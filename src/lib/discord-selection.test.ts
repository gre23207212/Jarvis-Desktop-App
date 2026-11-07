import { describe, expect, it } from "vitest";
import { selectDiscordChannel } from "./discord-selection";

const channels = [
  { name: "The Lounge", link: "https://discord.com/channels/1/2" },
  { name: "Gaming", link: "https://discord.com/channels/1/3" },
];

describe("Discord channel selection", () => {
  it("requires a choice when multiple saved channels exist, even with a default link", () => {
    expect(selectDiscordChannel(channels, "", channels[0]?.link)).toEqual({ kind: "choose", channels });
  });
  it("uses the user's spoken channel name", () => {
    expect(selectDiscordChannel(channels, "I'd like The Lounge, please.")).toEqual({ kind: "selected", channel: channels[0] });
  });
  it("does not join an unknown channel", () => {
    expect(selectDiscordChannel(channels, "Music").kind).toBe("choose");
  });
  it("asks again rather than choosing between ambiguous names", () => {
    expect(selectDiscordChannel([...channels, { name: "Gaming Two", link: "https://discord.com/channels/1/4" }], "join Gaming or The Lounge").kind).toBe("choose");
  });
  it("joins the only saved channel without needing a follow-up", () => {
    expect(selectDiscordChannel([channels[0]].filter((c) => c !== undefined))).toEqual({ kind: "selected", channel: channels[0] });
  });
});