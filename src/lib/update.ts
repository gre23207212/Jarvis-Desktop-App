// GitHub auto-update checker helpers.

export const UPDATE_REPO = "gre23207212/pocket-jarvis-desktop-mate";
export const UPDATE_URL = `https://github.com/${UPDATE_REPO}/releases/latest`;
export const UPDATE_NOTE = "Checks GitHub releases on boot and every 3 hours.";

const parts = (v: string): number[] =>
  v.replace(/^v/i, "").split(/[.\-+]/).slice(0, 4).map((n) => Number(n) || 0);

/** True when the remote release tag is strictly newer than the local version. */
export function isNewerVersion(remote: string, local: string): boolean {
  const a = parts(String(remote || "").trim());
  const b = parts(String(local || "").trim());
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export type UpdateInfo = { tag: string; url: string; download?: string | null } | null;
export type UpdateProgress = { text: string; pct: number };

export function updateMessage(info: NonNullable<UpdateInfo>, title = "Sir"): string {
  const v = info.tag.replace(/^v/i, "");
  return info.download
    ? `${title}, version ${v} is available. Press Update now and I'll install it myself.`
    : `${title}, an updated firmware patch is available on GitHub — version ${v} is ready to download.`;
}

// "Remind me tonight": hide the update offer until 8pm (or 3 hours from now if it's already evening).
const SNOOZE_KEY = "jarvis-update-snooze";

export function tonight(now = new Date()): number {
  const eight = new Date(now);
  eight.setHours(20, 0, 0, 0);
  return now.getTime() < eight.getTime() ? eight.getTime() : now.getTime() + 3 * 3600_000;
}

export function snoozeUpdate(tag: string, now = new Date()): number {
  const until = tonight(now);
  localStorage.setItem(SNOOZE_KEY, JSON.stringify({ tag, until }));
  sessionStorage.removeItem("jarvis-update-shown");
  return until;
}

export function isSnoozed(tag: string, now = Date.now()): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null") as { tag: string; until: number } | null;
    return !!s && s.tag === tag && now < s.until;
  } catch { return false; }
}

export const snoozeLine = (until: number, title = "sir") =>
  `Understood, ${title}. I'll remind you about the update ${new Date(until).getHours() === 20 ? "at 8 tonight" : "in a few hours"}.`;
