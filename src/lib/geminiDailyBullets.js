/**
 * Gemini helper: 2–3 short daily action bullets from a user's goal text.
 * Used by Home; keeps Onboarding free of this logic.
 */

const GEMINI_MODEL =
  typeof import.meta.env.VITE_GEMINI_MODEL === "string" && import.meta.env.VITE_GEMINI_MODEL.trim()
    ? import.meta.env.VITE_GEMINI_MODEL.trim()
    : "gemini-2.5-flash";

const DAILY_BULLETS_SCHEMA = {
  type: "OBJECT",
  properties: {
    bullets: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["bullets"],
};

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

function extractTextFromGenerateContentResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
}

/** Pull string lines from mixed array (strings or { text } / { title } / { task }). */
function stringsFromArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (typeof x === "string") {
      const s = x.trim();
      if (s) out.push(s);
    } else if (x && typeof x === "object") {
      const t = x.text ?? x.title ?? x.task ?? x.label;
      if (typeof t === "string" && t.trim()) out.push(t.trim());
    }
    if (out.length >= 3) break;
  }
  return out;
}

function tryParseObject(t) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Extract {...} from noisy model output. */
function sliceFirstJsonObject(str) {
  const i = str.indexOf("{");
  const j = str.lastIndexOf("}");
  if (i === -1 || j <= i) return str.trim();
  return str.slice(i, j + 1).trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
/** Coerce array elements to trimmed strings (numbers / nested objects). */
function normalizeBulletStrings(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (typeof x === "string") {
      const s = x.trim();
      if (s) out.push(s);
    } else if (typeof x === "number" && Number.isFinite(x)) {
      out.push(String(x));
    } else if (x && typeof x === "object") {
      const t = x.text ?? x.title ?? x.task ?? x.label ?? x.bullet;
      if (typeof t === "string" && t.trim()) out.push(t.trim());
    }
    if (out.length >= 3) break;
  }
  return out;
}

function parseBulletsJson(text) {
  let t = String(text ?? "").trim();
  if (!t) return [];
  t = t.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();

  const candidates = [t, sliceFirstJsonObject(t)];
  const keys = ["bullets", "tasks", "items", "steps", "todo", "checklist", "lines", "daily_bullets"];

  for (const chunk of candidates) {
    let o = tryParseObject(chunk);
    if (!o && chunk.includes('"bullets"')) {
      const m = chunk.match(/"bullets"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (m) {
        try {
          const inner = JSON.parse(m[1]);
          const fromArr = normalizeBulletStrings(inner);
          if (fromArr.length) return fromArr.slice(0, 3);
        } catch {
          /* ignore */
        }
      }
    }
    if (!o) continue;

    /* Double-encoded JSON string */
    if (typeof o === "object" && !Array.isArray(o) && typeof o.bullets === "string") {
      try {
        const inner = JSON.parse(/** @type {string} */ (o.bullets));
        if (Array.isArray(inner)) {
          const fromArr = normalizeBulletStrings(inner);
          if (fromArr.length) return fromArr.slice(0, 3);
        }
      } catch {
        /* ignore */
      }
    }

    if (Array.isArray(o)) {
      const fromArr = stringsFromArray(o);
      if (fromArr.length) return fromArr.slice(0, 3);
      const norm = normalizeBulletStrings(o);
      if (norm.length) return norm.slice(0, 3);
    }

    if (typeof o === "object") {
      for (const k of keys) {
        if (Array.isArray(o[k])) {
          const fromArr = normalizeBulletStrings(o[k]);
          if (fromArr.length) return fromArr.slice(0, 3);
        }
      }
    }
  }

  /* One string with semicolons / newlines → split into up to 3 tasks */
  const oneLine = candidates[0];
  if (oneLine && !oneLine.startsWith("{")) {
    const parts = oneLine
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length >= 2) return parts;
  }

  return [];
}

const MAX_CATALOG_IN_PROMPT = 3200;

function truncatePromptBlock(block) {
  const s = String(block ?? "").trim();
  if (!s) return "";
  if (s.length <= MAX_CATALOG_IN_PROMPT) return s;
  return s.slice(0, MAX_CATALOG_IN_PROMPT) + "\n… [truncated for length]";
}

/** Last resort so Home always gets two checkboxes. */
function fallbackBulletsFromGoal(goalText) {
  const g = goalText.trim() || "your intention";
  const short = g.length > 90 ? `${g.slice(0, 87)}…` : g;
  return [
    `Take one concrete step today toward: ${short}`,
    "Log any sadaqah or hasanat you complete in the app.",
  ];
}

/**
 * @param {string} system
 * @param {string} user
 * @param {boolean} useSchema
 * @param {AbortSignal | undefined} signal
 * @param {string} apiKey
 */
async function generateBulletsOnce(system, user, useSchema, signal, apiKey) {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
  );
  url.searchParams.set("key", apiKey.trim());

  const generationConfig = {
    maxOutputTokens: 1024,
    temperature: 0.45,
    ...(useSchema
      ? {
          responseMimeType: "application/json",
          responseSchema: DAILY_BULLETS_SCHEMA,
        }
      : {}),
  };

  const base = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  };

  let res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(base),
    signal,
  });

  if (res.status === 400 && useSchema) {
    await res.text().catch(() => "");
    const fallback = {
      systemInstruction: base.systemInstruction,
      contents: base.contents,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.45,
      },
    };
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fallback),
      signal,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(formatGeminiError(res.status, errText));
  }

  const json = await res.json();
  const block = json?.promptFeedback?.blockReason;
  if (block) throw new Error(`Prompt blocked (${block}).`);

  const rawText = extractTextFromGenerateContentResponse(json);
  return { rawText, json };
}

