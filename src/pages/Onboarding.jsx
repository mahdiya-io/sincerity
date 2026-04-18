import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const LS_PATH = "sincerity_onboarding_path";
const LS_USERNAME = "sincerity_username";
const LS_PASSWORD = "sincerity_password";
const LS_GOAL = "sincerity_sadaqah_goal";
const LS_SUGGESTIONS = "sincerity_ai_suggestions";

const PATH_OPTIONS = [
  {
    id: "seeking",
    label: "I want to give sadaqah but I'm not sure where to start",
    promptLabel: "Wants to donate but does not know where yet; needs trustworthy causes and practical first steps.",
  },
  {
    id: "tracking",
    label: "I already donate and want to track and grow it",
    promptLabel: "Already gives monetary sadaqah; wants structure, consistency, and ideas to increase impact without burnout.",
  },
  {
    id: "non_monetary",
    label: "I cannot donate money right now; I want non-monetary sadaqah & hasanat",
    promptLabel: "Cannot donate monetarily right now; focus on non-monetary sadaqah, adab, community care, and removing harm.",
  },
];

/** Override with VITE_GEMINI_MODEL in .env if one model hits quota (restart dev server). */
const GEMINI_MODEL =
  typeof import.meta.env.VITE_GEMINI_MODEL === "string" && import.meta.env.VITE_GEMINI_MODEL.trim()
    ? import.meta.env.VITE_GEMINI_MODEL.trim()
    : "gemini-2.5-flash";

/** Gemini expects JSON schema root type OBJECT (not a bare ARRAY). */
const SUGGESTIONS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          kind: { type: "STRING" },
        },
        required: ["title", "description", "kind"],
      },
    },
  },
  required: ["suggestions"],
};

function loadPath() {
  const v = localStorage.getItem(LS_PATH);
  return PATH_OPTIONS.some((p) => p.id === v) ? v : "";
}

function loadUsername() {
  return localStorage.getItem(LS_USERNAME) ?? "";
}

function loadPassword() {
  return localStorage.getItem(LS_PASSWORD) ?? "";
}

function loadGoal() {
  return localStorage.getItem(LS_GOAL) ?? "";
}

function loadSavedSuggestions() {
  try {
    const raw = localStorage.getItem(LS_SUGGESTIONS);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** @typedef {{ title: string; description: string; type: string }} Suggestion */

function formatGeminiError(status, text) {
  try {
    const j = JSON.parse(text);
    const msg = j?.error?.message;
    if (msg) return msg;
  } catch {
    /* ignore */
  }
  return text?.trim() || `Request failed (${status})`;
}

/** Concatenate all text parts from a generateContent JSON body. */
function extractTextFromGenerateContentResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
}

/**
 * One-shot generateContent (more reliable than SSE for JSON).
 * Retries without responseSchema if the API rejects the schema (400).
 */
async function fetchGeminiSuggestionText(apiKey, systemInstruction, userText) {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
  );
  url.searchParams.set("key", apiKey.trim());

  const base = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.65,
      responseMimeType: "application/json",
      responseSchema: SUGGESTIONS_RESPONSE_SCHEMA,
    },
  };

  const opts = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(base) };
  let res = await fetch(url.toString(), opts);

  if (res.status === 400) {
    const errTxt = await res.text().catch(() => "");
    console.warn("[Sincerity] generateContent with schema returned 400; retrying without schema.", errTxt.slice(0, 400));
    const fallback = {
      systemInstruction: base.systemInstruction,
      contents: base.contents,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.65,
      },
    };
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fallback),
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(formatGeminiError(res.status, errText));
  }

  const json = await res.json();
  const block = json?.promptFeedback?.blockReason;
  if (block) throw new Error(`This prompt was blocked (${block}). Try different wording.`);

  const text = extractTextFromGenerateContentResponse(json);
  if (!text?.trim()) {
    const fr = json?.candidates?.[0]?.finishReason;
    console.warn("[Sincerity] Empty model text; finishReason:", fr, json);
    throw new Error(
      fr && fr !== "STOP" && fr !== "MAX_TOKENS"
        ? `Model stopped early (${fr}). Try again or shorten your goal.`
        : "Empty response from the model. Try again.",
    );
  }
  return text.trim();
}

/**
 * Try to extract complete NDJSON lines from buffer; returns [suggestions, restBuffer].
 * @param {string} buffer
 * @param {Suggestion[]} existing
 */
