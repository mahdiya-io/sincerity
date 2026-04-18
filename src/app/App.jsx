import { NavLink, useLocation } from "react-router-dom";
import { AppRoutes } from "./routes.jsx";

function tabLinkClass({ isActive }) {
  return `app-tabnav__link${isActive ? " app-tabnav__link--active" : ""}`;
}

export default function App() {
  const { pathname } = useLocation();
  const showTabs = pathname !== "/onboarding";

  return (
    <div className="app-shell">
      <main className={`app-main${showTabs ? " app-main--tabbed" : ""}`}>
        <AppRoutes />
      </main>
      {showTabs ? (
        <nav className="app-tabnav" aria-label="Primary">
          <NavLink to="/home" className={tabLinkClass} end>
            Home
          </NavLink>
          <NavLink to="/tracker" className={tabLinkClass}>
            Tracker
          </NavLink>
          <NavLink to="/hasanat" className={tabLinkClass}>
            Hasanat
          </NavLink>
          <NavLink to="/sadaqah" className={tabLinkClass}>
            Sadaqah
          </NavLink>
        </nav>
      ) : null}
    </div>
  );
}
