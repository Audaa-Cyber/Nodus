export default function SettingsLoading() {
  return (
    <main className="dashboard-content narrow-content" role="status" aria-live="polite" aria-busy="true">
      <header className="page-title">
        <p className="eyebrow">ACCOUNT</p>
        <h1>Business profile</h1>
        <p>Loading business details…</p>
      </header>
      <div className="newtons-cradle" style={{ margin: "48px auto" }} aria-hidden="true">
        <div className="newtons-cradle__dot"></div>
        <div className="newtons-cradle__dot"></div>
        <div className="newtons-cradle__dot"></div>
        <div className="newtons-cradle__dot"></div>
      </div>
    </main>
  );
}

