import { PageLoader } from "@/components/page-loader";

// TEMPORARY dev-only preview route for validating the new loader. Deleted after test.
export default function DevLoaderPreview() {
  return (
    <main style={{ padding: "24px", fontFamily: "var(--sans)", color: "#333" }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 14 }}>Fullscreen variant (fixed overlay)</h2>
      <div style={{ height: 320, border: "1px dashed #ccc", marginBottom: 40, display: "grid", placeItems: "center", color: "#999", fontSize: 12 }}>
        page content sits behind the fixed overlay
      </div>

      <h2 style={{ margin: "0 0 12px", fontSize: 14 }}>Inline variant (sized to parent, like an auth card)</h2>
      <div className="auth-card" style={{ display: "block" }}>
        <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>Suspense fallback slot:</div>
        <PageLoader variant="inline" label="Loading form" />
      </div>

      <PageLoader label="Loading dashboard" />
    </main>
  );
}
