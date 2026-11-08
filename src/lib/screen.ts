/** Screen helpers for "look at my screen" and "clip that". Main monitor is chosen by the desktop app. */

export const isClipCommand = (t: string) => /\b(clip (that|it|this)|save (a )?clip|start clipping|make a clip)\b/i.test(t);
export const isScreenCommand = (t: string) =>
  /\b(look at|see|check|read|what'?s on|what is on|describe|explain)\b[^.?!]*\bmy screen\b|\bshare (my )?screen\b|\bscreen ?shot\b/i.test(t);

/** Grabs one frame of the main screen as a JPEG data URL. */
export async function captureScreen(): Promise<string | null> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 300));
    const scale = Math.min(1, 1600 / (video.videoWidth || 1600));
    const c = document.createElement("canvas");
    c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale);
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } catch { return null; } finally { stream?.getTracks().forEach((t) => t.stop()); }
}

/** Keeps a rolling recording of the main screen; clip() returns roughly the last 30 seconds. */
export class ScreenClipper {
  running = false;
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private previous: Blob | null = null;
  private startedAt = 0;
  private timer = 0;

  async start() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    this.running = true;
    this.begin();
  }

  private begin() {
    if (!this.stream) return;
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    this.rec = rec; this.chunks = chunks; this.startedAt = Date.now();
    rec.start(1000);
    // Restart every 30s so a finished, playable segment is always on hand.
    this.timer = window.setTimeout(() => this.roll(), 30000);
  }

  private async finish(): Promise<Blob | null> {
    window.clearTimeout(this.timer);
    const rec = this.rec;
    if (!rec) return null;
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    if (rec.state !== "inactive") rec.stop();
    await done;
    return this.chunks.length ? new Blob(this.chunks, { type: "video/webm" }) : null;
  }

  private async roll() {
    const blob = await this.finish();
    if (blob) this.previous = blob;
    this.begin();
  }

  /** Saves the current segment, or the last full one if the current one is too short. */
  async clip(): Promise<Blob | null> {
    const age = Date.now() - this.startedAt;
    const current = await this.finish();
    const pick = age < 10000 && this.previous ? this.previous : current;
    this.previous = current;
    this.begin();
    return pick;
  }
}

export const blobToBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(b); });
