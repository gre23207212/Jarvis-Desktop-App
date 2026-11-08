import { expect, it, vi } from "vitest";
import { findAudioOutput, selectedVoiceAudio } from "./voice-audio";

const settings = { voiceEngine: "eleven" as const, elevenKey: "test-key", elevenVoice: "custom-jarvis", elevenModel: "eleven_flash_v2_5" };
it("uses the user's selected ElevenLabs voice and returns the same audio for both destinations", async () => {
  const blob = new Blob(["custom voice"]);
  const eleven = vi.fn(async () => blob);
  const system = vi.fn(async () => new Blob(["system"]));
  expect(await selectedVoiceAudio("I'll be fifteen minutes", settings, eleven, system)).toBe(blob);
  expect(eleven).toHaveBeenCalledWith("I'll be fifteen minutes", "test-key", "custom-jarvis", "eleven_flash_v2_5");
  expect(system).not.toHaveBeenCalled();
});
it("falls back to system audio when the user's ElevenLabs credits run out", async () => {
  const blob = new Blob(["system"]);
  expect(await selectedVoiceAudio("Hello", settings, async () => { throw new Error("quota"); }, async () => blob)).toBe(blob);
});
it("uses system audio without charging ElevenLabs when system is selected", async () => {
  const eleven = vi.fn();
  const blob = new Blob(["system"]);
  expect(await selectedVoiceAudio("Hello", { ...settings, voiceEngine: "system" }, eleven, async () => blob)).toBe(blob);
  expect(eleven).not.toHaveBeenCalled();
});
it("selects the configured physical output rather than the changing Windows default alias", () => {
  const devices = [{ kind: "audiooutput", deviceId: "default", label: "Default - Headphones" }, { kind: "audiooutput", deviceId: "headphones", label: "Headphones" }] as MediaDeviceInfo[];
  expect(findAudioOutput(devices, "Headphones")?.deviceId).toBe("headphones");
});