import { describe, expect, it } from "vitest";
import { isClipCommand, isScreenCommand } from "./screen";
import { parseWake } from "./jarvis";

describe("screen commands", () => {
  it("recognises clip that", () => expect(isClipCommand("clip that")).toBe(true));
  it("recognises look at my screen", () => expect(isScreenCommand("can you look at my screen")).toBe(true));
  it("ignores normal chat", () => expect(isScreenCommand("what's the weather")).toBe(false));
});

describe("wake word", () => {
  it("accepts a misheard name", () => expect(parseWake("Hey Jervis, open Spotify")).toBe("open Spotify"));
  it("still ignores other speech", () => expect(parseWake("what time is it")).toBeNull());
});
