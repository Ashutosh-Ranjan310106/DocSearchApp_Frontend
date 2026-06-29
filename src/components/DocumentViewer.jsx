import { useState, useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import { getDocumentChunks } from "../api.js";
import { Spinner, EmptyState, EntityTag } from "./ui.jsx";
import "./DocumentViewer.css";

// Configure marked once: safe defaults, no mangling of IDs.
marked.setOptions({ gfm: true, breaks: true });

const PAGE_SIZE = 3000;

// Global default render mode persists across chunk pages but resets per doc.
const DEFAULT_RENDER_MODE = "markdown"; // "markdown" | "raw"

export default function DocumentViewer({ doc, activeCitationChunkId }) {
  const [chunks,      setChunks]      = useState([]);
  const [page,        setPage]        = useState(0);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [fileUrl,     setFileUrl]     = useState(null);
  const [fileType,    setFileType]    = useState(null); // "pdf" | "html" | "text" | "other"
  const [renderMode,  setRenderMode]  = useState(DEFAULT_RENDER_MODE); // global for all chunks

  const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const [viewMode, setViewMode] = useState("chunks"); // "chunks" | "file"
  const chunkRefs          = useRef({});
  const highlightTimeout   = useRef();
  const iframeRef          = useRef();

  // Load chunks on doc / page change
  useEffect(() => {
    if (!doc) { setChunks([]); setTotal(0); setFileUrl(null); return; }
    setLoading(true);
    getDocumentChunks(doc.doc_id, page, PAGE_SIZE)
      .then((res) => {
        setChunks(res.chunks);
        setTotal(res.total);
        console.log("[DocumentViewer] API response file_url:", res.file_url ?? "(not present)");
        if (res.file_url) {
          const absolute = res.file_url.startsWith("http")
            ? res.file_url
            : `${BACKEND_URL}${res.file_url}`;
          console.log("[DocumentViewer] resolved file URL:", absolute);
          setFileUrl(absolute);

          const fn = (doc.filename || "").toLowerCase();
          if      (fn.endsWith(".pdf"))                          setFileType("pdf");
          else if (fn.endsWith(".html") || fn.endsWith(".htm")) setFileType("html");
          else if (fn.endsWith(".txt")  || fn.endsWith(".md"))  setFileType("text");
          else                                                    setFileType("other");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [doc, page]);

  // Reset to page 0, chunk view, and default render mode when doc changes
  useEffect(() => {
    setPage(0);
    setRenderMode(DEFAULT_RENDER_MODE);
  }, [doc?.doc_id]);

  // Jump to cited chunk — may need to page-switch first
  useEffect(() => {
    if (!activeCitationChunkId || !doc) return;

    if (viewMode === "chunks") {
      const idx = chunks.findIndex((c) => c.chunk_id === activeCitationChunkId);
      if (idx !== -1) {
        clearTimeout(highlightTimeout.current);
        highlightTimeout.current = setTimeout(() => {
          chunkRefs.current[activeCitationChunkId]?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
      } else {
        setPage(0);
      }
    } else if (viewMode === "file") {
      scrollIframeToChunk(activeCitationChunkId);
    }
  }, [activeCitationChunkId, viewMode]);

  // After page changes, try scroll again (chunk view)
  useEffect(() => {
    if (!activeCitationChunkId || viewMode !== "chunks") return;
    const idx = chunks.findIndex((c) => c.chunk_id === activeCitationChunkId);
    if (idx !== -1) {
      clearTimeout(highlightTimeout.current);
      highlightTimeout.current = setTimeout(() => {
        chunkRefs.current[activeCitationChunkId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [chunks, activeCitationChunkId]);

  // When switching to file view with an active citation, jump immediately
  useEffect(() => {
    if (viewMode === "file" && activeCitationChunkId) {
      scrollIframeToChunk(activeCitationChunkId);
    }
  }, [viewMode]);

  function scrollIframeToChunk(chunkId) {
    if (!iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage({ type: "JUMP_TO_CHUNK", chunkId }, "*");
    try {
      const el = iframeRef.current.contentDocument?.getElementById(`chunk-${chunkId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("chunk--highlighted");
        setTimeout(() => el.classList.remove("chunk--highlighted"), 2000);
      }
    } catch {
      // Cross-origin — postMessage only
    }
  }

  if (!doc) {
    return (
      <div className="viewer viewer--empty">
        <EmptyState
          icon={
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--border-2)" strokeWidth="1">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
          }
          message="Select a document to view its chunks"
          sub="Click a search result or citation to jump directly to a chunk"
        />
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const canShowFile = !!fileUrl;

  return (
    <div className="viewer">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="viewer__header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span className="viewer__name" title={doc.filename}>{doc.filename}</span>
        <div className="viewer__stats">
          <span>{total} chunks</span>
          <span>·</span>
          <span>{Math.round((doc.char_count || 0) / 1000)}K chars</span>
        </div>

        {/* Chunks vs File toggle */}
        <div className="viewer__toggle">
          <button
            className={`viewer__toggle-btn${viewMode === "chunks" ? " viewer__toggle-btn--active" : ""}`}
            onClick={() => setViewMode("chunks")}
            title="Chunk view"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Chunks
          </button>
          <button
            className={`viewer__toggle-btn${viewMode === "file" ? " viewer__toggle-btn--active" : ""}${!canShowFile ? " viewer__toggle-btn--disabled" : ""}`}
            onClick={() => canShowFile && setViewMode("file")}
            title={canShowFile ? "Original file view" : "No file URL available for this document"}
            disabled={!canShowFile}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
            File
          </button>
        </div>

        {activeCitationChunkId && (
          <div className="viewer__jump-indicator">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Jumped to citation
          </div>
        )}
      </div>

      {/* ── Chunk View ─────────────────────────────────────────── */}
      {viewMode === "chunks" && (
        <>
          {/* Render-mode bar (Markdown / Raw) */}
          <div className="viewer__render-bar">
            <span className="viewer__render-label">Render as</span>
            <div className="viewer__toggle" style={{ marginLeft: 0 }}>
              <button
                className={`viewer__toggle-btn${renderMode === "markdown" ? " viewer__toggle-btn--active" : ""}`}
                onClick={() => setRenderMode("markdown")}
                title="Render chunk text as Markdown"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h10M4 18h12"/>
                </svg>
                Markdown
              </button>
              <button
                className={`viewer__toggle-btn${renderMode === "raw" ? " viewer__toggle-btn--active" : ""}`}
                onClick={() => setRenderMode("raw")}
                title="Show raw chunk text"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
                Raw
              </button>
            </div>
          </div>

          <div className="viewer__scroll">
            {loading ? (
              <div className="viewer__loading"><Spinner size={22} /></div>
            ) : (
              <div className="viewer__chunks">
                {chunks.map((c) => (
                  <Chunk
                    key={c.chunk_id}
                    chunk={c}
                    highlighted={activeCitationChunkId === c.chunk_id}
                    renderMode={renderMode}
                    ref_={(el) => { if (el) chunkRefs.current[c.chunk_id] = el; }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="viewer__pagination">
              <button className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                ← Prev
              </button>
              <div className="viewer__page-dots">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i : Math.round(i * (totalPages - 1) / 6);
                  return (
                    <button
                      key={p}
                      className={`page-dot${page === p ? " page-dot--active" : ""}`}
                      onClick={() => setPage(p)}
                      title={`Page ${p + 1}`}
                    />
                  );
                })}
              </div>
              <span className="viewer__page-label">{page + 1} / {totalPages}</span>
              <button className="btn btn--ghost btn--sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── File View ──────────────────────────────────────────── */}
      {viewMode === "file" && (
        <div className="viewer__file-wrap">
          <div className="viewer__file-jump-bar">
            {activeCitationChunkId && (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Citation highlighted —
                <button
                  className="viewer__file-jump-btn"
                  onClick={() => scrollIframeToChunk(activeCitationChunkId)}
                >
                  scroll to it
                </button>
                <span className="viewer__file-bar-divider">·</span>
              </>
            )}
            <a
              className="viewer__download-btn"
              href={fileUrl}
              download={doc.filename}
              title={`Download ${doc.filename}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </a>
          </div>
          {fileType === "pdf" ? (
            <PdfViewer url={fileUrl} iframeRef={iframeRef} filename={doc.filename} />
          ) : fileType === "html" || fileType === "text" ? (
            <iframe
              ref={iframeRef}
              className="viewer__iframe"
              src={fileUrl}
              title={doc.filename}
              onLoad={() => console.log("[DocumentViewer] iframe loaded")}
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
          ) : fileType === "other" ? (
            <div className="viewer__file-unsupported">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border-2)" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>This file type can't be previewed in the browser.</p>
              <a className="btn btn--primary btn--sm" href={fileUrl} target="_blank" rel="noreferrer">
                Open / Download ↗
              </a>
            </div>
          ) : (
            <div className="viewer__loading"><Spinner size={22} /></div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * PdfViewer — renders PDF inline using an <object> tag.
 * Falls back gracefully if the browser blocks it.
 */
function PdfViewer({ url, iframeRef, filename }) {
  const [failed, setFailed] = useState(false);
  const src = `${url}#toolbar=0&view=FitH`;
  console.log("[DocumentViewer] PdfViewer src:", src);

  if (failed) {
    return (
      <div className="viewer__file-unsupported">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border-2)" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>PDF preview blocked — likely a <code>Content-Disposition: attachment</code> header.</p>
        <a className="btn btn--primary btn--sm" href={url} target="_blank" rel="noreferrer">
          Open PDF ↗
        </a>
        <p className="viewer__file-hint">
          Fix in FastAPI: return{" "}
          <code>FileResponse(..., headers={"{"}&#34;Content-Disposition&#34;: &#34;inline&#34;{"}"})</code>
        </p>
      </div>
    );
  }

  return (
    <object
      ref={iframeRef}
      className="viewer__iframe"
      data={src}
      type="application/pdf"
      onError={() => { console.warn("[DocumentViewer] PDF object tag failed"); setFailed(true); }}
    >
      <div className="viewer__file-unsupported">
        <p>Browser cannot render PDF inline.</p>
        <a className="btn btn--primary btn--sm" href={url} target="_blank" rel="noreferrer">
          Open PDF ↗
        </a>
      </div>
    </object>
  );
}

/**
 * Chunk — renders a single document chunk.
 *
 * renderMode: "markdown" → sanitised HTML via marked
 *             "raw"      → monospaced pre-wrap text (original behaviour)
 */
function Chunk({ chunk: c, highlighted, renderMode, ref_ }) {
  // Parse markdown once per text change; memoised so it's not re-run on every
  // highlight toggle or scroll event.
  const html = useMemo(() => {
    try {
      return marked.parse(c.display_text ?? "");
    } catch {
      return c.display_text ?? "";
    }
  }, [c.display_text]);

  return (
    <div
      ref={ref_}
      className={`chunk${highlighted ? " chunk--highlighted" : ""}`}
      id={`chunk-${c.chunk_id}`}
    >
      <div className="chunk__header">
        <span className="chunk__idx">#{c.index + 1}</span>
        {c.char_start != null && (
          <span className="chunk__pos" title="Character offset">@{c.char_start}</span>
        )}
        {c.entities?.slice(0, 4).map((e) => (
          <EntityTag key={e.text} text={e.text} label={e.label} />
        ))}
        {c.entities?.length > 4 && (
          <span className="chunk__more-ents">+{c.entities.length - 4}</span>
        )}
      </div>

      {renderMode === "markdown" ? (
        <div
          className="chunk__markdown"
          // marked output is safe for GFM; no user-supplied scripts can enter
          // because marked does not parse <script> tags by default.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="chunk__text">{c.display_text}</p>
      )}
    </div>
  );
}