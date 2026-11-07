import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { bridge, loadSettings, saveSettings, SYSTEM_PROMPT, VERSION, type Brain, type Settings } from "@/lib/jarvis";

export const Route = createFileRoute("/mainframe")({
  head: () => ({
    meta: [
      { title: "Jarvis Mainframe — Settings" },
      { name: "description", content: "Choose Jarvis's brain, voice and microphone." },
      { property: "og:title", content: "Jarvis Mainframe — Settings" },
      { property: "og:description", content: "Choose Jarvis's brain, voice and microphone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Mainframe,
});

const BRAINS: { id: Brain; label: string; note: string }[] = [
  { id: "chatgpt", label: "CHATGPT", note: "Your saved ChatGPT key" },
  { id: "builtin", label: "BUILT-IN CLOUD", note: "No key needed" },
  { id: "local", label: "LOCAL · GEMMA", note: "Runs on this PC, free" },
  { id: "custom", label: "CUSTOM", note: "Your own API key & model" },
];

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-primary/30 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="border-l-2 border-primary pl-2 font-hud text-sm tracking-widest text-term-text">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const field = "w-full border border-primary/40 bg-term-bg px-2 py-1.5 font-mono text-xs text-term-text outline-none focus:border-primary";
const btn = "border border-primary/50 px-3 py-1.5 font-hud text-[11px] tracking-wider text-primary hover:bg-primary/10";

function Mainframe() {
  const [s, setS] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState("");
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    setS(loadSettings());
    const lv = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    lv();
    speechSynthesis.onvoiceschanged = lv;
    navigator.mediaDevices?.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === "audioinput"))).catch(() => {});
  }, []);

  if (!s) return null;
  const set = (p: Partial<Settings>) => setS(saveSettings(p));
  const b = bridge();

  const test = async () => {
    setStatus("Testing…");
    const req = s.brain === "local" ? { url: s.localUrl, model: s.localModel } : { url: s.customUrl, key: s.customKey, model: s.customModel };
    if (!b) { setStatus("Testing local brains works in the desktop app."); return; }
    const r = await b.chat({ ...req, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Say hello in five words." }] });
    setStatus(r.error ? "✗ " + r.error : "✓ " + r.text);
  };

  const testVoice = () => {
    const u = new SpeechSynthesisUtterance("At your service, sir.");
    u.voice = voices.find((v) => v.name === s.voiceName) || voices.find((v) => /en-GB/.test(v.lang)) || null;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const active = BRAINS.find((x) => x.id === s.brain)!;

  return (
    <div className="h-screen w-screen p-1 select-none">
      <div className="hud-panel flex h-full flex-col overflow-y-auto">
        <header className="flex items-center justify-between px-5 py-4" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <h1 className="font-hud text-xl font-bold tracking-[0.2em] text-primary">MAINFRAME</h1>
          <div className="flex gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <button aria-label="Minimise" onClick={() => b?.cmd("mf-min")} className="p-1.5 text-term-dim hover:text-primary"><Minus size={16} /></button>
            <button aria-label="Close" onClick={() => (b ? b.cmd("mf-close") : window.close())} className="p-1.5 text-term-dim hover:text-destructive"><X size={16} /></button>
          </div>
        </header>

        <Section title="BRAIN">
          <p className="mb-1 font-sans text-lg font-semibold text-term-text">{active.label === "LOCAL · GEMMA" ? `Local · ${s.localModel}` : active.label}</p>
          <p className="mb-3 font-mono text-[11px] italic text-term-dim">Pick one. Only one brain runs at a time.</p>
          <div className="space-y-1.5">
            {BRAINS.map((x) => (
              <button key={x.id} onClick={() => { set({ brain: x.id }); setStatus(""); }} className="flex w-full items-center gap-2 text-left">
                <span className={`text-xs ${s.brain === x.id ? "text-primary" : "text-term-dim"}`}>{s.brain === x.id ? "◆" : "◇"}</span>
                <span className={`font-hud text-xs tracking-wider ${s.brain === x.id ? "text-primary" : "text-term-text"}`}>{x.label}</span>
                <span className="font-mono text-[11px] text-term-dim">{x.note}</span>
              </button>
            ))}
          </div>

          {s.brain === "local" && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className={field} value={s.localModel} onChange={(e) => set({ localModel: e.target.value })} placeholder="gemma4:e4b" aria-label="Local model" />
                <input className={field} value={s.localUrl} onChange={(e) => set({ localUrl: e.target.value })} aria-label="Local address" />
              </div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => setSetup(!setup)}>SET UP</button>
                <button className={btn} onClick={test}>TEST</button>
              </div>
              {setup && (
                <ol className="list-decimal space-y-1 pl-5 font-mono text-[11px] text-term-dim">
                  <li>Install Ollama from <span className="text-primary">ollama.com</span></li>
                  <li>Open a terminal and run <span className="text-term-text">ollama pull {s.localModel}</span></li>
                  <li>Press TEST. Jarvis now thinks entirely on your PC.</li>
                </ol>
              )}
            </div>
          )}
          {s.brain === "custom" && (
            <div className="mt-3 space-y-2">
              <input className={field} value={s.customUrl} onChange={(e) => set({ customUrl: e.target.value })} placeholder="https://api.openai.com/v1" aria-label="API address" />
              <div className="grid grid-cols-2 gap-2">
                <input className={field} type="password" value={s.customKey} onChange={(e) => set({ customKey: e.target.value })} placeholder="API key" aria-label="API key" />
                <input className={field} value={s.customModel} onChange={(e) => set({ customModel: e.target.value })} placeholder="Model" aria-label="Model" />
              </div>
              <p className="font-mono text-[10px] text-term-dim">Works with OpenAI, OpenRouter, Groq, LM Studio — anything OpenAI-compatible. Key stays on this PC.</p>
              <button className={btn} onClick={test}>TEST</button>
            </div>
          )}
          {status && <p className="mt-2 break-words font-mono text-[11px] text-term-reply">{status}</p>}
        </Section>

        <Section title="VOICE" right={<span className="font-mono text-[10px] text-term-dim">Say "Hey Jarvis"</span>}>
          <div className="mb-3 space-y-1.5">
            {[[true, "SPEAK", "Jarvis talks back"], [false, "SILENT", "Text only"]].map(([v, l, n]) => (
              <button key={String(v)} onClick={() => set({ voiceOn: v as boolean })} className="flex w-full items-center gap-2 text-left">
                <span className={`text-xs ${s.voiceOn === v ? "text-primary" : "text-term-dim"}`}>{s.voiceOn === v ? "◆" : "◇"}</span>
                <span className={`font-hud text-xs tracking-wider ${s.voiceOn === v ? "text-primary" : "text-term-text"}`}>{l as string}</span>
                <span className="font-mono text-[11px] text-term-dim">{n as string}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select className={field} value={s.voiceName} onChange={(e) => set({ voiceName: e.target.value })} aria-label="Voice">
                <option value="">Voice: best British voice</option>
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
              <button className={btn} onClick={testVoice}>TEST</button>
            </div>
            <select className={field} value={s.micId} onChange={(e) => set({ micId: e.target.value })} aria-label="Microphone">
              <option value="">Mic: Windows default</option>
              {mics.filter((m) => m.deviceId !== "default").map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || "Microphone"}</option>)}
            </select>
            <p className="font-mono text-[10px] text-term-dim">Speaker: Windows default. Mic changes apply after Reboot systems.</p>
            <label className="flex items-center gap-2 font-hud text-xs tracking-wider text-term-text">
              <input type="checkbox" checked={s.wakeWord} onChange={(e) => set({ wakeWord: e.target.checked })} className="accent-primary" />
              LISTEN FOR "HEY JARVIS"
            </label>
          </div>
        </Section>

        <Section title="JARVIS" right={<span className="font-mono text-[10px] text-term-dim">v{VERSION}</span>}>
          <div className="grid grid-cols-3 gap-2">
            <button className={btn} onClick={() => b?.cmd("toggle")}>HIDE / SHOW</button>
            <button className={btn} onClick={() => b?.cmd("move", "center")}>BRING HERE</button>
            <button className={btn} onClick={() => b?.cmd("reload")}>REBOOT</button>
          </div>
          <button className="mt-3 w-full border border-destructive/60 py-2 font-hud text-xs tracking-wider text-destructive hover:bg-destructive/10" onClick={() => b?.cmd("quit")}>SHUT DOWN JARVIS</button>
        </Section>
      </div>
    </div>
  );
}
