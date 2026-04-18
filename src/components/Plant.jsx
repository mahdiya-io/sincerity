import { useId, useMemo } from "react";
import "./Plant.css";

const STEM_HEALTHY = "#1D9E75";
const STEM_WILT = "#B4B2A9";
const LEAF_HEALTHY = "#26B07E";
const LEAF_WILT = "#B4B2A9";
const GOLD = "#EF9F27";

const LEAF_D_LEFT =
  "M0,0 C-6,-3 -20,-16 -28,-30 C-32,-38 -26,-44 -16,-46 C-10,-38 -4,-22 -1,-10 C-0.5,-4 0,-1 0,0 Z";
const LEAF_D_RIGHT =
  "M0,0 C6,-3 20,-16 28,-30 C32,-38 26,-44 16,-46 C10,-38 4,-22 1,-10 C0.5,-4 0,-1 0,0 Z";

/** Bottom pair (idx 0–1), middle (2–3), top (4–5): small → medium → large. */
function tierLeafScale(idx) {
  if (idx < 2) return 0.76;
  if (idx < 4) return 0.9;
  return 1.06;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function lerpRgb(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const u = clamp(t, 0, 1);
  const r = Math.round(A.r + (B.r - A.r) * u);
  const g = Math.round(A.g + (B.g - A.g) * u);
  const bch = Math.round(A.b + (B.b - A.b) * u);
  return `rgb(${r} ${g} ${bch})`;
}

const LEAF_SLOTS = [
  { side: -1, frac: 0.22, baseAngle: -40 },
  { side: 1, frac: 0.38, baseAngle: 40 },
  { side: -1, frac: 0.52, baseAngle: -36 },
  { side: 1, frac: 0.62, baseAngle: 36 },
  { side: -1, frac: 0.74, baseAngle: -34 },
  { side: 1, frac: 0.86, baseAngle: 34 },
];

const tFill = "fill 0.8s ease, opacity 0.75s ease";

/** Soft outer petal — rounded, slightly asymmetric. */
const PETAL_OUTER =
  "M0,4 C-7.5,1.5 -14,-9 -12.5,-21 C-11,-30 -4,-36.5 0,-38.5 C4,-36.5 11,-30 12.5,-21 C14,-9 7.5,1.5 0,4 Z";

/** Smaller inner petal for a layered bloom. */
const PETAL_INNER =
  "M0,2.5 C-4.5,0.8 -8,-5 -7,-12 C-6,-17 -2.5,-20 0,-21.2 C2.5,-20 6,-17 7,-12 C8,-5 4.5,0.8 0,2.5 Z";

const OUTER_ANGLES = [0, 60, 120, 180, 240, 300];
const INNER_ANGLES = [30, 90, 150, 210, 270, 330];

function Flower({ wilt }) {
  const pistilId = useId().replace(/:/g, "");
  const wilted = wilt > 0.35;
  const petalOuter = lerpRgb("#F0A62E", LEAF_WILT, wilt);
  const petalInner = lerpRgb("#EF9F27", LEAF_WILT, wilt);
  const petalBack = lerpRgb("#E89420", LEAF_WILT, wilt);
  const strokeOuter = lerpRgb("#C47F18", LEAF_WILT, wilt);
  const centerFill = lerpRgb("#F6C14A", LEAF_WILT, Math.min(1, wilt * 1.05));
  const centerCore = lerpRgb("#D49222", LEAF_WILT, wilt);

  return (
    <g className={`plant-flower${wilted ? " plant-flower--wilted" : ""}`}>
      <defs>
        <radialGradient id={`plant-pistil-${pistilId}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={lerpRgb("#FFF6DC", LEAF_WILT, wilt)} stopOpacity={0.95} />
          <stop offset="55%" stopColor={centerFill} />
          <stop offset="100%" stopColor={centerCore} />
        </radialGradient>
      </defs>

      <g transform="translate(0,-4)">
        {OUTER_ANGLES.map((deg, i) => (
          <g
            key={`o-${deg}`}
            className="plant-petal-arm"
            style={{
              "--ang": `${deg}deg`,
              "--smax": "1",
              animationDelay: wilted ? "0s" : `${i * 0.06}s`,
            }}
          >
            <path
              d={PETAL_OUTER}
              fill={i % 2 === 0 ? petalOuter : petalBack}
              stroke={strokeOuter}
              strokeWidth={0.28}
              strokeLinejoin="round"
              style={{ transition: tFill }}
            />
          </g>
        ))}

        {INNER_ANGLES.map((deg, i) => (
          <g
            key={`i-${deg}`}
            className="plant-petal-arm"
            style={{
              "--ang": `${deg}deg`,
              "--smax": "0.82",
              animationDelay: wilted ? "0s" : `${0.28 + i * 0.045}s`,
            }}
          >
            <path
              d={PETAL_INNER}
              fill={petalInner}
              stroke={strokeOuter}
              strokeWidth={0.22}
              strokeLinejoin="round"
              opacity={0.92}
              style={{ transition: tFill }}
            />
          </g>
        ))}

        <circle
          cx="0"
          cy="-3"
          r="6.2"
          fill={`url(#plant-pistil-${pistilId})`}
          stroke={lerpRgb("#B8731A", LEAF_WILT, wilt)}
          strokeWidth={0.28}
          style={{ transition: tFill }}
        />
        <ellipse
          cx="-1.2"
          cy="-4.2"
          rx="2.2"
          ry="1.4"
          fill={lerpRgb("#fff", LEAF_WILT, wilt)}
          opacity={0.35 - wilt * 0.28}
        />
      </g>
    </g>
  );
}

/** Scale entire plant from visual center; keeps layout in same coordinate space. */
const PLANT_GROUP_CENTER = { cx: 60, cy: 86 };
const PLANT_OVERALL_SCALE = 0.86;

export default function Plant({ leaves: leavesProp = 0, wilt: wiltProp = 0 }) {
  const leaves = clamp(Math.round(Number(leavesProp) || 0), 0, 7);
  const wilt = clamp(Number(wiltProp) || 0, 0, 1);

  const stemStroke = useMemo(() => lerpRgb(STEM_HEALTHY, STEM_WILT, wilt), [wilt]);
  const leafFill = useMemo(() => lerpRgb(LEAF_HEALTHY, LEAF_WILT, wilt), [wilt]);
  const leafStroke = useMemo(() => lerpRgb("#166647", LEAF_WILT, wilt), [wilt]);
  const budFill = useMemo(() => lerpRgb("#5DCF9A", LEAF_WILT, wilt), [wilt]);

  const stemTip = useMemo(() => {
    if (leaves === 0) {
      return { x: 61, y: 131, short: true };
    }
    const maxY = 130;
    const minY = 22;
    const t = leaves / 7;
    const y = maxY - t * (maxY - minY);
    const x = 60 + Math.sin(leaves * 0.65) * 2.8;
    return { x, y, short: false };
  }, [leaves]);

  const stemD = useMemo(() => {
    const { x, y, short } = stemTip;
    if (short) {
      return `M60,156 Q59.5,144 60.5,138 Q61,133 ${x},${y + 4}`;
    }
    const cx = 57 + (1 - wilt) * 5;
    const cy = 98 + wilt * 14;
    return `M60,156 Q${cx},${cy} ${x},${y}`;
  }, [stemTip, wilt]);

  const leavesOnStem = leaves === 7 ? 6 : Math.max(0, leaves);

  const ease = "cubic-bezier(0.33, 1, 0.68, 1)";
  const tStem = `stroke 0.8s ${ease}, stroke-width 0.65s ease`;
  const tMove = `transform 0.9s ${ease}`;

  const stemWide = 3 + (leaves / 7) * 1.15;

  const { cx, cy } = PLANT_GROUP_CENTER;
  const s = PLANT_OVERALL_SCALE;

  return (
    <svg
      className="plant"
      width={120}
      height={178}
      viewBox="0 -44 120 216"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g transform={`translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`}>
        <ellipse cx="60" cy="156" rx="24" ry="5.5" fill="#1a2210" opacity={0.35} />

        <path
          className="plant-stem"
          d={stemD}
          stroke={stemStroke}
          strokeWidth={stemWide}
          strokeLinecap="round"
          fill="none"
          style={{ transition: tStem }}
        />

        {leaves === 0 ? (
          <g
            style={{
              transform: `translate(${stemTip.x}px, ${stemTip.y - 1}px)`,
              transition: tMove,
              transformBox: "view-box",
            }}
          >
            <ellipse cx="0" cy="0" rx="5" ry="6" fill={budFill} style={{ transition: "fill 0.75s ease" }} />
            <path
              d="M0,-7 Q2.5,-11 0,-13.5 Q-2.5,-11 0,-7"
              stroke={stemStroke}
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              style={{ transition: tStem }}
            />
          </g>
        ) : null}

        {LEAF_SLOTS.slice(0, leavesOnStem).map((slot, idx) => {
          const { x, y } = stemTip;
          const py = 156 + (y - 156) * slot.frac;
          const sway = Math.sin((idx + 1) * 1.15 + wilt * 0.8) * 1.4;
          const px = 60 + sway * (1 - wilt * 0.45);
          const droop = wilt * 62;
          const angle = slot.baseAngle + (slot.side < 0 ? droop : -droop);
          const tier = tierLeafScale(idx);
          const scale = (0.8 + (leaves / 7) * 0.22 + idx * 0.012) * tier;
          const d = slot.side < 0 ? LEAF_D_LEFT : LEAF_D_RIGHT;

          return (
            <g
              key={idx}
              className="plant-leaf"
              style={{
                transform: `translate(${px}px, ${py}px) rotate(${angle}deg) scale(${scale})`,
                transformBox: "view-box",
                transition: tMove,
              }}
            >
              <path
                d={d}
                fill={leafFill}
                stroke={leafStroke}
                strokeWidth={0.45}
                strokeLinejoin="round"
                style={{ transition: "fill 0.75s ease, stroke 0.75s ease" }}
              />
            </g>
          );
        })}

        {leaves === 7 ? (
          <g
            style={{
              transform: `translate(${stemTip.x}px, ${stemTip.y}px) rotate(${wilt * 22}deg)`,
              transformBox: "view-box",
              transition: tMove,
            }}
          >
            <Flower wilt={wilt} />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
