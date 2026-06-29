import { useRef, useState } from "react";
import { uploadDocument } from "../api.js";
import { Spinner, ErrorBanner } from "./ui.jsx";
import "./UploadPanel.css";

const ACCEPTED = ".pdf,.docx,.doc,.txt,.md,.rst,.csv,.json,.xml,.html,.xlsx,.xls";
const ACCEPTED_LABEL = "PDF · DOCX · TXT · MD · CSV · JSON · XML · HTML · XLSX";

export default function UploadPanel({ onUploaded }) {
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState(null);
  const [lastDoc, setLastDoc]     = useState(null);
  const inputRef                  = useRef();

  const doUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setLastDoc(null);
    try {
      const doc = await uploadDocument(file);
      setLastDoc(doc);
      onUploaded?.(doc);
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
      // reset input so same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    doUpload(e.dataTransfer.files[0]);
  };

  return (
    <div className="upload-panel">
      <div
        className={`upload-zone${dragging ? " upload-zone--drag" : ""}${uploading ? " upload-zone--busy" : ""}`}
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
          <div className="upload-zone__body">
            <Spinner size={26} />
            <span className="upload-zone__label">Processing document…</span>
            <span className="upload-zone__sub">Chunking · Embedding · Extracting entities</span>
          </div>
        ) : (
          <div className="upload-zone__body">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="1.5">
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>
            <strong>{lastDoc.filename}</strong> — {lastDoc.chunk_count} chunks, {lastDoc.top_entities?.length ?? 0} entities
          </span>
        </div>
      )}
    </div>
  );
}
