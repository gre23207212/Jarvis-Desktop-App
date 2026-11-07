import { beforeEach, describe, expect, it } from "vitest";
import { clearMemory, forget, loadMemory, memoryCommand, memoryContext, remember, saveConversation } from "./memory";

describe("Jarvis persistent memory", () => {
  beforeEach(() => localStorage.clear());
  it("remembers explicit facts across subsequent reads", () => {
    memoryCommand("Remember that my name is Alex");
    expect(loadMemory().facts).toEqual(["my name is Alex"]);
    expect(memoryContext()).toContain("my name is Alex");
  });
  it("retains conversation for the next session", () => {
    saveConversation([{ role: "user", content: "My dog is called Max" }, { role: "assistant", content: "Hello Max" }]);
    expect(loadMemory().history[0]?.content).toBe("My dog is called Max");
  });
  it("can forget one saved fact", () => {
    remember("My name is Alex"); remember("My dog is Max"); forget("My name is Alex");
    expect(loadMemory().facts).toEqual(["My dog is Max"]);
  });
  it("forgets facts and conversation when asked", () => {
    remember("My name is Alex"); saveConversation([{ role: "user", content: "Hello" }]);
    memoryCommand("Forget everything");
    expect(loadMemory()).toEqual({ facts: [], history: [] });
  });
  it("does not save ordinary questions as facts", () => {
    expect(memoryCommand("What is the weather?")).toBeNull();
    expect(loadMemory().facts).toEqual([]);
    clearMemory();
  });
});