function flushNdjsonLines(buffer, existing) {
  const next = [...existing];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (Array.isArray(o)) {
        for (const item of o) {
          const row = normalizeSuggestion(item);
          if (row && next.length < 5) next.push(row);
        }
      } else {
        const row = normalizeSuggestion(o);
        if (row && next.length < 5) next.push(row);
      }
    } catch {
      /* incomplete or non-JSON line */
    }
  }
  return { suggestions: next, rest };
}

/** @param {unknown} o */
function normalizeSuggestion(o) {
  if (!o || typeof o !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (o);
  const title = pickStr(rec, ["title", "Title", "name", "heading"]);
  const description = pickStr(rec, ["description", "Description", "body", "summary", "text", "details"]);
  const type =
    pickStr(rec, ["type", "Type", "kind", "Kind", "category", "Category"]) || "community";
  if (!title || !description) return null;
  return { title, description, type };
}

/** @param {Record<string, unknown>} o @param {string[]} keys */
function pickStr(o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Pull balanced {...} segments (best-effort when model adds prose). */
function extractJsonObjects(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          /* skip */
        }
        start = -1;
      }
    }
  }
  return out;
}

/**
 * Gemini often returns a JSON array or markdown; NDJSON was Claude-style.
 * @param {string} raw
 * @returns {Suggestion[]}
 */
function parseSuggestionsFromText(raw) {
  let t = String(raw ?? "").trim();
  t = t.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();

  try {
    const root = JSON.parse(t);
    if (root && typeof root === "object" && Array.isArray(root.suggestions)) {
      const rows = root.suggestions.map((item) => normalizeSuggestion(item)).filter(Boolean);
      if (rows.length) return rows.slice(0, 5);
    }
  } catch {
    /* fall through */
  }

  const tryArray = (slice) => {
    try {
      const p = JSON.parse(slice);
      if (!Array.isArray(p)) return [];
      const rows = [];
      for (const item of p) {
        const row = normalizeSuggestion(item);
        if (row) rows.push(row);
        if (rows.length >= 5) break;
      }
      return rows;
    } catch {
      return [];
    }
  };

  const direct = tryArray(t);
  if (direct.length) return direct.slice(0, 5);

  const i0 = t.indexOf("[");
  const i1 = t.lastIndexOf("]");
  if (i0 !== -1 && i1 > i0) {
    const fromBracket = tryArray(t.slice(i0, i1 + 1));
    if (fromBracket.length) return fromBracket.slice(0, 5);
  }

  const objs = extractJsonObjects(t)
    .map((o) => normalizeSuggestion(o))
    .filter(Boolean);
  if (objs.length) return objs.slice(0, 5);

  const { suggestions: nd } = flushNdjsonLines(t + "\n", []);
  return nd.slice(0, 5);
}

/**
 * @param {string} pathLabel - Rich path summary for the model
 * @param {string} goalText - User's goal / focus (verbatim)
 * @param {string} pathButtonLabel - Exact label of the path button they chose
 */
function buildSystemPrompt(pathLabel, goalText, pathButtonLabel) {
  const g = (goalText ?? "").trim() || "(none provided)";
  return [
    "You are a caring Muslim assistant for the app Sincerity.",
    "",
    "USER CONTEXT — read carefully and use all of it in every suggestion:",
    "- Path they chose (button text): " + pathButtonLabel,
    "- Path notes for you: " + pathLabel,
    "- Their goal / focus (verbatim): " + g,
    "",
    "PERSONALIZATION (required):",
    "- All 5 suggestions must clearly reflect THEIR goal above: echo themes, amounts, time frame, people, skills, masjid, neighborhood, causes, or constraints they mentioned.",
    "- Do not give generic charity tips that could apply to anyone with no link to their text; each description must show how the idea fits their situation.",
    "- If their goal is narrow, stay focused; still offer variety (small steps, habit, learning, community) only when it genuinely serves that goal.",
    "",
    "OUTPUT — ONLY valid JSON, no markdown or commentary:",
    '{"suggestions":[{"title":"...","description":"...","kind":"..."}, ...]}',
    "Exactly 5 objects. title: short. description: 1–2 sentences, warm Islamic adab, explicitly tied to their goal (shown when they tap the title).",
    'kind: one of "monetary", "non_monetary", "habit", "learning", "community".',
    "No duplicate ideas.",
  ].join("\n");
}

