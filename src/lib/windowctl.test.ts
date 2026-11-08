import { describe, expect, it } from "vitest";
import { parseWindowCommand, windowReply } from "./windowctl";

describe("parseWindowCommand", () => {
  it("minimizes an app", () => {
    expect(parseWindowCommand("Jarvis, minimize Chrome")).toEqual({ action: "minimize", app: "Chrome" });
  });
  it("brings an app to the front", () => {
    expect(parseWindowCommand("bring Discord to the front")).toEqual({ action: "focus", app: "Discord" });
    expect(parseWindowCommand("switch to VS Code")).toEqual({ action: "focus", app: "VS Code" });
  });
  it("closes and shuts down apps", () => {
    expect(parseWindowCommand("close Steam")).toEqual({ action: "close", app: "Steam" });
    expect(parseWindowCommand("shut down Spotify")).toEqual({ action: "close", app: "Spotify" });
    expect(parseWindowCommand("kill discord")).toEqual({ action: "close", app: "discord" });
  });
  it("ignores pronouns and normal chat", () => {
    expect(parseWindowCommand("close it")).toBeNull();
    expect(parseWindowCommand("what's the time")).toBeNull();
  });
  it("reports failure politely", () => {
    expect(windowReply("close", "Steam", false)).toMatch(/couldn't find a window/i);
    expect(windowReply("minimize", "Chrome", true)).toMatch(/Minimising Chrome/i);
  });
});
