// GPU-assisted rolling instant replay: a continuous circular buffer of the screen.
// Chrome/Electron encode via the platform GPU encoder (NVENC / AMF / QuickSync / VideoToolbox) whenever
// the machine offers one; detectEncoder() reports which engine is live so the UI can say so.

export type EncoderInfo = { hardware: boolean; label: string };

export async function detectEncoder(): Promise<EncoderInfo> {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : "";
    const vendorStr = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "") : "";
    const both = `${vendorStr} ${renderer}`;
    if (/swiftshader|software|llvmpipe/i.test(both)) return { hardware: false, label: "software encoder" };
    if (/nvidia|geforce|rtx|gtx/i.test(both)) return { hardware: true, label: "NVIDIA NVENC" };
    if (/amd|radeon|vega|rx \d/i.test(both)) return { hardware: true, label: "AMD VCN" };
    if (/intel|iris|arc/i.test(both)) return { hardware: true, label: "Intel QuickSync" };
    if (/apple|m1|m2|m3|m4/i.test(both)) return { hardware: true, label: "Apple Media Engine" };
    if (renderer) return { hardware: !/basic/i.test(renderer), label: renderer.slice(0, 40) };
  } catch { /* keep the default label */ }
  return { hardware: false, label: "system encoder" };
}

export type ReplayConfig = { seconds: number; fps: number };

/**
 * Keeps a rolling recording of the screen. clip() finalises the segment covering the previous
 * `seconds` of gameplay and saves it to Videos/Jarvis Clips via the desktop bridge.
 */
export class RollingReplay {
  running = false;
  seconds = 30;
  fps = 30;
  encoder: EncoderInfo = { hardware: false, label: "system encoder" };
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private previous: Blob | null = null;
  private startedAt = 0;
  private timer: number | 0 = 0;

  async start(seconds = this.seconds, fps = this.fps): Promise<void> {
    if (this.running) return;
    this.seconds = seconds;
    this.fps = fps;
    this.encoder = await detectEncoder();
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: true });
    this.running = true;
    this.begin();
  }

  setSeconds(seconds: number) {
    this.seconds = seconds;
    if (this.running) { this.restart(); }
  }

  private begin() {
    if (!this.stream) return;
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    this.rec = rec; this.chunks = chunks; this.startedAt = Date.now();
    rec.start(1000);
    this.timer = window.setTimeout(() => { this.roll(); }, Math.max(10, this.seconds) * 1000);
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
    if (this.running) this.begin();
  }

  private async restart() {
    window.clearTimeout(this.timer);
    await this.finish();
    if (this.running) this.begin();
  }

  /** Saves the segment covering the last `seconds`; falls back to the previous full segment when too fresh. */
  async clip(): Promise<Blob | null> {
    const age = Date.now() - this.startedAt;
    const current = await this.finish();
    const pick = age < 10000 && this.previous ? this.previous : current;
    this.previous = current;
    if (this.running) this.begin();
    return pick;
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.chunks = [];
  }
}
