import { describe, expect, it } from "vitest";
import { parseWake } from "./jarvis";

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
