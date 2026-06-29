import "./ui.css";

export function Spinner({ size = 16, color }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      className="spinner"
      style={color ? { color } : undefined}
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="3"
        fill="none"
        strokeDasharray="31.4" strokeDashoffset="10"
      />
    </svg>
  );
}

export function StatusDot({ status = "ready" }) {
  const colors = { ready: "var(--green)", processing: "var(--amber)", error: "var(--red)", idle: "var(--text-3)" };
  return (
    <span
      className="status-dot"
      style={{ background: colors[status] || colors.idle }}
      title={status}
    />
  );
}

export function CitationBadge({ num, onClick, active }) {
  return (
    <button
      className={`citation-badge${active ? " citation-badge--active" : ""}`}
      onClick={onClick}
      title={`Jump to source [${num}]`}
    >
      [{num}]
    </button>
  );
}

export function EntityTag({ text, label }) {
  return (
    <span className="entity-tag" title={label}>{text}</span>
  );
}

export function Badge({ children }) {
  return <span className="badge">{children}</span>;
}

export function EmptyState({ icon, message, sub }) {
  return (
    <div className="empty-state">
      {icon}
      <span className="empty-state__msg">{message}</span>
      {sub && <span className="empty-state__sub">{sub}</span>}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="error-banner__close">×</button>
      )}
    </div>
  );
}
