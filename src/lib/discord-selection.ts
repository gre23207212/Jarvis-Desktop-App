import type { DiscordServer } from "./jarvis";

export type DiscordSelection =
  | { kind: "selected"; channel: DiscordServer }
  | { kind: "choose"; channels: DiscordServer[] }
  | { kind: "missing" };

const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Resolve only a unique saved name; never silently choose the first of several channels. */
export function selectDiscordChannel(channels: DiscordServer[], request = "", legacyLink = ""): DiscordSelection {
  const saved = channels.filter((channel) => channel.name.trim() && channel.link.trim());
  const name = normalise(request);
  if (name) {
    const exact = saved.filter((channel) => normalise(channel.name) === name);
    const matches = exact.length ? exact : saved.filter((channel) => {
      const candidate = normalise(channel.name);
      return ` ${name} `.includes(` ${candidate} `) || ` ${candidate} `.includes(` ${name} `);
    });
    if (matches.length === 1 && matches[0]) return { kind: "selected", channel: matches[0] };
    return saved.length ? { kind: "choose", channels: saved } : { kind: "missing" };
  }
  if (saved.length > 1) return { kind: "choose", channels: saved };
  if (saved[0]) return { kind: "selected", channel: saved[0] };
  if (legacyLink.trim()) return { kind: "selected", channel: { name: "Discord", link: legacyLink } };
  return { kind: "missing" };
}