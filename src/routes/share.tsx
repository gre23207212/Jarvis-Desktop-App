import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Monitor, MonitorUp, Square, CirclePlay } from "lucide-react";
import { bridge, loadSettings, saveSettings } from "@/lib/jarvis";
import { detectEncoder, type EncoderInfo } from "@/lib/replay";

export const Route = createFileRoute("/share")({
  head: () => ({
    meta: [
      { title: "Jarvis Live Share" },
      { name: "description", content: "Discord-style live screen sharing through Jarvis." },
    ],
  }),
  component: ShareView,
});

type ShareSource = { id: string; name: string; kind: "screen" | "window" };
type Stats = { width: number; height: number; fps: number; label: string };

function ShareView() {
  const [sources, setSources] = useState<ShareSource[]>([]);
  const [sourceId, setSourceId] = useState("auto");
  const [height, setHeight] = useState(() => loadSettings().shareHeight);
  const [fps, setFps] = useState(() => loadSettings().shareFps);
  const [audio, setAudio] = useState(true);
  const [live, setLive] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frames = useRef({ last: 0, count: 0, fps: 0 });

  useEffect(() => {
    document.documentElement.style.background = "#04080d";
    document.body.style.background = "#04080d";
    const b = bridge();
    if (b?.shareSources) {
      b.shareSources().then((r) => {
        if (Array.isArray(r)) setSources(r);
      }).catch(() => {});
    }
    const off = b?.onCmd((name) => { if (name === "share-close") stop(); });
    return () => { off?.(); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
    setStats(null);
  };

  const pick = async (): Promise<MediaStream | null> => {
    const b = bridge();
    const constraints = (srcId: string): MediaStreamConstraints | null => {
      if (!srcId.startsWith("auto") && !/^(screen|window):/.test(srcId)) return null;
      if (srcId !== "auto") {
        return {
          audio: false,
          video: {
            // @ts-expect-error Electron/Chrome desktop capture constraints
            mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: srcId, maxWidth: 1920, maxHeight: height, maxFrameRate: fps },
          },
        };
      }
      return null;
    };
    const fixed = constraints(sourceId);
    if (fixed) return navigator.mediaDevices.getUserMedia(fixed);
    // "auto": the desktop app silently picks the primary monitor with system (loopback) audio.
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: fps, height: { ideal: height } },
      audio: audio && !!b?.desktop,
    });
  };

  const start = async () => {
    setError("");
    stop();
    let encoder: EncoderInfo = { hardware: false, label: "system encoder" };
    try {
      const gpu = await bridge()?.gpuInfo?.();
      if (gpu?.videoEncode && /hardware|enabled/i.test(gpu.videoEncode)) encoder = { hardware: true, label: gpu.vendor ? `hardware · ${gpu.vendor}` : "hardware GPU encoder" };
    } catch { /* ignore */ }
    if (!encoder.hardware) encoder = await detectEncoder().catch(() => encoder);
    try {
      const stream = await pick();
      if (!stream) return;
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      const track = stream.getVideoTracks()[0];
      const s = track?.getSettings?.() || {};
      frames.current = { last: performance.now(), count: 0, fps: 0 };
      const tick = () => {
        if (!streamRef.current) return;
        frames.current.count += 1;
        const now = performance.now();
        if (now - frames.current.last >= 1000) {
          frames.current.fps = Math.round((frames.current.count * 1000) / (now - frames.current.last));
          frames.current = { last: now, count: 0, fps: frames.current.fps };
          setStats({ width: s.width || videoRef.current?.videoWidth || 0, height: s.height || videoRef.current?.videoHeight || 0, fps: frames.current.fps, label: encoder.label });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      track?.addEventListener("ended", stop);
      setLive(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setLive(false);
    }
  };

  const set = (p: { shareHeight?: number; shareFps?: number }) => { try { saveSettings(p); } catch { /* web */ } };

  return (
    <div className="flex h-screen w-screen flex-col gap-3 bg-[#04080d] p-4 text-term-text">
      <header className="flex items-center gap-3">
        <MonitorUp size={18} className="text-primary" />
        <h1 className="font-hud text-sm font-bold tracking-[0.2em] text-primary">LIVE SHARE</h1>
        <span data-testid="share-status" className={`ml-auto rounded-full border px-2 py-0.5 font-hud text-[10px] tracking-widest ${live ? "border-primary text-primary" : "border-primary/30 text-term-dim"}`}>{live ? "● STREAMING" : "○ IDLE"}</span>
      </header>

      <div className="relative flex-1 overflow-hidden rounded border border-primary/40 bg-black/60">
        <video ref={videoRef} data-testid="share-preview" muted playsInline className="h-full w-full object-contain" />
        {!live && <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-term-dim">Pick a source and press start — Jarvis streams your screen or a single window.</div>}
        {stats && (
          <div data-testid="share-stats" className="absolute bottom-2 left-2 flex gap-3 border border-primary/40 bg-term-bg px-2 py-1 font-mono text-[10px] text-term-text">
            <span>{stats.width}×{stats.height}</span>
            <span>{stats.fps} fps</span>
            <span className="text-primary">{stats.label}</span>
          </div>
        )}
      </div>

      {error && <p data-testid="share-error" role="alert" className="font-mono text-[11px] text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 font-hud text-[10px] tracking-wider text-term-text">
          SOURCE
          <select data-testid="share-source-select" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="border border-primary/40 bg-term-bg px-2 py-1 font-mono text-[11px] text-term-text outline-none focus:border-primary">
            <option value="auto">Primary monitor</option>
            <option value="window:active">Active window</option>
            {sources.filter((s) => s.kind === "window").slice(0, 12).map((s) => <option key={s.id} value={s.id}>{s.name.slice(0, 40)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 font-hud text-[10px] tracking-wider text-term-text">
          QUALITY
          <select data-testid="share-height-select" value={height} onChange={(e) => { const v = Number(e.target.value); setHeight(v); set({ shareHeight: v }); }} className="border border-primary/40 bg-term-bg px-2 py-1 font-mono text-[11px] text-term-text outline-none focus:border-primary">
            {[720, 1080, 1440].map((h) => <option key={h} value={h}>{h}p</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 font-hud text-[10px] tracking-wider text-term-text">
          FPS
          <select data-testid="share-fps-select" value={fps} onChange={(e) => { const v = Number(e.target.value); setFps(v); set({ shareFps: v }); }} className="border border-primary/40 bg-term-bg px-2 py-1 font-mono text-[11px] text-term-text outline-none focus:border-primary">
            {[15, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 font-hud text-[10px] tracking-wider text-term-text" title="Loopback audio — desktop app, primary monitor only">
          <input type="checkbox" data-testid="share-audio-toggle" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="accent-primary" />
          SYSTEM AUDIO
        </label>
        <div className="ml-auto flex gap-2">
          {!live ? (
            <button data-testid="share-start-button" onClick={start} className="flex items-center gap-1 border border-primary/60 px-3 py-1.5 font-hud text-[11px] tracking-wider text-primary hover:bg-primary/10"><CirclePlay size={14} /> START</button>
          ) : (
            <button data-testid="share-stop-button" onClick={stop} className="flex items-center gap-1 border border-destructive/60 px-3 py-1.5 font-hud text-[11px] tracking-wider text-destructive hover:bg-destructive/10"><Square size={14} /> STOP</button>
          )}
        </div>
      </div>
      <p className="flex items-center gap-1 font-mono text-[10px] text-term-dim"><Monitor size={11} /> Primary monitor streams with system audio; window sources are video-only. Feed plays in this companion view and can be captured into any call or recorder.</p>
    </div>
  );
}
