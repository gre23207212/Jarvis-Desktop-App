// Bring-your-own ElevenLabs voice. Each user's own key and credits; called straight from their app.
const API = "https://api.elevenlabs.io/v1";

export type ElevenVoice = { id: string; name: string; custom: boolean };

/** Lists the voices on the user's own account (includes voices they cloned/designed). */
export async function listElevenVoices(key: string): Promise<ElevenVoice[]> {
  const r = await fetch(`${API}/voices`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(r.status === 401 ? "That ElevenLabs key was rejected." : `ElevenLabs error ${r.status}`);
  const j = (await r.json()) as { voices?: { voice_id: string; name: string; category?: string }[] };
  return (j.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, custom: v.category !== "premade" }));
}

/** Returns playable MP3 audio, or throws (bad key, out of credits, offline) so callers fall back. */
export async function elevenSpeech(text: string, key: string, voiceId: string, model: string): Promise<Blob> {
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model || "eleven_flash_v2_5" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  return r.blob();
}
