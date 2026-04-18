import { Link } from "react-router-dom";

export default function Onboarding() {
  return (
    <div className="page page--center">
      <header className="page__header">
        <h1 className="page__title">Sincerity</h1>
        <p className="page__lede">
          Track sadaqah, daily habits, and hasanat in one simple app shell.
        </p>
      </header>
      <Link className="page__cta" to="/home">
        Continue
      </Link>
    </div>
  );
}