/**
 * @param {string} apiKey
 * @param {string} goalText
 * @param {AbortSignal | undefined} signal
 * @param {{
 *   donationCount?: number;
 *   hasanatCount?: number;
 *   goalsCatalogBlock?: string;
 *   hasanatCountsBlock?: string;
 * }} [activity]
 * @returns {Promise<string[]>} 2–3 strings (checkbox labels for today)
 */
export async function fetchDailyBulletsFromGoal(apiKey, goalText, signal, activity = {}) {
  const donationCount = Number(activity.donationCount) || 0;
  const hasanatCount = Number(activity.hasanatCount) || 0;
  const goalsCatalogBlock = truncatePromptBlock(
    typeof activity.goalsCatalogBlock === "string" ? activity.goalsCatalogBlock : "",
  );
  const hasanatCountsBlock = truncatePromptBlock(
    typeof activity.hasanatCountsBlock === "string" ? activity.hasanatCountsBlock : "",
  );

  const system = [
    "You write 2–3 checkbox lines for ONE day, tied tightly to the user's pinned goal. Tone: calm, specific, dignified — like tasks in a notes app, not a motivational poster.",
    "The app includes a fixed list of official Sadaqah (monetary) and Hasanat (good deed) causes. When a task fits, you may reference those cause names or themes from the catalog — stay consistent with the catalog wording.",
    "AVOID: clichés and filler (e.g. 'a smile is sadaqah', 'kindness costs nothing', generic 'spread love', vague 'be grateful', hashtag-y slogans, or recycled hadith one-liners used as decoration).",
    "AVOID: preaching, rhetorical questions, exclamation hype, or explaining basic fiqh they already know.",
    "DO: concrete verbs + one clear object or context from THEIR goal (who, what, where, how much if relevant). Each line must be doable today without a lecture.",
    "If donation/hasanat counts are low, you may imply 'room to log more' through practical tasks — still no guilt-tripping, no comparing to others.",
    "You MUST return a JSON object with key \"bullets\" whose value is an array of exactly 2 or 3 non-empty strings (short task lines). No markdown, no extra keys.",
  ].join("\n");

  const buildFullUser = () => {
    const userParts = [
      "Pinned goal (mirror its themes in every bullet):",
      '"""' + goalText.trim() + '"""',
      "",
      "App counts (lifetime rows — use only to calibrate how concrete / ambitious the tasks are, not to lecture):",
      `- Monetary donations logged: ${donationCount}`,
      `- Hasanat / good-deed rows logged: ${hasanatCount}`,
      "",
    ];
    if (hasanatCountsBlock) {
      userParts.push("Hasanat rows by official cause (from the Hasanat tab):", hasanatCountsBlock, "");
    }
    if (goalsCatalogBlock) {
      userParts.push("Official cause catalog (same as in the app):", goalsCatalogBlock, "");
    }
    userParts.push('Reply with only: {"bullets":["line1","line2"]} or three strings.');
    return userParts.join("\n");
  };

  const buildMinimalUser = () =>
    [
      "Pinned goal:",
      '"""' + goalText.trim() + '"""',
      "",
      `Donation rows logged: ${donationCount}; hasanat rows: ${hasanatCount}.`,
      "",
      'Return only JSON: {"bullets":["two or three short actionable lines for today"]}.',
    ].join("\n");

  const tryParseResponse = (rawText, json, label) => {
    if (!rawText.trim()) {
      const fr = json?.candidates?.[0]?.finishReason;
      console.warn("[Sincerity] daily bullets empty response", label, { finishReason: fr, json });
      return [];
    }
    const bullets = parseBulletsJson(rawText);
    if (bullets.length < 2) {
      console.warn("[Sincerity] daily bullets parse miss", label, rawText.slice(0, 800));
    }
    return bullets;
  };

  let bullets = [];
  /** At least one HTTP 200 + body received (even if JSON parse failed). */
  let anyResponse = false;
  /** Last transport/API error when a request threw before parsing. */
  let lastRequestError = /** @type {Error | null} */ (null);

  const attempts = [
    ["full", buildFullUser],
    ["minimal", buildMinimalUser],
  ];

  for (const [label, buildUser] of attempts) {
    try {
      const { rawText, json } = await generateBulletsOnce(system, buildUser(), true, signal, apiKey);
      anyResponse = true;
      bullets = tryParseResponse(rawText, json, label);
      if (bullets.length >= 2) return bullets.slice(0, 3);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastRequestError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[Sincerity] daily bullets request "${label}" failed:`, lastRequestError);
    }
  }

  if (anyResponse) {
    console.warn("[Sincerity] daily bullets using local fallback (model did not return 2+ lines).");
    return fallbackBulletsFromGoal(goalText);
  }
  if (lastRequestError) throw lastRequestError;
  return fallbackBulletsFromGoal(goalText);
}
