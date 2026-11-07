import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRecentNews } from "@/lib/news.functions";
import { newsTopic, saveNewsTopic, startupGreeting, welcomeAnswer, READY_MESSAGE, type WelcomeStage, type NewsStory } from "@/lib/welcome";
import { AudioLines, Pencil } from "lucide-react";
import reactor from "@/assets/jarvis-reactor.png.asset.json";
import { loadMemory, memoryCommand, memoryContext, saveConversation } from "@/lib/memory";
import { selectDiscordChannel } from "@/lib/discord-selection";
import { deliverDiscordMessage } from "@/lib/discord-relay";
import { useRemoteDesktop } from "@/hooks/use-remote-desktop";
import type { DiscordServer } from "@/lib/jarvis";
import { bridge, liveContext, loadSettings, parseAction, parseWake, personaPrompt, relayLines, saveSettings, sentiment, SIZES, SYSTEM_PROMPT, type Action, type Settings } from "@/lib/jarvis";

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
  const fetchNews = useServerFn(getRecentNews);
  const welcomeStage = useRef<WelcomeStage>(null);
  const [newsSources, setNewsSources] = useState<NewsStory[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [you, setYou] = useState("");
  const [reply, setReply] = useState("");
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [hover, setHover] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const history = useRef<Msg[]>([]);
  const pendingDiscord = useRef<{ action: Extract<Action, { kind: "discord" }>; channels: DiscordServer[] } | null>(null);
  const warned = useRef(false);
  const modeRef = useRef<Mode>("idle");
  const want = useRef<"wake" | "command" | "none">("none");
  const settingsRef = useRef<Settings | null>(null);
  const hideTimer = useRef<number>(0);
  const hoverTimer = useRef<number>(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  modeRef.current = mode;
  settingsRef.current = settings;
  useRemoteDesktop(async (job) => {
    const action = parseAction(job.text);
    if (action?.kind !== "discord") return { status: "failed", result: "Only Discord voice commands are supported from the phone." };
    const s = settingsRef.current ?? loadSettings();
    const selection = selectDiscordChannel(s.discordServers, job.channel || action.server || "", s.discordLink);
    if (selection.kind === "choose") return { status: "choose", result: `Which channel? ${selection.channels.map((channel) => channel.name).join(", ")}. Choose it on your phone and send again.` };
    if (selection.kind === "missing") return { status: "failed", result: "Save a voice channel in the PC Mainframe first." };
    setM("thinking"); setYou(job.text);
    try {
      const result = await runAction({ ...action, server: selection.channel.name }, s);
      setReply(result);
      const failed = /couldn't|could not|can't|first, sir|unavailable/i.test(result);
      return { status: failed ? "failed" : "done", result };
    } finally { setM("idle"); }
  }, () => modeRef.current !== "idle" || !!pendingDiscord.current || !!welcomeStage.current);

  const setM = (m: Mode) => { modeRef.current = m; setMode(m); try { localStorage.setItem("jarvis-status", JSON.stringify({ mode: m, at: Date.now() })); } catch { /* ignore */ } };
  const setMood = (text: string) => { try { localStorage.setItem("jarvis-mood", JSON.stringify({ mood: sentiment(text), text: text.slice(0, 140), at: Date.now() })); } catch { /* ignore */ } };

  // ---------- setup ----------
  useEffect(() => {
    for (const el of [document.documentElement, document.body]) { el.style.background = "transparent"; el.style.overflow = "hidden"; }
    const s = loadSettings();
    setSettings(s);
    history.current = loadMemory().history;
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
    if (!s.alwaysOnTop) b?.cmd("always-on-top", false);
    startMic();
    // Each desktop window session welcomes once; reloads and opening settings do not repeat it.
    const welcomeTimer = window.setTimeout(() => {
      if (!b || sessionStorage.getItem("jarvis-welcomed") || modeRef.current !== "idle") return;
      sessionStorage.setItem("jarvis-welcomed", "yes");
      askWelcome(startupGreeting(new Date(), newsTopic()), "offer");
    }, 1600);
    return () => { window.clearTimeout(welcomeTimer); window.removeEventListener("storage", onStorage); window.removeEventListener("mousemove", onMove); off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (t: string) => {
    setYou(""); setReply(t);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (modeRef.current === "idle") setReply(""); }, 7000);
  };

  // ---------- voice out ----------
  const speak = (text: string, then?: () => void) => {
    const s = settingsRef.current;
    if (!s?.voiceOn || !("speechSynthesis" in window)) { setM("idle"); then?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices();
    u.voice = v.find((x) => x.name === s.voiceName) || v.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|thomas|male/i.test(x.name)) || v.find((x) => /en-GB/i.test(x.lang)) || null;
    u.pitch = 0.9;
    u.volume = s.volume ?? 1;
    u.rate = s.rate ?? 1;
    setM("speaking");
    setMood(text);
    u.onstart = () => setM("speaking");
    u.onend = u.onerror = () => { setM("idle"); if (then) { then(); return; } hideTimer.current = window.setTimeout(() => { if (modeRef.current === "idle") { setReply(""); setYou(""); } }, 8000); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const askWelcome = (text: string, stage: WelcomeStage) => {
    welcomeStage.current = stage;
    want.current = "none";
    setReply(text);
    speak(text, () => {
      window.setTimeout(() => {
        if (welcomeStage.current === stage && stage) listenNow(text);
      }, 350);
    });
  };
  const finishWelcome = (prefix = "") => {
    welcomeStage.current = null;
    endListen();
    const text = [prefix, READY_MESSAGE].filter(Boolean).join(" ");
    setReply(text); speak(text);
  };
  const readNews = async (topic: string) => {
    welcomeStage.current = null;
    saveNewsTopic(topic);
    want.current = "none";
    setM("thinking"); setReply(`Checking recent news about ${topic}, boss…`);
    try {
      const result = await fetchNews({ data: { topic } });
      setNewsSources(result.stories);
      const headlines = result.stories.map((story) => `${story.source}: ${story.title}.`).join(" ");
      finishWelcome(result.error || `Here are the recent public headlines about ${topic}. ${headlines}`);
    } catch { finishWelcome("I couldn't reach the news right now, boss. I won't make up an update."); }
  };

  // ---------- brain ----------
  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    window.clearTimeout(hideTimer.current);
    setInput(""); setTyping(false); setYou(t); setReply("");
    const s = settingsRef.current ?? loadSettings();
    const answer = welcomeAnswer(welcomeStage.current, t, newsTopic());
    if (answer.kind === "finish") { finishWelcome(); return; }
    if (answer.kind === "topic") { askWelcome("What news topic interests you, boss? For example, world news, science, technology, or sport. I'll remember your choice for next time.", "topic"); return; }
    // Desktop commands always take priority over a topic answer.
    if (answer.kind === "news" && !parseAction(t)) { await readNews(answer.topic || "world news"); return; }
    welcomeStage.current = null;
    setNewsSources([]);
    const pending = pendingDiscord.current;
    const parsed = parseAction(t);
    if (pending && /^(?:cancel|never mind|nevermind|stop)[.!?]*$/i.test(t)) {
      pendingDiscord.current = null;
      endListen();
      setReply("Cancelled, sir."); speak("Cancelled, sir."); return;
    }
    if (pending && (!parsed || parsed.kind === "discord")) {
      const selection = selectDiscordChannel(pending.channels, parsed?.kind === "discord" ? parsed.server || t : t);
      const action = parsed?.kind === "discord" && parsed.message ? { ...pending.action, message: parsed.message } : pending.action;
      if (selection.kind !== "selected") {
        askDiscordChannel(action, pending.channels, true);
        return;
      }
      pendingDiscord.current = null;
      await performAction({ ...action, server: selection.channel.name }, s);
      return;
    }
    if (parsed) pendingDiscord.current = null;
    if (parsed?.kind === "discord" && bridge()?.discordJoin) {
      const selection = selectDiscordChannel(s.discordServers ?? [], parsed.server || t, s.discordLink);
      // A generic join request does not count as naming a channel.
      const resolved = selection.kind === "choose" && !parsed.server
        ? selectDiscordChannel(s.discordServers ?? [], "", s.discordLink)
        : selection;
      if (resolved.kind === "choose") {
        askDiscordChannel(parsed, resolved.channels);
        return;
      }
      await performAction(resolved.kind === "selected" ? { ...parsed, server: resolved.channel.name } : parsed, s);
      return;
    }
    const remembered = memoryCommand(t);
    if (remembered) { history.current = loadMemory().history; setReply(remembered); speak(remembered); return; }
    history.current = loadMemory().history;
    history.current = [...history.current, { role: "user" as const, content: t }].slice(-20);
    setM("thinking");
    let full = "";
    const act = parseAction(t);
    if (act && bridge()?.openApp) {
      const said = await runAction(act, s).catch(() => "Something went wrong doing that, sir.");
      history.current.push({ role: "assistant", content: said });
      saveConversation(history.current);
      setReply(said);
      speak(said);
      return;
    }
    try {
      const context = [await liveContext(t, history.current), memoryContext()].filter(Boolean).join("\n\n");
      const persona = personaPrompt(s);
      const system = `${SYSTEM_PROMPT}\n${persona}\n\n${context}`;
      const cloud = async (provider: "builtin" | "chatgpt") => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.current, provider, context: [persona, context].filter(Boolean).join("\n\n") }),
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
      };
      if (s.brain === "local" || s.brain === "custom") {
        const b = bridge();
        const req = s.brain === "local"
          ? { url: s.localUrl, model: s.localModel }
          : { url: s.customUrl, key: s.customKey, model: s.customModel };
        const messages = [{ role: "system", content: system }, ...history.current];
        let err = "";
        if (b) {
          const r = await b.chat({ ...req, messages });
          if (r.error) err = r.error; else full = r.text ?? "";
        } else err = "desktop only";
        if (err && s.brain === "local") {
          // Gemma isn't installed/running yet — answer with the built-in brain instead.
          await cloud("builtin");
          if (!warned.current) { warned.current = true; full += " (Using my cloud brain for now — set up Gemma in the Mainframe to think locally.)"; }
        } else if (err) throw new Error(err);
        setReply(full);
      } else {
        await cloud(s.brain);
      }
      history.current.push({ role: "assistant", content: full });
      saveConversation(history.current);
      speak(full);
    } catch (e) {
      setReply(e instanceof Error ? e.message : "Systems malfunction, sir.");
      setM("idle");
    }
  };

  // ---------- skills on the PC ----------
  const askDiscordChannel = (action: Extract<Action, { kind: "discord" }>, channels: DiscordServer[], retry = false) => {
    pendingDiscord.current = { action, channels };
    want.current = "none";
    setM("thinking");
    const question = `${retry ? "I couldn't identify one channel, sir. " : ""}Which one would you like to join? ${channels.map((channel) => channel.name).join(", ")}.`;
    setReply(question);
    speak(question, () => {
      setM("thinking");
      window.setTimeout(() => {
        if (pendingDiscord.current?.action === action && want.current === "none") listenNow(question);
      }, 350);
    });
  };

  const performAction = async (action: Action, s: Settings) => {
    setM("thinking");
    history.current = [...loadMemory().history, { role: "user" as const, content: action.kind === "discord" ? `Join ${action.server ?? "Discord"}${action.message ? ` and tell them ${action.message}` : ""}` : you }].slice(-20);
    const said = await runAction(action, s).catch(() => "Something went wrong doing that, sir.");
    history.current.push({ role: "assistant", content: said });
    saveConversation(history.current);
    setReply(said); speak(said);
  };

  const sayIntoCable = async (text: string, cableOnly = false) => {
    const b = bridge();
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cable = devs.find((d) => d.kind === "audiooutput" && /cable input/i.test(d.label));
    if (!cable) return false;
    // Same voice Jarvis normally speaks with, not a different Windows voice.
    const voices = "speechSynthesis" in window ? speechSynthesis.getVoices() : [];
    const s = settingsRef.current;
    const voice = voices.find((x) => x.name === s?.voiceName) || voices.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|thomas|male/i.test(x.name)) || voices.find((x) => /en-GB/i.test(x.lang));
    const r = await b?.voiceWav?.(text, voice?.name);
    if (!r?.wav) return false;
    const src = `data:audio/wav;base64,${r.wav}`;
    const toCall = new Audio(src) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    await toCall.setSinkId?.(cable.deviceId);
    toCall.volume = s?.volume ?? 1;
    // Point Windows' default mic at VB-Cable so Discord (on "Default") hears Jarvis, then switch it back after.
    const swapped = (await b?.cableMic?.(true).catch(() => null))?.ok;
    try {
      if (swapped) await new Promise((res) => setTimeout(res, 900));
      const completed = new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => { toCall.pause(); resolve(false); }, 60000);
        toCall.onended = () => { window.clearTimeout(timer); resolve(true); };
        toCall.onerror = () => { window.clearTimeout(timer); resolve(false); };
      });
      setM("speaking");
      try { await toCall.play(); } catch { toCall.dispatchEvent(new Event("error")); return false; }
      if (!cableOnly) {
        const local = new Audio(src); // so you hear it too
        local.volume = toCall.volume;
        await local.play().catch(() => {});
      }
      if (!(await completed)) return false;
      await new Promise((res) => setTimeout(res, 400));
    } finally {
      if (swapped) await b?.cableMic?.(false).catch(() => null);
      setM("idle");
    }
    return true;
  };

  const runAction = async (act: Action, s: Settings): Promise<string> => {
    const b = bridge();
    if (!b) return "Discord actions are available in the desktop app, sir.";
    if (act.kind === "open") {
      const r = await b.openApp?.(act.app);
      return r?.ok ? `Opening ${r.name}, sir.` : `I couldn't find ${act.app} on this PC, sir.`;
    }
    if (act.kind === "apps") {
      const list = (await b.listApps?.()) ?? [];
      return list.length ? `You have ${list.length} apps, sir, including ${list.slice(0, 12).join(", ")}. Just say "open" and the name.` : "I couldn't read your apps, sir.";
    }
    if (act.kind === "spotify") {
      setReply(`Searching Spotify for "${act.query}"…`);
      const r = await b.spotifyPlay?.(act.query);
      return r?.ok ? `Playing ${act.query} on Spotify, sir.` : `${r?.error ?? "Spotify is unavailable"} sir.`;
    }
    // Discord
    const selection = selectDiscordChannel(s.discordServers ?? [], act.server, s.discordLink);
    if (selection.kind === "missing") return "Save your Discord voice channel link in the Mainframe under Skills first, sir.";
    if (selection.kind === "choose") return "Please tell me the saved voice channel name, sir.";
    if (!b.discordJoin) return "Discord actions are available in the desktop app, sir.";
    const r = await b.discordJoin(selection.channel.link);
    if (r.error) return "That Discord link doesn't look right, sir. Copy the voice channel's link again in the Mainframe.";
    if (r.joined === false) return "I opened the channel, sir, but couldn't press Join Voice. Click it and ask me again.";
    if (!act.message) return "Joining your Discord call, sir.";
    setReply("Joining your Discord call, sir…");
    await new Promise((res) => setTimeout(res, 2500));
    const lines = relayLines(act.message, s.userName ?? "");
    const result = await deliverDiscordMessage(() => sayIntoCable(lines.call), () => b.discordMute?.() ?? Promise.resolve({ ok: false }));
    if (result === "failed") return "I joined, sir, but couldn't play the message through VB-Cable. Check your audio setup in the Mainframe.";
    return result === "muted" ? `${lines.done} Your Discord microphone is now muted.` : `${lines.done} I couldn't confirm your Discord microphone is muted; please mute it yourself.`;
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
          loud = rms > 11 ? loud + 1 : 0;
          if (loud > 4) {
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
    // Only "Hey Jarvis" wakes him; anything else he hears is ignored and never shown.
    const rest = parseWake(text);
    if (rest === null || want.current !== "wake") return;
    if (rest.split(/\s+/).length >= 3) { send(rest); return; }
    want.current = "none";
    setYou(""); setReply("Yes, sir?");
    speak("Yes, sir?", () => listenNow("Yes, sir? I'm listening…"));
  };

  const listenTimer = useRef<number>(0);
  const listenNow = (prompt = "Listening, sir…") => {
    speechSynthesis.cancel();
    startMic();
    want.current = "command";
    setM("listening");
    setYou(""); setReply(prompt);
    window.clearTimeout(listenTimer.current);
    listenTimer.current = window.setTimeout(() => { if (want.current === "command" && modeRef.current === "listening") { if (welcomeStage.current) finishWelcome(); else { endListen(); setReply(""); } } }, 12000);
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
                <span className="text-term-dim">&gt; You:</span>
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
                {you && <div className="text-term-dim">&gt; You: <span className="text-term-text">{you}</span></div>}
                <div>
                  <span className="font-bold text-primary">JARVIS:</span>{" "}
                  <span className="text-term-reply">{mode === "thinking" && !reply ? "processing" : reply}</span>
                  {(mode === "thinking" || mode === "listening") && <span className="term-caret" />}
                </div>
                {newsSources.length > 0 && <ul className="mt-2 space-y-1 text-xs text-term-dim">{newsSources.map((story) => <li key={story.url}><a href={story.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{story.source}</a> · {new Date(story.published).toLocaleDateString("en-GB")}</li>)}</ul>}
              </>
            )}
          </div>
        )}

        <div data-hit onMouseEnter={enter} onMouseLeave={leave} className="flex flex-col items-center gap-2">
          <div className="relative h-32 w-32">
            <button
              onPointerDown={onDown}
              onPointerMove={onDragMove}
              onPointerUp={onUp}
              aria-label="Jarvis — click to talk, drag to move"
              className="jarvis-orb relative h-32 w-32 shrink-0 cursor-grab touch-none active:cursor-grabbing"
            >
              <img src={reactor.url} alt="" draggable={false}
                className={`pointer-events-none absolute inset-0 h-full w-full ${busy ? "animate-spin-fast" : "animate-spin-slow"} ${mode === "listening" || mode === "speaking" ? "animate-core-fast" : ""}`} />
            </button>
          </div>
          <div className={`jarvis-pill -mt-5 mb-1 flex items-center justify-center self-center transition-all duration-200 ${hover || typing ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}>
            <button aria-label="Type to Jarvis" onClick={() => { setTyping(true); setReply(""); setYou(""); }}
              className={`px-3 py-1.5 hover:text-primary ${typing ? "text-primary" : ""}`}>
              <Pencil size={15} />
            </button>
            <span className="h-4 w-px bg-primary/40" />
            <button aria-label="Talk to Jarvis" onClick={() => (mode === "listening" ? (endListen(), setReply("")) : listenNow())}
              className={`px-3 py-1.5 hover:text-primary ${mode === "listening" ? "text-primary" : ""}`}>
              <AudioLines size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
