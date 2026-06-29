import { useState, useRef, useEffect } from "react";
import { chatStream } from "../api.js";
import { Spinner, CitationBadge, ErrorBanner } from "./ui.jsx";
import ReactMarkdown from "react-markdown";
import "./ChatBox.css";

export default function ChatBox({ onCitationClick }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error,     setError]     = useState(null);
  const [mode,      setMode]      = useState("hybrid");
  const [topK,      setTopK]      = useState(5);
  const [rerank,    setRerank]    = useState(true);
  const scrollRef                 = useRef();
  const abortRef                  = useRef();
  const textareaRef               = useRef();

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };
  useEffect(scrollToBottom, [messages]);

  const sendMessage = () => {
    if (!input.trim() || streaming) return;

    const userContent = input.trim();

    // FIX #1: Snapshot history from the CURRENT messages (before we add the
    // new user + assistant shells).  This means the history sent to the backend
    // contains only completed prior turns — not the empty assistant placeholder
    // we're about to append.
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: "user",      content: userContent, id: Date.now() },
      { role: "assistant", content: "", citations: [], streaming: true, id: Date.now() + 1 },
    ]);
    setInput("");
    setError(null);
    setStreaming(true);

    abortRef.current = chatStream(
      { query: userContent, history, top_k: topK, use_reranking: rerank, search_mode: mode },
      {
        onCitations: (cits) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = { ...next[next.length - 1], citations: cits };
            next[next.length - 1] = last;
            return next;
          });
        },
        onToken: (text) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            last.content += text;
            next[next.length - 1] = last;
            return next;
          });
        },
        onDone: () => {
          setMessages((prev) => {
            const next = [...prev];
            const last = { ...next[next.length - 1], streaming: false };
            next[next.length - 1] = last;
            return next;
          });
          setStreaming(false);
        },
        onError: (e) => {
          setError(e.message);
          setMessages((prev) => {
            const next = [...prev];
            // FIX #2: read from `next`, not `prev` — `next` is the mutated
            // copy; `prev[prev.length - 1]` still has the old (empty) content.
            const last = { ...next[next.length - 1], streaming: false };
            if (!last.content) last.content = "[Error receiving response]";
            next[next.length - 1] = last;
            return next;
          });
          setStreaming(false);
        },
      }
    );
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1], streaming: false };
      next[next.length - 1] = last;
      return next;
    });
  };

  const clearChat = () => {
    if (streaming) cancelStream();
    setMessages([]);
    setError(null);
  };

  const renderContent = (content, citations) => {
    if (!content) return null;

    // Split on citation markers, keeping them as tokens
    const parts = content.split(/(\[\d+\])/g);

    return parts.map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const num = parseInt(m[1]);
        const cit = citations?.[num - 1];
        return (
          <CitationBadge
            key={i}
            num={num}
            onClick={() => cit && onCitationClick?.(cit)}
          />
        );
      }
      // Render each text segment as markdown
      return part ? (
        <ReactMarkdown key={i} className="md-content">
          {part}
        </ReactMarkdown>
      ) : null;
    });
  };

  return (
    <div className="chat">
      {/* Toolbar */}
      <div className="chat__toolbar">
        {/* FIX #3: added "full" mode option to match backend */}
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="hybrid">Hybrid</option>
          <option value="full">Full (BM25 + semantic + graph)</option>
          <option value="graph">Graph</option>
          <option value="keyword">Keyword</option>
          <option value="semantic">Semantic</option>
        </select>
        <select className="select" value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
          {[3, 5, 8, 10].map((n) => <option key={n} value={n}>Top {n}</option>)}
        </select>
        <label className="chat__toggle">
          <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
          <span>Rerank</span>
        </label>
        {messages.length > 0 && (
          <button className="btn btn--ghost btn--sm chat__clear" onClick={clearChat} title="Clear conversation">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="chat__messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat__welcome">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border-2)" strokeWidth="1">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <p>Ask anything about your uploaded documents</p>
            <p className="chat__welcome-sub">Answers include inline citations you can click to jump to the source</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`message message--${m.role}`}>
              <div className="message__label">{m.role === "user" ? "You" : "System"}</div>
              <div className="message__bubble">
                {m.role === "assistant"
                  ? <>{renderContent(m.content, m.citations)}{m.streaming && <span className="cursor-blink" />}</>
                  : m.content
                }
              </div>
              {m.role === "assistant" && m.citations?.length > 0 && !m.streaming && (
                <div className="message__sources">
                  <div className="message__sources-label">Sources</div>
                  {m.citations.map((c, ci) => (
                    <button key={c.chunk_id} className="source-card" onClick={() => onCitationClick?.(c)}>
                      <span className="source-card__num">[{ci + 1}]</span>
                      <div className="source-card__body">
                        <div className="source-card__name">{c.doc_name}</div>
                        <div className="source-card__snip">{c.snippet?.slice(0, 90)}{c.snippet?.length > 90 ? "…" : ""}</div>
                      </div>
                      <span className="source-card__score" title="Relevance score">
                        {(c.score * 100).toFixed(0)}%
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Input */}
      <div className="chat__input-area">
        <textarea
          ref={textareaRef}
          className="chat__textarea"
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
          }}
          rows={2}
          disabled={streaming}
        />
        {streaming ? (
          <button className="btn btn--danger btn--sm chat__send" onClick={cancelStream} title="Stop generation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
          </button>
        ) : (
          <button className="btn btn--primary chat__send" onClick={sendMessage} disabled={!input.trim()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}