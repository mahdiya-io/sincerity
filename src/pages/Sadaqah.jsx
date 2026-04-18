import { useCallback, useMemo, useState } from "react";
import { recordDonationForPlantGrowth } from "@/lib/sincerityPlantStorage.js";
import { getActiveSadaqahGoals } from "@/lib/catalogGoals.js";
import "./Home.css";
import "./Sadaqah.css";

const DONATIONS_KEY = "sincerity_donations";
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

function loadDonations() {
  try {
    const raw = localStorage.getItem(DONATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDonations(list) {
  localStorage.setItem(DONATIONS_KEY, JSON.stringify(list));
}

function aggregateByCause(donations) {
  const map = new Map();
  for (const row of donations) {
    const key = String(row.cause ?? "").trim() || "Unknown";
    const n = Number(row.amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    map.set(key, (map.get(key) ?? 0) + n);
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

function CauseSelect({ value, onChange }) {
  return (
    <label className="sadaqah__label">
      <span className="sadaqah__label-text">Who did you donate to?</span>
      <select
        className="sadaqah__input"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
      >
        <option value="" disabled>
          Select a cause
        </option>
        {getActiveSadaqahGoals().map((goal) => (
          <option key={goal.id} value={goal.id}>
            {goal.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Sadaqah() {
  const [donations, setDonations] = useState(loadDonations);
  const [cause, setCause] = useState("");
  const [donateWhere, setDonateWhere] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInputDate);
  const [donationSheetOpen, setDonationSheetOpen] = useState(false);

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
      const raw = localStorage.getItem(DONATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      list = [];
    }

    const totalDonated = list.reduce((sum, row) => {
      const n = Number(row.amount);
      return sum + (Number.isFinite(n) ? Math.round(n) : 0);
    }, 0);

    const validGoal = goalAmount != null && goalAmount > 0;
    const percent = validGoal
      ? Math.min((totalDonated / goalAmount) * 100, 100)
      : 0;

    return { goalAmount: validGoal ? goalAmount : null, totalDonated, percent };
  }, [donations]);

  const byCause = useMemo(() => aggregateByCause(donations), [donations]);
  const chart = useMemo(() => buildConicGradient(byCause), [byCause]);

  const sortedList = useMemo(() => {
    return [...donations].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [donations]);

  const canSubmitDonation =
    Boolean(cause.trim()) &&
    Boolean(donateWhere.trim()) &&
    Boolean(date) &&
    Number.isFinite(Number.parseFloat(amount)) &&
    Math.max(0, Math.round(Number.parseFloat(amount))) > 0;

  const handleAmountChange = useCallback((ev) => {
    const v = ev.target.value;
    if (v === "") {
      setAmount("");
      return;
    }
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) {
      setAmount("");
      return;
    }
    setAmount(String(Math.max(0, Math.round(n))));
  }, []);

  const handleAmountKeyDown = useCallback((ev) => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    const prev = Number.parseFloat(amount);
    const n = Number.isFinite(prev) ? Math.round(prev) : 0;
    const next = ev.key === "ArrowUp" ? n + 1 : Math.max(0, n - 1);
    setAmount(String(next));
  }, [amount]);

  const handleAmountBlur = useCallback(() => {
    setAmount((prev) => {
      if (prev === "") return prev;
      const n = Number.parseFloat(prev);
      if (!Number.isFinite(n)) return "";
      return String(Math.max(0, Math.round(n)));
    });
  }, []);

  const logDonation = useCallback(
    (e) => {
      e.preventDefault();
      const goal = getActiveSadaqahGoals().find((g) => g.id === cause);
      const categoryName = goal ? goal.name.trim() : "";
      const n = Math.max(0, Math.round(Number.parseFloat(amount)));
      if (!categoryName || !Number.isFinite(n) || n <= 0 || !date) return false;

      const whereTitle = donateWhere.trim();
      if (!whereTitle) return false;

      const next = [
        ...donations,
        {
          cause: categoryName,
          whereTo: whereTitle,
          amount: n,
          date,
        },
      ];
      saveDonations(next);
      recordDonationForPlantGrowth();
      setDonations(next);
      setCause("");
      setDonateWhere("");
      setAmount("");
      setDate(todayInputDate());
      return true;
    },
    [amount, cause, date, donateWhere, donations],
  );

  return (
    <>
      <style>{`
        @keyframes sadaqah-donation-sheet-in {
          from {
            transform: translate(-50%, 100%);
          }
          to {
            transform: translate(-50%, 0);
          }
        }
        .sadaqah-fab {
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
        .sadaqah-fab:hover {
          background-color: #6a451a;
        }
        .sadaqah-fab:active {
          background-color: #5c3a16;
        }
        .sadaqah-fab:focus-visible {
          outline: 2px solid #e5d3ad;
          outline-offset: 2px;
        }
        .sadaqah-donation-sheet {
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
          animation: sadaqah-donation-sheet-in 0.28s ease-out both;
        }
      `}</style>
      <div className="sadaqah">
        <header className="sadaqah__header">
          <h1 className="sadaqah__title">Monetary Sadaqah</h1>
          <blockquote className="home__ayah" cite="https://sunnah.com/muslim:2588">
            <p className="home__ayah-text">
              &ldquo;Charity does not decrease wealth.&hellip;&rdquo;
            </p>
            <footer className="home__ayah-ref">Sahih Muslim 2588</footer>
          </blockquote>
        </header>

        <div
          role="region"
          aria-labelledby="sadaqah-goal-heading"
          style={{
            marginBottom: "1.5rem",
            background: "#42501F",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2
            id="sadaqah-goal-heading"
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

        <section className="sadaqah__section" aria-labelledby="sadaqah-chart-heading">
          <h2 id="sadaqah-chart-heading" className="sadaqah__h2">
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
                      ${Math.round(row.total)} ({row.pct.toFixed(0)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="sadaqah__section" aria-labelledby="sadaqah-list-heading">
          <h2 id="sadaqah-list-heading" className="sadaqah__h2">
            Past donations
          </h2>
          {sortedList.length === 0 ? (
            <p className="sadaqah__muted">Nothing logged yet.</p>
          ) : (
            <ul className="sadaqah__list">
              {sortedList.map((row, idx) => {
                const title =
                  typeof row.whereTo === "string" && row.whereTo.trim()
                    ? row.whereTo.trim()
                    : String(row.cause ?? "").trim() || "—";
                return (
                  <li key={`${row.date}-${title}-${row.amount}-${idx}`} className="sadaqah__row">
                    <span className="sadaqah__row-cause">{title}</span>
                    <span className="sadaqah__row-amt">${Math.round(Number(row.amount))}</span>
                    <span className="sadaqah__row-date">{row.date}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <button
        type="button"
        className="sadaqah-fab"
        aria-haspopup="dialog"
        aria-expanded={donationSheetOpen}
        aria-controls="sadaqah-donation-sheet"
        onClick={() => setDonationSheetOpen(true)}
      >
        +
      </button>

      {donationSheetOpen ? (
        <div
          id="sadaqah-donation-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sadaqah-donation-sheet-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
          }}
        >
          <div
            role="presentation"
            onClick={() => setDonationSheetOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.4)",
              cursor: "pointer",
            }}
          />
          <div id="sadaqah-donation-sheet" className="sadaqah-donation-sheet">
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
              id="sadaqah-donation-sheet-title"
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
                if (logDonation(ev)) setDonationSheetOpen(false);
              }}
            >
              <CauseSelect value={cause} onChange={setCause} />
              <label className="sadaqah__label">
                <span className="sadaqah__label-text">Where did you donate to today?</span>
                <input
                  className="sadaqah__input"
                  type="text"
                  value={donateWhere}
                  onChange={(ev) => setDonateWhere(ev.target.value)}
                  placeholder="e.g. HDF, local masjid, food bank…"
                  autoComplete="off"
                />
              </label>
              <label className="sadaqah__label">
                <span className="sadaqah__label-text">How much? ($)</span>
                <input
                  className="sadaqah__input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={handleAmountChange}
                  onKeyDown={handleAmountKeyDown}
                  onBlur={handleAmountBlur}
                  placeholder="0"
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
                disabled={!canSubmitDonation}
                style={{
                  marginTop: 4,
                  width: "100%",
                  padding: "0.65rem 1rem",
                  border: "none",
                  borderRadius: 10,
                  fontSize: "0.95rem",
                  fontWeight: 650,
                  cursor: canSubmitDonation ? "pointer" : "not-allowed",
                  background: "#b7933f",
                  color: "#42501f",
                  opacity: canSubmitDonation ? 1 : 0.55,
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