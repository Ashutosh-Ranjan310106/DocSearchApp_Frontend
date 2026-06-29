import { useRef, useState, useCallback, useEffect } from "react";
import { ErrorBanner } from "./ui.jsx";
import "./UploadPanel.css";

const ACCEPTED = ".pdf,.docx,.doc,.txt,.md,.rst,.csv,.json,.xml,.html,.xlsx,.xls";
const ACCEPTED_LABEL = "PDF · DOCX · TXT · MD · CSV · JSON · XML · HTML · XLSX";
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const STAGES = {
  upload:     { label: "Uploading file",            from: 0,  to: 5  },
  validation: { label: "Validating document",       from: 5,  to: 10 },
  parsing:    { label: "Parsing document",          from: 10, to: 20 },
  chunking:   { label: "Chunking text",             from: 20, to: 30 },
  embedding:  { label: "Embedding chunks",          from: 30, to: 75 },
  entities:   { label: "Extracting entities",       from: 75, to: 85 },
  graph:      { label: "Building knowledge graph",  from: 85, to: 95 },
  indexing:   { label: "Finalizing index",          from: 95, to: 99 },
  done:       { label: "Complete",                  from: 99, to: 100 },
};

function stageProgress(stage, fraction = 0) {
  const s = STAGES[stage] ?? STAGES.upload;
  return s.from + (s.to - s.from) * Math.min(1, Math.max(0, fraction));
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ progress, stageLabel, filename, detail, statusMsg, done }) {
  return (
    <div className="upload-progress">
      <div className="upload-progress__header">
        <span className="upload-progress__filename" title={filename}>{filename}</span>
        <span className="upload-progress__pct">{Math.round(progress)}%</span>
      </div>

      <div
        className="upload-progress__track"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={[
            "upload-progress__fill",
            done ? "upload-progress__fill--done" : "upload-progress__fill--active",
          ].join(" ")}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="upload-progress__footer">
        <span className="upload-progress__stage">{stageLabel}</span>
        {detail
          ? <span className="upload-progress__detail">{detail}</span>
          : statusMsg
            ? <span className="upload-progress__detail upload-progress__detail--muted">{statusMsg}</span>
            : null
        }
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function UploadPanel({ onUploaded }) {
  const [dragging, setDragging]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [done, setDone]             = useState(false);
  const [error, setError]           = useState(null);
  const [lastDoc, setLastDoc]       = useState(null);
  const [progress, setProgress]     = useState(0);
  const [stageLabel, setStageLabel] = useState("Uploading file...");
  const [detail, setDetail]         = useState("");
  const [statusMsg, setStatusMsg]   = useState("Uploading file...");
  const [currentFile, setCurrentFile] = useState("");

  const inputRef          = useRef();
  const abortRef          = useRef(null);
  const fakeTimerRef      = useRef(null);
  const stallTimerRef     = useRef(null);
  const targetProgressRef = useRef(0);
  const progressRef       = useRef(0);        // shadow for timer closures
  const firstSseRef       = useRef(false);
  const currentStageRef   = useRef("upload");
  const lastSseTimeRef    = useRef(Date.now());

  // keep shadow in sync
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const clearTimers = () => {
    clearInterval(fakeTimerRef.current);
    clearTimeout(stallTimerRef.current);
    fakeTimerRef.current  = null;
    stallTimerRef.current = null;
  };

  // ── Fake / smooth progress ticker ─────────────────────────────────────────
  const startFakeTicker = useCallback(() => {
    clearInterval(fakeTimerRef.current);

    fakeTimerRef.current = setInterval(() => {
      const now         = Date.now();
      const sinceSse    = now - lastSseTimeRef.current;
      const target      = targetProgressRef.current;
      const stage       = currentStageRef.current;

      // stall hint after 2 s without an SSE
      if (sinceSse > 2000 && firstSseRef.current) {
        if (stage === "embedding") {
          setStatusMsg("Generating embeddings… this may take a while.");
        } else {
          setStatusMsg("Still processing…");
        }
      }

      setProgress(prev => {
        // hard cap: never exceed 25% before first SSE
        const cap = firstSseRef.current
          ? Math.min(target, 99)          // after first SSE: drift toward target
          : Math.min(target + 2, 25);     // before first SSE: creep to 25% max

        // smooth lerp toward cap
        const next = prev + (cap - prev) * 0.15;

        // never go backward, clamp top
        const clamped = Math.min(Math.max(prev, next), 99.9);
        progressRef.current = clamped;
        return clamped;
      });
    }, 250);
  }, []);

  // ── Stall reset: clear status hint when a new SSE arrives ─────────────────
  const onSseArrived = () => {
    lastSseTimeRef.current = Date.now();
    setStatusMsg("");
  };

  // ── SSE upload ─────────────────────────────────────────────────────────────
  const doUpload = useCallback(async (file) => {
    if (!file) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // reset state
    clearTimers();
    setUploading(true);
    setDone(false);
    setError(null);
    setLastDoc(null);
    setProgress(0);
    setStageLabel("Uploading file...");
    setDetail("");
    setStatusMsg("Uploading file...");
    setCurrentFile(file.name);
    targetProgressRef.current = 0;
    progressRef.current       = 0;
    firstSseRef.current       = false;
    currentStageRef.current   = "upload";
    lastSseTimeRef.current    = Date.now();

    startFakeTicker();

    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch(`${API_BASE}/documents/upload/stream`, {
        method: "POST",
        body:   formData,
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => resp.statusText);
        throw new Error(msg || `Upload failed (${resp.status})`);
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   doc     = null;

      outer: while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const lines     = frame.split(/\n/);
          let   eventType = "progress";
          let   dataStr   = "";

          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:"))  dataStr   = line.slice(5).trim();
          }

          if (!dataStr) continue;

          let payload;
          try { payload = JSON.parse(dataStr); } catch { continue; }

          if (eventType === "progress") {
            onSseArrived();
            firstSseRef.current = true;

            const { stage, fraction = 0, message = "", detail: det = "" } = payload;
            const backendPct = stageProgress(stage, fraction);

            currentStageRef.current   = stage;
            // never let target go backward
            targetProgressRef.current = Math.max(targetProgressRef.current, backendPct);

            setStageLabel(STAGES[stage]?.label ?? message);
            setDetail(det);
            setStatusMsg("");
          }

          if (eventType === "done") {
            doc = payload;
            clearTimers();
            setProgress(100);
            setStageLabel("Complete");
            setDetail(`${doc.chunk_count} chunks · ${doc.top_entities?.length ?? 0} entities`);
            setStatusMsg("");
            setDone(true);
            break outer;
          }

          if (eventType === "error") {
            throw new Error(payload.message ?? "Upload failed");
          }
        }
      }

      if (doc) {
        setLastDoc(doc);
        onUploaded?.(doc);
        // keep completed bar visible for 2.5 s then hide uploading state
        setTimeout(() => setUploading(false), 2500);
      } else {
        setUploading(false);
      }

    } catch (e) {
      clearTimers();
      if (e.name !== "AbortError") {
        setError(e.message || "Upload failed");
        setStageLabel("");
        setStatusMsg("");
      }
      setUploading(false);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [onUploaded, startFakeTicker]);

  // cleanup on unmount
  useEffect(() => () => { clearTimers(); abortRef.current?.abort(); }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    doUpload(e.dataTransfer.files[0]);
  };

  return (
    <div className="upload-panel">
      <div
        className={[
          "upload-zone",
          dragging  ? "upload-zone--drag" : "",
          uploading ? "upload-zone--busy" : "",
        ].filter(Boolean).join(" ")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(e) => doUpload(e.target.files[0])}
        />

        {uploading ? (
          <div className="upload-zone__body upload-zone__body--progress">
            <ProgressBar
              progress={progress}
              stageLabel={stageLabel}
              filename={currentFile}
              detail={detail}
              statusMsg={statusMsg}
              done={done}
            />
          </div>
        ) : (
          <div className="upload-zone__body">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="var(--indigo)" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="upload-zone__label">Drop file or click to upload</span>
            <span className="upload-zone__sub">{ACCEPTED_LABEL}</span>
          </div>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {lastDoc && !error && !uploading && (
        <div className="upload-success">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="var(--green)" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>
            <strong>{lastDoc.filename}</strong> — {lastDoc.chunk_count} chunks,{" "}
            {lastDoc.top_entities?.length ?? 0} entities
          </span>
        </div>
      )}
    </div>
  );
}