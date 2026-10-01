"use client";

/**
 * `global-error.tsx` replaces the root layout, which means the component cannot
 * rely on anything the layout provides — including the Tailwind theme tokens it
 * wires up. Inline styles keep this page readable even if the stylesheet never
 * loads.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // A per-render reset (`reset`) re-runs the failed render without a reload;
    // the digest is the correlation id support can find in the server logs.
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#0f1115",
          color: "#f4f5f7",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            borderRadius: 16,
            border: "1px solid #2a2f38",
            background: "#171a20",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Something broke on our side
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: "#a2a9b5" }}>
            The page could not be rendered. Any seat hold you had is unaffected — holds live in Redis
            and expire on their own.
          </p>
          {error.digest && (
            <p style={{ marginTop: 12, fontSize: 11, color: "#6f7783", fontFamily: "ui-monospace, monospace" }}>
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              height: 40,
              padding: "0 18px",
              borderRadius: 12,
              border: "none",
              background: "#0f9a6b",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
