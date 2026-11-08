import { beforeEach, describe, expect, it } from "vitest";
import { clearMemory } from "./memory";
import { newsTopic, recentStories, saveNewsTopic, startupGreeting, welcomeAnswer } from "./welcome";

describe("startup welcome rules", () => {
  beforeEach(() => localStorage.clear());
  it("uses the current local date and time", () => {
    const now = new Date(2026, 10, 7, 2, 52);
    expect(startupGreeting(now, "")).toContain("Saturday, 7 November 2026");
    expect(startupGreeting(now, "")).toContain("2:52 am");
  });
  it("asks for a topic only after opting in", () => {
    expect(welcomeAnswer("offer", "yes", "")).toEqual({ kind: "topic" });
    expect(welcomeAnswer("offer", "no thanks", "")).toEqual({ kind: "finish" });
  });
  it("remembers one topic on the next launch and permits replacing it", () => {
    saveNewsTopic("science");
    expect(newsTopic()).toBe("science");
    expect(welcomeAnswer("offer", "yes", newsTopic())).toEqual({ kind: "news", topic: "science" });
    saveNewsTopic("technology");
    expect(newsTopic()).toBe("technology");
  });
  it("clearing memory also clears the saved news topic", () => {
    saveNewsTopic("science"); clearMemory(); expect(newsTopic()).toBe("");
  });
  it("does not swallow ordinary commands during the news offer", () => {
    expect(welcomeAnswer("offer", "open Discord", "science")).toEqual({ kind: "other" });
  });
  it("returns only genuinely recent dated public headlines", () => {
    const now = Date.parse("2026-11-07T02:52:00Z");
    expect(recentStories([
      { title: "Recent discovery", link: "https://example.com/news", pubDate: "2026-11-06T12:00:00Z", source: "Science publisher" },
      { title: "Old story", link: "https://example.com/old", pubDate: "2026-10-01T12:00:00Z" },
      { title: "Undated story", link: "https://example.com/unknown" },
    ], now).map((story) => story.title)).toEqual(["Recent discovery"]);
  });
});