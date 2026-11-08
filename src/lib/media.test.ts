import { describe, expect, it } from "vitest";
import { cleanNowPlaying, mediaReply, parseMediaCommand } from "./media";

describe("parseMediaCommand", () => {
  it("pauses, resumes and toggles", () => {
    expect(parseMediaCommand("pause")).toBe("playpause");
    expect(parseMediaCommand("pause the music")).toBe("playpause");
    expect(parseMediaCommand("resume")).toBe("playpause");
    expect(parseMediaCommand("play some music")).toBe("playpause");
  });
  it("skips and rewinds", () => {
    expect(parseMediaCommand("skip")).toBe("next");
    expect(parseMediaCommand("next track")).toBe("next");
    expect(parseMediaCommand("previous")).toBe("previous");
    expect(parseMediaCommand("go back a song")).toBeNull();
    expect(parseMediaCommand("previous song")).toBe("previous");
  });
  it("handles volume and what's playing", () => {
    expect(parseMediaCommand("volume up")).toBe("volumeup");
    expect(parseMediaCommand("turn the volume down")).toBe("volumedown");
    expect(parseMediaCommand("mute the volume")).toBe("volumemute");
    expect(parseMediaCommand("Jarvis, what's playing?")).toBe("whatsplaying");
    expect(parseMediaCommand("what's the weather")).toBeNull();
  });
  it("keeps named songs on the Spotify path", () => {
    expect(parseMediaCommand("play Blinding Lights")).toBeNull();
  });
});

describe("now playing lines", () => {
  it("speaks the track", () => {
    expect(mediaReply("whatsplaying", { player: "Spotify", title: "Back In Black" })).toMatch(/Back In Black/);
    expect(mediaReply("whatsplaying", null)).toMatch(/Nothing seems to be playing/);
  });
  it("cleans player window titles", () => {
    expect(cleanNowPlaying("Winamp", "1. AC/DC - Hells Bells - Winamp")).toEqual({ player: "Winamp", title: "AC/DC - Hells Bells" });
    expect(cleanNowPlaying("chrome", "Daft Punk - Voyager - YouTube")).toEqual({ player: "chrome", title: "Daft Punk - Voyager" });
  });
});
