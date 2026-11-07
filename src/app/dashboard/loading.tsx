export default function DashboardLoading() {
  return (
    <main className="dashboard-content" role="status" aria-live="polite" aria-busy="true">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">BUSINESS OVERVIEW</p>
          <h1>Overview</h1>
          <p>Loading your business summary…</p>
        </div>
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
