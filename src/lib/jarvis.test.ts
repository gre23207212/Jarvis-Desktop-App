import { describe, expect, it } from "vitest";
import { asksQuestion, parseWake } from "./jarvis";

describe("parseWake", () => {
  it("activates on 'Hey Jarvis' and keeps the request", () => {
    expect(parseWake("Hey Jarvis, what's the time?")).toBe("what's the time?");
  });
  it("activates on 'Hey Jarvis' alone with nothing after", () => {
    expect(parseWake("Hey Jarvis.")).toBe("");
  });
  it("ignores speech without Jarvis", () => {
    expect(parseWake("hey there what's the time")).toBeNull();
  });
  it("ignores normal talk that only mentions Jarvis mid-sentence", () => {
    expect(parseWake("I was telling my mate about Jarvis yesterday")).toBeNull();
  });
});

import { parseAction } from "./jarvis";
describe("parseAction", () => {
  it("plays a song on Spotify", () => {
    expect(parseAction("I want to play Blinding Lights by The Weeknd")).toEqual({ kind: "spotify", query: "Blinding Lights The Weeknd" });
  });
  it("joins Discord and passes on a message", () => {
    expect(parseAction("Join this Discord call and tell them I'll be five minutes")).toEqual({ kind: "discord", message: "I'll be five minutes" });
  });
  it("opens an app", () => {
    expect(parseAction("Can you open Steam")).toEqual({ kind: "open", app: "Steam" });
  });
  it("leaves normal questions to the brain", () => {
    expect(parseAction("what's the weather in Blackburn")).toBeNull();
  });
});

import { extractPlace } from "./jarvis";
describe("extractPlace", () => {
  it("finds the town in 'what's the weather in Blackburn'", () => {
    expect(extractPlace("what's the weather in Blackburn", false)).toBe("Blackburn");
  });
  it("treats a bare town as the place after a weather question", () => {
    expect(extractPlace("Blackburn", true)).toBe("Blackburn");
  });
  it("uses your own location when no place is named", () => {
    expect(extractPlace("what's the weather like", false)).toBeNull();
  });
});

import { parseAction as pa2, SYSTEM_PROMPT as SP2 } from "./jarvis";
describe("discord voice chat + creator", () => {
  it("parses hop in a vc with server and message", () => {
    expect(pa2("hop in a vc on discord on the Gaming server and tell my friends I'll be a few mins")).toEqual({ kind: "discord", server: "Gaming", message: "I'll be a few mins" });
  });
  it("knows Vraith made him", () => { expect(SP2).toMatch(/Vraith/); });
});

describe("discord casual phrasing", () => {
  it("joins voice for 'hop in voice chat and tell my friend that I will be a sec'", async () => {
    const { parseAction } = await import("./jarvis");
    expect(parseAction("Hop in voice chat and tell my friend that I will be a sec")).toEqual({ kind: "discord", message: "I will be a sec", server: undefined });
    expect(parseAction("hop in voice and tell my friend ill be a sec")).toMatchObject({ kind: "discord", message: "ill be a sec" });
  });
});

describe("asksQuestion", () => {
  it("listens after a question", () => {
    expect(asksQuestion("Which game shall I open, sir?")).toBe(true);
    expect(asksQuestion("Would you like me to join the Lounge.")).toBe(true);
  });
  it("does not listen after a statement", () => {
    expect(asksQuestion("Opening Spotify, sir.")).toBe(false);
  });
});

describe("Discord relay wording", () => {
  it("speaks for the boss in third person and confirms in second person", async () => {
    const { relayLines } = await import("./jarvis");
    expect(relayLines("I will be two minutes", "")).toEqual({
      call: "Hey everyone, Jarvis here. My boss says they will be two minutes.",
      done: "Done, sir. I told them you will be two minutes.",
    });
    expect(relayLines("ill be a sec", "").call).toBe("Hey everyone, Jarvis here. My boss says they'll be a sec.");
    expect(relayLines("I'm grabbing my food", "Morgan").call).toBe("Hey everyone, Jarvis here. Morgan says they're grabbing their food.");
    expect(relayLines("to wait for me", "").call).toBe("Hey everyone, Jarvis here. My boss wants you to wait for them.");
  });
});
