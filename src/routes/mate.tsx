import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";

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
type Mode = "idle" | "listening" | "thinking" | "speaking" | "sleeping";

const PERKS = [
  "Still here, sir.",
  "Shall I run a diagnostic? Kidding. Mostly.",
  "You've been staring at that screen a while, sir.",
  "Hydration levels look suboptimal, sir.",
];

function Mate() {
  const [mode, setMode] = useState<Mode>("idle");
  const [bubble, setBubble] = useState("Good evening, sir. Click me to talk.");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const history = useRef<Msg[]>([]);
  const lastActive = useRef(Date.now());

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const t = setInterval(() => {
      const idle = Date.now() - lastActive.current;
      if (idle > 180000) setMode((m) => (m === "idle" ? "sleeping" : m));
      else if (idle > 60000 && Math.random() < 0.15) setBubble(PERKS[Math.floor(Math.random() * PERKS.length)] ?? "");
    }, 20000);
    return () => clearInterval(t);
  }, []);

  const wake = () => {
    lastActive.current = Date.now();
    if (mode === "sleeping") { setMode("idle"); setBubble("Ah. Back online, sir."); }
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices();
    u.voice = v.find((x) => /en-GB/i.test(x.lang) && /daniel|george|arthur|male/i.test(x.name)) || v.find((x) => /en-GB/i.test(x.lang)) || null;
    u.pitch = 0.9;
    u.onstart = () => setMode("speaking");
    u.onend = () => setMode("idle");
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    wake();
    setInput("");
    history.current = [...history.current, { role: "user" as const, content: t }].slice(-20);
    setMode("thinking");
    setBubble("…");
    let full = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.current }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "Systems malfunction, sir.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.startsWith("data:")) continue;
          const d = l.slice(5).trim();
          if (!d || d === "[DONE]") continue;
          try {
            const c = JSON.parse(d).choices?.[0]?.delta?.content;
            if (c) { full += c; setBubble(full); }
          } catch { /* partial frame */ }
        }
      }
      history.current.push({ role: "assistant", content: full });
      setMode("idle");
      speak(full);
    } catch (e) {
      setBubble(e instanceof Error ? e.message : "Systems malfunction, sir.");
      setMode("idle");
    }
  };

  const listen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setBubble("My ears aren't available here, sir. Type instead."); return; }
    wake();
    speechSynthesis.cancel();
    const rec = new SR();
    let txt = "";
    rec.onresult = (e: any) => { txt = Array.from(e.results).map((r: any) => r[0].transcript).join(""); setBubble(txt); };
    rec.onend = () => { setMode("idle"); if (txt) send(txt); };
    rec.onerror = () => setMode("idle");
    setMode("listening");
    rec.start();
  };

  const fast = mode === "thinking" || mode === "speaking";

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-end gap-2 p-2 select-none" style={{ background: "transparent" }}>
      {bubble && mode !== "sleeping" && (
        <div className="max-w-[260px] rounded-lg border border-border bg-popover px-3 py-2 text-sm leading-snug text-popover-foreground shadow-glow">
          {bubble}
        </div>
      )}
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mate-nodrag flex w-[260px] gap-1">
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Jarvis…"
            className="flex-1 rounded border border-input bg-secondary px-2 py-1 text-sm text-foreground outline-none" />
          <button type="button" onClick={listen} aria-label="Talk" className="rounded border border-border px-2 text-primary"><Mic size={14} /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded border border-border px-2 text-muted-foreground"><X size={14} /></button>
        </form>
      )}
      <button
        onClick={() => { wake(); setOpen(true); }}
        onDoubleClick={listen}
        aria-label="Jarvis"
        className="mate-drag relative h-32 w-32 shrink-0"
      >
        <span className={`absolute inset-0 rounded-full border-2 border-dashed border-primary/50 ${mode === "sleeping" ? "" : "animate-spin-slow"}`} />
        <span className={`absolute inset-4 rounded-full border-4 border-primary/20 border-t-primary border-b-primary ${mode === "sleeping" ? "" : "animate-spin-rev"}`} />
        <span className={`absolute inset-10 rounded-full shadow-glow ${mode === "listening" ? "bg-accent" : "bg-primary"} ${mode === "sleeping" ? "opacity-30" : fast ? "animate-core-fast" : "animate-core"}`} />
        {mode === "sleeping" && <span className="absolute -top-1 right-2 font-display text-xs text-primary">z z</span>}
      </button>
    </div>
  );
}
