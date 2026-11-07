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
