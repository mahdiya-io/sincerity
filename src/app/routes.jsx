import { Navigate, Route, Routes } from "react-router-dom";
import Hasanat from "@/pages/Hasanat.jsx";
import Home from "@/pages/Home.jsx";
import Onboarding from "@/pages/Onboarding.jsx";
import Sadaqah from "@/pages/Sadaqah.jsx";
import Tracker from "@/pages/Tracker.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/onboarding" replace />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/home" element={<Home />} />
      <Route path="/tracker" element={<Tracker />} />
      <Route path="/hasanat" element={<Hasanat />} />
      <Route path="/sadaqah" element={<Sadaqah />} />
    </Routes>
  );
}
