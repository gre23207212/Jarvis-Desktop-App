// Jarvis's self-knowledge: his version history, his skills, and the voice commands that ask about them.

export type Release = { version: string; date: string; highlights: string[] };

// Newest first. Add an entry here (and raise package.json "version") for every release.
export const CHANGELOG: Release[] = [
  {
    version: "1.5.0",
    date: "2026-06",
    highlights: [
      "tell you my exact version and what's new",
      "check GitHub for updates when you ask and install them in one click, or remind you tonight",
      "show you're using Jarvis on Discord as soon as I start",
      "wipe all your saved data when you uninstall me",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-05",
    highlights: [
      "answer global hotkeys and go into standby",
      "dock to windows and orbit your cursor",
      "learn about you from your dossier",
      "control windows, apps and media",
      "mute, deafen and message on Discord",
      "share your screen live and save instant replays",
      "run protocols, Iron Legion decoys and your custom skill mods",
    ],
  },
];

export const CAPABILITIES = [
  "open any app or game on your PC",
  "play music on Spotify and control any media player",
  "minimize, focus or close windows",
  "join your saved Discord voice channels and speak messages for you",
  "look at your screen and answer questions about it",
  "save gameplay clips from a rolling replay",
  "share your screen live",
  "remember facts about you",
  "read you the news and the weather",
  "run your custom skill mods",
  "update myself from GitHub",
];

const nums = (v: string) => v.replace(/^v/i, "").split(/[.\-+]/).map((n) => Number(n) || 0);
export const versionCompare = (a: string, b: string): number => {
  const x = nums(a), y = nums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

export const releaseFor = (version: string) => CHANGELOG.find((r) => versionCompare(r.version, version) === 0);

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export type SelfQuery = "version" | "whats-new" | "capabilities" | "updates";

export function selfQuery(text: string): SelfQuery | null {
  const t = text.toLowerCase();
  const q = t.trim();
  if (/^(?:(?:are there|is there|got|have you got|do you have)\s+)?(?:any|an?)\s+(?:new\s+)?updates?(?:\s+(?:for (?:you|jarvis)|available))?[\s?.!]*$/.test(q) || /\bcheck (?:for )?(?:new |any )?updates?\b|\bupdate yourself\b|\bnew version (?:out|available)\b|\bupdates? (?:for (?:you|jarvis)|available)\b/.test(t)) return "updates";
  if (/^what(?:'s| is) new(?:,? jarvis)?[\s?.!]*$/.test(q) || /\bwhat(?:'s| is| has)\s+(?:new|changed)\s+(?:with you|in (?:you|this (?:version|update)|the (?:latest |last )?(?:update|version)))\b|\bwhat did (?:the|your) (?:last )?update\b|\b(?:latest|recent) changes\b|\bpatch notes\b|\bchangelog\b/.test(t)) return "whats-new";
  if (/\bwhat\s+version\b|\bwhich\s+version\b|\bversion (?:are|r) (?:you|u)\b|\byour version\b|\bversion number\b/.test(t)) return "version";
  if (/\bwhat (?:can|could) (?:you|u) do\b|\bwhat are (?:your|ur) (?:skills|features|abilities)\b|\bwhat do you do\b|\bhelp me with\b.*\byou\b/.test(t)) return "capabilities";
  return null;
}

export function versionLine(shell: string, pages: string, title = "sir"): string {
  const d = shell && versionCompare(shell, pages) !== 0 ? ` My desktop shell is version ${shell} and my screens are version ${pages}.` : "";
  return `I'm running Jarvis version ${shell || pages}, ${title}.${d}`;
}

export function whatsNewLine(version: string, title = "sir"): string {
  const r = (releaseFor(version) ?? CHANGELOG[0]) as Release;
  return `Version ${r.version} brought these, ${title}: ${list(r.highlights)}.`;
}

export function updatedLine(from: string, to: string, title = "sir"): string {
  const gained = CHANGELOG.filter((r) => versionCompare(r.version, from) > 0 && versionCompare(r.version, to) <= 0).flatMap((r) => r.highlights);
  return `I've been updated from version ${from} to ${to}, ${title}.${gained.length ? ` I can now ${list(gained.slice(0, 4))}.` : ""}`;
}

export function capabilitiesLine(title = "sir"): string {
  return `Quite a lot, ${title}. I can ${list(CAPABILITIES)}. Just ask.`;
}

/** Prompt block so the AI brain also knows its version and feature history. */
export function selfPrompt(shell: string, pages: string): string {
  return [
    `ABOUT YOURSELF: you are Jarvis Desktop version ${shell || pages}${shell && shell !== pages ? ` (screens version ${pages})` : ""}.`,
    `Your skills: ${CAPABILITIES.join("; ")}.`,
    ...CHANGELOG.map((r) => `Version ${r.version}: ${r.highlights.join("; ")}.`),
  ].join("\n");
}

const SEEN_KEY = "jarvis-last-version";

/** On launch: returns the old version when Jarvis has just been updated, then remembers the current one. */
export function consumeVersionChange(current: string): string | null {
  if (typeof localStorage === "undefined" || !current) return null;
  const prev = localStorage.getItem(SEEN_KEY);
  localStorage.setItem(SEEN_KEY, current);
  return prev && versionCompare(current, prev) > 0 ? prev : null;
}
