/**
 * GraphPage.jsx  — v2  (live RAF simulation, real canvas size)
 *
 * Root causes fixed vs v1:
 *  1. Force sim ran once at import time against a hardcoded 900×620 canvas,
 *     so all nodes landed outside the visible SVG area (the actual center
 *     panel is narrower/taller than that constant).
 *  2. The SVG had no explicit width/height attributes, so the browser gave it
 *     300×150 (the SVG default), meaning coordinates from the sim were way
 *     outside the viewport.
 *  3. No ResizeObserver → re-layout never fired when the panel changed size.
 *  4. The simulation was synchronous + one-shot, so connected nodes never
 *     had time to settle toward each other.
 *
 * What's different now:
 *  • A ResizeObserver measures the canvas wrapper and exposes {W, H} to the sim.
 *  • The SVG gets explicit width={W} height={H} so coordinates always land
 *    within the viewport.
 *  • The force sim runs continuously via requestAnimationFrame (live, animated),
 *    using a proper Fruchterman-Reingold repulsion + spring model.
 *  • Nodes start in a random jitter around the true center so repulsion fires.
 *  • Edges are visible at base opacity 0.5 (was 0.35 with dark stroke → invisible
 *    on a dark background); active edges are bright indigo.
 *  • Pan/zoom still work; zoom is now center-anchored to the cursor position.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── colour palette ────────────────────────────────────────────────────────────
const NODE_COLORS = {
  EQUIPMENT:  "#6366F1",
  PARAMETER:  "#22D3EE",
  SECTION:    "#A78BFA",
  PROCEDURE:  "#34D399",
  DOCUMENT:   "#F59E0B",
  COMPONENT:  "#F472B6",
  SYSTEM:     "#FB923C",
  UNKNOWN:    "#64748B",
};
function nodeColor(type) {
  return NODE_COLORS[type?.toUpperCase()] ?? NODE_COLORS.UNKNOWN;
}

// ── live force simulation hook ────────────────────────────────────────────────
// Returns { simNodes, simEdges } that are mutated in-place each RAF tick.
// Callers re-render by incrementing a counter from the RAF callback.
function useForceSimulation(rawNodes, rawEdges, W, H) {
  // Keep mutable sim state in a ref so RAF doesn't re-subscribe each render
  const simRef  = useRef({ nodes: [], edges: [], running: false });
  const rafRef  = useRef(null);
  const [tick, setTick] = useState(0); // triggers re-render each frame

  useEffect(() => {
    if (!W || !H || !rawNodes.length) {
      simRef.current.nodes = [];
      simRef.current.edges = [];
      setTick(t => t + 1);
      return;
    }

    const cx = W / 2;
    const cy = H / 2;
    const nodeById = {};

    // Reset node positions to a small random cloud around center
    const nodes = rawNodes.map(n => {
      const angle = Math.random() * 2 * Math.PI;
      const r     = 40 + Math.random() * 60;
      return {
        ...n,
        x:  cx + r * Math.cos(angle),
        y:  cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        pinned: false,
      };
    });
    nodes.forEach(n => { nodeById[n.id] = n; });

    const edges = rawEdges.map(e => ({ ...e }));

    simRef.current = { nodes, edges, running: true };

    // Fruchterman-Reingold constants
    const area = W * H;
    const k    = Math.sqrt(area / Math.max(nodes.length, 1)) * 0.85;
    const k2   = k * k;

    let alpha = 1.0; // "temperature" — cools down each frame

    function tick() {
      if (!simRef.current.running) return;
      const { nodes, edges } = simRef.current;
      const N = nodes.length;
      if (!N) return;

      // cool
      alpha = Math.max(0.001, alpha * 0.96);

      // repulsion — O(N²) but fine for <500 nodes
      for (let a = 0; a < N; a++) {
        for (let b = a + 1; b < N; b++) {
          const na = nodes[a], nb = nodes[b];
          let dx = nb.x - na.x || (Math.random() - 0.5) * 0.1;
          let dy = nb.y - na.y || (Math.random() - 0.5) * 0.1;
          const d2  = dx * dx + dy * dy;
          const d   = Math.sqrt(d2) || 0.001;
          const rep = k2 / d;
          const fx  = (dx / d) * rep;
          const fy  = (dy / d) * rep;
          na.vx -= fx;
          na.vy -= fy;
          nb.vx += fx;
          nb.vy += fy;
        }
      }

      // spring attraction
      for (const e of edges) {
        const s = nodeById[e.source];
        const t = nodeById[e.target];
        if (!s || !t) continue;
        const dx  = t.x - s.x;
        const dy  = t.y - s.y;
        const d   = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const att = (d * d) / k;
        const fx  = (dx / d) * att;
        const fy  = (dy / d) * att;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // gravity + integrate
      const margin = 30;
      for (const n of nodes) {
        if (n.pinned) { n.vx = 0; n.vy = 0; continue; }

        // gentle pull to center
        n.vx += (cx - n.x) * 0.008 * alpha;
        n.vy += (cy - n.y) * 0.008 * alpha;

        // velocity cap + damping
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        const maxSpeed = 8;
        if (speed > maxSpeed) { n.vx *= maxSpeed / speed; n.vy *= maxSpeed / speed; }

        n.x  += n.vx * alpha;
        n.y  += n.vy * alpha;
        n.vx *= 0.85;
        n.vy *= 0.85;

        n.x = Math.max(margin, Math.min(W - margin, n.x));
        n.y = Math.max(margin, Math.min(H - margin, n.y));
      }

      setTick(t => t + 1);

      if (alpha > 0.002) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    // cancel any previous animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    alpha = 1.0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      simRef.current.running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes, rawEdges, W, H]);

  return { simNodes: simRef.current.nodes, simEdges: simRef.current.edges };
}

// ── SVG canvas ────────────────────────────────────────────────────────────────
function GraphCanvas({ rawNodes, rawEdges, selected, onSelect }) {
  const wrapRef  = useRef(null);
  const svgRef   = useRef(null);
  const [size,   setSize]   = useState({ W: 0, H: 0 });
  const [pan,    setPan]    = useState({ x: 0, y: 0 });
  const [zoom,   setZoom]   = useState(1);
  const dragging = useRef(null);

  // ── measure container ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ W: Math.round(width), H: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── live simulation ────────────────────────────────────────────────────────
  const { simNodes, simEdges } = useForceSimulation(rawNodes, rawEdges, size.W, size.H);

  // Build a lookup for rendering (reads from the mutable sim arrays)
  const nodeById = useMemo(() => {
    const m = {};
    simNodes.forEach(n => { m[n.id] = n; });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simNodes.length]); // length change → rebuild; positions are mutated in-place

  // ── zoom (cursor-anchored) ─────────────────────────────────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const svg    = svgRef.current;
    if (!svg) return;
    const rect  = svg.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    setZoom(z => {
      const nz = Math.max(0.1, Math.min(5, z * factor));
      setPan(p => ({
        x: mx - (mx - p.x) * (nz / z),
        y: my - (my - p.y) * (nz / z),
      }));
      return nz;
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // ── drag ──────────────────────────────────────────────────────────────────
  const startDrag = (e, nodeId) => {
    e.stopPropagation();
    dragging.current = { nodeId };
  };
  const startPan = (e) => {
    if (e.button !== 0) return;
    dragging.current = { pan: true, startX: e.clientX, startY: e.clientY, origPan: { ...pan } };
  };
  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const d = dragging.current;
    if (d.pan) {
      setPan({ x: d.origPan.x + (e.clientX - d.startX), y: d.origPan.y + (e.clientY - d.startY) });
    } else {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const node = simNodes.find(n => n.id === d.nodeId);
      if (node) {
        node.x = (e.clientX - rect.left - pan.x) / zoom;
        node.y = (e.clientY - rect.top  - pan.y) / zoom;
        node.pinned = true;
      }
    }
  }, [simNodes, pan, zoom]);
  const stopDrag = () => { dragging.current = null; };

  if (!rawNodes.length) return (
    <div ref={wrapRef} className="gp-canvas-inner gp-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-3,#475569)" strokeWidth="1.5">
        <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/>
        <circle cx="19" cy="19" r="2"/><line x1="7" y1="11" x2="17" y2="6"/>
        <line x1="7" y1="13" x2="17" y2="18"/>
      </svg>
      <p>No graph data yet — upload documents first</p>
    </div>
  );

  return (
    <div ref={wrapRef} className="gp-canvas-inner">
      <svg
        ref={svgRef}
        width={size.W}
        height={size.H}
        style={{ display: "block" }}
        onMouseDown={startPan}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        <defs>
          <marker id="gp-arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,1 L0,6 L7,3.5 z" fill="#334155" />
          </marker>
          <marker id="gp-arr-active" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,1 L0,6 L7,3.5 z" fill="#6366F1" />
          </marker>
          <filter id="gp-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* ── edges first (under nodes) ──────────────────────────────── */}
          {simEdges.map(e => {
            const s = nodeById[e.source];
            const t = nodeById[e.target];
            if (!s || !t) return null;
            const isActive = selected?.id === e.source || selected?.id === e.target;
            // shorten line so arrowhead doesn't overlap node circle
            const nr = Math.max(5, Math.min(14, 5 + Math.sqrt(t.degree ?? 0)));
            const dx = t.x - s.x, dy = t.y - s.y;
            const d  = Math.sqrt(dx * dx + dy * dy) || 1;
            const x2 = t.x - (dx / d) * (nr + 4);
            const y2 = t.y - (dy / d) * (nr + 4);
            const mx = (s.x + x2) / 2;
            const my = (s.y + y2) / 2;
            return (
              <g key={e.id}>
                <line
                  x1={s.x} y1={s.y} x2={x2} y2={y2}
                  stroke={isActive ? "#6366F1" : "#334155"}
                  strokeWidth={isActive ? 1.8 : 1}
                  strokeOpacity={isActive ? 1 : 0.55}
                  markerEnd={isActive ? "url(#gp-arr-active)" : "url(#gp-arr)"}
                />
                {isActive && e.relation && (
                  <text x={mx} y={my - 5} textAnchor="middle"
                    fontSize="9" fill="#818cf8" fontWeight="500"
                    style={{ pointerEvents: "none" }}>
                    {e.relation.length > 22 ? e.relation.slice(0, 20) + "…" : e.relation}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── nodes ─────────────────────────────────────────────────── */}
          {simNodes.map(n => {
            const r        = Math.max(5, Math.min(14, 5 + Math.sqrt(n.degree ?? 0)));
            const color    = nodeColor(n.type);
            const isSel    = selected?.id === n.id;
            const isNeighbour = selected && simEdges.some(
              e => (e.source === selected.id && e.target === n.id) ||
                   (e.target === selected.id && e.source === n.id)
            );
            const opacity = selected && !isSel && !isNeighbour ? 0.25 : 1;

            return (
              <g key={n.id}
                transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                style={{ cursor: "pointer", opacity }}
                onMouseDown={ev => startDrag(ev, n.id)}
                onClick={ev => { ev.stopPropagation(); onSelect(isSel ? null : n); }}
              >
                {isSel && (
                  <circle r={r + 7} fill={color} fillOpacity={0.2} filter="url(#gp-glow)" />
                )}
                <circle
                  r={r}
                  fill={color}
                  fillOpacity={isSel ? 1 : 0.85}
                  stroke={isSel ? "#fff" : color}
                  strokeWidth={isSel ? 2 : 0.8}
                  strokeOpacity={isSel ? 1 : 0.4}
                />
                <text
                  y={r + 11}
                  textAnchor="middle"
                  fontSize={isSel ? "10" : "9"}
                  fontWeight={isSel ? "700" : "400"}
                  fill={isSel ? "#e2e8f0" : "#94a3b8"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {n.label.length > 20 ? n.label.slice(0, 18) + "…" : n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── legend chip ───────────────────────────────────────────────────────────────
function LegendChip({ type, count, active, onClick }) {
  const color = nodeColor(type);
  return (
    <button className={`gp-chip${active ? " gp-chip--on" : ""}`} onClick={onClick}
      style={{ "--chip-color": color }}>
      <span className="gp-chip__dot" />
      <span className="gp-chip__label">{type}</span>
      <span className="gp-chip__count">{count}</span>
    </button>
  );
}

// ── node detail panel ─────────────────────────────────────────────────────────
function NodeDetail({ node, edges, docs }) {
  if (!node) return (
    <div className="gp-detail gp-detail--empty">
      <p>Click a node to inspect it</p>
    </div>
  );

  const related  = edges.filter(e => e.source === node.id || e.target === node.id).slice(0, 14);
  const docNames = (node.doc_ids ?? [])
    .map(id => docs.find(d => d.doc_id === id)?.filename ?? id)
    .filter(Boolean);

  return (
    <div className="gp-detail">
      <div className="gp-detail__type-badge"
        style={{ background: nodeColor(node.type) + "22", color: nodeColor(node.type) }}>
        {node.type ?? "UNKNOWN"}
      </div>
      <p className="gp-detail__name">{node.label}</p>
      {node.description && <p className="gp-detail__desc">{node.description}</p>}

      <div className="gp-detail__stat-row">
        <span className="gp-detail__stat"><strong>{node.degree}</strong> connections</span>
        {docNames.length > 0 && (
          <span className="gp-detail__stat"><strong>{docNames.length}</strong> doc{docNames.length > 1 ? "s" : ""}</span>
        )}
      </div>

      {docNames.length > 0 && (
        <div className="gp-detail__section">
          <p className="gp-detail__section-title">Source documents</p>
          {docNames.map(name => <div key={name} className="gp-detail__doc-pill">{name}</div>)}
        </div>
      )}

      {related.length > 0 && (
        <div className="gp-detail__section">
          <p className="gp-detail__section-title">Relationships</p>
          {related.map(e => {
            const dir  = e.source === node.id ? "→" : "←";
            const peer = e.source === node.id ? e.target : e.source;
            return (
              <div key={e.id} className="gp-detail__rel">
                <span className="gp-detail__rel-dir">{dir}</span>
                <span className="gp-detail__rel-label">{e.relation || "related"}</span>
                <span className="gp-detail__rel-peer">{peer.length > 22 ? peer.slice(0, 20) + "…" : peer}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function GraphPage({ onBack, docs = [] }) {
  const [rawNodes,     setRawNodes]    = useState([]);
  const [rawEdges,     setRawEdges]    = useState([]);
  const [meta,         setMeta]        = useState(null);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState(null);

  const [selectedNode, setSelectedNode] = useState(null);
  const [filterDocId,  setFilterDocId]  = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [minDegree,    setMinDegree]    = useState(0);
  const [maxNodes,     setMaxNodes]     = useState(500);
  const [search,       setSearch]       = useState("");

  // ── fetch from backend ─────────────────────────────────────────────────────
  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const params = new URLSearchParams({ max_nodes: maxNodes, min_degree: minDegree });
      if (filterDocId) params.set("doc_id", filterDocId);
      const res  = await fetch(`${API}/graph/export?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      // Pass raw data straight to simulation — no pre-layout step
      setRawNodes(data.nodes);
      setRawEdges(data.edges);
      setMeta(data.meta);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterDocId, minDegree, maxNodes]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // ── client-side type + search filter (applied before passing to canvas) ────
  const visibleNodes = useMemo(() => rawNodes.filter(n => {
    if (filterType && n.type?.toUpperCase() !== filterType) return false;
    if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rawNodes, filterType, search]);

  const visibleIds   = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => rawEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [rawEdges, visibleIds]
  );

  // ── type counts for legend ─────────────────────────────────────────────────
  const typeCounts = useMemo(() => {
    const m = {};
    for (const n of rawNodes) {
      const t = n.type?.toUpperCase() ?? "UNKNOWN";
      m[t] = (m[t] ?? 0) + 1;
    }
    return m;
  }, [rawNodes]);

  return (
    <div className="gp-root">
      {/* header */}
      <div className="gp-header">
        <button className="gp-back" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>

        <div className="gp-header__title-group">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2">
            <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/>
            <circle cx="19" cy="19" r="2"/>
            <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
          </svg>
          <h1 className="gp-header__title">Knowledge Graph</h1>
          {meta && !loading && (
            <span className="gp-header__pill">
              {meta.returned_nodes.toLocaleString()} nodes · {meta.returned_edges.toLocaleString()} edges
              {meta.truncated && " · truncated"}
            </span>
          )}
        </div>

        <div className="gp-header__actions">
          <button className="gp-btn gp-btn--ghost" onClick={fetchGraph} disabled={loading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={loading ? "gp-spin" : ""}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* body */}
      <div className="gp-body">

        {/* left panel */}
        <div className="gp-panel">
          <div className="gp-panel__section">
            <label className="gp-panel__label">Search nodes</label>
            <div className="gp-search-wrap">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3,#475569)"
                strokeWidth="2" className="gp-search-icon">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="gp-input gp-search-input" placeholder="Entity name…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {docs.length > 0 && (
            <div className="gp-panel__section">
              <label className="gp-panel__label">Document</label>
              <select className="gp-select" value={filterDocId}
                onChange={e => setFilterDocId(e.target.value)}>
                <option value="">All documents</option>
                {docs.map(d => <option key={d.doc_id} value={d.filename}>{d.filename}</option>)}
              </select>
            </div>
          )}

          <div className="gp-panel__section">
            <label className="gp-panel__label">Min connections: <strong>{minDegree}</strong></label>
            <input type="range" min={0} max={20} value={minDegree}
              className="gp-range" onChange={e => setMinDegree(+e.target.value)} />
          </div>

          <div className="gp-panel__section">
            <label className="gp-panel__label">Max nodes: <strong>{maxNodes}</strong></label>
            <input type="range" min={50} max={2000} step={50} value={maxNodes}
              className="gp-range" onChange={e => setMaxNodes(+e.target.value)} />
          </div>

          {Object.keys(typeCounts).length > 0 && (
            <div className="gp-panel__section">
              <label className="gp-panel__label">Entity types</label>
              <div className="gp-chip-group">
                {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <LegendChip key={type} type={type} count={count}
                    active={filterType === type}
                    onClick={() => setFilterType(filterType === type ? "" : type)} />
                ))}
              </div>
            </div>
          )}

          {meta && (
            <div className="gp-panel__section gp-stats">
              <div className="gp-stats__row">
                <span>Total in graph</span>
                <span>{meta.total_nodes.toLocaleString()} nodes</span>
              </div>
              <div className="gp-stats__row">
                <span>Showing</span>
                <span>{visibleNodes.length.toLocaleString()} · {visibleEdges.length.toLocaleString()} edges</span>
              </div>
              {meta.truncated && (
                <div className="gp-stats__warn">Graph truncated — lower max nodes or filter by doc</div>
              )}
            </div>
          )}
        </div>

        {/* canvas */}
        <div className="gp-canvas-wrap">
          {loading && (
            <div className="gp-overlay">
              <div className="gp-spinner" />
              <p>Loading graph…</p>
            </div>
          )}
          {error && !loading && (
            <div className="gp-overlay gp-overlay--error">
              <p>⚠ {error}</p>
              <button className="gp-btn" onClick={fetchGraph}>Retry</button>
            </div>
          )}
          {!loading && !error && (
            <GraphCanvas
              rawNodes={visibleNodes}
              rawEdges={visibleEdges}
              selected={selectedNode}
              onSelect={setSelectedNode}
            />
          )}
          {!loading && rawNodes.length > 0 && (
            <div className="gp-hint">scroll to zoom · drag to pan · drag node to pin</div>
          )}
        </div>

        {/* right detail */}
        <div className="gp-detail-col">
          <p className="gp-panel__label" style={{ padding: "12px 14px 6px", marginBottom: 0 }}>
            Node detail
          </p>
          <NodeDetail node={selectedNode} edges={visibleEdges} docs={docs} />
        </div>

      </div>
    </div>
  );
}