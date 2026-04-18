import { Navigate, Route, Routes } from "react-router-dom";
import Hasanat from "@/pages/Hasanat.jsx";
import Home from "@/pages/Home.jsx";
import Onboarding from "@/pages/Onboarding.jsx";
import Sadaqah from "@/pages/Sadaqah.jsx";
import Profile from "@/pages/Profile.jsx";

const LS_ONBOARDING_DONE = "sincerity_onboarding_complete";

function RootRedirect() {
  const done = localStorage.getItem(LS_ONBOARDING_DONE) === "1";
  return <Navigate to={done ? "/home" : "/onboarding"} replace />;
}

function RequireOnboarding({ children }) {
  if (localStorage.getItem(LS_ONBOARDING_DONE) !== "1") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        path="/home"
        element={
          <RequireOnboarding>
            <Home />
          </RequireOnboarding>
        }
      />
      <Route path="/tracker" element={<Navigate to="/profile" replace />} />
      <Route
        path="/profile"
        element={
          <RequireOnboarding>
            <Profile />
          </RequireOnboarding>
        }
      />
      <Route
        path="/hasanat"
        element={
          <RequireOnboarding>
            <Hasanat />
          </RequireOnboarding>
        }
      />
      <Route
        path="/sadaqah"
        element={
          <RequireOnboarding>
            <Sadaqah />
          </RequireOnboarding>
        }
      />
    </Routes>
  );
}
