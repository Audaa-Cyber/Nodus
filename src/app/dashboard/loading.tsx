export default function DashboardLoading() {
  return <main className="dashboard-content dashboard-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="newtons-cradle" aria-hidden="true">
      <div className="newtons-cradle__dot"></div>
      <div className="newtons-cradle__dot"></div>
      <div className="newtons-cradle__dot"></div>
      <div className="newtons-cradle__dot"></div>
    </div>
    <p>Loading your business…</p>
  </main>;
}
