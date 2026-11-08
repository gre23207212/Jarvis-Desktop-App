import { describe, expect, it, beforeEach } from "vitest";
import { CHANGELOG, consumeVersionChange, selfQuery, updatedLine, versionLine, whatsNewLine, capabilitiesLine, selfPrompt } from "./changelog";
import { VERSION } from "./jarvis";

describe("Jarvis self-knowledge", () => {
  beforeEach(() => localStorage.clear());
  it("recognises version, what's new, skills and update questions", () => {
    expect(selfQuery("What version you on?")).toBe("version");
    expect(selfQuery("which version are you running")).toBe("version");
    expect(selfQuery("what's new in this update")).toBe("whats-new");
    expect(selfQuery("what can you do")).toBe("capabilities");
    expect(selfQuery("any updates?")).toBe("updates");
    expect(selfQuery("check for updates")).toBe("updates");
    expect(selfQuery("are there any updates for you?")).toBe("updates");
    expect(selfQuery("what's new in this version")).toBe("whats-new");
    expect(selfQuery("what's new in tech today?")).toBeNull();
    expect(selfQuery("any updates on the football?")).toBeNull();
    expect(selfQuery("open spotify")).toBeNull();
  });
  it("keeps the changelog in step with the app version", () => {
    expect(CHANGELOG[0]?.version).toBe(VERSION);
  });
  it("answers with the exact version", () => {
    expect(versionLine("1.5.0", "1.5.0")).toBe("I'm running Jarvis version 1.5.0, sir.");
    expect(versionLine("1.4.0", "1.5.0")).toMatch(/shell is version 1.4.0/);
  });
  it("describes what's new and what an update added", () => {
    expect(whatsNewLine("1.5.0")).toMatch(/^Version 1.5.0 brought/);
    expect(updatedLine("1.4.0", "1.5.0")).toMatch(/updated from version 1.4.0 to 1.5.0.*I can now/);
    expect(capabilitiesLine()).toMatch(/Spotify/);
    expect(selfPrompt("1.5.0", "1.5.0")).toMatch(/version 1.5.0/);
  });
  it("announces an update once, and stays quiet on a fresh install", () => {
    expect(consumeVersionChange("1.5.0")).toBeNull();
    expect(consumeVersionChange("1.5.0")).toBeNull();
    localStorage.setItem("jarvis-last-version", "1.4.0");
    expect(consumeVersionChange("1.5.0")).toBe("1.4.0");
    expect(consumeVersionChange("1.5.0")).toBeNull();
  });
});
