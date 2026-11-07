import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, X, Trash2, Plus, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhonePairing } from "@/components/phone-pairing";
import { clearMemory, forget, loadMemory, remember, type JarvisMemory } from "@/lib/memory";
import { bridge, loadSettings, saveSettings, SYSTEM_PROMPT, VERSION, type Brain, type Settings, type Size } from "@/lib/jarvis";

export const Route = createFileRoute("/mainframe")({
  head: () => ({
    meta: [
      { title: "Jarvis Mainframe — Settings" },
      { name: "description", content: "Choose Jarvis's brain, voice, skills and memory." },
      { property: "og:title", content: "Jarvis Mainframe — Settings" },
      { property: "og:description", content: "Choose Jarvis's brain, voice, skills and memory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Mainframe,
});

const BRAINS: { value: Brain; label: string; note: string }[] = [
  { value: "local", label: "Local · Gemma", note: "Free, runs on this PC" },
  { value: "builtin", label: "Built-in cloud", note: "Free, no setup" },
  { value: "chatgpt", label: "ChatGPT", note: "Project's ChatGPT key" },
  { value: "custom", label: "Custom", note: "Your own API key & model" },
];
type Tab = "mainframe" | "settings" | "skills";

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-primary/30 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="border-l-2 border-primary pl-2 font-hud text-xs tracking-widest text-term-text">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Glowing HUD dropdown that replaces native selects. */
function HudSelect<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; note?: string }[]; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const cur = options.find((o) => o.value === value) ?? options[0];
  return (
    <div ref={ref} className={`relative w-full ${open ? "z-50" : ""}`}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between border bg-term-bg px-2 py-1.5 font-mono text-xs text-term-text ${open ? "border-primary shadow-[0_0_10px_var(--color-primary)]" : "border-primary/40 hover:border-primary"}`}>
        <span className="truncate">{cur?.label}</span>
        <ChevronDown size={14} className={`shrink-0 text-primary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto border border-primary bg-background shadow-[0_0_14px_var(--color-primary)]">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-xs hover:bg-primary/15 ${o.value === value ? "text-primary" : "text-term-text"}`}>
                <span className="w-3">{o.value === value && <Check size={12} />}</span>
                <span className="truncate">{o.label}</span>
                {o.note && <span className="ml-auto truncate text-[10px] text-term-dim">{o.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label, note }: { on: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center gap-2 py-0.5 text-left">
      <span className={`text-xs ${on ? "text-primary" : "text-term-dim"}`}>{on ? "◆" : "◇"}</span>
      <span className={`font-hud text-[11px] tracking-wider ${on ? "text-primary" : "text-term-text"}`}>{label}</span>
      {note && <span className="font-mono text-[10px] text-term-dim">{note}</span>}
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 font-hud text-[11px] tracking-wider text-term-text">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-primary" />
      <span className="w-9 text-right font-mono text-[10px] text-term-dim">{Math.round(value * 100)}%</span>
    </label>
  );
}

const field = "w-full border border-primary/40 bg-term-bg px-2 py-1.5 font-mono text-xs text-term-text outline-none focus:border-primary";
const btn = "border border-primary/50 px-3 py-1.5 font-hud text-[11px] tracking-wider text-primary hover:bg-primary/10";
const MOODS = { positive: ["◆ UPBEAT", "text-primary"], neutral: ["◇ CALM", "text-term-text"], concerned: ["▲ CONCERNED", "text-destructive"] } as const;

function Mainframe() {
  const [tab, setTab] = useState<Tab>("mainframe");
  const [s, setS] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [devs, setDevs] = useState<{ inputs: string[]; outputs: string[] }>({ inputs: [], outputs: [] });
  useEffect(() => {
    const merge = (a: string[], b: string[]) => Array.from(new Set([...a, ...b].filter(Boolean)));
    const clean = (l: string) => l.replace(/^(Default|Communications) - /, "").replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, "");
    (async () => {
      let ins: string[] = [], outs: string[] = [];
      try {
        const d = await navigator.mediaDevices?.enumerateDevices();
        if (d?.length) {
          ins = d.filter((x) => x.kind === "audioinput" && x.label).map((x) => clean(x.label));
          outs = d.filter((x) => x.kind === "audiooutput" && x.label).map((x) => clean(x.label));
        }
      } catch { /* ignore */ }
      try {
        const n = await bridge()?.audioDevices?.();
        if (n) { ins = merge(n.inputs, ins); outs = merge(n.outputs, outs); }
      } catch { /* ignore */ }
      setDevs({ inputs: merge(ins, []), outputs: merge(outs, []) });
    })();
  }, []);
  const [status, setStatus] = useState("");
  const [local, setLocal] = useState<{ running: boolean; hasModel: boolean } | null>(null);
  const [dl, setDl] = useState<{ text: string; pct: number | null } | null>(null);
  const [cable, setCable] = useState(false);
  const [apps, setApps] = useState<number | null>(null);
  const [memory, setMemory] = useState<JarvisMemory>({ facts: [], history: [] });
  const [fact, setFact] = useState("");
  const [mood, setMood] = useState<{ mood: keyof typeof MOODS; text: string } | null>(null);
  const [live, setLive] = useState("idle");
  const [srv, setSrv] = useState({ name: "", link: "" });

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    setS(loadSettings());
    const refresh = () => {
      setMemory(loadMemory());
      try { setMood(JSON.parse(localStorage.getItem("jarvis-mood") || "null")); } catch { /* ignore */ }
      try { setLive(JSON.parse(localStorage.getItem("jarvis-status") || "{}").mode || "idle"); } catch { /* ignore */ }
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("jarvis-memory-changed", refresh);
    const lv = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    lv();
    speechSynthesis.onvoiceschanged = lv;
    bridge()?.localStatus?.(loadSettings().localModel).then(setLocal);
    const off = bridge()?.onCmd((n, a) => { if (n === "setup-progress") setDl(a as { text: string; pct: number | null }); });
    navigator.mediaDevices?.enumerateDevices().then((d) => {
      setMics(d.filter((x) => x.kind === "audioinput"));
      setCable(d.some((x) => x.kind === "audiooutput" && /cable input/i.test(x.label)));
    }).catch(() => {});
    bridge()?.listApps?.().then((a) => setApps(a.length)).catch(() => {});
    return () => { off?.(); window.removeEventListener("storage", refresh); window.removeEventListener("jarvis-memory-changed", refresh); };
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
    u.volume = s.volume; u.rate = s.rate;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const m = mood ? MOODS[mood.mood] ?? MOODS.neutral : MOODS.neutral;
  const servers = s.discordServers ?? [];

  return (
    <div className="h-screen w-screen p-1 select-none">
      <div className="hud-panel flex h-full flex-col">
        <header className="flex items-center justify-between px-4 pt-3 pb-2" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <h1 className="font-hud text-lg font-bold tracking-[0.2em] text-primary">MAINFRAME</h1>
          <div className="flex gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <button aria-label="Minimise" onClick={() => b?.cmd("mf-min")} className="p-1 text-term-dim hover:text-primary"><Minus size={15} /></button>
            <button aria-label="Close" onClick={() => (b ? b.cmd("mf-close") : window.close())} className="p-1 text-term-dim hover:text-destructive"><X size={15} /></button>
          </div>
        </header>

        <div className="mx-4 mb-2 flex items-center gap-2 border border-primary/30 px-2 py-1.5" aria-live="polite">
          <span className={`h-2 w-2 rounded-full bg-primary ${live !== "idle" ? "animate-pulse" : "opacity-60"}`} />
          <span className="font-hud text-[10px] tracking-widest text-term-dim">STATUS</span>
          <span className="font-mono text-[11px] uppercase text-term-text">{live}</span>
          <span className="ml-auto font-hud text-[10px] tracking-widest text-term-dim">SENTIMENT</span>
          <span className={`font-hud text-[11px] tracking-wider ${m[1]}`} title={mood?.text}>{m[0]}</span>
        </div>

        <nav className="mx-4 flex gap-1" role="tablist">
          {(["mainframe", "settings", "skills"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`flex-1 border-b-2 py-1.5 font-hud text-[11px] tracking-widest ${tab === t ? "border-primary text-primary" : "border-transparent text-term-dim hover:text-term-text"}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </nav>

        <div className="mt-1 flex-1 overflow-y-auto">
          {tab === "mainframe" && (<>
            <Section title="BRAIN">
              <HudSelect label="Brain" value={s.brain} options={BRAINS} onChange={(v) => { set({ brain: v }); setStatus(""); }} />
              {s.brain === "local" && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={field} value={s.localModel} onChange={(e) => set({ localModel: e.target.value })} placeholder="gemma4:e4b" aria-label="Local model" />
                    <input className={field} value={s.localUrl} onChange={(e) => set({ localUrl: e.target.value })} aria-label="Local address" />
                  </div>
                  <p className="font-mono text-[10px] text-term-dim">
                    {local == null ? "Status: open in the desktop app to check." : local.hasModel ? "◆ Installed and ready." : local.running ? "Engine ready, model not downloaded yet." : "Not installed yet."}
                  </p>
                  {dl ? (
                    <div className="space-y-1">
                      <div className="h-2 w-full border border-primary/50">
                        <div className={`h-full bg-primary transition-all ${dl.pct == null ? "w-1/3 animate-pulse" : ""}`} style={dl.pct == null ? undefined : { width: `${Math.round(dl.pct * 100)}%` }} />
                      </div>
                      <p className="font-mono text-[10px] text-term-reply">{dl.text}</p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {!local?.hasModel && <button className={btn} onClick={install}>DOWNLOAD &amp; INSTALL (~10 GB)</button>}
                      <button className={btn} onClick={test}>TEST</button>
                    </div>
                  )}
                </div>
              )}
              {s.brain === "custom" && (
                <div className="mt-2 space-y-2">
                  <input className={field} value={s.customUrl} onChange={(e) => set({ customUrl: e.target.value })} placeholder="https://api.openai.com/v1" aria-label="API address" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={field} type="password" value={s.customKey} onChange={(e) => set({ customKey: e.target.value })} placeholder="API key" aria-label="API key" />
                    <input className={field} value={s.customModel} onChange={(e) => set({ customModel: e.target.value })} placeholder="Model" aria-label="Model" />
                  </div>
                  <button className={btn} onClick={test}>TEST</button>
                </div>
              )}
              {status && <p className="mt-2 break-words font-mono text-[10px] text-term-reply">{status}</p>}
            </Section>

            <Section title="PERSONALITY">
              <div className="grid grid-cols-2 gap-2">
                <input className={field} value={s.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="Preferred name" aria-label="Preferred name" maxLength={40} />
                <HudSelect label="Personality" value={s.personality} onChange={(v) => set({ personality: v })}
                  options={[{ value: "classic", label: "Classic butler" }, { value: "warm", label: "Warm" }, { value: "sarcastic", label: "Sarcastic" }]} />
              </div>
            </Section>

            <Section title="JARVIS" right={<span className="font-mono text-[10px] text-term-dim">v{VERSION}</span>}>
              <div className="grid grid-cols-3 gap-2">
                <button className={btn} onClick={() => b?.cmd("toggle")}>HIDE / SHOW</button>
                <button className={btn} onClick={() => b?.cmd("move", "center")}>BRING HERE</button>
                <button className={btn} onClick={() => b?.cmd("reload")}>REBOOT</button>
              </div>
              <button className="mt-2 w-full border border-destructive/60 py-1.5 font-hud text-[11px] tracking-wider text-destructive hover:bg-destructive/10" onClick={() => b?.cmd("quit")}>SHUT DOWN JARVIS</button>
            </Section>
          </>)}

          {tab === "settings" && (<>
            <Section title="VOICE & AUDIO">
              <div className="space-y-2">
                <Toggle on={s.voiceOn} onChange={(v) => set({ voiceOn: v })} label="SPEAK REPLIES" note="Off = text only" />
                <div className="flex gap-2">
                  <HudSelect label="Voice" value={s.voiceName} onChange={(v) => set({ voiceName: v })}
                    options={[{ value: "", label: "Best British voice" }, ...voices.map((v) => ({ value: v.name, label: v.name, note: v.lang }))]} />
                  <button className={btn} onClick={testVoice}>TEST</button>
                </div>
                <Slider label="LOUDNESS" value={s.volume} min={0} max={1} step={0.05} onChange={(v) => set({ volume: v })} />
                <Slider label="SPEED" value={s.rate} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ rate: v })} />
                <HudSelect label="Microphone" value={s.micId} onChange={(v) => set({ micId: v })}
                  options={[{ value: "", label: "Mic: Windows default" }, ...mics.filter((x) => x.deviceId !== "default").map((x) => ({ value: x.deviceId, label: x.label || "Microphone" }))]} />
                <Toggle on={s.wakeWord} onChange={(v) => set({ wakeWord: v })} label={'LISTEN FOR "HEY JARVIS"'} />
              </div>
            </Section>

            <Section title="SYSTEM">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-hud text-[11px] tracking-wider text-term-text">SIZE</span>
                  <HudSelect label="Jarvis size" value={s.size} onChange={(v: Size) => { set({ size: v }); b?.cmd("size", v); }}
                    options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "huge", label: "Huge" }]} />
                </div>
                <Toggle on={s.alwaysOnTop} onChange={(v) => { set({ alwaysOnTop: v }); b?.cmd("always-on-top", v); }} label="ALWAYS ON TOP" />
                <Toggle on={s.startup} onChange={(v) => { set({ startup: v }); b?.cmd("startup", v); }} label="START WITH WINDOWS" />
              </div>
            </Section>

            <Section title="MEMORY" right={<span className="font-mono text-[10px] text-term-dim">{memory.facts.length} saved facts</span>}>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); remember(fact); setFact(""); }}>
                <input className={field} aria-label="New memory" placeholder="A fact to remember…" value={fact} onChange={(e) => setFact(e.target.value)} maxLength={1000} />
                <Button type="submit" variant="outline" size="icon" aria-label="Save memory" disabled={!fact.trim()}><Plus size={16} /></Button>
              </form>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {memory.facts.map((f) => <li key={f} className="flex items-center justify-between gap-2 border-b border-primary/20 py-1 font-mono text-xs text-term-text">
                  <span className="min-w-0 break-words">{f}</span>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => forget(f)} aria-label={`Forget ${f}`}><Trash2 size={14} /></Button>
                </li>)}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-term-dim">Stored on this PC · {memory.history.length} recent messages</span>
                <Button variant="outline" size="sm" disabled={!memory.facts.length && !memory.history.length} onClick={() => { if (window.confirm("Clear all saved facts and conversation?")) clearMemory(); }}><Trash2 size={14} /> Clear</Button>
              </div>
              <button className="mt-2 w-full py-1 font-mono text-[10px] text-term-dim hover:text-destructive" onClick={() => b?.cmd("uninstall")}>Uninstall Jarvis…</button>
            </Section>
          </>)}

          {tab === "skills" && (<>
            <Section title="PHONE REMOTE"><PhonePairing /></Section>
            <Section title="SKILLS">
              <ul className="space-y-1 font-mono text-[11px] text-term-dim">
                <li><span className="text-primary">◆</span> <span className="text-term-text">"Open Steam"</span> — opens any installed app{apps != null && ` (${apps} found)`}</li>
                <li><span className="text-primary">◆</span> <span className="text-term-text">"Play Blinding Lights by The Weeknd"</span> — Spotify</li>
                <li><span className="text-primary">◆</span> <span className="text-term-text">"Hop in a VC on Discord and tell my friends I'll be a few mins"</span></li>
                <li><span className="text-primary">◆</span> <span className="text-term-text">"…on the Gaming server…"</span> — picks a saved channel by name</li>
              </ul>
            </Section>

            <Section title="DISCORD CHANNELS" right={<span className="font-mono text-[10px] text-term-dim">{servers.length} saved</span>}>
              <form className="space-y-2" onSubmit={(e) => {
                e.preventDefault();
                if (!srv.name.trim() || !srv.link.trim()) return;
                set({ discordServers: [...servers.filter((x) => x.name.toLowerCase() !== srv.name.trim().toLowerCase()), { name: srv.name.trim(), link: srv.link.trim() }] });
                setSrv({ name: "", link: "" });
              }}>
                <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input className={field} value={srv.name} onChange={(e) => setSrv({ ...srv, name: e.target.value })} placeholder="Name (Gaming)" aria-label="Server name" maxLength={30} />
                  <input className={field} value={srv.link} onChange={(e) => setSrv({ ...srv, link: e.target.value })} placeholder="Voice channel link" aria-label="Voice channel link" />
                  <Button type="submit" variant="outline" size="icon" aria-label="Save channel" disabled={!srv.name.trim() || !srv.link.trim()}><Plus size={16} /></Button>
                </div>
              </form>
              <ul className="mt-2 space-y-1">
                {servers.map((x) => <li key={x.name} className="flex items-center justify-between gap-2 border-b border-primary/20 py-1 font-mono text-xs text-term-text">
                  <span className="min-w-0 truncate"><span className="text-primary">{x.name}</span> · <span className="text-term-dim">{x.link}</span></span>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => set({ discordServers: servers.filter((y) => y.name !== x.name) })} aria-label={`Remove ${x.name}`}><Trash2 size={14} /></Button>
                </li>)}
              </ul>
              <p className="mt-2 font-mono text-[10px] text-term-dim">In Discord: right-click a voice channel → Copy Link.</p>
            </Section>

            <Section title="VB-CABLE">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] text-term-dim">{cable ? <span className="text-primary">◆ VB-Cable found.</span> : "VB-Cable not found — needed for Jarvis to talk in calls."}</p>
                {!cable && <button className={btn} onClick={() => b?.openUrl?.("https://vb-audio.com/Cable/")}>GET VB-CABLE</button>}
              </div>
              <div className="mt-2 space-y-2">
                {([["audioIn", "inputs", "Default input", "Your mic"], ["audioOut", "outputs", "Default output", "Your speakers"], ["cableIn", "outputs", "VB-Cable input", "CABLE Input"], ["cableOut", "inputs", "VB-Cable output", "CABLE Output"]] as const).map(([key, list, label, auto]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 font-hud text-[10px] tracking-wider text-term-text">{label.toUpperCase()}</span>
                    <HudSelect label={label} value={s[key]} onChange={(v) => set({ [key]: v })}
                      options={[{ value: "", label: `Auto (${auto})` }, ...devs[list].map((n) => ({ value: n, label: n }))]} />
                  </div>
                ))}
              </div>
              <p className="mt-1 font-mono text-[10px] text-term-dim">In calls Jarvis switches Windows to the VB-Cable devices, then back to your defaults. Set Discord Input/Output Device to Default once so it follows.</p>
            </Section>
          </>)}
        </div>
      </div>
    </div>
  );
}
