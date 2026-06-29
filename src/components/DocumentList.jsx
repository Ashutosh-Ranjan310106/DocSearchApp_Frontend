import { StatusDot, EmptyState, Badge } from "./ui.jsx";
import "./DocumentList.css";

export default function DocumentList({ docs, selectedDocId, onSelect, onDelete }) {
  if (!docs.length) {
    return (
      <EmptyState
        icon={
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--border-2)" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        }
        message="No documents yet"
        sub="Upload a file to get started"
      />
    );
  }

  return (
    <div className="doc-list">
      {docs.map((d) => (
        <div
          key={d.doc_id}
          className={`doc-item${selectedDocId === d.doc_id ? " doc-item--active" : ""}`}
          onClick={() => onSelect(d)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelect(d)}
        >
          <StatusDot status="ready" />
          <div className="doc-item__body">
            <div className="doc-item__name" title={d.filename}>{d.filename}</div>
            <div className="doc-item__meta">
              <span>{d.chunk_count} chunks</span>
              <span>·</span>
              <span>{fmt(d.size_bytes)}</span>
              <span>·</span>
              <span className="doc-item__date">{fmtDate(d.uploaded_at)}</span>
            </div>
          </div>
          <button
            className="doc-item__del"
            onClick={(e) => { e.stopPropagation(); onDelete(d.doc_id); }}
            title="Delete document"
            aria-label={`Delete ${d.filename}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

const fmt     = (b) => b > 1048576 ? `${(b/1048576).toFixed(1)}MB` : `${Math.round(b/1024)}KB`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
