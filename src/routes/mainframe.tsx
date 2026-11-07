import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Minus, X, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearMemory, forget, loadMemory, remember, type JarvisMemory } from "@/lib/memory";
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
  { id: "local", label: "LOCAL · GEMMA", note: "Free, runs on this PC" },
  { id: "builtin", label: "BUILT-IN CLOUD", note: "Free, no setup" },
  { id: "chatgpt", label: "CHATGPT", note: "Project's ChatGPT key" },
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
  const [local, setLocal] = useState<{ running: boolean; hasModel: boolean } | null>(null);
  const [dl, setDl] = useState<{ text: string; pct: number | null } | null>(null);
  const [cable, setCable] = useState(false);
  const [apps, setApps] = useState<number | null>(null);
  const [memory, setMemory] = useState<JarvisMemory>({ facts: [], history: [] });
  const [fact, setFact] = useState("");

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    setS(loadSettings());
    const refreshMemory = () => setMemory(loadMemory());
    refreshMemory();
    window.addEventListener("storage", refreshMemory);
    window.addEventListener("jarvis-memory-changed", refreshMemory);
    const lv = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    lv();
    speechSynthesis.onvoiceschanged = lv;
    const s0 = loadSettings();
    bridge()?.localStatus?.(s0.localModel).then(setLocal);
    const off = bridge()?.onCmd((n, a) => { if (n === "setup-progress") setDl(a as { text: string; pct: number | null }); });
    navigator.mediaDevices?.enumerateDevices().then((d) => {
      setMics(d.filter((x) => x.kind === "audioinput"));
      setCable(d.some((x) => x.kind === "audiooutput" && /cable input/i.test(x.label)));
    }).catch(() => {});
    bridge()?.listApps?.().then((a) => setApps(a.length)).catch(() => {});
    return () => { off?.(); window.removeEventListener("storage", refreshMemory); window.removeEventListener("jarvis-memory-changed", refreshMemory); };
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

  const install = async () => {
    if (!b?.localSetup) { setStatus("One-click install works in the desktop app."); return; }
    setStatus("");
    setDl({ text: "Preparing…", pct: null });
    const r = await b.localSetup(s.localModel);
    if (r.error) { setDl(null); setStatus("✗ " + r.error); return; }
    setLocal(await b.localStatus!(s.localModel));
    setDl(null);
    setStatus("✓ Gemma is installed. Jarvis now thinks on your PC.");
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
              <p className="font-mono text-[11px] text-term-dim">
                {local == null ? "Status: open in the desktop app to check." : local.hasModel ? "◆ Installed and ready." : local.running ? "Engine ready, model not downloaded yet." : "Not installed yet."}
              </p>
              {dl ? (
                <div className="space-y-1">
                  <div className="h-2 w-full border border-primary/50">
                    <div className={`h-full bg-primary transition-all ${dl.pct == null ? "w-1/3 animate-pulse" : ""}`} style={dl.pct == null ? undefined : { width: `${Math.round(dl.pct * 100)}%` }} />
                  </div>
                  <p className="font-mono text-[11px] text-term-reply">{dl.text}</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  {!local?.hasModel && <button className={btn} onClick={install}>DOWNLOAD &amp; INSTALL (~10 GB)</button>}
                  <button className={btn} onClick={test}>TEST</button>
                </div>
              )}
              <p className="font-mono text-[10px] text-term-dim">Until Gemma is ready, Jarvis uses the free cloud brain.</p>
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

        <Section title="SKILLS" right={<span className="font-mono text-[10px] text-term-dim">Things Jarvis can do</span>}>
          <ul className="mb-3 space-y-1 font-mono text-[11px] text-term-dim">
            <li><span className="text-primary">◆</span> <span className="text-term-text">"Open Steam"</span> — opens any installed app{apps != null && ` (${apps} found)`}</li>
            <li><span className="text-primary">◆</span> <span className="text-term-text">"Play Blinding Lights by The Weeknd"</span> — types it into Spotify and plays it</li>
            <li><span className="text-primary">◆</span> <span className="text-term-text">"Join Discord and tell them I'll be 5 minutes"</span></li>
          </ul>
          <input className={field} value={s.discordLink} onChange={(e) => set({ discordLink: e.target.value.trim() })} placeholder="Discord voice channel link (right-click channel → Copy Link)" aria-label="Discord call link" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] text-term-dim">
              {cable ? <span className="text-primary">◆ VB-Cable found.</span> : "VB-Cable not found — needed to speak in calls."}
            </p>
            {!cable && <button className={btn} onClick={() => b?.openUrl?.("https://vb-audio.com/Cable/")}>GET VB-CABLE</button>}
          </div>
          <p className="mt-1 font-mono text-[10px] text-term-dim">In Discord, set Voice → Input Device to "CABLE Output" so the call hears Jarvis.</p>
        </Section>

        <Section title="MEMORY" right={<span className="font-mono text-[10px] text-term-dim">{memory.facts.length} saved facts</span>}>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); remember(fact); setFact(""); }}>
            <input className={field} aria-label="New memory" placeholder="A fact to remember…" value={fact} onChange={(e) => setFact(e.target.value)} maxLength={1000} />
            <Button type="submit" variant="outline" size="icon" aria-label="Save memory" title="Save memory" disabled={!fact.trim()}><Plus size={16} /></Button>
          </form>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {memory.facts.map((f) => <li key={f} className="flex items-center justify-between gap-2 border-b border-primary/20 py-1 font-mono text-xs text-term-text">
              <span className="min-w-0 break-words">{f}</span>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => forget(f)} aria-label={`Forget ${f}`} title="Forget memory"><Trash2 size={14} /></Button>
            </li>)}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-term-dim">Stored on this PC · {memory.history.length} recent messages · Sent to your chosen AI when chatting</span>
            <Button variant="outline" size="sm" disabled={!memory.facts.length && !memory.history.length} onClick={() => { if (window.confirm("Clear all saved facts and conversation?")) clearMemory(); }}><Trash2 size={14} /> Clear memory</Button>
          </div>
        </Section>

        <Section title="JARVIS" right={<span className="font-mono text-[10px] text-term-dim">v{VERSION}</span>}>
          <div className="grid grid-cols-3 gap-2">
            <button className={btn} onClick={() => b?.cmd("toggle")}>HIDE / SHOW</button>
            <button className={btn} onClick={() => b?.cmd("move", "center")}>BRING HERE</button>
            <button className={btn} onClick={() => b?.cmd("reload")}>REBOOT</button>
          </div>
          <button className="mt-3 w-full border border-destructive/60 py-2 font-hud text-xs tracking-wider text-destructive hover:bg-destructive/10" onClick={() => b?.cmd("quit")}>SHUT DOWN JARVIS</button>
          <button className="mt-2 w-full py-1 font-mono text-[10px] text-term-dim hover:text-destructive" onClick={() => b?.cmd("uninstall")}>Uninstall Jarvis…</button>
        </Section>
      </div>
    </div>
  );
}
