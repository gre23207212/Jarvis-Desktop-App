// Personal dossier (sir.md / user.md): who Jarvis serves. Lives in browser storage and is mirrored to a sir.md file on disk.
import { bridge } from "./jarvis";

export type Dossier = {
  name: string;
  /** Honorific Jarvis uses when addressing the user: "Sir", "Boss", "Mr. Stark"… */
  title: string;
  favoriteGames: string[];
  music: string[];
  codingStack: string[];
  notes: string;
};

export const DEFAULT_DOSSIER: Dossier = { name: "", title: "Sir", favoriteGames: [], music: [], codingStack: [], notes: "" };
const KEY = "jarvis-dossier-v1";
const MAX = 8000;

const list = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [];
  return raw.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()).slice(0, 24);
};

export function parseDossier(md: string): Dossier {
  const d: Dossier = { ...DEFAULT_DOSSIER, favoriteGames: [], music: [], codingStack: [] };
  for (const line of String(md || "").split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]?\s*([\w -]+?)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = (m[1] ?? "").toLowerCase().replace(/[\s_]+/g, "");
    const val = (m[2] ?? "").replace(/^["'\[]|\["']$/g, "").replace(/\]$/, "").trim();
    if (key === "name") d.name = val.slice(0, 60);
    else if (key === "title" || key === "honorific") d.title = val.slice(0, 40) || "Sir";
    else if (key === "favoritegames" || key === "games") d.favoriteGames = list(val);
    else if (key === "music") d.music = list(val);
    else if (key === "codingstack" || key === "stack") d.codingStack = list(val);
    else if (key === "notes" || key === "customnotes") d.notes = val.slice(0, 500);
  }
  return d;
}

export function serializeDossier(d: Dossier): string {
  const j = (xs: string[]) => (xs.length ? `[${xs.join(", ")}]` : "[]");
  return [
    "# sir.md — personal dossier",
    "",
    `name: ${d.name || ""}`,
    `title: ${d.title || "Sir"}`,
    `favorite_games: ${j(d.favoriteGames)}`,
    `coding_stack: ${j(d.codingStack)}`,
    `music: ${j(d.music)}`,
    `notes: ${d.notes || ""}`,
    "",
  ].join("\n");
}

export function loadDossier(): Dossier {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_DOSSIER };
    const v = JSON.parse(raw);
    return {
      name: typeof v.name === "string" ? v.name : "",
      title: typeof v.title === "string" && v.title.trim() ? v.title : "Sir",
      favoriteGames: list(v.favoriteGames),
      music: list(v.music),
      codingStack: list(v.codingStack),
      notes: typeof v.notes === "string" ? v.notes : "",
    };
  } catch {
    return { ...DEFAULT_DOSSIER };
  }
}

export function saveDossier(d: Dossier): Dossier {
  const clean: Dossier = {
    name: d.name.trim().slice(0, 60),
    title: d.title.trim().slice(0, 40) || "Sir",
    favoriteGames: list(d.favoriteGames),
    music: list(d.music),
    codingStack: list(d.codingStack),
    notes: d.notes.slice(0, 500),
  };
  localStorage.setItem(KEY, JSON.stringify(clean));
  bridge()?.dossierWrite?.(serializeDossier(clean));
  window.dispatchEvent(new Event("jarvis-dossier-changed"));
  return clean;
}

/** Pulls the on-disk sir.md into browser storage; call once when a desktop window opens. */
export function syncDossierFromDisk(): void {
  const b = bridge();
  if (!b?.dossierRead) return;
  b.dossierRead().then((r) => {
    if (r?.content && r.content.trim()) {
      const disk = parseDossier(r.content);
      const local = loadDossier();
      if (serializeDossier(disk) !== serializeDossier(local)) {
        localStorage.setItem(KEY, JSON.stringify(disk));
        window.dispatchEvent(new Event("jarvis-dossier-changed"));
      }
    } else {
      const local = loadDossier();
      if (local !== DEFAULT_DOSSIER) b.dossierWrite?.(serializeDossier(local));
    }
  }).catch(() => { /* file unavailable; browser copy rules */ });
}

/** The word Jarvis greets and addresses the user with. */
export function titleWord(d: Dossier): string {
  return (d.name || d.title || "boss").trim() || "boss";
}

/** System-prompt block built from the dossier so Jarvis tailors himself to the user. */
export function dossierPrompt(d: Dossier): string {
  const bits: string[] = [];
  const who = d.name ? `${d.name}` : "";
  bits.push(`USER DOSSIER (sir.md, user-provided): The user's preferred form of address is "${d.title || "Sir"}"${who ? ` (their name is ${who})` : ""}. Always address them by that title and never as "sir" if it differs.`);
  if (d.favoriteGames.length) bits.push(`Favourite games: ${d.favoriteGames.join(", ")}. Reference these when recommending games or asking what they're playing.`);
  if (d.music.length) bits.push(`Music taste: ${d.music.join(", ")}. Use this when they ask for music suggestions.`);
  if (d.codingStack.length) bits.push(`Coding stack: ${d.codingStack.join(", ")}. Tailor technical help to this stack.`);
  if (d.notes) bits.push(`Standing notes from the user: ${d.notes}`);
  return bits.join(" ");
}
