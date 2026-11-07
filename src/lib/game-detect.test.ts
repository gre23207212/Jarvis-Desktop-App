import { describe, expect, it } from "vitest";
import { findGame } from "./game-detect";

const apps = ["Discord", "Steam", "VALORANT", "Rocket League", "Minecraft Launcher", "Google Chrome"];

describe("friend game detection", () => {
  it("finds a game a friend names that is installed", () => {
    expect(findGame("we're hopping on Valorant tonight", apps)).toBe("VALORANT");
    expect(findGame("probably rocket league", apps)).toBe("Rocket League");
    expect(findGame("let's do minecraft", apps)).toBe("Minecraft Launcher");
  });
  it("does not boot a game the user does not own", () => {
    expect(findGame("we're playing Fortnite", apps)).toBeNull();
  });
  it("never treats chat or browser apps as the game", () => {
    expect(findGame("I'm on discord and chrome", apps)).toBeNull();
  });
});
