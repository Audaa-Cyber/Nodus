export default function PublicInvoiceLoading() {
  return <main className="public-invoice-page" role="status" aria-live="polite" aria-busy="true">
    <section className="public-invoice-card public-invoice-state public-invoice-loading">
      <div className="newtons-cradle" aria-hidden="true">
        <div className="newtons-cradle__dot"></div>
        <div className="newtons-cradle__dot"></div>
        <div className="newtons-cradle__dot"></div>
        <div className="newtons-cradle__dot"></div>
      </div>
      <p>Loading invoice details…</p>
    </section>
  </main>;
}
