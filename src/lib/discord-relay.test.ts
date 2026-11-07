import { expect, it, vi } from "vitest";
import { deliverDiscordMessage } from "./discord-relay";

it("mutes only after the full message finishes", async () => {
  let finish: ((value: boolean) => void) | undefined;
  const mute = vi.fn(async () => ({ ok: true }));
  const result = deliverDiscordMessage(() => new Promise<boolean>((resolve) => { finish = resolve; }), mute);
  expect(mute).not.toHaveBeenCalled();
  finish?.(true);
  expect(await result).toBe("muted");
  expect(mute).toHaveBeenCalledTimes(1);
});

it("does not mute if the message could not play", async () => {
  const mute = vi.fn(async () => ({ ok: true }));
  expect(await deliverDiscordMessage(async () => false, mute)).toBe("failed");
  expect(mute).not.toHaveBeenCalled();
});

it("reports a mute failure instead of claiming success", async () => {
  expect(await deliverDiscordMessage(async () => true, async () => ({ ok: false }))).toBe("mute-failed");
});