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
function parseBulletsJson(text) {
  let t = String(text ?? "").trim();
  if (!t) return [];
  t = t.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();

  const candidates = [t, sliceFirstJsonObject(t)];
  const keys = ["bullets", "tasks", "items", "steps", "todo", "checklist", "lines"];

  for (const chunk of candidates) {
    const o = tryParseObject(chunk);
    if (!o) continue;

    if (Array.isArray(o)) {
      const fromArr = stringsFromArray(o);
      if (fromArr.length) return fromArr.slice(0, 3);
    }

    if (typeof o === "object") {
      for (const k of keys) {
        if (Array.isArray(o[k])) {
          const fromArr = stringsFromArray(o[k]);
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

/**
 * @param {string} apiKey
 * @param {string} goalText
 * @param {AbortSignal | undefined} signal
 * @param {{ donationCount?: number; hasanatCount?: number }} [activity]
 * @returns {Promise<string[]>} 2–3 strings (checkbox labels for today)
 */
export async function fetchDailyBulletsFromGoal(apiKey, goalText, signal, activity = {}) {
  const donationCount = Number(activity.donationCount) || 0;
  const hasanatCount = Number(activity.hasanatCount) || 0;

  const system = [
    "You write 2–3 checkbox lines for ONE day, tied tightly to the user's pinned goal. Tone: calm, specific, dignified — like tasks in a notes app, not a motivational poster.",
    "AVOID: clichés and filler (e.g. 'a smile is sadaqah', 'kindness costs nothing', generic 'spread love', vague 'be grateful', hashtag-y slogans, or recycled hadith one-liners used as decoration).",
    "AVOID: preaching, rhetorical questions, exclamation hype, or explaining basic fiqh they already know.",
    "DO: concrete verbs + one clear object or context from THEIR goal (who, what, where, how much if relevant). Each line must be doable today without a lecture.",
    "If donation/hasanat counts are low, you may imply 'room to log more' through practical tasks — still no guilt-tripping, no comparing to others.",
    "Output ONLY valid JSON (no markdown). The root object MUST use the key exactly: \"bullets\" (an array of 2 or 3 strings). Example: {\"bullets\":[\"...\",\"...\"]}. Max ~16 words per string.",
  ].join("\n");

  const user = [
    "Pinned goal (mirror its themes in every bullet):",
    '"""' + goalText.trim() + '"""',
    "",
    "App counts (lifetime rows — use only to calibrate how concrete / ambitious the tasks are, not to lecture):",
    `- Monetary donations logged: ${donationCount}`,
    `- Hasanat / good-deed rows logged: ${hasanatCount}`,
    "",
    "Return only one JSON object. The array key must be spelled exactly: bullets",
  ].join("\n");

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
  );
  url.searchParams.set("key", apiKey.trim());

  const base = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: 768,
      temperature: 0.45,
      responseMimeType: "application/json",
      responseSchema: DAILY_BULLETS_SCHEMA,
    },
  };

  let res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(base),
    signal,
  });

  if (res.status === 400) {
    await res.text().catch(() => "");
    const fallback = {
      systemInstruction: base.systemInstruction,
      contents: base.contents,
      generationConfig: {
        maxOutputTokens: 768,
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
  if (!rawText.trim()) {
    const fr = json?.candidates?.[0]?.finishReason;
    const msg = fr
      ? `No text returned (${fr}). Try a shorter goal or tap refresh.`
      : "Empty response from the model. Try again.";
    console.warn("[Sincerity] daily bullets empty response", { finishReason: fr, json });
    throw new Error(msg);
  }

  const bullets = parseBulletsJson(rawText);
  if (bullets.length < 2) {
    console.warn("[Sincerity] daily bullets parse miss; raw snippet:", rawText.slice(0, 600));
    throw new Error(
      "Could not read the checklist from the model. Try again — if it keeps failing, open F12 → Console for a snippet of the raw reply.",
    );
  }
  return bullets.slice(0, 3);
}
