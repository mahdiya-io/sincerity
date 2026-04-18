/**
 * Personalized Sadaqah / Hasanat dropdown catalogs.
 * Populated after onboarding (Gemini) and read by Sadaqah, Hasanat, and Home daily prompts.
 * Defaults live in `src/data/goals.js` until AI rows are saved.
 */

import {
  HASANAT_GOALS as DEFAULT_HASANAT_GOALS,
  SADAQAH_GOALS as DEFAULT_SADAQAH_GOALS,
} from "@/data/goals.js";

const LS_SADAQAH = "sincerity_catalog_sadaqah_goals";
const LS_HASANAT = "sincerity_catalog_hasanat_goals";

/** @typedef {{ id: string; name: string; body: string }} CatalogGoal */

/** @param {unknown} x @returns {x is CatalogGoal} */
function isCatalogGoal(x) {
  if (!x || typeof x !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (x);
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const body = typeof o.body === "string" ? o.body.trim() : "";
  return Boolean(id && name && body);
}

/** @param {unknown} raw @param {CatalogGoal[]} fallback */
function parseStoredArray(raw, fallback) {
  try {
    const v = JSON.parse(String(raw ?? ""));
    if (!Array.isArray(v) || v.length < 1) return fallback;
    const out = v.filter(isCatalogGoal).map((g) => ({
      id: g.id.trim(),
      name: g.name.trim(),
      body: g.body.trim(),
    }));
    return out.length >= 3 ? out.slice(0, 3) : fallback;
  } catch {
    return fallback;
  }
}

/** Active list for Sadaqah dropdowns (AI catalog or `goals.js` defaults). */
export function getActiveSadaqahGoals() {
  try {
    const raw = localStorage.getItem(LS_SADAQAH);
    return parseStoredArray(raw, DEFAULT_SADAQAH_GOALS);
  } catch {
    return DEFAULT_SADAQAH_GOALS;
  }
}

/** Active list for Hasanat dropdowns (AI catalog or `goals.js` defaults). */
export function getActiveHasanatGoals() {
  try {
    const raw = localStorage.getItem(LS_HASANAT);
    return parseStoredArray(raw, DEFAULT_HASANAT_GOALS);
  } catch {
    return DEFAULT_HASANAT_GOALS;
  }
}

/**
 * @param {CatalogGoal[]} sadaqah exactly 3
 * @param {CatalogGoal[]} hasanat exactly 3
 */
export function saveCatalogGoals(sadaqah, hasanat) {
  const s = sadaqah.filter(isCatalogGoal).slice(0, 3);
  const h = hasanat.filter(isCatalogGoal).slice(0, 3);
  if (s.length !== 3 || h.length !== 3) return;
  try {
    localStorage.setItem(LS_SADAQAH, JSON.stringify(s));
    localStorage.setItem(LS_HASANAT, JSON.stringify(h));
  } catch {
    /* quota */
  }
}

/** Stable string for Home daily cache when catalog content changes. */
export function dailyGoalsCatalogDigest() {
  return [...getActiveSadaqahGoals(), ...getActiveHasanatGoals()]
    .map((g) => `${g.id}\t${g.name}\t${g.body}`)
    .join("\n");
}

/** Block for Gemini daily checklist. */
export function formatDailyGoalsCatalogForPrompt() {
  const sadaqah = getActiveSadaqahGoals().map((g, i) => `${i + 1}. ${g.name} — ${g.body}`).join("\n");
  const hasanat = getActiveHasanatGoals().map((g, i) => `${i + 1}. ${g.name} — ${g.body}`).join("\n");
  return [
    "These causes are defined in the app (users pick them when logging monetary sadaqah or hasanat). Prefer concrete tasks that can align with one of these when it fits the user’s pinned goal — do not invent new official cause names.",
    "",
    "Sadaqah (monetary) causes:",
    sadaqah,
    "",
    "Hasanat (good deed) causes:",
    hasanat,
  ].join("\n");
}

/**
 * @param {number} donationCount
 * @param {unknown[]} hasanatEntries parsed `sincerity_hasanat` array
 */
export function dailyActivityFingerprint(donationCount, hasanatEntries) {
  const list = Array.isArray(hasanatEntries) ? hasanatEntries : [];
  const catalog = getActiveHasanatGoals();
  const counts = new Map(catalog.map((g) => [g.id, 0]));
  for (const row of list) {
    const id = String(row?.goalId ?? "").trim();
    if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const tail = catalog.map((g) => `${g.id}:${counts.get(g.id) ?? 0}`).join(";");
  return `${Number(donationCount) || 0}|${tail}`;
}

/** Human-readable lines for the daily Gemini user message. */
export function formatHasanatCountsForPrompt(hasanatEntries) {
  const list = Array.isArray(hasanatEntries) ? hasanatEntries : [];
  const catalog = getActiveHasanatGoals();
  const counts = new Map(catalog.map((g) => [g.id, 0]));
  for (const row of list) {
    const id = String(row?.goalId ?? "").trim();
    if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return catalog.map((g) => `- ${g.name}: ${counts.get(g.id) ?? 0} logged`).join("\n");
}
