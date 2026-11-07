import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Pencil } from "lucide-react";
import reactor from "@/assets/jarvis-reactor.png.asset.json";
import logo from "@/assets/jarvis-logo.png.asset.json";
import { bridge, loadSettings, parseWake, saveSettings, SIZES, SYSTEM_PROMPT, type Settings } from "@/lib/jarvis";

export const Route = createFileRoute("/mate")({
  head: () => ({
    meta: [
      { title: "Jarvis Desktop Mate" },
      { name: "description", content: "Jarvis, a little AI companion that lives on your desktop." },
      { property: "og:title", content: "Jarvis Desktop Mate" },
      { property: "og:description", content: "Jarvis, a little AI companion that lives on your desktop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Mate,
});

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "idle" | "listening" | "thinking" | "speaking";

function Mate() {
  const [mode, setMode] = useState<Mode>("idle");
  const [you, setYou] = useState("");
  const [reply, setReply] = useState("");
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [hover, setHover] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const history = useRef<Msg[]>([]);
  const modeRef = useRef<Mode>("idle");
  const want = useRef<"wake" | "command" | "none">("none");
  const settingsRef = useRef<Settings | null>(null);
  const hideTimer = useRef<number>(0);
  const hoverTimer = useRef<number>(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  modeRef.current = mode;
  settingsRef.current = settings;

  const setM = (m: Mode) => { modeRef.current = m; setMode(m); };

  // ---------- setup ----------
  useEffect(() => {
    for (const el of [document.documentElement, document.body]) { el.style.background = "transparent"; el.style.overflow = "hidden"; }
    const s = loadSettings();
    setSettings(s);
    want.current = s.wakeWord ? "wake" : "none";
    const onStorage = () => { const n = loadSettings(); setSettings(n); if (want.current !== "command") want.current = n.wakeWord ? "wake" : "none"; };
    window.addEventListener("storage", onStorage);
    const b = bridge();
    // Click-through: only Jarvis himself and his panels catch the mouse.
    let ignoring = true;
    const onMove = (e: MouseEvent) => {
      if (drag.current) return;
      const hit = !!(e.target as HTMLElement)?.closest?.("[data-hit]");
      if (hit === ignoring) { ignoring = !hit; b?.setIgnore(ignoring); }
    };
    window.addEventListener("mousemove", onMove);
    const off = b?.onCmd((name, arg) => {
      if (name === "settings-changed") onStorage();
      if (name === "size") setSettings(saveSettings({ size: arg as Settings["size"] }));
      if (name === "wake") { const n = saveSettings({ wakeWord: !loadSettings().wakeWord }); setSettings(n); want.current = n.wakeWord ? "wake" : "none"; flash(n.wakeWord ? "Listening for my name, sir." : "Wake word off, sir."); }
      if (name === "talk") listenNow();
      if (name === "type") { setTyping(true); b?.setIgnore(false); }
    });
    startMic();
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("mousemove", onMove); off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (t: string) => {
    setYou(""); setReply(t);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (modeRef.current === "idle") setReply(""); }, 7000);
  };

  // ---------- voice out ----------
  const speak = (text: string) => {
    const s = settingsRef.current;
    if (!s?.voiceOn || !("speechSynthesis" in window)) { setM("idle"); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices();
    u.voice = v.find((x) => x.name === s.voiceName) || v.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|thomas|male/i.test(x.name)) || v.find((x) => /en-GB/i.test(x.lang)) || null;
    u.pitch = 0.9;
    u.onstart = () => setM("speaking");
    u.onend = u.onerror = () => { setM("idle"); hideTimer.current = window.setTimeout(() => { if (modeRef.current === "idle") { setReply(""); setYou(""); } }, 8000); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  // ---------- brain ----------
  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    window.clearTimeout(hideTimer.current);
    setInput(""); setTyping(false); setYou(t); setReply("");
    history.current = [...history.current, { role: "user" as const, content: t }].slice(-20);
    setM("thinking");
    const s = settingsRef.current ?? loadSettings();
    let full = "";
    try {
      if (s.brain === "local" || s.brain === "custom") {
        const b = bridge();
        const req = s.brain === "local"
          ? { url: s.localUrl, model: s.localModel }
          : { url: s.customUrl, key: s.customKey, model: s.customModel };
        const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history.current];
        if (b) {
          const r = await b.chat({ ...req, messages });
          if (r.error) throw new Error(r.error);
          full = r.text ?? "";
        } else {
          const r = await fetch(req.url.replace(/\/$/, "") + "/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...("key" in req && req.key ? { Authorization: `Bearer ${req.key}` } : {}) },
            body: JSON.stringify({ model: req.model, messages }),
          });
          if (!r.ok) throw new Error("That brain didn't answer, sir.");
          full = (await r.json()).choices?.[0]?.message?.content ?? "";
        }
        setReply(full);
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.current, provider: s.brain }),
        });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "Systems malfunction, sir.");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const l of lines) {
            if (!l.startsWith("data:")) continue;
            const d = l.slice(5).trim();
            if (!d || d === "[DONE]") continue;
            try { const c = JSON.parse(d).choices?.[0]?.delta?.content; if (c) { full += c; setReply(full); } } catch { /* partial */ }
          }
        }
      }
      history.current.push({ role: "assistant", content: full });
      speak(full);
    } catch (e) {
      setReply(e instanceof Error ? e.message : "Systems malfunction, sir.");
      setM("idle");
    }
  };

  // ---------- voice in: one mic loop for both "Hey Jarvis" and click-to-talk ----------
  const micReady = useRef(false);
  const startMic = async () => {
    if (micReady.current) return;
    try {
      const s = loadSettings();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: s.micId ? { deviceId: { exact: s.micId } } : true });
      micReady.current = true;
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      let rec: MediaRecorder | null = null;
      let chunks: Blob[] = [];
      let loud = 0, quiet = 0, started = 0;
      const tick = () => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) * (v - 128);
        const rms = Math.sqrt(sum / data.length);
        const busy = modeRef.current === "speaking" || modeRef.current === "thinking";
        const active = want.current !== "none" && !busy;
        if (!rec && active) {
          loud = rms > 9 ? loud + 1 : 0;
          if (loud > 3) {
            chunks = [];
            rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
            rec.ondataavailable = (e) => chunks.push(e.data);
            const r = rec;
            r.onstop = () => { const blob = new Blob(chunks, { type: "audio/webm" }); if (blob.size > 3000) handleClip(blob); };
            rec.start();
            started = performance.now(); quiet = 0;
          }
        } else if (rec) {
          quiet = rms < 6 ? quiet + 1 : 0;
          if (quiet > 50 || performance.now() - started > 9000 || busy) { rec.stop(); rec = null; loud = 0; }
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      flash("I can't reach your microphone, sir. You can still type to me.");
    }
  };

  const handleClip = async (blob: Blob) => {
    const wasCommand = want.current === "command";
    const fd = new FormData();
    fd.append("audio", blob, "clip.webm");
    const r = await fetch("/api/transcribe", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Hearing offline, sir." }));
    const text: string = (r.text ?? "").trim();
    if (r.error && wasCommand) { flash(r.error); endListen(); return; }
    if (wasCommand) {
      endListen();
      const stripped = parseWake(text);
      if (text) send(stripped ?? text);
      return;
    }
    const rest = parseWake(text);
    if (rest === null) return;
    if (rest.length > 2) send(rest);
    else listenNow("Yes, sir?");
  };

  const listenTimer = useRef<number>(0);
  const listenNow = (prompt = "Listening, sir…") => {
    speechSynthesis.cancel();
    startMic();
    want.current = "command";
    setM("listening");
    setYou(""); setReply(prompt);
    window.clearTimeout(listenTimer.current);
    listenTimer.current = window.setTimeout(() => { if (want.current === "command" && modeRef.current === "listening") { endListen(); setReply(""); } }, 12000);
  };
  const endListen = () => {
    window.clearTimeout(listenTimer.current);
    want.current = settingsRef.current?.wakeWord ? "wake" : "none";
    if (modeRef.current === "listening") setM("idle");
  };

  const onLogoClick = () => {
    if (mode === "speaking") { speechSynthesis.cancel(); setM("idle"); return; }
    if (mode === "listening") { endListen(); setReply(""); return; }
    if (mode === "idle") listenNow();
  };

  // ---------- drag ----------
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.screenX, y: e.screenY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.x, dy = e.screenY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    d.x = e.screenX; d.y = e.screenY;
    const b = bridge();
    if (b) b.moveBy(dx, dy);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onLogoClick();
  };

  const enter = () => { window.clearTimeout(hoverTimer.current); setHover(true); };
  const leave = () => { hoverTimer.current = window.setTimeout(() => setHover(false), 600); };

  const scale = SIZES[settings?.size ?? "medium"];
  const busy = mode === "thinking" || mode === "speaking";
  const showPanel = typing || !!reply || !!you;

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none" style={{ background: "transparent" }}>
      <div className="absolute bottom-2 left-1/2 flex w-[340px] flex-col items-center gap-2" style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: "bottom center" }}>
        {showPanel && (
          <div data-hit className="jarvis-term w-full px-4 py-3 font-mono text-[13px] leading-relaxed">
            {typing ? (
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-1">
                <span className="text-term-dim">&gt; you:</span>
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setTyping(false); }}
                  onBlur={() => { if (!input) setTyping(false); }}
                  className="flex-1 bg-transparent font-bold text-term-text caret-primary outline-none"
                />
              </form>
            ) : (
              <>
                {you && <div className="text-term-dim">&gt; you: <span className="text-term-text">{you}</span></div>}
                <div>
                  <span className="font-bold text-primary">JARVIS:</span>{" "}
                  <span className="text-term-reply">{mode === "thinking" && !reply ? "processing" : reply}</span>
                  {(mode === "thinking" || mode === "listening") && <span className="term-caret" />}
                </div>
              </>
            )}
          </div>
        )}

        <div data-hit onMouseEnter={enter} onMouseLeave={leave} className="flex flex-col items-center gap-2">
          <button
            onPointerDown={onDown}
            onPointerMove={onDragMove}
            onPointerUp={onUp}
            aria-label="Jarvis — click to talk, drag to move"
            className="jarvis-orb relative h-32 w-32 shrink-0 cursor-grab touch-none active:cursor-grabbing"
          >
            <img src={reactor.url} alt="" draggable={false}
              className={`pointer-events-none absolute inset-0 h-full w-full ${busy ? "animate-spin-fast" : "animate-spin-slow"} ${mode === "listening" ? "animate-core-fast" : ""}`} />
            <img src={logo.url} alt="" draggable={false}
              className={`pointer-events-none absolute inset-[30%] h-[40%] w-[40%] ${mode === "speaking" ? "animate-core-fast" : "animate-core"}`} />
          </button>

          <div className={`jarvis-pill flex items-center gap-1 px-2 py-1 transition-all duration-200 ${hover || typing ? "opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}>
            <button aria-label="Type to Jarvis" onClick={() => { setTyping(true); setReply(""); setYou(""); }} className="rounded-full p-2 text-term-text hover:text-primary">
              <Pencil size={15} />
            </button>
            <span className="h-4 w-px bg-border" />
            <button aria-label="Talk to Jarvis" onClick={() => (mode === "listening" ? (endListen(), setReply("")) : listenNow())}
              className={`rounded-full p-2 hover:text-primary ${mode === "listening" ? "text-primary" : "text-term-text"}`}>
              <AudioLines size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
