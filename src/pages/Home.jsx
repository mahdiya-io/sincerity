import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Plant from "@/components/Plant.jsx";
import { fetchDailyBulletsFromGoal } from "@/lib/geminiDailyBullets.js";
import { notifySincerityStorageChanged, SINCERITY_STORAGE_EVENT } from "@/lib/sincerityPlantStorage.js";
import "./Home.css";

const LS_LEAVES = "sincerity_leaves";
const LS_LAST_ACT = "sincerity_last_act";
const LS_GOAL = "sincerity_goal";
const LS_DONATIONS = "sincerity_donations";
const LS_HASANAT = "sincerity_hasanat";
/** Cached AI daily checklist: { date, goal, entries: [{ text, done }] } (legacy: items: string[]) */
const LS_DAILY_BULLETS = "sincerity_home_daily_bullets_cache";

/** @typedef {{ text: string; done: boolean }} DailyEntry */

function normalizeDailyCache(raw, date, goal) {
  try {
    const c = JSON.parse(raw);
    if (c?.date !== date || c?.goal !== goal) return null;
    if (Array.isArray(c.entries)) {
      const entries = c.entries
        .filter((e) => e && typeof e.text === "string")
        .map((e) => ({ text: String(e.text).trim(), done: Boolean(e.done) }))
        .filter((e) => e.text)
        .slice(0, 3);
      return entries.length >= 2 ? entries : null;
    }
    if (Array.isArray(c.items)) {
      const items = c.items
        .filter((x) => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (items.length >= 2) return items.map((text) => ({ text, done: false }));
    }
  } catch {
    return null;
  }
  return null;
}

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

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function PencilIcon() {
  return (
    <svg className="home__goal-edit-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [dailyEntries, setDailyEntries] = useState(/** @type {DailyEntry[]} */ ([]));
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(/** @type {string | null} */ (null));
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const goalTextareaRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));

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

  useEffect(() => {
    if (!goalEditOpen) return;
    setGoalDraft(readGoal());
    const t = window.requestAnimationFrame(() => goalTextareaRef.current?.focus());
    const onKey = (e) => {
      if (e.key === "Escape") setGoalEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [goalEditOpen]);

  useEffect(() => {
    const goal = readGoal().trim();
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!goal) {
      setDailyEntries([]);
      setDailyLoading(false);
      setDailyError(null);
      return;
    }

    if (!apiKey || String(apiKey).trim() === "") {
      setDailyEntries([]);
      setDailyLoading(false);
      setDailyError(null);
      return;
    }

    const date = todayYmd();
    const donationCount = parseJsonArray(LS_DONATIONS).length;
    const hasanatCount = parseJsonArray(LS_HASANAT).length;

    const raw = localStorage.getItem(LS_DAILY_BULLETS);
    if (raw) {
      const cached = normalizeDailyCache(raw, date, goal);
      if (cached) {
        setDailyEntries(cached);
        try {
          const c = JSON.parse(raw);
          if (!Array.isArray(c.entries) && Array.isArray(c.items)) {
            localStorage.setItem(LS_DAILY_BULLETS, JSON.stringify({ date, goal, entries: cached }));
          }
        } catch {
          /* ignore */
        }
        setDailyLoading(false);
        setDailyError(null);
        return;
      }
    }

    const ac = new AbortController();
    setDailyLoading(true);
    setDailyError(null);
    setDailyEntries([]);

    (async () => {
      try {
        const items = await fetchDailyBulletsFromGoal(apiKey, goal, ac.signal, {
          donationCount,
          hasanatCount,
        });
        if (ac.signal.aborted) return;
        const entries = items.map((text) => ({ text, done: false }));
        setDailyEntries(entries);
        localStorage.setItem(LS_DAILY_BULLETS, JSON.stringify({ date, goal, entries }));
      } catch (e) {
        if (ac.signal.aborted) return;
        setDailyEntries([]);
        setDailyError(e instanceof Error ? e.message : "Could not load daily suggestions.");
      } finally {
        if (!ac.signal.aborted) setDailyLoading(false);
      }
    })();

    return () => ac.abort();
  }, [refresh]);

  const closeGoalEdit = useCallback(() => setGoalEditOpen(false), []);

  const saveGoalEdit = useCallback(() => {
    const prev = readGoal().trim();
    const t = goalDraft.trim();
    if (t) localStorage.setItem(LS_GOAL, t);
    else localStorage.removeItem(LS_GOAL);
    if (t !== prev) {
      try {
        localStorage.removeItem(LS_DAILY_BULLETS);
      } catch {
        /* ignore */
      }
    }
    notifySincerityStorageChanged();
    setGoalEditOpen(false);
    refresh();
  }, [goalDraft]);

  const toggleDailyEntry = useCallback((index) => {
    setDailyEntries((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev.map((e, i) => (i === index ? { ...e, done: !e.done } : e));
      const goal = readGoal().trim();
      const date = todayYmd();
      try {
        localStorage.setItem(LS_DAILY_BULLETS, JSON.stringify({ date, goal, entries: next }));
      } catch {
        /* ignore quota */
      }
      return next;
    });
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
        <div className="home__goal-heading-row">
          <h2 id="home-goal-heading" className="home__goal-label">
            Your goal
          </h2>
          <button
            type="button"
            className="home__goal-edit"
            title="Edit goal"
            aria-label="Edit goal"
            onClick={() => setGoalEditOpen(true)}
          >
            <PencilIcon />
          </button>
        </div>
        <p className="home__goal-text">{goal.trim() ? goal : "No goal pinned yet — set one during onboarding."}</p>

        {goal.trim() ? (
          <div className="home__daily" aria-live="polite">
            <h3 className="home__daily-label">Today</h3>
            {dailyLoading ? <p className="home__daily-muted">Gathering small steps for you…</p> : null}
            {!dailyLoading && dailyError ? <p className="home__daily-err">{dailyError}</p> : null}
            {!dailyLoading && !dailyError && dailyEntries.length >= 2 ? (
              <ul className="home__daily-list">
                {dailyEntries.map((entry, idx) => (
                  <li key={`${idx}-${entry.text.slice(0, 28)}`} className="home__daily-item">
                    <label className={`home__daily-check${entry.done ? " home__daily-check--done" : ""}`}>
                      <input
                        type="checkbox"
                        className="home__daily-input"
                        checked={entry.done}
                        onChange={() => toggleDailyEntry(idx)}
                        aria-label={entry.done ? `Done: ${entry.text}` : `Mark done: ${entry.text}`}
                      />
                      <span className="home__daily-check-text">{entry.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            {!dailyLoading &&
            !dailyError &&
            dailyEntries.length < 2 &&
            (!import.meta.env.VITE_GEMINI_API_KEY || String(import.meta.env.VITE_GEMINI_API_KEY).trim() === "") ? (
              <p className="home__daily-muted">
                Add <code className="home__daily-code">VITE_GEMINI_API_KEY</code> in <code className="home__daily-code">.env</code>{" "}
                to see AI daily steps here.
              </p>
            ) : null}
            {!dailyLoading &&
            !dailyError &&
            dailyEntries.length < 2 &&
            import.meta.env.VITE_GEMINI_API_KEY &&
            String(import.meta.env.VITE_GEMINI_API_KEY).trim() !== "" ? (
              <p className="home__daily-muted">No suggestions loaded — try refreshing the page.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {goalEditOpen ? (
        <div
          className="home__goal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeGoalEdit();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-goal-edit-title"
            className="home__goal-dialog"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="home-goal-edit-title" className="home__goal-dialog-title">
              Edit goal
            </h3>
            <textarea
              ref={goalTextareaRef}
              className="home__goal-dialog-input"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              rows={5}
              placeholder="Describe your intention in your own words…"
            />
            <div className="home__goal-dialog-actions">
              <button type="button" className="home__goal-dialog-btn home__goal-dialog-btn--primary" onClick={saveGoalEdit}>
                Save
              </button>
              <button type="button" className="home__goal-dialog-btn" onClick={closeGoalEdit}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
