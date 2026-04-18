import { useCallback, useMemo, useState } from "react";
import {
  recordDonationForPlantGrowth,
  resetPlantStateToFresh,
} from "@/lib/sincerityPlantStorage.js";
import "./Sadaqah.css";

const DONATIONS_KEY = "sincerity_donations";
const GOAL_KEY = "sincerity_monthly_goal";

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

/** Parse a numeric goal from plain number text or copy that includes a $ amount. */
function parseGoalAmount(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const dollarMatch = str.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (dollarMatch) {
    const n = Number.parseFloat(dollarMatch[1].replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const normalized = str.replace(/,/g, "");
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  return null;
}

function readGoalAmount() {
  const raw = localStorage.getItem(GOAL_KEY);
  const n = parseGoalAmount(raw);
  if (n == null || n <= 0) return null;
  return n;
}

function currentYearMonth(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function sumForYearMonth(donations, ym) {
  return donations.reduce((sum, row) => {
    if (typeof row.date === "string" && row.date.startsWith(ym)) {
      const n = Number(row.amount);
      return sum + (Number.isFinite(n) ? n : 0);
    }
    return sum;
  }, 0);
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

export default function Sadaqah() {
  const [donations, setDonations] = useState(loadDonations);
  const [cause, setCause] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInputDate);
  const [donationSheetOpen, setDonationSheetOpen] = useState(false);

  const goalAmount = readGoalAmount();
  const ym = currentYearMonth();
  const monthTotal = useMemo(
    () => sumForYearMonth(donations, ym),
    [donations, ym],
  );

  const overGoal = goalAmount != null && monthTotal > goalAmount;

  const byCause = useMemo(() => aggregateByCause(donations), [donations]);
  const chart = useMemo(() => buildConicGradient(byCause), [byCause]);

  const sortedList = useMemo(() => {
    return [...donations].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [donations]);

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

  const handleReset = useCallback(() => {
    if (
      !window.confirm(
        "Clear all logged donations, remove this month’s savings goal, and reset your plant on Home? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(DONATIONS_KEY);
      localStorage.removeItem(GOAL_KEY);
    } catch {
      /* ignore */
    }
    resetPlantStateToFresh();
    setDonations([]);
  }, []);

  const logDonation = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = cause.trim();
      const n = Math.max(0, Math.round(Number.parseFloat(amount)));
      if (!trimmed || !Number.isFinite(n) || n <= 0 || !date) return false;

      const next = [
        ...donations,
        { cause: trimmed, amount: n, date },
      ];
      saveDonations(next);
      recordDonationForPlantGrowth();
      setDonations(next);
      setCause("");
      setAmount("");
      setDate(todayInputDate());
      return true;
    },
    [amount, cause, date, donations],
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
          <div className="sadaqah__header-top">
            <div className="sadaqah__header-text">
              <h1 className="sadaqah__title">Monetary Sadaqah</h1>
              <p className="sadaqah__lede">Log donations and see them by cause.</p>
            </div>
            <button type="button" className="sadaqah__reset" onClick={handleReset}>
              Start over
            </button>
          </div>
        </header>

        <section className="sadaqah__section" aria-labelledby="sadaqah-form-heading">
          <h2 id="sadaqah-form-heading" className="sadaqah__h2">
            Log a donation
          </h2>
          <form className="sadaqah__form" onSubmit={logDonation}>
            <label className="sadaqah__label">
              <span className="sadaqah__label-text">Who did you donate to?</span>
              <input
                className="sadaqah__input"
                type="text"
                value={cause}
                onChange={(ev) => setCause(ev.target.value)}
                placeholder="Organization or cause"
                autoComplete="organization"
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
            <button type="submit" className="sadaqah__submit">
              Log donation
            </button>
          </form>
        </section>

        <section className="sadaqah__section" aria-labelledby="sadaqah-goal-heading">
          <h2 id="sadaqah-goal-heading" className="sadaqah__h2">
            This month&apos;s goal
          </h2>
          {goalAmount == null ? (
            <p className="sadaqah__muted">
              Set <code className="sadaqah__code">{GOAL_KEY}</code> in localStorage
              (for example <code className="sadaqah__code">$500</code> or{" "}
              <code className="sadaqah__code">Donate $250 this month</code>) to see
              progress.
            </p>
          ) : (
            <>
              <p className="sadaqah__goal-line">
                <strong>${Math.round(monthTotal)}</strong>
                <span className="sadaqah__goal-sep"> / </span>
                <span>${Math.round(goalAmount)}</span>
                {overGoal ? (
                  <span className="sadaqah__badge">Above goal</span>
                ) : null}
              </p>
              <div
                className="sadaqah__progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={goalAmount}
                aria-valuenow={Math.min(monthTotal, goalAmount)}
                aria-label="Progress toward monthly donation goal"
              >
                <div
                  className="sadaqah__progress-fill"
                  style={{
                    width: `${goalAmount > 0 ? Math.min((monthTotal / goalAmount) * 100, 100) : 0}%`,
                  }}
                />
              </div>
            </>
          )}
        </section>

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
              {sortedList.map((row, idx) => (
                <li key={`${row.date}-${row.cause}-${row.amount}-${idx}`} className="sadaqah__row">
                  <span className="sadaqah__row-cause">{row.cause}</span>
                  <span className="sadaqah__row-amt">${Math.round(Number(row.amount))}</span>
                  <span className="sadaqah__row-date">{row.date}</span>
                </li>
              ))}
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
              <label className="sadaqah__label">
                <span className="sadaqah__label-text">Who did you donate to?</span>
                <input
                  className="sadaqah__input"
                  type="text"
                  value={cause}
                  onChange={(ev) => setCause(ev.target.value)}
                  placeholder="Organization or cause"
                  autoComplete="organization"
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
