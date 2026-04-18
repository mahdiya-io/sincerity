import { useEffect, useReducer } from "react";
import Plant from "@/components/Plant.jsx";
import { SINCERITY_STORAGE_EVENT } from "@/lib/sincerityPlantStorage.js";
import "./Home.css";

const LS_LEAVES = "sincerity_leaves";
const LS_LAST_ACT = "sincerity_last_act";
const LS_GOAL = "sincerity_goal";
const LS_DONATIONS = "sincerity_donations";
const LS_HASANAT = "sincerity_hasanat";

function parseJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function readLeaves() {
  const raw = localStorage.getItem(LS_LEAVES);
  if (raw == null || raw === "") return 0;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(7, Math.max(0, n));
}

function readLastAct() {
  const raw = localStorage.getItem(LS_LAST_ACT);
  if (raw == null || raw === "") return null;
  const t = Number(raw);
  return Number.isFinite(t) ? t : null;
}

function readGoal() {
  const g = localStorage.getItem(LS_GOAL);
  return g == null ? "" : String(g);
}

/** >3d → 0.3, >7d → 0.7, >10d → 1; ≤3d or no timestamp → 0. */
function computeWilt(lastActMs) {
  if (lastActMs == null) return 0;
  const days = (Date.now() - lastActMs) / 86_400_000;
  if (days <= 3) return 0;
  if (days <= 7) return 0.3;
  if (days <= 10) return 0.7;
  return 1;
}

export default function Home() {
  const [, refresh] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const bump = () => refresh();
    window.addEventListener("storage", bump);
    window.addEventListener("focus", bump);
    window.addEventListener(SINCERITY_STORAGE_EVENT, bump);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("focus", bump);
      window.removeEventListener(SINCERITY_STORAGE_EVENT, bump);
    };
  }, []);

  const leaves = readLeaves();
  const lastAct = readLastAct();
  const goal = readGoal();
  const wilt = computeWilt(lastAct);

  const donations = parseJsonArray(LS_DONATIONS);
  const hasanat = parseJsonArray(LS_HASANAT);

  return (
    <div
      className="home"
      data-donations-count={donations.length}
      data-hasanat-count={hasanat.length}
    >
      <header className="home__greet" dir="rtl" lang="ar">
        <h1 className="home__salam">السلام عليكم</h1>
      </header>

      <div className="home__plant-wrap" aria-hidden>
        <Plant leaves={leaves} wilt={wilt} />
      </div>

      <blockquote className="home__ayah" cite="https://quran.com/2/261">
        <p className="home__ayah-text">
          &ldquo;The example of those who spend their wealth in the cause of Allah is that of a grain
          that sprouts into seven ears&hellip;&rdquo;
        </p>
        <footer className="home__ayah-ref">Quran 2:261</footer>
      </blockquote>

      <section className="home__goal" aria-labelledby="home-goal-heading">
        <h2 id="home-goal-heading" className="home__goal-label">
          Your goal
        </h2>
        <p className="home__goal-text">{goal.trim() ? goal : "No goal pinned yet — set one during onboarding."}</p>
      </section>
    </div>
  );
}
