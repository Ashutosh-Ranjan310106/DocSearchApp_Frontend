const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Documents ─────────────────────────────────────────────────────────────────
export const uploadDocument = (file, onProgress) => {
  const fd = new FormData();
  fd.append("file", file);
  return request("/documents/upload", { method: "POST", body: fd });
};

export const listDocuments   = ()        => request("/documents");
export const getDocument     = (id)      => request(`/documents/${id}`);
export const deleteDocument  = (id)      => request(`/documents/${id}`, { method: "DELETE" });

export const getDocumentChunks = (docId, page = 0, size = 15) =>
  request(`/documents/${docId}/chunks?page=${page}&size=${size}`);

export const getChunk = (docId, chunkId) =>
  request(`/documents/${docId}/chunks/${chunkId}`);

// ── Search ────────────────────────────────────────────────────────────────────
export const search = ({ query, top_k = 5, search_mode = "hybrid", doc_ids = null }) =>
  request("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k, search_mode, doc_ids }),
  });

export const entitySearch = ({ entities, top_k = 10 }) =>
  request("/search/entities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entities, top_k }),
  });

export const listEntities = (doc_id) =>
  request(doc_id ? `/entities?doc_id=${doc_id}` : "/entities");

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatSync = ({ query, history, top_k, use_reranking, search_mode }) =>
  request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history, top_k, use_reranking, search_mode }),
  });

/**
 * Streaming chat — returns an AbortController so caller can cancel.
 * Calls onCitations(citations[]), onToken(text), onDone(), onError(err).
 */
export const chatStream = ({ query, history, top_k, use_reranking, search_mode }, { onCitations, onToken, onDone, onError }) => {
  const ctrl = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, history, top_k, use_reranking, search_mode }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(await res.text());

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // keep incomplete last part

        for (const part of parts) {
          const lines     = part.split("\n");
          let eventType   = "message";
          let dataStr     = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: "))  dataStr   = line.slice(6).trim();
          }

          if (!dataStr) continue;

          if (eventType === "citations") {
            onCitations?.(JSON.parse(dataStr));
          } else if (eventType === "done") {
            onDone?.();
            return;
          } else if (eventType === "error") {
            onError?.(new Error(JSON.parse(dataStr).error || "Stream error"));
            return;
          } else {
            try {
              const payload = JSON.parse(dataStr);
              if (payload.text) onToken?.(payload.text);
            } catch {}
          }
        }
      }
      onDone?.();
    } catch (e) {
      if (e.name !== "AbortError") onError?.(e);
    }
  })();

  return ctrl;
};

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => request("/health");
export async function getHealth() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`health: ${res.status}`);
  return res.json();
}
 
// Alias — GET / returns the same shape (minus live doc/chunk counts)
export async function getRoot() {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`root: ${res.status}`);
  return res.json();
}
