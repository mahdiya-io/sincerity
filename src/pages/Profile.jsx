import "./Profile.css";

const LS_MONTHLY = "sincerity_monthly_plant_progress";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** @returns {Record<string, 'full' | 'bud' | 'empty'>} */
function readMonthlyProgress() {
  try {
    const raw = localStorage.getItem(LS_MONTHLY);
    if (!raw) return defaultMonthlyDemo();
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length > 0) {
      return o;
    }
  } catch {
    /* ignore */
  }
  return defaultMonthlyDemo();
}

/** Demo: Jan + Feb full bloom, Mar bud (rest empty until you save progress). */
function defaultMonthlyDemo() {
  const y = new Date().getFullYear();
  return {
    [`${y}-01`]: "full",
    [`${y}-02`]: "full",
    [`${y}-03`]: "bud",
  };
}

function MiniBud() {
  return (
    <svg width="36" height="40" viewBox="0 0 36 40" aria-hidden>
      <path
        d="M18 36 Q17 28 18 22"
        stroke="#1D9E75"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="18" cy="18" rx="5" ry="6" fill="#5DCF9A" stroke="#166647" strokeWidth="0.35" />
      <path d="M18 13 Q20 10 18 8 Q16 10 18 13" stroke="#1D9E75" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function MiniFullFlower() {
  return (
    <svg width="40" height="44" viewBox="0 0 40 44" aria-hidden>
      <path d="M20 40 L20 24" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" fill="none" />
      <g transform="translate(20, 20)" fill="#EF9F27" stroke="#B8731A" strokeWidth="0.35">
        <ellipse cx="0" cy="-6" rx="4" ry="9.5" transform="rotate(-54)" />
        <ellipse cx="0" cy="-6" rx="4" ry="9.5" transform="rotate(54)" />
        <ellipse cx="0" cy="-9" rx="3.8" ry="7.8" />
        <ellipse cx="0" cy="-6" rx="4.5" ry="10" transform="rotate(95)" />
        <ellipse cx="0" cy="-6" rx="4.5" ry="10" transform="rotate(-95)" />
      </g>
      <circle cx="20" cy="22" r="4.5" fill="#F6C14A" stroke="#A56A0F" strokeWidth="0.3" />
    </svg>
  );
}

function MiniEmpty() {
  return (
    <svg width="36" height="40" viewBox="0 0 36 40" aria-hidden>
      <ellipse cx="18" cy="35" rx="10" ry="2.5" fill="#1a2210" opacity={0.25} />
      <circle cx="18" cy="22" r="3" fill="color-mix(in srgb, var(--color-cream) 12%, transparent)" opacity={0.45} />
    </svg>
  );
}

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export default function Profile() {
  const progress = readMonthlyProgress();
  const year = new Date().getFullYear();
  const plantsGrown = 10;

  return (
    <div className="profile">
      <div className="profile__avatar-wrap" aria-hidden>
        <div className="profile__avatar profile__avatar--initials" role="img" aria-label="Flora Yasmin initials">
          FY
        </div>
      </div>

      <h1 className="profile__name">Flora Yasmin</h1>
      <p className="profile__username">@floraysm</p>
      <p className="profile__bio">UW Student</p>
      <p className="profile__location">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="profile__pin">
          <path
            fill="currentColor"
            opacity={0.85}
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
          />
        </svg>
        <span>United States</span>
      </p>

      <p className="profile__stat">
        Plants grown: <span className="profile__stat-value">{plantsGrown}</span>
      </p>

      <section className="profile__calendar" aria-labelledby="profile-calendar-heading">
        <h2 id="profile-calendar-heading" className="profile__calendar-title">
          Monthly progress
        </h2>
        <div className="profile__months" role="list">
          {MONTH_LABELS.map((label, i) => {
            const key = monthKey(year, i);
            const state = progress[key] ?? "empty";
            return (
              <div key={key} className="profile__month" role="listitem">
                <span className="profile__month-label">{label}</span>
                <div className="profile__month-visual" title={`${label} ${year}: ${state}`}>
                  {state === "full" ? <MiniFullFlower /> : null}
                  {state === "bud" ? <MiniBud /> : null}
                  {state === "empty" ? <MiniEmpty /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
