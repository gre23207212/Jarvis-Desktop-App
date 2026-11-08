/** Mute only after successful call playback, never when playback failed. */
export async function deliverDiscordMessage(
  play: () => Promise<boolean>,
  mute: () => Promise<{ ok?: boolean }> ,
): Promise<"failed" | "muted" | "mute-failed"> {
  if (!(await play())) return "failed";
  try { return (await mute()).ok ? "muted" : "mute-failed"; }
  catch { return "mute-failed"; }
}