import { useRef, useState, useCallback } from "react";
import { Spinner, ErrorBanner } from "./ui.jsx";
import "./UploadPanel.css";

const ACCEPTED = ".pdf,.docx,.doc,.txt,.md,.rst,.csv,.json,.xml,.html,.xlsx,.xls";
const ACCEPTED_LABEL = "PDF · DOCX · TXT · MD · CSV · JSON · XML · HTML · XLSX";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── Stage definitions ─────────────────────────────────────────────────────────
// progress range each stage "owns" (0–100). Embedding is the longest phase
// so it gets the biggest slice. The backend emits fractional progress within
// the embedding range as batches complete.
const STAGES = {
  parsing:    { label: "Parsing document",         from: 0,   to: 10  },
  chunking:   { label: "Chunking text",             from: 10,  to: 20  },
  embedding:  { label: "Embedding chunks",          from: 20,  to: 75  },
  entities:   { label: "Extracting entities",       from: 75,  to: 88  },
  graph:      { label: "Inserting into graph",      from: 88,  to: 97  },
  done:       { label: "Complete",                  from: 97,  to: 100 },
};

function stageProgress(stage, fraction = 0) {
  const s = STAGES[stage] ?? STAGES.parsing;
  return s.from + (s.to - s.from) * Math.min(1, Math.max(0, fraction));
}

// ── Progress bar component ────────────────────────────────────────────────────
function ProgressBar({ progress, stageLabel, filename, detail }) {
  return (
    <div className="upload-progress">
      <div className="upload-progress__header">
        <span className="upload-progress__filename" title={filename}>
          {filename}
        </span>
        <span className="upload-progress__pct">{Math.round(progress)}%</span>
      </div>

      <div className="upload-progress__track" role="progressbar"
           aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="upload-progress__fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="upload-progress__footer">
        <span className="upload-progress__stage">{stageLabel}</span>
        {detail && <span className="upload-progress__detail">{detail}</span>}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function UploadPanel({ onUploaded }) {
  const [dragging, setDragging]       = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState(null);
  const [lastDoc, setLastDoc]         = useState(null);
  const [progress, setProgress]       = useState(0);
  const [stageLabel, setStageLabel]   = useState("");
  const [detail, setDetail]           = useState("");
  const [currentFile, setCurrentFile] = useState("");
  const inputRef                      = useRef();
  const abortRef                      = useRef(null);   // AbortController for SSE fetch

  // ── SSE upload ──────────────────────────────────────────────────────────────
  const doUpload = useCallback(async (file) => {
    if (!file) return;

    // Cancel any previous in-flight upload
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setUploading(true);
    setError(null);
    setLastDoc(null);
    setProgress(0);
    setStageLabel("Preparing…");
    setDetail("");
    setCurrentFile(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch(`${API_BASE}/documents/upload/stream`, {
        method: "POST",
        body: formData,
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => resp.statusText);
        throw new Error(msg || `Upload failed (${resp.status})`);
      }

      // ── Consume SSE stream ────────────────────────────────────────────────
      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   doc     = null;

      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newline
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";   // last element may be incomplete

        for (const frame of frames) {
          const lines      = frame.split(/\n/);
          let   eventType  = "progress";
          let   dataStr    = "";

          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:"))  dataStr   = line.slice(5).trim();
          }

          if (!dataStr) continue;

          let payload;
          try { payload = JSON.parse(dataStr); }
          catch { continue; }

          if (eventType === "progress") {
            const { stage, fraction = 0, message = "", detail: det = "" } = payload;
            const pct = stageProgress(stage, fraction);
            setProgress(pct);
            setStageLabel(STAGES[stage]?.label ?? message);
            setDetail(det);
          }

          if (eventType === "done") {
            doc = payload;
            setProgress(100);
            setStageLabel("Complete");
            setDetail(`${doc.chunk_count} chunks · ${doc.top_entities?.length ?? 0} entities`);
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
      }

    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message || "Upload failed");
        setStageLabel("");
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [onUploaded]);

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

      {lastDoc && !error && (
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