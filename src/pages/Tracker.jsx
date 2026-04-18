export default function Tracker() {
  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Tracker</h1>
        <p className="page__lede">
          This screen is ready for prayer, fasting, Quran, or custom habits. Wire your
          checklist or calendar here when you are ready.
        </p>
      </header>
      <section className="page__panel" aria-label="Empty state">
        <p className="page__muted">No habits tracked yet — UI placeholder.</p>
      </section>
    </div>
  );
}
