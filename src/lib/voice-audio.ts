import type { Settings } from "./jarvis";

/** Generate once so call playback and local monitoring use identical speech. */
export async function selectedVoiceAudio(
  text: string,
  settings: Pick<Settings, "voiceEngine" | "elevenKey" | "elevenVoice" | "elevenModel">,
  eleven: (text: string, key: string, voice: string, model: string) => Promise<Blob>,
  system: () => Promise<Blob | null>,
): Promise<Blob | null> {
  if (settings.voiceEngine === "eleven" && settings.elevenKey && settings.elevenVoice) {
    try { return await eleven(text, settings.elevenKey, settings.elevenVoice, settings.elevenModel); }
    catch { /* Account unavailable: use the configured system voice. */ }
  }
  return system();
}

export function findAudioOutput(devices: MediaDeviceInfo[], name: string): MediaDeviceInfo | undefined {
  const outputs = devices.filter((device) => device.kind === "audiooutput" && !["default", "communications"].includes(device.deviceId));
  const clean = (label: string) => label.replace(/^(Default|Communications) - /i, "").trim().toLowerCase();
  return outputs.find((device) => clean(device.label) === clean(name));
}