import { beforeEach, describe, expect, it } from "vitest";
import { loadDossier, parseDossier, saveDossier, serializeDossier, titleWord, dossierPrompt } from "./dossier";

beforeEach(() => { localStorage.clear(); });

describe("dossier parsing", () => {
  it("reads the sir.md sample fields", () => {
    const d = parseDossier("# sir.md\nname: Morgan\ntitle: Boss\nfavorite_games: [Minecraft, GTA, Cyberpunk]\ncoding_stack: [TypeScript, Python]\nmusic: [lo-fi, AC/DC, synthwave]\nnotes: Remind me to stretch every hour");
    expect(d.name).toBe("Morgan");
    expect(d.title).toBe("Boss");
    expect(d.favoriteGames).toEqual(["Minecraft", "GTA", "Cyberpunk"]);
    expect(d.codingStack).toEqual(["TypeScript", "Python"]);
    expect(d.music).toEqual(["lo-fi", "AC/DC", "synthwave"]);
    expect(d.notes).toBe("Remind me to stretch every hour");
  });
  it("round-trips through serialize", () => {
    const d = parseDossier(serializeDossier({ ...parseDossier(""), name: "Alex", title: "Mr. Stark", favoriteGames: ["Elite Dangerous"] }));
    expect(d.name).toBe("Alex");
    expect(d.title).toBe("Mr. Stark");
    expect(d.favoriteGames).toEqual(["Elite Dangerous"]);
  });
  it("falls back to Sir when blank", () => {
    expect(parseDossier("name: ").title).toBe("Sir");
  });
});

describe("dossier storage", () => {
  it("saves and loads", () => {
    saveDossier({ ...loadDossier(), name: "Morgan", title: "Boss", favoriteGames: ["GTA"] });
    const d = loadDossier();
    expect(d.name).toBe("Morgan");
    expect(d.title).toBe("Boss");
    expect(d.favoriteGames).toEqual(["GTA"]);
  });
  it("builds the addressing word and prompt", () => {
    expect(titleWord({ ...loadDossier(), title: "Sir" })).toBe("Sir");
    expect(titleWord({ ...loadDossier(), name: "Morgan", title: "Sir" })).toBe("Morgan");
    const p = dossierPrompt({ ...loadDossier(), title: "Boss", favoriteGames: ["Cyberpunk"], codingStack: ["Rust"] });
    expect(p).toMatch(/"Boss"/);
    expect(p).toMatch(/Cyberpunk/);
    expect(p).toMatch(/Rust/);
  });
});
