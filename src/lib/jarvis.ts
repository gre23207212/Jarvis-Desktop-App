// Shared Jarvis settings + desktop bridge (browser-only usage).
export type Brain = "builtin" | "chatgpt" | "local" | "custom";
export type Size = "small" | "medium" | "large" | "huge";

export type Settings = {
  brain: Brain;
  localUrl: string;
  localModel: string;
  customUrl: string;
  customKey: string;
  customModel: string;
  voiceOn: boolean;
  voiceName: string;
  micId: string;
  wakeWord: boolean;
  size: Size;
};

export const DEFAULTS: Settings = {
  brain: "chatgpt",
  localUrl: "http://localhost:11434/v1",
  localModel: "gemma4:e4b",
  customUrl: "https://api.openai.com/v1",
  customKey: "",
  customModel: "gpt-4o-mini",
  voiceOn: true,
  voiceName: "",
  micId: "",
  wakeWord: true,
  size: "medium",
};

export const SIZES: Record<Size, number> = { small: 0.7, medium: 1, large: 1.3, huge: 1.6 };
export const VERSION = "1.1.0";
const KEY = "jarvis-settings";

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  bridge()?.cmd("settings-changed");
  return next;
}

export type Bridge = {
  desktop: true;
  moveBy: (dx: number, dy: number) => void;
  setIgnore: (ignore: boolean) => void;
  cmd: (name: string, arg?: unknown) => void;
  chat: (req: { url: string; key?: string; model: string; messages: { role: string; content: string }[] }) => Promise<{ text?: string; error?: string }>;
  onCmd: (fn: (name: string, arg?: unknown) => void) => () => void;
};

export function bridge(): Bridge | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { jarvis?: Bridge }).jarvis;
}

export const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — a calm, witty, impeccably polite British AI companion who lives on the user's screen.
Address the user as "sir". Be dry, understated and helpful. Keep replies short: usually 1-3 sentences, since they are read aloud. Plain text, no markdown.`;

/** Strips the wake phrase. Returns null when "Jarvis" wasn't said. */
export function parseWake(text: string): string | null {
  const m = text.match(/\b(?:hey|hi|ok|okay|yo)?[\s,]*jarvis\b[\s,.!?]*/i);
  if (!m) return null;
  return text.slice((m.index ?? 0) + m[0].length).trim();
}
