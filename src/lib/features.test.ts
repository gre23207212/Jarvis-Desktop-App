import { describe, expect, it } from "vitest";
import { isNewerVersion, updateMessage } from "./update";
import { BANTER, nextBanter, spawnDecoys, stepDecoys } from "./legion";

describe("isNewerVersion", () => {
  it("detects newer releases", () => {
    expect(isNewerVersion("1.5.0", "1.4.0")).toBe(true);
    expect(isNewerVersion("v2.0.1", "2.0.0")).toBe(true);
    expect(isNewerVersion("1.4.0", "1.4.0")).toBe(false);
    expect(isNewerVersion("1.3.9", "1.4.0")).toBe(false);
  });
});

describe("legion decoys", () => {
  it("spawns three decoys inside the screen", () => {
    const d = spawnDecoys(3, 1920, 1080, () => 0.5);
    expect(d).toHaveLength(3);
    for (const decoy of d) {
      expect(decoy.x).toBeGreaterThanOrEqual(0);
      expect(decoy.x).toBeLessThan(1920);
      expect(decoy.y).toBeGreaterThanOrEqual(0);
      expect(decoy.line).toBeTruthy();
    }
  });
  it("bounces decoys off the edges", () => {
    const spawned = spawnDecoys(1, 100, 100, () => 0);
    const edge = spawned[0];
    expect(edge).toBeDefined();
    if (!edge) return;
    edge.x = 99; edge.vx = 200; edge.y = 50;
    const moved = stepDecoys([edge], 100, 100, 0.1);
    expect(moved[0]?.x).toBeLessThanOrEqual(100 - 72);
    expect(moved[0]?.vx).toBeLessThan(0);
  });
  it("banters without repeating immediately", () => {
    expect(BANTER.length).toBeGreaterThan(3);
    expect(nextBanter(BANTER[0] ?? "")).not.toBe(BANTER[0] ?? "");
  });
  it("announces updates in Jarvis's voice", () => {
    expect(updateMessage({ tag: "v1.5.0", url: "" }, "Sir")).toMatch(/firmware patch is available/);
    expect(updateMessage({ tag: "v1.5.0", url: "", download: "https://x/a.zip" }, "Sir")).toMatch(/install it myself/);
  });
});

import { isSnoozed, snoozeUpdate, tonight } from "./update";
describe("update snooze", () => {
  it("snoozes until 8pm, or 3 hours when it's already evening", () => {
    const am = new Date(2026, 5, 1, 10, 0);
    expect(new Date(tonight(am)).getHours()).toBe(20);
    const pm = new Date(2026, 5, 1, 21, 0);
    expect(tonight(pm) - pm.getTime()).toBe(3 * 3600_000);
  });
  it("hides only the snoozed version until the time passes", () => {
    const until = snoozeUpdate("v1.6.0", new Date(2026, 5, 1, 10, 0));
    expect(isSnoozed("v1.6.0", until - 1)).toBe(true);
    expect(isSnoozed("v1.6.0", until + 1)).toBe(false);
    expect(isSnoozed("v1.7.0", until - 1)).toBe(false);
  });
});
