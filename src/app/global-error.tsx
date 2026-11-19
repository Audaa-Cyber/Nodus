"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#08090a", color: "#fff", fontFamily: "Arial, sans-serif" }}><main style={{ maxWidth: 430, padding: 28, textAlign: "center" }}><p style={{ color: "#aeb7c2", fontSize: 10, letterSpacing: ".18em" }}>NODUS / SYSTEM</p><h1 style={{ fontSize: 38, fontWeight: 500, letterSpacing: "-1.8px" }}>A system interruption.</h1><p style={{ color: "#aeb7c2", fontSize: 13, lineHeight: 1.7 }}>Nodus could not render this page. Please try again.</p><button onClick={reset} style={{ marginTop: 20, padding: "12px 20px", border: 0, borderRadius: 999, background: "#fff", color: "#08090a", cursor: "pointer" }}>Try again</button></main></body></html>;
}
