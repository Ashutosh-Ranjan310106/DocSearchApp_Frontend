import { useState } from "react";
import { search } from "../api.js";
import { Spinner, CitationBadge, ErrorBanner } from "./ui.jsx";
import "./SearchPanel.css";

export default function SearchPanel({ onCitationClick }) {
  const [query,    setQuery]    = useState("");
  const [mode,     setMode]     = useState("hybrid");
  const [topK,     setTopK]     = useState(5);
  const [loading,  setLoading]  = useState(false);
  const [results,  setResults]  = useState(null);
  const [error,    setError]    = useState(null);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await search({ query, top_k: topK, search_mode: mode });
      setResults(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-panel">
      <div className="search-row">
        <input
          className="input search-input"
          placeholder="Search knowledge base…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <button className="btn btn--primary btn--sm search-btn" onClick={doSearch} disabled={loading || !query.trim()}>
          {loading ? <Spinner size={13} color="#fff" /> : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          )}
        </button>
      </div>

      <div className="search-controls">
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="hybrid">Hybrid</option>
          <option value="semantic">Semantic</option>
          <option value="keyword">Keyword (BM25)</option>
        </select>
        <select className="select" value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
          {[3, 5, 8, 10, 15].map((n) => (
            <option key={n} value={n}>Top {n}</option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {results && (
        <div className="search-results">
          <div className="search-results__header">
            <span>{results.count} results</span>
            <span className="search-results__mode">{results.mode}</span>
          </div>

          {results.results.length === 0 ? (
            <p className="search-empty">No chunks matched your query</p>
          ) : (
            results.results.map((r, i) => (
              <div
                key={r.chunk_id}
                className="search-result"
                onClick={() => onCitationClick?.({ ...results.citations[i], chunk_id: r.chunk_id, doc_id: r.doc_id })}
              >
                <div className="search-result__header">
                  <CitationBadge num={i + 1} />
                  <span className="search-result__doc" title={r.doc_name}>{r.doc_name}</span>
                  <div className="search-result__scores">
                    <span title="Combined score" style={{ color: "var(--cyan)" }}>{pct(r.score)}</span>
                    {r.sem_score  != null && <span title="Semantic"  style={{ color: "var(--indigo)" }}>S:{pct(r.sem_score)}</span>}
                    {r.bm25_score != null && <span title="BM25"      style={{ color: "var(--amber)" }}>K:{pct(r.bm25_score)}</span>}
                  </div>
                </div>
                <p className="search-result__text">{r.text.slice(0, 200)}{r.text.length > 200 ? "…" : ""}</p>
                {r.entities?.length > 0 && (
                  <div className="search-result__ents">
                    {r.entities.slice(0, 4).map((e) => (
                      <span key={e.text} className="entity-tag">{e.text}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const pct = (n) => `${(n * 100).toFixed(0)}%`;
