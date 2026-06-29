import { useState, useEffect, useCallback, useRef } from "react";
import { listDocuments, deleteDocument, getStats, getHealth } from "./api.js";

import UploadPanel    from "./components/UploadPanel.jsx";
import DocumentList   from "./components/DocumentList.jsx";
import SearchPanel    from "./components/SearchPanel.jsx";
import DocumentViewer from "./components/DocumentViewer.jsx";
import ChatBox        from "./components/ChatBox.jsx";
import StatsBar       from "./components/StatsBar.jsx";
import GraphPage      from "./components/GraphPage.jsx";
import OfflineLoader  from "./components/OfflineLoader.jsx";
import "./components/OfflineLoader.css";
import "./App.css";
import "./components/GraphPage.css";

const HEALTH_POLL_MS    = 30_000;
const RETRY_INTERVAL_MS = 5_000;

const SIDEBAR_DEFAULT = 260;
const CHAT_DEFAULT    = 320;
const SIDEBAR_MIN     = 48;
const CHAT_MIN        = 48;
const SIDEBAR_MAX     = 480;
const CHAT_MAX        = 560;

export default function App() {
  const [docs,                  setDocs]           = useState([]);
  const [stats,                 setStats]          = useState(null);
  const [health,                setHealth]         = useState(null);
  const [selectedDoc,           setSelectedDoc]    = useState(null);
  const [activeCitationChunkId, setActiveCitation] = useState(null);
  const [sidebarTab,            setSidebarTab]     = useState("docs");
  const [page,                  setPage]           = useState("main");
  const [backendStatus,         setBackendStatus]  = useState("connecting");

  // Column widths
  const [sidebarW, setSidebarW] = useState(SIDEBAR_DEFAULT);
  const [chatW,    setChatW]    = useState(CHAT_DEFAULT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed,    setChatCollapsed]    = useState(false);

  // Drag state stored in refs to avoid stale closures
  const dragRef = useRef(null);

  const startDrag = (e, which) => {
    e.preventDefault();
    dragRef.current = { which, startX: e.clientX,
      startSidebar: sidebarW, startChat: chatW };

    const onMove = (ev) => {
      const d = ev.clientX - dragRef.current.startX;
      if (dragRef.current.which === "left") {
        setSidebarW(Math.min(SIDEBAR_MAX,
          Math.max(SIDEBAR_MIN, dragRef.current.startSidebar + d)));
      } else {
        setChatW(Math.min(CHAT_MAX,
          Math.max(CHAT_MIN, dragRef.current.startChat - d)));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor     = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  const checkHealth = useCallback(async () => {
    try {
      const h = await getHealth();
      if (h?.status === "ok") {
        setHealth(h);
        setBackendStatus("ready");
        return true;
      }
      return false;
    } catch { return false; }
  }, []);

  const reload = useCallback(async () => {
    try { setDocs(await listDocuments()); } catch {}
    try { setStats(await getStats()); }    catch {}
  }, []);

  useEffect(() => {
    checkHealth().then((ok) => { if (ok) reload(); });
  }, [checkHealth, reload]);

  useEffect(() => {
    if (backendStatus === "ready") return;
    const id = setInterval(() => {
      checkHealth().then((ok) => { if (ok) reload(); });
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [backendStatus, checkHealth, reload]);

  useEffect(() => {
    if (backendStatus !== "ready") return;
    const id = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [backendStatus, checkHealth]);

  const handleUploaded = (doc) => { reload(); setSelectedDoc(doc); };

  const handleDelete = async (docId) => {
    try { await deleteDocument(docId); } catch {}
    if (selectedDoc?.doc_id === docId) { setSelectedDoc(null); setActiveCitation(null); }
    reload();
  };

  const handleCitationClick = (citation) => {
    const doc = docs.find((d) => d.doc_id === citation.doc_id);
    if (doc) {
      setSelectedDoc(doc);
      setTimeout(() => setActiveCitation(citation.chunk_id), 80);
    }
  };

  if (backendStatus !== "ready") {
    return (
      <OfflineLoader
        status={backendStatus}
        onRetry={() => {
          setBackendStatus("connecting");
          checkHealth().then((ok) => { if (ok) reload(); });
        }}
      />
    );
  }

  if (page === "graph") {
    return <GraphPage docs={docs} onBack={() => setPage("main")} />;
  }

  // Effective widths — collapsed columns show 40px (icon strip)
  const effectiveSidebar = sidebarCollapsed ? 40 : sidebarW;
  const effectiveChat    = chatCollapsed    ? 40 : chatW;

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="header__title">DocSearch</span>
          <span className="header__pill">Hybrid Knowledge Base</span>
        </div>
        <button className="header__graph-btn" onClick={() => setPage("graph")} title="Explore the knowledge graph">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="5"  cy="12" r="2"/><circle cx="19" cy="5"  r="2"/><circle cx="19" cy="19" r="2"/>
            <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
          </svg>
          Knowledge Graph
        </button>
        <StatsBar stats={stats} health={health} />
      </header>

      <div
        className="body"
        style={{ gridTemplateColumns: `${effectiveSidebar}px 4px 1fr 4px ${effectiveChat}px` }}
      >
        {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
        <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
          {sidebarCollapsed ? (
            <div className="col-collapsed-bar">
              <button
                className="col-expand-btn"
                onClick={() => setSidebarCollapsed(false)}
                title="Expand sidebar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              <span className="col-collapsed-label">Sidebar</span>
            </div>
          ) : (
            <>
              <div className="col-header">
                <section className="sidebar__section">
                  <div className="panel-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload Document
                    <button
                      className="col-collapse-btn"
                      onClick={() => setSidebarCollapsed(true)}
                      title="Collapse sidebar"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </button>
                  </div>
                </section>
              </div>

              <div className="sidebar__pad">
                <UploadPanel onUploaded={handleUploaded} />
              </div>

              <div className="sidebar__tabs">
                <button
                  className={`sidebar__tab${sidebarTab === "docs" ? " sidebar__tab--active" : ""}`}
                  onClick={() => setSidebarTab("docs")}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Documents
                  {docs.length > 0 && <span className="sidebar__tab-count">{docs.length}</span>}
                </button>
                <button
                  className={`sidebar__tab${sidebarTab === "search" ? " sidebar__tab--active" : ""}`}
                  onClick={() => setSidebarTab("search")}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Search
                </button>
              </div>

              <div className="sidebar__tab-body">
                {sidebarTab === "docs" ? (
                  <div className="sidebar__pad">
                    <DocumentList
                      docs={docs}
                      selectedDocId={selectedDoc?.doc_id}
                      onSelect={(d) => { setSelectedDoc(d); setActiveCitation(null); }}
                      onDelete={handleDelete}
                    />
                  </div>
                ) : (
                  <div className="sidebar__pad sidebar__pad--search">
                    <SearchPanel onCitationClick={handleCitationClick} />
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* ── DRAG HANDLE LEFT ─────────────────────────────── */}
        <div
          className="drag-handle"
          onMouseDown={(e) => startDrag(e, "left")}
          title="Drag to resize"
        >
          <div className="drag-handle__pip" />
        </div>

        {/* ── CENTER ───────────────────────────────────────── */}
        <main className="center">
          <DocumentViewer doc={selectedDoc} activeCitationChunkId={activeCitationChunkId} />
        </main>

        {/* ── DRAG HANDLE RIGHT ────────────────────────────── */}
        <div
          className="drag-handle"
          onMouseDown={(e) => startDrag(e, "right")}
          title="Drag to resize"
        >
          <div className="drag-handle__pip" />
        </div>

        {/* ── RIGHT CHAT COLUMN ────────────────────────────── */}
        <aside className={`chat-col${chatCollapsed ? " chat-col--collapsed" : ""}`}>
          {chatCollapsed ? (
            <div className="col-collapsed-bar">
              <button
                className="col-expand-btn"
                onClick={() => setChatCollapsed(false)}
                title="Expand chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <span className="col-collapsed-label">Chat</span>
            </div>
          ) : (
            <>
              <div className="panel-title">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                Chat
                <span className="panel-title__right" style={{ fontSize: 10, color: "var(--text-3)" }}>
                  Click citations → jump to source
                </span>
                <button
                  className="col-collapse-btn"
                  onClick={() => setChatCollapsed(true)}
                  title="Collapse chat"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
              <ChatBox onCitationClick={handleCitationClick} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}