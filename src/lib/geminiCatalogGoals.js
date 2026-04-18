/**
 * Gemini: 3 Sadaqah (monetary) causes + 3 Hasanat deeds for dropdowns, from onboarding goal text.
 */

import { saveCatalogGoals } from "@/lib/catalogGoals.js";

const GEMINI_MODEL =
  typeof import.meta.env.VITE_GEMINI_MODEL === "string" && import.meta.env.VITE_GEMINI_MODEL.trim()
    ? import.meta.env.VITE_GEMINI_MODEL.trim()
    : "gemini-2.5-flash";

const CATALOG_SCHEMA = {
  type: "OBJECT",
  properties: {
    sadaqah_goals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          name: { type: "STRING" },
          body: { type: "STRING" },
        },
        required: ["id", "name", "body"],
      },
    },
    hasanat_goals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          name: { type: "STRING" },
          body: { type: "STRING" },
        },
        required: ["id", "name", "body"],
      },
    },
  },
  required: ["sadaqah_goals", "hasanat_goals"],
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

/** @param {unknown} o */
function normalizeRow(o) {
  if (!o || typeof o !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (o);
  const id = typeof r.id === "string" ? r.id.trim().replace(/\s+/g, "_") : "";
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const body = typeof r.body === "string" ? r.body.trim() : "";
  if (!id || !name || !body) return null;
  return { id, name, body };
}

function parseCatalogJson(text) {
  let t = String(text ?? "").trim();
  t = t.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  try {
    const o = JSON.parse(t);
    if (!o || typeof o !== "object") return null;
    const rec = /** @type {Record<string, unknown>} */ (o);
    const sRaw = rec.sadaqah_goals ?? rec.sadaqahGoals;
    const hRaw = rec.hasanat_goals ?? rec.hasanatGoals;
    if (!Array.isArray(sRaw) || !Array.isArray(hRaw)) return null;
    const sadaqah = sRaw.map(normalizeRow).filter(Boolean).slice(0, 3);
    const hasanat = hRaw.map(normalizeRow).filter(Boolean).slice(0, 3);
    if (sadaqah.length !== 3 || hasanat.length !== 3) return null;
    const sIds = new Set(sadaqah.map((x) => x.id));
    const hIds = new Set(hasanat.map((x) => x.id));
    if (sIds.size !== 3 || hIds.size !== 3) return null;
    for (const id of sIds) if (hIds.has(id)) return null;
    return { sadaqah, hasanat };
  } catch {
    return null;
  }
}

/**
 * Calls Gemini and writes `saveCatalogGoals` on success.
 * @param {string} apiKey
 * @param {{ userGoal: string; pathLabel: string }} ctx
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<boolean>} true if saved
 */
export async function fetchAndPersistCatalogGoals(apiKey, ctx, signal) {
  const userGoal = String(ctx.userGoal ?? "").trim();
  if (!userGoal) return false;

  const system = [
    "You output JSON only for a Muslim charity-tracking app.",
    "Generate exactly THREE monetary-sadaqah causes and exactly THREE hasanat (non-monetary good deed) causes tailored to the user's stated intention and onboarding path.",
    "Each item: id (unique snake_case, ASCII, start with sadaqah_ or hasanat_ prefix), name (short label for a dropdown), body (one sentence describing what to log under this cause).",
    "Causes must be specific enough to distinguish rows in a chart; avoid duplicate themes across the three in each category.",
    "Stay practical and dignified; no guilt, no hype, no fiqh lectures.",
  ].join("\n");

  const user = [
    "Onboarding path (how they framed their journey):",
    '"""' + String(ctx.pathLabel ?? "").trim() + '"""',
    "",
    "Their goal / intention (primary signal):",
    '"""' + userGoal + '"""',
    "",
    'Return JSON with keys exactly "sadaqah_goals" and "hasanat_goals", each an array of exactly 3 objects { "id", "name", "body" }.',
  ].join("\n");

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
  );
  url.searchParams.set("key", apiKey.trim());

  const base = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: 1536,
      temperature: 0.55,
      responseMimeType: "application/json",
      responseSchema: CATALOG_SCHEMA,
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
        maxOutputTokens: 1536,
        temperature: 0.55,
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
  const parsed = parseCatalogJson(rawText);
  if (!parsed) {
    console.warn("[Sincerity] catalog goals parse miss:", rawText.slice(0, 500));
    return false;
  }

  saveCatalogGoals(parsed.sadaqah, parsed.hasanat);
  return true;
}
