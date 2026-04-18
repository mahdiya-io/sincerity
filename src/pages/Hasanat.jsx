import { useCallback, useMemo, useState } from "react";
import { recordDonationForPlantGrowth } from "@/lib/sincerityPlantStorage.js";
import { HASANAT_GOALS } from "../data/goals";
import "./Home.css";
import "./Sadaqah.css";

const HASANAT_KEY = "sincerity_hasanat";
const MONTH_GOAL_TEXT_KEY = "sincerity_goal";

const CHART_COLORS = [
  "var(--color-antique-gold)",
  "var(--color-sage)",
  "var(--color-olive)",
  "var(--color-wood-brown)",
  "#c4a574",
  "#8f9a5c",
  "#d4bc8c",
  "#5c6d2e",
];

function loadHasanat() {
  try {
    const raw = localStorage.getItem(HASANAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHasanat(list) {
  localStorage.setItem(HASANAT_KEY, JSON.stringify(list));
}

/** Pie slices: each logged act counts as 1 toward its goal label. */
function aggregateHasanatByGoal(entries) {
  const map = new Map();
  for (const row of entries) {
    const gid = String(row.goalId ?? "").trim();
    const goal = HASANAT_GOALS.find((g) => g.id === gid);
    const key = goal ? goal.name.trim() : gid || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([cause, total]) => ({ cause, total }))
    .sort((a, b) => b.total - a.total);
}

function buildConicGradient(entries) {
  const total = entries.reduce((s, e) => s + e.total, 0);
  if (total <= 0) {
    return { background: "var(--color-olive)", legend: [] };
  }

  let acc = 0;
  const parts = [];
  const legend = entries.map((e, i) => {
    const pct = (e.total / total) * 100;
    const start = acc;
    acc += pct;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    parts.push(`${color} ${start}% ${acc}%`);
    return {
      cause: e.cause,
      total: e.total,
      pct,
      color,
    };
  });

  return {
    background: `conic-gradient(${parts.join(", ")})`,
    legend,
  };
}

function todayInputDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function GoalSelect({ value, onChange }) {
  return (
    <label className="sadaqah__label">
      <span className="sadaqah__label-text">Which goal is this for?</span>
      <select
        className="sadaqah__input"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
      >
        <option value="" disabled>
          Select a cause
        </option>
        {HASANAT_GOALS.map((goal) => (
          <option key={goal.id} value={goal.id}>
            {goal.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function goalLabelForId(goalId) {
  const g = HASANAT_GOALS.find((x) => x.id === goalId);
  return g ? g.name : goalId || "—";
}

export default function Hasanat() {
  const [entries, setEntries] = useState(loadHasanat);
  const [goalId, setGoalId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInputDate);
  const [sheetOpen, setSheetOpen] = useState(false);

  const monthGoalProgress = useMemo(() => {
    let goalStr = "";
    try {
      goalStr = localStorage.getItem(MONTH_GOAL_TEXT_KEY) ?? "";
    } catch {
      goalStr = "";
    }
    const match = goalStr.match(/\$(\d+)/);
    const goalAmount = match ? parseInt(match[1], 10) : null;

    let list = [];
    try {
      const raw = localStorage.getItem(HASANAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      list = [];
    }

    const totalDonated = list.length;

    const validGoal = goalAmount != null && goalAmount > 0;
    const percent = validGoal
      ? Math.min((totalDonated / goalAmount) * 100, 100)
      : 0;

    return { goalAmount: validGoal ? goalAmount : null, totalDonated, percent };
  }, [entries]);

  const byCause = useMemo(() => aggregateHasanatByGoal(entries), [entries]);
  const chart = useMemo(() => buildConicGradient(byCause), [byCause]);

  const sortedList = useMemo(() => {
    return [...entries].sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? "")),
    );
  }, [entries]);

  const logHasanat = useCallback(
    (e) => {
      e.preventDefault();
      const picked = HASANAT_GOALS.find((g) => g.id === goalId);
      if (!picked || !date) return false;

      const next = [
        ...entries,
        {
          goalId: picked.id,
          description: description.trim(),
          date: new Date().toISOString(),
        },
      ];
      saveHasanat(next);
      recordDonationForPlantGrowth();
      setEntries(next);
      setGoalId("");
      setDescription("");
      setDate(todayInputDate());
      return true;
    },
    [date, description, entries, goalId],
  );

  return (
    <>
      <style>{`
        @keyframes hasanat-sheet-in {
          from {
            transform: translate(-50%, 100%);
          }
          to {
            transform: translate(-50%, 0);
          }
        }
        .hasanat-fab {
          position: fixed;
          z-index: 900;
          bottom: 24px;
          right: max(24px, calc((100vw - 390px) / 2 + 24px));
          width: 56px;
          height: 56px;
          padding: 0;
          margin: 0;
          border: none;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          background-color: #7e551f;
          color: #b7933f;
          font-size: 28px;
          font-weight: 300;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .hasanat-fab:hover {
          background-color: #6a451a;
        }
        .hasanat-fab:active {
          background-color: #5c3a16;
        }
        .hasanat-fab:focus-visible {
          outline: 2px solid #e5d3ad;
          outline-offset: 2px;
        }
        .hasanat-donation-sheet {
          position: absolute;
          left: 50%;
          bottom: 0;
          z-index: 1;
          width: 100%;
          max-width: 390px;
          box-sizing: border-box;
          background: #42501f;
          border-radius: 20px 20px 0 0;
          padding: 24px;
          animation: hasanat-sheet-in 0.28s ease-out both;
        }
      `}</style>
      <div className="sadaqah">
        <header className="sadaqah__header">
          <h1 className="sadaqah__title">Hasanat</h1>
          <blockquote className="home__ayah" cite="https://sunnah.com/bukhari:6464">
            <p className="home__ayah-text">
              &ldquo;The best deeds are those done regularly, even if they are few.&hellip;&rdquo;
            </p>
            <footer className="home__ayah-ref">Sahih Bukhari 6464</footer>
          </blockquote>
        </header>

        <div
          role="region"
          aria-labelledby="hasanat-goal-heading"
          style={{
            marginBottom: "1.5rem",
            background: "#42501F",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2
            id="hasanat-goal-heading"
            style={{
              margin: 0,
              color: "#E5D3AD",
              fontWeight: "bold",
              fontSize: "1rem",
            }}
          >
            This month&apos;s goal
          </h2>
          {monthGoalProgress.goalAmount == null ? (
            <p style={{ margin: "12px 0 0", color: "#B7933F", fontSize: 14 }}>
              No goal set yet.
            </p>
          ) : (
            <>
              <p
                style={{
                  margin: "10px 0 16px",
                  color: "#E5D3AD",
                  fontSize: 14,
                  opacity: 0.95,
                }}
              >
                ${monthGoalProgress.totalDonated} donated of $
                {monthGoalProgress.goalAmount} goal
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(monthGoalProgress.percent)}
                aria-label="Progress toward donation goal"
                style={{
                  width: "100%",
                  height: 12,
                  background: "#7D7E3C",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${monthGoalProgress.percent}%`,
                    height: "100%",
                    background: "#B7933F",
                    borderRadius: 99,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  color: "#B7933F",
                  fontSize: 13,
                }}
              >
                {Math.round(monthGoalProgress.percent)}% complete
              </p>
            </>
          )}
        </div>

        <section className="sadaqah__section" aria-labelledby="hasanat-chart-heading">
          <h2 id="hasanat-chart-heading" className="sadaqah__h2">
            By cause
          </h2>
          {byCause.length === 0 ? (
            <p className="sadaqah__muted">No donations yet. Log one to see the chart.</p>
          ) : (
            <div className="sadaqah__chart-wrap">
              <div
                className="sadaqah__pie"
                style={{ background: chart.background }}
                role="img"
                aria-label="Pie chart of donation totals by cause"
              />
              <ul className="sadaqah__legend">
                {chart.legend.map((row) => (
                  <li key={row.cause} className="sadaqah__legend-item">
                    <span
                      className="sadaqah__swatch"
                      style={{ background: row.color }}
                      aria-hidden
                    />
                    <span className="sadaqah__legend-cause">{row.cause}</span>
                    <span className="sadaqah__legend-meta">
                      {Math.round(row.total)} ({row.pct.toFixed(0)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="sadaqah__section" aria-labelledby="hasanat-list-heading">
          <h2 id="hasanat-list-heading" className="sadaqah__h2">
            Past donations
          </h2>
          {sortedList.length === 0 ? (
            <p className="sadaqah__muted">Nothing logged yet.</p>
          ) : (
            <ul className="sadaqah__list">
              {sortedList.map((row, idx) => (
                <li
                  key={`${row.date}-${row.goalId}-${idx}`}
                  className="sadaqah__row"
                >
                  <span className="sadaqah__row-cause">{goalLabelForId(row.goalId)}</span>
                  <span className="sadaqah__row-amt">
                    {row.description?.trim() ? row.description.trim() : "—"}
                  </span>
                  <span className="sadaqah__row-date">
                    {row.date
                      ? new Date(row.date).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <button
        type="button"
        className="hasanat-fab"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-controls="hasanat-donation-sheet"
        onClick={() => setSheetOpen(true)}
      >
        +
      </button>

      {sheetOpen ? (
        <div
          id="hasanat-donation-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hasanat-donation-sheet-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
          }}
        >
          <div
            role="presentation"
            onClick={() => setSheetOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.4)",
              cursor: "pointer",
            }}
          />
          <div id="hasanat-donation-sheet" className="hasanat-donation-sheet">
            <div
              style={{
                width: 40,
                height: 5,
                margin: "0 auto 16px",
                borderRadius: 999,
                background: "#7d7e3c",
              }}
              aria-hidden
            />
            <h2
              id="hasanat-donation-sheet-title"
              style={{
                margin: "0 0 16px",
                fontSize: "1rem",
                fontWeight: 700,
                color: "#e5d3ad",
              }}
            >
              Log a donation
            </h2>
            <form
              className="sadaqah__form"
              onSubmit={(ev) => {
                if (logHasanat(ev)) setSheetOpen(false);
              }}
            >
              <GoalSelect value={goalId} onChange={setGoalId} />
              <label className="sadaqah__label">
                <span className="sadaqah__label-text">Description</span>
                <textarea
                  className="sadaqah__input"
                  value={description}
                  onChange={(ev) => setDescription(ev.target.value)}
                  placeholder="Describe your act of sadaqah... (optional)"
                  rows={3}
                  style={{
                    minHeight: 80,
                    resize: "none",
                    fontFamily: "inherit",
                  }}
                />
              </label>
              <label className="sadaqah__label">
                <span className="sadaqah__label-text">Date</span>
                <input
                  className="sadaqah__input"
                  type="date"
                  value={date}
                  onChange={(ev) => setDate(ev.target.value)}
                />
              </label>
              <button
                type="submit"
                style={{
                  marginTop: 4,
                  width: "100%",
                  padding: "0.65rem 1rem",
                  border: "none",
                  borderRadius: 10,
                  fontSize: "0.95rem",
                  fontWeight: 650,
                  cursor: "pointer",
                  background: "#b7933f",
                  color: "#42501f",
                }}
              >
                Log donation
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
