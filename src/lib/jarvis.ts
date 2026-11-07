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
  discordLink: string;
};

export const DEFAULTS: Settings = {
  brain: "local",
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
  discordLink: "",
};

export const SIZES: Record<Size, number> = { small: 0.7, medium: 1, large: 1.3, huge: 1.6 };
export const VERSION = "1.3.0";
const KEY = "jarvis-settings-v2";

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
  localSetup?: (model: string) => Promise<{ ok?: boolean; error?: string }>;
  localStatus?: (model: string) => Promise<{ running: boolean; hasModel: boolean }>;
  listApps?: () => Promise<string[]>;
  openApp?: (name: string) => Promise<{ ok?: boolean; name?: string; error?: string }>;
  spotifyPlay?: (query: string) => Promise<{ ok?: boolean; error?: string }>;
  discordJoin?: (link: string) => Promise<{ ok?: boolean; error?: string }>;
  voiceWav?: (text: string) => Promise<{ wav?: string; error?: string }>;
  openUrl?: (url: string) => void;
};

export function bridge(): Bridge | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { jarvis?: Bridge }).jarvis;
}

export const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — a calm, witty, impeccably polite British AI companion who lives on the user's screen.
Address the user as "sir". Be dry, understated and helpful. Keep replies short: usually 1-3 sentences, since they are read aloud. Plain text, no markdown.
When a "LIVE DATA" section is provided, it is real, current information fetched just now — use it confidently (weather, time, facts) and never claim you cannot access it.`;

/** Strips the wake phrase. Returns null unless the clip STARTS with "(Hey) Jarvis". */
export function parseWake(text: string): string | null {
  const m = text.match(/^[\s"'.,!?-]*(?:(?:hey|hi|ok|okay|yo|a|hay)[\s,.!]+)?jarvis\b[\s,.!?]*/i);
  if (!m) return null;
  return text.slice(m[0].length).trim();
}

export type Action =
  | { kind: "open"; app: string }
  | { kind: "apps" }
  | { kind: "spotify"; query: string }
  | { kind: "discord"; message: string };

/** Recognises things Jarvis can DO on the PC. Returns null for normal chat. */
export function parseAction(text: string): Action | null {
  const s = text.trim().replace(/[.!?]+$/, "");
  const polite = "(?:(?:can|could|would) you |please |jarvis,? )*";
  let m = s.match(/\bjoin\b.*?\bdiscord\b.*?\b(?:tell|say|let)\b(?:\s+(?:them|everyone|the call|the guys))?(?:\s+know)?(?:\s+that)?\s+(.+)$/i);
  if (m) return { kind: "discord", message: (m[1] ?? "").trim() };
  if (/\bjoin\b.*\bdiscord\b/i.test(s)) return { kind: "discord", message: "" };
  m = s.match(new RegExp(`^${polite}(?:play|put on)\\s+(.+?)(?:\\s+on spotify)?$`, "i"))
    || s.match(/\bi(?: want|'d like| would like) to (?:play|listen to|hear)\s+(.+?)(?:\s+on spotify)?$/i);
  if (m) {
    const query = (m[1] ?? "").replace(/^(?:the song|song|some)\s+/i, "").replace(/["“”‘’']/g, "").replace(/\s+by\s+/i, " ").trim();
    if (query) return { kind: "spotify", query };
  }
  if (/\b(?:what|which|list|show)\b.*\b(?:apps|programs|applications|games)\b/i.test(s)) return { kind: "apps" };
  m = s.match(new RegExp(`^${polite}(?:open|launch|start|run|load)\\s+(?:up\\s+)?(?:the\\s+|my\\s+)?(.+?)(?:\\s+(?:app|application|program))?(?:\\s+for me)?$`, "i"));
  if (m) return { kind: "open", app: (m[1] ?? "").trim() };
  return null;
}

// ---------- live knowledge: weather, time, facts (free, no keys) ----------
const WEATHER_RE = /\b(weather|forecast|temperature|rain|raining|snow|sunny|cloudy|windy|umbrella|cold|hot|warm)\b/i;
const CODES: Record<number, string> = { 0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "violent showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail" };

/** Pulls a place name out of things like "weather in Blackburn" or a bare "Blackburn". */
export function extractPlace(text: string, followUp: boolean): string | null {
  const m = text.match(/\b(?:in|for|at|near|around)\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?:\s+(?:today|tomorrow|tonight|now|this week|right now))?[?.!]*$/i);
  if (m?.[1]) return m[1].trim();
  const bare = text.replace(/[?.!,]/g, "").trim();
  if (followUp && bare.split(/\s+/).length <= 3 && !WEATHER_RE.test(bare)) return bare;
  return null;
}

async function getJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function weatherFor(place: string | null): Promise<string | null> {
  let lat: number, lon: number, name: string;
  if (place) {
    const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`);
    const hit = g.results?.[0];
    if (!hit) return null;
    ({ latitude: lat, longitude: lon } = hit);
    name = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  } else {
    const ip = await getJson("https://ipapi.co/json/");
    lat = ip.latitude; lon = ip.longitude; name = [ip.city, ip.region, ip.country_name].filter(Boolean).join(", ");
  }
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`);
  const c = w.current, d = w.daily;
  const days = d.time.map((t: string, i: number) => `${t}: ${CODES[d.weather_code[i]] ?? "mixed"}, ${Math.round(d.temperature_2m_min[i])}–${Math.round(d.temperature_2m_max[i])}°C, ${d.precipitation_probability_max[i]}% chance of rain`).join("; ");
  return `Weather for ${name}: now ${Math.round(c.temperature_2m)}°C (feels ${Math.round(c.apparent_temperature)}°C), ${CODES[c.weather_code] ?? "mixed"}, wind ${Math.round(c.wind_speed_10m)} km/h, humidity ${c.relative_humidity_2m}%. Next days — ${days}.`;
}

async function factsFor(text: string): Promise<string | null> {
  const m = text.match(/\b(?:who|what)\s+(?:is|was|are|were)\s+(?:a |an |the )?(.{2,60}?)[?.!]*$/i) || text.match(/\btell me about\s+(.{2,60}?)[?.!]*$/i);
  if (!m?.[1]) return null;
  const q = await getJson(`https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&origin=*&search=${encodeURIComponent(m[1])}`);
  const title = q?.[1]?.[0];
  if (!title) return null;
  const s = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  return s.extract ? `Wikipedia on ${title}: ${String(s.extract).slice(0, 900)}` : null;
}

/** Builds the LIVE DATA block for a user message. Never throws. */
export async function liveContext(text: string, history: { role: string; content: string }[]): Promise<string> {
  const now = new Date();
  const parts = [`Current local date and time: ${now.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}.`];
  const recent = history.slice(-3).map((m) => m.content).join(" ");
  const followUp = !WEATHER_RE.test(text) && WEATHER_RE.test(recent);
  const tasks: Promise<string | null>[] = [];
  if (WEATHER_RE.test(text) || (followUp && extractPlace(text, true))) tasks.push(weatherFor(extractPlace(text, followUp)).catch(() => null));
  tasks.push(factsFor(text).catch(() => null));
  for (const r of await Promise.all(tasks)) if (r) parts.push(r);
  return "LIVE DATA:\n" + parts.join("\n");
}
