export default function InvoicesLoading() {
  return (
    <main className="dashboard-content" role="status" aria-live="polite" aria-busy="true">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">BUSINESS MANAGEMENT</p>
          <h1>Invoices</h1>
          <p>Loading your invoices…</p>
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