/** User turn repeats goal + path so the model anchors on them. */
function buildUserMessage(goalText, pathButtonLabel) {
  const g = (goalText ?? "").trim();
  return [
    "Generate the JSON object now.",
    "",
    "Anchor every suggestion to this goal/focus:",
    '"""' + g + '"""',
    "",
    "And to this onboarding path:",
    '"""' + pathButtonLabel + '"""',
    "",
    "If any suggestion could apply unchanged to a random Muslim with a different goal, rewrite it until it is specific to the quotes above.",
  ].join("\n");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [pathId, setPathId] = useState(loadPath);
  const [username, setUsername] = useState(loadUsername);
  const [password, setPassword] = useState(loadPassword);
  const [goal, setGoal] = useState(loadGoal);
  /** @type {[Suggestion[], React.Dispatch<React.SetStateAction<Suggestion[]>>]} */
  const [suggestions, setSuggestions] = useState(loadSavedSuggestions);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState("");
  /** Which suggestion row is expanded (`sug-0` …); null = none. */
  const [openSuggestionId, setOpenSuggestionId] = useState(null);

  const pathMeta = useMemo(() => PATH_OPTIONS.find((p) => p.id === pathId), [pathId]);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, 3));
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const onChoosePath = (id) => {
    setPathId(id);
    localStorage.setItem(LS_PATH, id);
    goNext();
  };

  const onSaveCredentials = (e) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    localStorage.setItem(LS_USERNAME, u);
    localStorage.setItem(LS_PASSWORD, password);
    goNext();
  };

  const onGetSuggestions = async (e) => {
    e.preventDefault();
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key || String(key).trim() === "") {
      setAiError("Add VITE_GEMINI_API_KEY to your .env file (Google AI Studio).");
      return;
    }
    const g = goal.trim();
    if (!g) {
      setAiError("Please describe your sadaqah goal first.");
      return;
    }
    localStorage.setItem(LS_GOAL, g);
    setAiError("");
    setSuggestions([]);
    setOpenSuggestionId(null);
    setLoadingAi(true);

    const pathButtonLabel = pathMeta?.label ?? "Not specified";
    const system = buildSystemPrompt(
      pathMeta?.promptLabel ?? "General Muslim user.",
      g,
      pathButtonLabel,
    );
    const userMsg = buildUserMessage(g, pathButtonLabel);

    try {
      const textAcc = await fetchGeminiSuggestionText(key, system, userMsg);
      const final = parseSuggestionsFromText(textAcc);
      if (final.length >= 5) {
        const rows = final.slice(0, 5);
        setSuggestions([]);
        for (let i = 0; i < 5; i++) {
          window.setTimeout(() => {
            setSuggestions(rows.slice(0, i + 1));
          }, 220 * (i + 1));
        }
        window.setTimeout(() => {
          localStorage.setItem(LS_SUGGESTIONS, JSON.stringify(rows));
        }, 220 * 5 + 80);
      } else if (final.length > 0) {
        setSuggestions(final);
        console.warn("[Sincerity] Expected 5 suggestions, got", final.length, textAcc.slice(0, 400));
        setAiError(`Only received ${final.length} suggestion(s). Try again for a full set of five.`);
      } else {
        console.warn("[Sincerity] Could not parse AI suggestions. Raw length:", textAcc.length, textAcc.slice(0, 800));
        setAiError("Could not parse suggestions. Try again — or press F12 → Console for a snippet of the model output.");
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoadingAi(false);
    }
  };

  const onBegin = () => {
    navigate("/home", { replace: true });
  };

  const quote =
    "“The example of those who spend their wealth in the way of Allah is like a seed of grain which grows seven spikes; in each spike is a hundred grains. And Allah multiplies for whom He wills.” — Quran 2:261";

  return (
    <>
      <style>{`
        .onb {
          min-height: 100vh;
          padding: 1.25rem 1rem 2rem;
          color: var(--color-cream);
          display: flex;
          flex-direction: column;
        }
        .onb__dots {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }
        .onb__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--color-cream) 22%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-cream) 35%, transparent);
        }
        .onb__dot--active {
          background: var(--color-antique-gold);
          border-color: color-mix(in srgb, var(--color-antique-gold) 70%, var(--color-forest));
          transform: scale(1.15);
        }
        .onb__quote {
          margin: 0 0 1.25rem;
          font-size: 0.92rem;
          line-height: 1.55;
          font-style: italic;
          opacity: 0.95;
          text-align: center;
        }
        .onb__h1 {
          margin: 0 0 0.75rem;
          font-size: 1.2rem;
          font-weight: 700;
          text-align: center;
          letter-spacing: 0.02em;
        }
        .onb__sub {
          margin: 0 0 1rem;
          font-size: 0.88rem;
          opacity: 0.88;
          text-align: center;
          line-height: 1.45;
        }
        .onb__paths {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          margin-top: 0.5rem;
        }
        .onb__path-btn {
          width: 100%;
          text-align: left;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--color-cream) 22%, transparent);
          background: color-mix(in srgb, var(--color-forest) 82%, var(--color-cream));
          color: var(--color-cream);
          font-size: 0.9rem;
          line-height: 1.45;
          cursor: pointer;
          font-weight: 600;
        }
        .onb__path-btn:hover {
          border-color: var(--color-antique-gold);
        }
        .onb__path-btn:focus-visible {
          outline: 2px solid var(--color-antique-gold);
          outline-offset: 2px;
        }
        .onb__form {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .onb__label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .onb__label-text {
          font-size: 0.8rem;
          font-weight: 600;
          color: color-mix(in srgb, var(--color-cream) 92%, var(--color-forest));
        }
        .onb__input {
          width: 100%;
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--color-cream) 28%, transparent);
          background: color-mix(in srgb, var(--color-forest) 65%, #1a1f0d);
          color: var(--color-cream);
          font-size: 1rem;
        }
        .onb__input:focus {
          outline: 2px solid var(--color-antique-gold);
          outline-offset: 1px;
        }
        .onb__textarea {
          min-height: 5.5rem;
          resize: vertical;
        }
        .onb__actions {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          margin-top: 0.5rem;
        }
        .onb__btn {
          padding: 0.65rem 1rem;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 650;
          cursor: pointer;
          border: none;
        }
        .onb__btn--primary {
          background: var(--color-antique-gold);
          color: var(--color-forest);
        }
        .onb__btn--primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .onb__btn--ghost {
          background: transparent;
          color: var(--color-cream);
          border: 1px solid color-mix(in srgb, var(--color-cream) 30%, transparent);
        }
        .onb__btn--primary:hover:not(:disabled),
        .onb__btn--ghost:hover {
          filter: brightness(1.06);
        }
        .onb__err {
          margin: 0;
          font-size: 0.85rem;
          color: color-mix(in srgb, var(--color-cream) 85%, #c44);
          line-height: 1.4;
        }
        .onb__suggest-list {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .onb__suggest {
          border-bottom: 1px solid color-mix(in srgb, var(--color-cream) 14%, transparent);
          animation: onbCardIn 0.35s ease;
        }
        .onb__suggest:first-child {
          border-top: 1px solid color-mix(in srgb, var(--color-cream) 14%, transparent);
        }
        @keyframes onbCardIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .onb__suggest-title {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 0.45rem;
          padding: 0.75rem 0;
          margin: 0;
          border: none;
          background: transparent;
          color: var(--color-antique-gold);
          font-size: 0.95rem;
          font-weight: 700;
          line-height: 1.35;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
        }
        .onb__suggest-title:hover {
          color: color-mix(in srgb, var(--color-antique-gold) 88%, var(--color-cream));
        }
        .onb__suggest-title:focus-visible {
          outline: 2px solid var(--color-antique-gold);
          outline-offset: 2px;
          border-radius: 6px;
        }
        .onb__suggest-chevron {
          flex-shrink: 0;
          width: 1.1rem;
          opacity: 0.75;
          font-size: 0.72rem;
          line-height: 1.6;
        }
        .onb__suggest-title-text {
          flex: 1;
          min-width: 0;
        }
        .onb__suggest-panel {
          padding: 0 0 0.85rem 1.45rem;
        }
        .onb__suggest-desc {
          margin: 0;
          font-size: 0.86rem;
          line-height: 1.5;
          color: color-mix(in srgb, var(--color-cream) 94%, var(--color-forest));
          opacity: 0.95;
        }
        .onb__suggest-type {
          margin-top: 0.5rem;
          font-size: 0.72rem;
          font-weight: 650;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--color-sage);
        }
      `}</style>

      <div className="onb">
        <div className="onb__dots" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`onb__dot${step === i ? " onb__dot--active" : ""}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <p className="onb__quote">{quote}</p>
            <h1 className="onb__h1">How can we walk with you?</h1>
            <p className="onb__sub">Choose the path that fits you best right now.</p>
            <div className="onb__paths">
              {PATH_OPTIONS.map((p) => (
                <button key={p.id} type="button" className="onb__path-btn" onClick={() => onChoosePath(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="onb__h1">Create your space</h1>
            <p className="onb__sub">This stays on your device only — no server, no real accounts.</p>
            <form className="onb__form" onSubmit={onSaveCredentials}>
              <label className="onb__label">
                <span className="onb__label-text">Username</span>
                <input
                  className="onb__input"
                  value={username}
                  onChange={(ev) => setUsername(ev.target.value)}
                  autoComplete="username"
                  placeholder="What should we call you?"
                />
              </label>
              <label className="onb__label">
                <span className="onb__label-text">Password</span>
                <input
                  className="onb__input"
                  type="password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  autoComplete="new-password"
                  placeholder="For demo only — stored locally"
                />
              </label>
              <div className="onb__actions">
                <button type="submit" className="onb__btn onb__btn--primary" disabled={!username.trim()}>
                  Continue
                </button>
                <button type="button" className="onb__btn onb__btn--ghost" onClick={goBack}>
                  Back
                </button>
              </div>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="onb__h1">Your sadaqah intention</h1>
            <p className="onb__sub">
              Share a goal in your own words — amounts, causes, time you have, or skills you can offer. The more
              specific you are, the more personalized your five suggestions will be.
            </p>
            <form className="onb__form" onSubmit={onGetSuggestions}>
              <label className="onb__label">
                <span className="onb__label-text">Goal or focus</span>
                <textarea
                  className="onb__input onb__textarea"
                  value={goal}
                  onChange={(ev) => setGoal(ev.target.value)}
                  placeholder="e.g. $50/month to local food banks, or more smiling and helping neighbors…"
                />
              </label>
              {aiError ? (
                <p className="onb__err" role="alert">
                  {aiError}
                </p>
              ) : null}
              <div className="onb__actions">
                <button type="submit" className="onb__btn onb__btn--primary" disabled={loadingAi || !goal.trim()}>
                  {loadingAi ? "Listening…" : "Get suggestions"}
                </button>
                <button type="button" className="onb__btn onb__btn--ghost" onClick={goBack} disabled={loadingAi}>
                  Back
                </button>
              </div>
            </form>
            {suggestions.length > 0 ? (
              <div className="onb__suggest-list" aria-live="polite">
                {suggestions.map((s, idx) => {
                  const rowId = `sug-${idx}`;
                  const open = openSuggestionId === rowId;
                  return (
                    <div key={rowId} className="onb__suggest">
                      <button
                        type="button"
                        className="onb__suggest-title"
                        aria-expanded={open}
                        aria-controls={`${rowId}-panel`}
                        id={`${rowId}-btn`}
                        onClick={() =>
                          setOpenSuggestionId((prev) => (prev === rowId ? null : rowId))
                        }
                      >
                        <span className="onb__suggest-chevron" aria-hidden>
                          {open ? "▾" : "▸"}
                        </span>
                        <span className="onb__suggest-title-text">{s.title}</span>
                      </button>
                      {open ? (
                        <div
                          id={`${rowId}-panel`}
                          className="onb__suggest-panel"
                          role="region"
                          aria-labelledby={`${rowId}-btn`}
                        >
                          <p className="onb__suggest-desc">{s.description}</p>
                          <div className="onb__suggest-type">{s.type.replace(/_/g, " ")}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {suggestions.length >= 5 && !loadingAi ? (
              <div className="onb__actions" style={{ marginTop: "1.25rem" }}>
                <button type="button" className="onb__btn onb__btn--primary" onClick={goNext}>
                  Continue
                </button>
              </div>
            ) : null}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="onb__h1">You&apos;re ready</h1>
            <p className="onb__sub">
              Your intentions are planted. When you log sadaqah or hasanat, your garden on the home screen will grow —
              seven leaves, by the mercy of Allah.
            </p>
            <div className="onb__actions" style={{ marginTop: "1.5rem" }}>
              <button type="button" className="onb__btn onb__btn--primary" onClick={onBegin}>
                Bismillah, let&apos;s begin
              </button>
              <button type="button" className="onb__btn onb__btn--ghost" onClick={goBack}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
