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
      <body style={{ minHeight: "100vh", margin: 0, background: "#09090b", color: "#f4f4f5", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h2 style={{ color: "#f87171", fontSize: 20, fontWeight: 700 }}>GatePass is temporarily unavailable</h2>
            <p style={{ color: "#a1a1aa", fontSize: 14 }}>Please try again in a moment.</p>
            {error.digest && <p style={{ color: "#52525b", fontSize: 11 }}>Reference: {error.digest}</p>}
            <button
              type="button"
              onClick={() => reset()}
              style={{ marginTop: 12, padding: "8px 16px", background: "#ea580c", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
