import { useState, useEffect } from "react";
import "./StatsBar.css";

const fmt_k  = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v);
const fmt_mb = (v) => `${(v / 1_000_000).toFixed(1)} MB`;

const FEATURE_PILLS = [
  { key: "llm",          label: "LLM",      on: "ollama",  off: "offline" },
  { key: "reranker",     label: "reranker", on: "cross-encoder", off: "off" },
  { key: "spacy_ner",    label: "NER",      on: "spaCy",   off: "regex"   },
  { key: "pdf_parser",   label: "PDF",      on: "pdfplumber", off: "off"  },
  { key: "docx_parser",  label: "DOCX",     on: "python-docx", off: "off" },
];

function Pill({ active, label, onText, offText }) {
  return (
    <span
      className={`stats-pill${active ? " stats-pill--on" : " stats-pill--off"}`}
      title={`${label}: ${active ? onText : offText}`}
    >
      <span className="stats-pill__dot" />
      <span className="stats-pill__label">{label}</span>
      <span className="stats-pill__val">{active ? onText : offText}</span>
    </span>
  );
}

export default function StatsBar({ stats, health }) {
  const [expanded, setExpanded] = useState(false);

  if (!stats) {
    return <div className="stats-bar stats-bar--loading"><span className="stats-bar__pulse" /></div>;
  }

  const f = stats.features ?? {};

  return (
    <div className="stats-bar">
      {/* ── compact metric row ── */}
      <div className="stats-bar__metrics">
        <span className="stats-metric">
          <span className="stats-metric__val">{stats.documents ?? 0}</span>
          <span className="stats-metric__label">docs</span>
        </span>
        <span className="stats-metric__sep" />
        <span className="stats-metric">
          <span className="stats-metric__val">{fmt_k(stats.chunks ?? 0)}</span>
          <span className="stats-metric__label">chunks</span>
        </span>
        <span className="stats-metric__sep" />
        <span className="stats-metric">
          <span className="stats-metric__val">{fmt_k(stats.total_chars ?? 0)}</span>
          <span className="stats-metric__label">chars</span>
        </span>

        {/* embed model badge */}
        {stats.embed_model && (
          <>
            <span className="stats-metric__sep" />
            <span className="stats-metric stats-metric--embed" title={`Embedding model · dim ${stats.embed_dim ?? "?"}`}>
              <span className="stats-metric__icon">⬡</span>
              <span className="stats-metric__val">{stats.embed_model}</span>
              <span className="stats-metric__label">d{stats.embed_dim ?? "?"}</span>
            </span>
          </>
        )}
      </div>

      {/* ── feature pills ── */}
      <div className="stats-bar__pills">
        {FEATURE_PILLS.map(({ key, label, on, off }) => (
          <Pill key={key} active={!!f[key]} label={label} onText={on} offText={off} />
        ))}
      </div>

      {/* ── expandable health panel ── */}
      <button
        className={`stats-bar__expand-btn${expanded ? " stats-bar__expand-btn--open" : ""}`}
        onClick={() => setExpanded((e) => !e)}
        aria-label="Toggle system details"
        title="System details"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && health && (
        <div className="stats-bar__panel">
          <div className="stats-panel__grid">
            <Row label="Ollama host"   val={health.ollama_host  ?? "—"} />
            <Row label="LLM model"     val={health.ollama_model ?? "—"} mono />
            <Row label="Embed model"   val={health.embed_model  ?? stats.embed_model ?? "—"} mono />
            <Row label="Embed dim"     val={health.embed_dim    ?? stats.embed_dim    ?? "—"} />
            <Row label="DB path"       val={health.db_path      ?? "—"} mono small />
            <Row label="Storage dir"   val={health.rag_storage  ?? "—"} mono small />
            <Row label="Uptime"        val={health.uptime_s != null ? fmtUptime(health.uptime_s) : "—"} />
            <Row label="API version"   val={health.version      ?? "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, val, mono, small }) {
  return (
    <div className="stats-panel__row">
      <span className="stats-panel__label">{label}</span>
      <span className={`stats-panel__val${mono ? " stats-panel__val--mono" : ""}${small ? " stats-panel__val--small" : ""}`}>
        {val}
      </span>
    </div>
  );
}

function fmtUptime(s) {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}