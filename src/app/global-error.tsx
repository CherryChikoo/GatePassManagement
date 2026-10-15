"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body style={{ minHeight: "100vh", margin: 0, background: "#f4f4f6", color: "#18181b", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h2 style={{ color: "#dc2626", fontSize: 20, fontWeight: 600 }}>Gate Pass is temporarily unavailable</h2>
            <p style={{ color: "#6b6b73", fontSize: 14 }}>Please try again in a moment.</p>
            {error.digest && <p style={{ color: "#9a9aa2", fontSize: 11 }}>Reference: {error.digest}</p>}
            <button
              type="button"
              onClick={() => reset()}
              style={{ marginTop: 12, padding: "8px 16px", background: "#cf3e25", color: "#fff", border: 0, borderRadius: 999, fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
