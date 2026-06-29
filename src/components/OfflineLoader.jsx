import { useEffect, useState } from "react";

/**
 * OfflineLoader
 * Shown while /health is unreachable or pending.
 *
 * Props:
 *   status   — "connecting" | "health-fail"
 *   onRetry  — called when user clicks "Retry now"
 *
 * The parent auto-retries every 5 s; this component just counts down
 * and shows a live "retrying in Ns…" label.
 */
export default function OfflineLoader({ status = "connecting", onRetry }) {
  const [countdown, setCountdown] = useState(5);

  // Reset + tick countdown whenever we're in a non-ready state.
  useEffect(() => {
    if (status === "connecting") { setCountdown(5); return; }
    setCountdown(5);
    const id = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(id); return 5; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  const isFailed = status === "health-fail";

  return (
    <div className="offline-loader">
      <div className="offline-loader__icon-wrap">
        <div className="offline-loader__ring" />
        <div className="offline-loader__ring offline-loader__ring--2" />
        <div className="offline-loader__icon-bg">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="#534AB7" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
      </div>

      <div className="offline-loader__tag">
        <span className="offline-loader__tag-dot" />
        {isFailed ? "Backend offline" : "Connecting"}
        {!isFailed && (
          <span className="offline-loader__dots">
            <span /><span /><span />
          </span>
        )}
      </div>

      <p className="offline-loader__title">
          {isFailed ? "Cannot reach the backend" : "Starting up DocSearch"}
        </p>
        <p className="offline-loader__subtitle">
          {isFailed
            ? "The health check failed. Make sure your backend is running, then we'll reconnect automatically."
            : "Waiting for the backend to respond…"}
        </p>

        <div className="offline-loader__checks">
    <div
      className={`offline-loader__check offline-loader__check--${
        isFailed ? "fail" : "spinning"
      }`}
    >
      {isFailed ? (
        <span className="offline-loader__check-icon offline-loader__check-icon--fail">
          ✕
        </span>
      ) : (
        <span className="offline-loader__spinner" />
      )}

      <span>
        {isFailed ? (
          "Backend connection failed"
        ) : (
          "Waiting for backend…"
        )}
      </span>
    </div>
  </div>

      {isFailed && (
        <p className="offline-loader__countdown">
          Retrying automatically
        </p>
      )}

      <button className="offline-loader__retry" onClick={onRetry}>
        ↻ Retry now
      </button>
    </div>
  );
}