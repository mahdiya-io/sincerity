/** Fired after same-tab writes to sincerity_* keys so Home can re-read without `storage` (other tabs only). */
export const SINCERITY_STORAGE_EVENT = "sincerity:storage";

const LS_LEAVES = "sincerity_leaves";
const LS_LAST_ACT = "sincerity_last_act";

function readLeavesCount() {
  try {
    const raw = localStorage.getItem(LS_LEAVES);
    if (raw == null || raw === "") return 0;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return 0;
    return Math.min(7, Math.max(0, n));
  } catch {
    return 0;
  }
}

export function notifySincerityStorageChanged() {
  window.dispatchEvent(new Event(SINCERITY_STORAGE_EVENT));
}

/** Each successful donation: +1 leaf (max 7) and refresh last-act time for wilt. */
export function recordDonationForPlantGrowth() {
  try {
    const next = Math.min(7, readLeavesCount() + 1);
    localStorage.setItem(LS_LEAVES, String(next));
    localStorage.setItem(LS_LAST_ACT, String(Date.now()));
  } catch {
    /* quota / private mode */
  }
  notifySincerityStorageChanged();
}

/** Clears plant growth and last-act time (e.g. when resetting Sadaqah data). */
export function resetPlantStateToFresh() {
  try {
    localStorage.setItem(LS_LEAVES, "0");
    localStorage.removeItem(LS_LAST_ACT);
  } catch {
    /* ignore */
  }
  notifySincerityStorageChanged();
}
