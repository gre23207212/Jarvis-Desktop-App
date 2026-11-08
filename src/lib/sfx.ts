// Tiny WebAudio cues: repulsor hums for sleep/wake and an abort bleep.

function tone(ctx: AudioContext, from: number, to: number, secs: number, type: OscillatorType, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), ctx.currentTime + secs);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + secs);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + secs + 0.05);
}

/** Powering down: a falling hum. Powering up: a rising repulsor whine. */
export function repulsorHum(kind: "sleep" | "wake"): void {
  try {
    const ctx = new AudioContext();
    if (kind === "sleep") tone(ctx, 240, 60, 0.7, "sawtooth", 0.08);
    else { tone(ctx, 70, 340, 0.5, "sawtooth", 0.09); tone(ctx, 140, 680, 0.5, "sine", 0.05); }
    window.setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* audio unavailable */ }
}

export function abortBleep(): void {
  try {
    const ctx = new AudioContext();
    tone(ctx, 660, 220, 0.28, "square", 0.05);
    window.setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch { /* audio unavailable */ }
}
