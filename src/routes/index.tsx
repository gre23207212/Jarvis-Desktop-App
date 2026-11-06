import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "J.A.R.V.I.S. — Your AI Companion" },
      { name: "description", content: "Talk to Jarvis, a witty voice-enabled AI assistant in your browser." },
      { property: "og:title", content: "J.A.R.V.I.S. — Your AI Companion" },
      { property: "og:description", content: "Talk to Jarvis, a witty voice-enabled AI assistant in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Jarvis,
});

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "idle" | "listening" | "thinking" | "speaking";

function Reactor({ mode }: { mode: Mode }) {
  const fast = mode === "thinking" || mode === "speaking";
  return (
    <div className="relative mx-auto h-56 w-56 sm:h-72 sm:w-72">
      <div className="absolute inset-0 animate-spin-slow rounded-full border-2 border-dashed border-primary/40" />
      <div className="absolute inset-6 animate-spin-rev rounded-full border-4 border-primary/20 border-t-primary border-b-primary" />
      <div className="absolute inset-14 animate-spin-slow rounded-full border border-primary/50" />
      <div
        className={`absolute inset-20 rounded-full bg-primary shadow-glow ${fast ? "animate-core-fast" : "animate-core"} ${mode === "listening" ? "bg-accent" : ""}`}
      />
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className="font-display text-xs tracking-[0.4em] text-primary text-glow uppercase">{mode}</span>
      </div>
    </div>
  );
}

function Jarvis() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Good evening, sir. All systems are online. How may I assist?" },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [voiceOn, setVoiceOn] = useState(true);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) setCanListen(true);
  }, []);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const speak = (text: string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return setMode("idle");
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name)) ||
      voices.find((v) => /en-GB/i.test(v.lang)) || null;
    u.rate = 1.02;
    u.pitch = 0.9;
    u.onstart = () => setMode("speaking");
    u.onend = () => setMode("idle");
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || mode === "thinking") return;
    setInput("");
    const history = [...messagesRef.current, { role: "user" as const, content: t }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setMode("thinking");
    let full = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20) }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Systems malfunction, sir.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            if (j.error) throw new Error("I lost the connection mid-thought, sir.");
            const d = j.choices?.[0]?.delta?.content;
            if (d) {
              full += d;
              setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("sir")) throw e;
          }
        }
      }
      setMode("idle");
      speak(full);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Systems malfunction, sir.";
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: full || msg }]);
      setMode("idle");
    }
  };

  const toggleListen = () => {
    if (mode === "listening") {
      recRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    speechSynthesis.cancel();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e: any) => {
      let txt = "";
      for (const r of e.results) txt += r[0].transcript;
      finalText = txt;
      setInput(txt);
    };
    rec.onend = () => {
      setMode("idle");
      if (finalText) send(finalText);
    };
    rec.onerror = () => setMode("idle");
    recRef.current = rec;
    setMode("listening");
    rec.start();
  };

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-6">
      <header className="flex w-full max-w-3xl items-center justify-between">
        <h1 className="font-display text-xl tracking-[0.3em] text-primary text-glow">J.A.R.V.I.S.</h1>
        <button
          onClick={() => { setVoiceOn((v) => !v); speechSynthesis.cancel(); }}
          className="rounded border border-border p-2 text-primary transition hover:shadow-glow"
          aria-label={voiceOn ? "Mute voice" : "Unmute voice"}
        >
          {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </header>

      <section className="my-6">
        <Reactor mode={mode} />
      </section>

      <section className="w-full max-w-3xl flex-1 space-y-3 overflow-y-auto rounded border border-border bg-card p-4 backdrop-blur max-h-[40vh]">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span className="font-display text-[10px] tracking-[0.3em] text-muted-foreground">
              {m.role === "user" ? "YOU" : "JARVIS"}
            </span>
            <p className={`text-lg leading-snug ${m.role === "user" ? "text-accent" : "text-foreground"}`}>
              {m.content || <span className="text-muted-foreground">Processing…</span>}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-4 flex w-full max-w-3xl gap-2"
      >
        {canListen && (
          <button
            type="button"
            onClick={toggleListen}
            aria-label="Talk to Jarvis"
            className={`rounded border border-border px-4 transition hover:shadow-glow ${mode === "listening" ? "bg-accent text-accent-foreground" : "text-primary"}`}
          >
            {mode === "listening" ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Speak or type a command…"
          className="flex-1 rounded border border-input bg-secondary px-4 py-3 text-lg text-foreground outline-none placeholder:text-muted-foreground focus:shadow-glow"
        />
        <button
          type="submit"
          disabled={mode === "thinking" || !input.trim()}
          aria-label="Send"
          className="rounded bg-primary px-5 text-primary-foreground transition hover:shadow-glow disabled:opacity-40"
        >
          <Send size={20} />
        </button>
      </form>
    </main>
  );
}
