import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRecentNews } from "@/lib/news.functions";
import { newsTopic, readyMessage, saveNewsTopic, startupGreeting, welcomeAnswer, type WelcomeStage, type NewsStory } from "@/lib/welcome";
import { AudioLines, Pencil } from "lucide-react";
import reactor from "@/assets/jarvis-reactor.png.asset.json";
import { loadMemory, memoryCommand, memoryContext, saveConversation } from "@/lib/memory";
import { selectDiscordChannel } from "@/lib/discord-selection";
import { deliverDiscordMessage } from "@/lib/discord-relay";
import { ASK_GAME, findGame } from "@/lib/game-detect";
import { useRemoteDesktop } from "@/hooks/use-remote-desktop";
import { elevenSpeech } from "@/lib/elevenlabs";
import { findAudioOutput, selectedVoiceAudio } from "@/lib/voice-audio";
import type { DiscordServer } from "@/lib/jarvis";
import { blobToBase64, captureScreen, isClipCommand, isScreenCommand } from "@/lib/screen";
import { cleanNowPlaying, mediaReply } from "@/lib/media";
import { windowReply } from "@/lib/windowctl";
import { nextBanter, spawnDecoys, type Decoy } from "@/lib/legion";
import { RollingReplay } from "@/lib/replay";
import { abortBleep, repulsorHum } from "@/lib/sfx";
import { dossierPrompt, loadDossier, syncDossierFromDisk, titleWord } from "@/lib/dossier";
import { isSnoozed, snoozeLine, snoozeUpdate, updateMessage, type UpdateInfo } from "@/lib/update";
import { capabilitiesLine, consumeVersionChange, selfPrompt, selfQuery, updatedLine, versionLine, whatsNewLine } from "@/lib/changelog";
import { UpdateButton } from "@/components/update-button";
import { asksQuestion, bridge, liveContext, loadSettings, parseAction, parseWake, personaPrompt, relayLines, saveSettings, sentiment, SIZES, SYSTEM_PROMPT, VERSION, type Action, type Settings } from "@/lib/jarvis";

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
  const [quiet, setQuiet] = useState(false);
  const [standby, setStandby] = useState(false);
  const [orbitOn, setOrbitOn] = useState(false);
  const [decoys, setDecoys] = useState<Decoy[]>([]);
  const [legionCollapsing, setLegionCollapsing] = useState(false);
  const [hud, setHud] = useState<{ title: string; steps: string[]; index: number } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>(null);
  const shellVersion = useRef("");
  const history = useRef<Msg[]>([]);
  const pendingDiscord = useRef<{ action: Extract<Action, { kind: "discord" }>; channels: DiscordServer[] } | null>(null);
  const warned = useRef(false);
  const modeRef = useRef<Mode>("idle");
  const want = useRef<"wake" | "command" | "none">("none");
  const settingsRef = useRef<Settings | null>(null);
  const hideTimer = useRef<number>(0);
  const hoverTimer = useRef<number>(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const activeAudio = useRef<HTMLAudioElement[]>([]);
  const speechGeneration = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hudRef = useRef(hud);
  const abortRef = useRef(false);
  const quietRef = useRef(false);
  const standbyRef = useRef(false);
  const legionRef = useRef(false);
  const escArmRef = useRef(0);
  const clickTimer = useRef(0);
  const bootTs = useRef(Date.now());
  const stopSpeech = () => {
    speechGeneration.current += 1;
    activeAudio.current.forEach((audio) => { audio.pause(); audio.dispatchEvent(new Event("error")); });
    activeAudio.current = [];
    speechSynthesis.cancel();
  };
  modeRef.current = mode;
  settingsRef.current = settings;
  hudRef.current = hud;
  quietRef.current = quiet;
  standbyRef.current = standby;
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
    syncDossierFromDisk();
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
      // ---- hotkeys & protocol relays from the desktop shell ----
      if (name === "summon") { setTyping(true); setReply(""); setYou(""); b?.setIgnore(false); window.setTimeout(() => inputRef.current?.focus(), 80); }
      if (name === "quiet-protocol") toggleQuiet();
      if (name === "unsnap") { setOrbitOn(false); flash("Unsnapped, sir. Free-floating desktop mode."); }
      if (name === "update-available") {
        const info = arg as { tag: string; url: string; download?: string | null };
        if (!isSnoozed(info.tag) && sessionStorage.getItem("jarvis-update-shown") !== info.tag) {
          sessionStorage.setItem("jarvis-update-shown", info.tag);
          setUpdateInfo(info);
          const msg = updateMessage(info, titleWord(loadDossier()));
          flash(msg); speak(msg);
        }
      }
      if (name === "esc-hit") handleEscHit(!!(arg as { held?: boolean } | undefined)?.held);
      if (name === "abort-protocol") abortRef.current = true;
    });
    if (!s.alwaysOnTop) b?.cmd("always-on-top", false);
    startMic();
    b?.appInfo?.().then((i) => { if (i?.version) shellVersion.current = i.version; }).catch(() => {});
    // Each desktop window session welcomes once; reloads and opening settings do not repeat it.
    const welcomeTimer = window.setTimeout(() => {
      if (!b || sessionStorage.getItem("jarvis-welcomed") || modeRef.current !== "idle") return;
      sessionStorage.setItem("jarvis-welcomed", "yes");
      const tw = titleWord(loadDossier());
      const from = consumeVersionChange(shellVersion.current || VERSION);
      const greet = startupGreeting(new Date(), newsTopic(), tw);
      askWelcome(from ? `${updatedLine(from, shellVersion.current || VERSION, tw.toLowerCase())} ${greet}` : greet, "offer");
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
    stopSpeech();
    const generation = speechGeneration.current;
    const s = settingsRef.current;
    if (!s?.voiceOn) { setM("idle"); then?.(); return; }
    const finish = () => { setM("idle"); if (then) { then(); return; } hideTimer.current = window.setTimeout(() => { if (modeRef.current === "idle") { setReply(""); setYou(""); } }, 8000); };
    if (s.voiceEngine === "eleven" && s.elevenKey && s.elevenVoice) {
      setM("speaking"); setMood(text);
      speechSynthesis.cancel();
      elevenSpeech(text, s.elevenKey, s.elevenVoice, s.elevenModel).then((blob) => {
        if (generation !== speechGeneration.current) return;
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        activeAudio.current = [a];
        a.volume = s.volume ?? 1;
        a.onended = () => { URL.revokeObjectURL(url); activeAudio.current = []; if (generation === speechGeneration.current) finish(); };
        a.onerror = () => { URL.revokeObjectURL(url); activeAudio.current = []; if (generation === speechGeneration.current) systemSpeak(text, then); };
        return a.play();
      }).catch(() => { if (generation === speechGeneration.current) systemSpeak(text, then); }); // out of credits / bad key / offline -> default voice
      return;
    }
    systemSpeak(text, then);
  };
  const systemSpeak = (text: string, then?: () => void) => {
    const s = settingsRef.current;
    if (!s) { setM("idle"); then?.(); return; }
    if (!("speechSynthesis" in window)) { setM("idle"); then?.(); return; }
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
    const text = [prefix, readyMessage(titleWord(loadDossier()))].filter(Boolean).join(" ");
    setReply(text); speak(text);
  };
  const readNews = async (topic: string) => {
    welcomeStage.current = null;
    saveNewsTopic(topic);
    want.current = "none";
    setM("thinking"); setReply(`Checking recent news about ${topic}, ${titleWord(loadDossier()).toLowerCase()}…`);
    try {
      const result = await fetchNews({ data: { topic } });
      setNewsSources(result.stories);
      const headlines = result.stories.map((story) => `${story.source}: ${story.title}.`).join(" ");
      finishWelcome(result.error || `Here are the recent public headlines about ${topic}. ${headlines}`);
    } catch { finishWelcome(`I couldn't reach the news right now, ${titleWord(loadDossier()).toLowerCase()}. I won't make up an update.`); }
  };

  // ---------- brain ----------
  const replay = useRef(new RollingReplay());
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
    const parsed = parseAction(t);
    if (isClipCommand(t)) {
      const b = bridge();
      if (!b?.saveClip) { setReply("Clipping only works in the desktop app, sir."); speak("Clipping only works in the desktop app, sir."); return; }
      const say = (m: string) => { setReply(m); speak(m); };
      if (!replay.current.running) {
        const secs = s.replaySeconds || 30;
        say(`Rolling the replay buffer now, sir — ${secs} seconds of continuous capture. Say clip that again and I'll save it.`);
        replay.current.start(secs, 30).catch(() => say("I couldn't record your screen, sir."));
        return;
      }
      const blob = await replay.current.clip();
      if (!blob) { say("There's nothing recorded yet, sir."); return; }
      const r = await b.saveClip(await blobToBase64(blob));
      say(r?.ok ? `Clipped, sir. The last ${replay.current.seconds} seconds are in your Videos folder under Jarvis Clips.` : "I couldn't save that clip, sir.");
      return;
    }
    // Live share beats the vision path ("share my screen" streams, it doesn't describe).
    if (parsed?.kind === "share") {
      const said = await runAction(parsed, s).catch(() => "Something went wrong doing that, sir.");
      setReply(said); speak(said);
      return;
    }
    if (isScreenCommand(t)) {
      setM("thinking"); setReply("Looking at your screen…");
      const shot = await captureScreen();
      if (!shot) { setM("idle"); setReply("I couldn't see your screen, sir."); speak("I couldn't see your screen, sir."); return; }
      const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: t, image: shot }) }).then((x) => x.json()).catch(() => ({ error: "My eyes are offline, sir." }));
      setM("idle");
      const said = String(r.text || r.error || "I couldn't make that out, sir.");
      setReply(said); speak(said);
      return;
    }
    const pending = pendingDiscord.current;
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
    // Custom skill mods: say the trigger phrase and Jarvis runs every step under the protocol HUD.
    const modHit = (s.customMods ?? []).find((m2) => m2.enabled !== false && m2.trigger.trim() && new RegExp(`\\b${m2.trigger.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
    if (modHit && bridge()) {
      setYou(t);
      const said = await runProtocol(modHit.name || "Custom mod", modHit.steps.map((cmd) => ({ label: cmd.slice(0, 44), run: () => executeModStep(cmd, s) })));
      history.current = [...loadMemory().history, { role: "user" as const, content: t }, { role: "assistant" as const, content: said }].slice(-20);
      saveConversation(history.current);
      setReply(said); speak(said);
      return;
    }
    const remembered = memoryCommand(t);
    if (remembered) { history.current = loadMemory().history; setReply(remembered); speak(remembered); return; }
    const self = parsed ? null : selfQuery(t);
    if (self) {
      const tw = titleWord(loadDossier()).toLowerCase();
      const shell = shellVersion.current || VERSION;
      let said = self === "version" ? versionLine(shell, VERSION, tw)
        : self === "whats-new" ? whatsNewLine(shell, tw)
        : self === "capabilities" ? capabilitiesLine(tw) : "";
      if (self === "updates") {
        const b = bridge();
        if (!b?.checkUpdates) said = `Update checks run in the desktop app, ${tw}. You're on version ${shell}.`;
        else {
          setM("thinking"); setReply("Checking GitHub for updates…");
          const r = await b.checkUpdates().catch(() => null);
          setM("idle");
          if (!r) said = `I couldn't reach GitHub just now, ${tw}. You're on version ${shell}.`;
          else if (!r.newer) said = `You're on the latest version, ${tw} — ${shell}.`;
          else { setUpdateInfo(r); said = updateMessage(r, titleWord(loadDossier())); }
        }
      }
      history.current = [...loadMemory().history, { role: "user" as const, content: t }, { role: "assistant" as const, content: said }].slice(-20);
      saveConversation(history.current);
      setReply(said); speak(said);
      return;
    }
    history.current = loadMemory().history;
    history.current = [...history.current, { role: "user" as const, content: t }].slice(-20);
    setM("thinking");
    let full = "";
    if (parsed) {
      const said = await runAction(parsed, s).catch(() => "Something went wrong doing that, sir.");
      history.current.push({ role: "assistant", content: said });
      saveConversation(history.current);
      setReply(said);
      speak(said);
      return;
    }
    try {
      const context = [await liveContext(t, history.current), memoryContext()].filter(Boolean).join("\n\n");
      const persona = personaPrompt(s);
      const dossier = [dossierPrompt(loadDossier()), selfPrompt(shellVersion.current || VERSION, VERSION)].filter(Boolean).join("\n");
      const system = [SYSTEM_PROMPT, persona, dossier].filter(Boolean).join("\n") + `\n\n${context}`;
      const cloud = async (provider: "builtin" | "chatgpt") => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.current, provider, context: [persona, dossier, context].filter(Boolean).join("\n\n") }),
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
          if (!warned.current) { warned.current = true; full += " (Using my cloud brain for now — you can set up local AI in the Mainframe.)"; }
        } else if (err) throw new Error(err);
        setReply(full);
      } else {
        await cloud(s.brain);
      }
      history.current.push({ role: "assistant", content: full });
      saveConversation(history.current);
      // If Jarvis asked something, open the mic for the answer straight away.
      speak(full, asksQuestion(full) ? () => {
        window.setTimeout(() => { if (modeRef.current === "idle" && want.current === "none") listenNow("Your answer, sir…"); else if (modeRef.current === "idle") listenNow("Your answer, sir…"); }, 350);
      } : undefined);
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

  let cableFailure = "Unknown audio failure";
  const sayIntoCable = async (text: string) => {
    cableFailure = "Audio playback did not start";
    const b = bridge();
    const s = settingsRef.current;
    if (!s) { cableFailure = "Jarvis settings are unavailable"; return false; }
    stopSpeech();
    const generation = speechGeneration.current;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const systemDevices = await b?.audioDevices?.().catch(() => null);
    const isCablePlayback = (name: string) => /cable input|vb-audio.*input/i.test(name);
    const isCableRecording = (name: string) => /cable output|vb-audio.*output/i.test(name);
    const cable = s.cableIn ? findAudioOutput(devs, s.cableIn) : devs.find((d) => d.kind === "audiooutput" && !["default", "communications"].includes(d.deviceId) && isCablePlayback(d.label));
    if (!cable) {
      const available = devs.filter((d) => d.kind === "audiooutput").map((d) => d.label).filter(Boolean).slice(0, 5).join(", ");
      cableFailure = `VB-CABLE playback device isn't visible to Jarvis. Check Windows Sound settings and browser audio permissions. Playback devices: ${available || "none available"}.`;
      return false;
    }
    if (systemDevices && !systemDevices.inputs.some(isCableRecording)) {
      cableFailure = "Windows cannot find VB-CABLE's recording endpoint (CABLE Output). Enable it under Sound > More sound settings > Recording, then retry.";
      return false;
    }
    const voices = "speechSynthesis" in window ? speechSynthesis.getVoices() : [];
    const voice = voices.find((x) => x.name === s.voiceName) || voices.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|thomas|male/i.test(x.name)) || voices.find((x) => /en-GB/i.test(x.lang));
    setM("speaking");
    const blob = await selectedVoiceAudio(text, s, elevenSpeech, async () => {
      const r = await b?.voiceWav?.(text, voice?.name);
      return r?.wav ? (await fetch(`data:audio/wav;base64,${r.wav}`)).blob() : null;
    });
    if (!blob || generation !== speechGeneration.current) { cableFailure = blob ? "Speech was interrupted" : "Voice generation failed. Test your ElevenLabs voice or Windows speech engine."; setM("idle"); return false; }
    const src = URL.createObjectURL(blob);
    const toCall = new Audio(src) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    const local = new Audio(src) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    const audio = { cableIn: s.cableIn, cableOut: s.cableOut, preserveOutput: true };
    let swapped = false;
    try {
      // Route only call speech into the cable; leave speakers/Discord output alone.
      if (!toCall.setSinkId) { cableFailure = "This audio engine does not support selecting a playback device"; return false; }
      await toCall.setSinkId(cable.deviceId);
      const localOutput = s.audioOut ? findAudioOutput(devs, s.audioOut) : undefined;
      if (localOutput?.deviceId === cable.deviceId || (s.audioOut && !localOutput)) { cableFailure = "Your headphone output is missing or set to CABLE Input"; return false; }
      await local.setSinkId?.(localOutput?.deviceId ?? "default");
      toCall.volume = local.volume = s.volume;
      toCall.playbackRate = local.playbackRate = s.voiceEngine === "system" ? s.rate : 1;
      const switchResult = await b?.cableMic?.(true, audio);
      swapped = !!switchResult?.ok;
      if (!swapped) { cableFailure = `Could not switch the Windows microphone: ${switchResult?.error ?? "Desktop bridge unavailable"}`; return false; }
      await new Promise((res) => setTimeout(res, 900));
      if (generation !== speechGeneration.current) return false;
      const completed = new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => { toCall.pause(); resolve(false); }, 60000);
        toCall.onended = () => { window.clearTimeout(timer); resolve(true); };
        toCall.onerror = () => { window.clearTimeout(timer); resolve(false); };
      });
      activeAudio.current = [toCall, local];
      try { await toCall.play(); } catch (error) { cableFailure = `Playback to CABLE Input failed: ${String(error)}`; toCall.dispatchEvent(new Event("error")); return false; }
      await local.play().catch(() => {});
      if (!(await completed)) { cableFailure = "Playback stopped, timed out or encountered a media error"; return false; }
      await new Promise((res) => setTimeout(res, 400));
      return true;
    } catch (error) { cableFailure = `Audio routing error: ${String(error)}`; return false; }
    finally {
      toCall.pause(); local.pause(); activeAudio.current = [];
      URL.revokeObjectURL(src);
      if (swapped) await b?.cableMic?.(false, audio).catch(() => null);
      setM("idle");
    }
  };

  // Hear the call: record what Windows plays (your friends in Discord) for a short window, then transcribe it.
  const hearCall = async (seconds = 12): Promise<string> => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach((t) => t.stop());
      const audio = new MediaStream(stream.getAudioTracks());
      if (!audio.getAudioTracks().length) return "";
      const rec = new MediaRecorder(audio, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start();
      setReply("Listening to the call…");
      setM("listening");
      await new Promise((res) => setTimeout(res, seconds * 1000));
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: "audio/webm" });
      if (blob.size < 3000) return "";
      const fd = new FormData();
      fd.append("audio", blob, "call.webm");
      const r = await fetch("/api/transcribe", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({}));
      return typeof r.text === "string" ? r.text : "";
    } catch {
      return "";
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setM("idle");
    }
  };

  const askWhatGame = async (b: NonNullable<ReturnType<typeof bridge>>): Promise<string> => {
    if (!(await sayIntoCable(ASK_GAME))) return "";
    const heard = await hearCall();
    if (!heard) return " I couldn't hear what they're playing.";
    const game = findGame(heard, (await b.listApps?.()) ?? []);
    if (!game) return ` They said: "${heard.slice(0, 80)}", but I couldn't find that game on your PC.`;
    const r = await b.openApp?.(game);
    if (!r?.ok) return ` They want ${game}, but I couldn't open it.`;
    await sayIntoCable(`Booting up ${r.name ?? game} on my boss's PC now.`);
    return ` They're playing ${r.name ?? game}, so I've started it for you.`;
  };

  // ---------- automation: reticle sweep + steps HUD + ESC abort ----------
  const runProtocol = async (title: string, steps: { label: string; run: () => Promise<string> }[]): Promise<string> => {
    const b = bridge();
    abortRef.current = false;
    b?.cmd("grab-esc");
    setHud({ title, steps: steps.map((st) => st.label), index: 0 });
    try {
      for (let i = 0; i < steps.length; i++) {
        if (abortRef.current) { abortBleep(); return "Protocol aborted, sir. Manual control restored."; }
        const step = steps[i];
        if (!step) break;
        setHud({ title, steps: steps.map((st) => st.label), index: i });
        b?.cmd("reticle-step", { index: i, total: steps.length, label: step.label });
        const said = await step.run();
        if (abortRef.current) { abortBleep(); return "Protocol aborted, sir. Manual control restored."; }
        if (i === steps.length - 1) return said || "Done, sir.";
      }
      return "Done, sir.";
    } catch (e) {
      return e instanceof Error && e.message ? e.message : "Something went wrong during the protocol, sir.";
    } finally {
      setHud(null);
      b?.cmd("reticle-hide");
      b?.cmd("release-esc");
    }
  };

  const executeModStep = async (cmd: string, s: Settings): Promise<string> => {
    const parsed = parseAction(cmd);
    if (!parsed) return `Skipped "${cmd}" — I don't know that step, sir.`;
    return runAction(parsed, s);
  };

  // ---------- Iron Legion (local fallback when the overlay window isn't available) ----------
  const spawnLegion = () => {
    const b = bridge();
    legionRef.current = true;
    setLegionCollapsing(false);
    escArmRef.current = 0;
    if (b) b.cmd("decoys", true); else setDecoys(spawnDecoys(3, window.innerWidth, window.innerHeight));
    b?.cmd("grab-esc");
  };
  const dismissLegion = (msg?: string) => {
    legionRef.current = false;
    setDecoys([]);
    setLegionCollapsing(false);
    const b = bridge();
    b?.cmd("decoys", false);
    b?.cmd("release-esc");
    if (msg) flash(msg);
  };
  const handleEscHit = (held: boolean) => {
    if (hudRef.current) { abortRef.current = true; return; }
    if (!legionRef.current) return;
    if (held || Date.now() - escArmRef.current <= 1500) {
      abortBleep();
      dismissLegion("Legion disbanded, sir. Desktop restored.");
    } else {
      escArmRef.current = Date.now();
      setLegionCollapsing(true);
      flash("Disbanding the Legion — press ESC again to confirm, sir.");
      window.setTimeout(() => setLegionCollapsing(false), 1700);
    }
  };
  // ESC fallback for the browser (the desktop shell grabs ESC globally during protocols).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (hudRef.current) { abortRef.current = true; return; }
      if (legionRef.current) handleEscHit(Date.now() - escArmRef.current <= 1500);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!decoys.length) return;
    const t = window.setInterval(() => setDecoys((ds) => ds.map((d) => ({ ...d, line: nextBanter(d.line) }))), 2800);
    return () => window.clearInterval(t);
  }, [decoys.length]);

  const runAction = async (act: Action, s: Settings): Promise<string> => {
    const b = bridge();
    if (!b) return "That action needs the desktop app, sir — it works when Jarvis runs on your PC.";
    const mod = (id: string) => s.mods?.[id] !== false;
    if (act.kind === "discord-control") {
      const r = act.action === "mute" ? await b.discordMute?.() : await b.discordDeafen?.();
      if (r?.ok) return act.action === "mute" ? "Your Discord microphone is muted, sir." : "Discord is deafened, sir.";
      return `${r?.error || "I could not confirm the Discord control"} — please check Discord, sir.`;
    }
    if (act.kind === "discord-text") {
      const saved = (s.discordServers ?? []).find((c) => c.name.toLowerCase().replace(/^#/, "") === act.channel.toLowerCase());
      if (!saved) return `I don't have a saved Discord channel named ${act.channel}, sir. Add its text channel link in Mainframe Skills first.`;
      const r = await b.discordMessage?.(saved.link, act.message);
      return r?.ok ? `Sent your message to ${act.channel}, sir.` : `${r?.error || "I couldn't confirm the message was sent"}, sir.`;
    }
    if (act.kind === "open") {
      const r = await b.openApp?.(act.app);
      return r?.ok ? `Opening ${r.name}, sir.` : `I couldn't find ${act.app} on this PC, sir.`;
    }
    if (act.kind === "apps") {
      const list = (await b.listApps?.()) ?? [];
      return list.length ? `You have ${list.length} apps, sir, including ${list.slice(0, 12).join(", ")}. Just say "open" and the name.` : "I couldn't read your apps, sir.";
    }
    if (act.kind === "media") {
      if (!mod("media")) return "The media engine is switched off in the Mainframe, sir.";
      if (act.action === "whatsplaying") {
        const r = await b.nowPlaying?.().catch(() => ({ playing: null }));
        const playing = r?.playing ?? null;
        return mediaReply("whatsplaying", playing ? cleanNowPlaying(playing.player, playing.title) : null);
      }
      const r = await b.mediaKey?.(act.action);
      if (r && r.error) return `${r.error}${/sir/i.test(r.error) ? "" : ", sir"}`;
      return mediaReply(act.action);
    }
    if (act.kind === "window") {
      if (!mod("windows")) return "Window control is switched off in the Mainframe, sir.";
      const r = await b.windowControl?.(act.action, act.app);
      if (r?.error && r.error !== "notfound") return `${r.error} sir.`;
      return windowReply(act.action, act.app, !!r?.ok);
    }
    if (act.kind === "orbit") {
      b.orbit?.(act.on);
      setOrbitOn(act.on);
      return act.on ? "Orbiting your cursor like a holographic drone, sir. Say stop following my cursor to drop." : "Dropped out of orbit, sir.";
    }
    if (act.kind === "legion") {
      if (!mod("legion")) return "The Iron Legion is switched off in the Mainframe, sir.";
      if (act.on) { spawnLegion(); return "Iron Legion deployed, sir. Three decoys on patrol — press ESC twice to disband them."; }
      dismissLegion("Legion disbanded, sir.");
      return "Legion disbanded, sir.";
    }
    if (act.kind === "quiet") {
      if (!mod("quiet")) return "The quiet protocol is switched off in the Mainframe, sir.";
      const wasQuiet = quietRef.current;
      toggleQuiet();
      return wasQuiet ? "Quiet protocol lifted, sir. Listening again." : "Quiet protocol engaged, sir. I'll stay dimmed and silent until you toggle me again.";
    }
    if (act.kind === "standby") {
      if (standbyRef.current === act.on) return act.on ? "Already standing by, sir." : "Already online, sir.";
      toggleStandby();
      return act.on ? "Entering standby, sir. Double-click the reactor to wake me." : "Powered back up, sir.";
    }
    if (act.kind === "share") {
      if (!mod("share")) return "Live share is switched off in the Mainframe, sir.";
      b.openShare?.();
      return "Opening the live share view, sir.";
    }
    if (act.kind === "spotify") {
      return runProtocol("Spotify", [
        { label: "Launching Spotify", run: async () => { try { await b.openApp?.("Spotify"); } catch { /* tolerate missing app */ } return ""; } },
        { label: `Searching "${act.query}"`, run: async () => {
            const r = await b.spotifyPlay?.(act.query);
            if (!r?.ok) throw new Error(`${r?.error ?? "Spotify is unavailable"} sir.`);
            return "";
          } },
        { label: "Playing", run: async () => `Playing ${act.query} on Spotify, sir.` },
      ]);
    }
    // Discord
    const selection = selectDiscordChannel(s.discordServers ?? [], act.server, s.discordLink);
    if (selection.kind === "missing") return "Save your Discord voice channel link in the Mainframe under Skills first, sir.";
    if (selection.kind === "choose") return "Please tell me the saved voice channel name, sir.";
    if (!b.discordJoin) return "Discord actions are available in the desktop app, sir.";
    const lines = relayLines(act.message, s.userName ?? "");
    let gameNote = "";
    return runProtocol("Discord", [
      { label: "Opening the channel", run: async () => {
          const r = await b.discordJoin?.(selection.channel.link);
          if (!r || r.error) throw new Error("That Discord link doesn't look right, sir. Copy the voice channel's link again in the Mainframe.");
          if (r.joined === false) throw new Error("I opened the channel, sir, but couldn't press Join Voice. Click it and ask me again.");
          return "";
        } },
      { label: "Delivering your message", run: async () => {
          setReply("Joining your Discord call, sir…");
          await new Promise((res) => setTimeout(res, 2500));
          if (!(await sayIntoCable(lines.call))) throw new Error(`I could not deliver the Discord message: ${cableFailure}. Check the Mainframe VB-CABLE test.`);
          return "";
        } },
      ...(s.askGame ? [{ label: "Checking what they're playing", run: async () => { gameNote = await askWhatGame(b); return ""; } }] : []),
      { label: "Muting your microphone", run: async () => {
          const result = await deliverDiscordMessage(async () => true, () => b.discordMute?.() ?? Promise.resolve({ ok: false }));
          if (result === "muted") return `${lines.done}${gameNote} Your Discord microphone is now muted.`;
          return `${lines.done}${gameNote} I couldn't confirm your Discord microphone is muted; please mute it yourself.`;
        } },
    ]);
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
      // A suspended context hears only silence, so "Hey Jarvis" never triggered.
      if (ctx.state !== "running") await ctx.resume().catch(() => {});
      window.addEventListener("pointerdown", () => { if (ctx.state !== "running") ctx.resume(); });
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
        const active = want.current !== "none" && !busy && !quietRef.current && !standbyRef.current;
        if (!rec && active) {
          loud = rms > 5 ? loud + 1 : 0;
          if (loud > 2) {
            chunks = [];
            rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
            rec.ondataavailable = (e) => chunks.push(e.data);
            const r = rec;
            r.onstop = () => { const blob = new Blob(chunks, { type: "audio/webm" }); if (blob.size > 3000) handleClip(blob); };
            rec.start();
            started = performance.now(); quiet = 0;
          }
        } else if (rec) {
          quiet = rms < 4 ? quiet + 1 : 0;
          if (quiet > 40 || performance.now() - started > 9000 || busy) { rec.stop(); rec = null; loud = 0; }
        }
      };
      // A timer keeps listening even when the window isn't focused (animation frames pause).
      window.setInterval(tick, 20);
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
    stopSpeech();
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

  // ---------- quiet protocol & standby ----------
  const toggleQuiet = () => {
    const next = !quietRef.current;
    quietRef.current = next;
    setQuiet(next);
    if (next) { stopSpeech(); endListen(); want.current = "none"; flash("Quiet protocol engaged. My ears are dimmed until you toggle me again, sir."); }
    else { want.current = settingsRef.current?.wakeWord ? "wake" : "none"; flash("Quiet protocol lifted, sir. Listening again."); }
  };
  const toggleStandby = () => {
    const next = !standbyRef.current;
    standbyRef.current = next;
    setStandby(next);
    if (next) { repulsorHum("sleep"); stopSpeech(); endListen(); want.current = "none"; flash("Entering standby. Double-click me to wake, sir."); }
    else { repulsorHum("wake"); flash("Systems online, sir."); }
  };

  const onLogoClick = () => {
    if (standbyRef.current) { toggleStandby(); return; }
    if (mode === "speaking") { stopSpeech(); setM("idle"); return; }
    if (mode === "listening") { endListen(); setReply(""); return; }
    if (mode === "idle") listenNow();
  };
  const onReactorClick = () => {
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = 0; toggleStandby(); return; }
    clickTimer.current = window.setTimeout(() => { clickTimer.current = 0; onLogoClick(); }, 320);
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
    if (d && !d.moved) onReactorClick();
  };

  const enter = () => { window.clearTimeout(hoverTimer.current); setHover(true); };
  const leave = () => { hoverTimer.current = window.setTimeout(() => setHover(false), 600); };

  // ---------- Discord Rich Presence: live activity on every state change ----------
  useEffect(() => {
    const b = bridge();
    const s = settingsRef.current;
    if (!b?.rpcActivity) return;
    if (!s?.discordRpc || !s.discordAppId) { b.rpcDisable?.(); return; }
    const state = standby ? "Standby mode — core dimmed"
      : quiet ? "Quiet protocol engaged"
      : mode === "listening" ? "Listening for your voice"
      : mode === "thinking" ? "Analyzing your request"
      : mode === "speaking" ? "Relaying audio"
      : orbitOn ? "Orbiting your cursor"
      : "All systems operational";
    b.rpcActivity({ appId: s.discordAppId, details: "Jarvis Desktop Companion", state, asset: s.rpcAsset || "jarvis", startTimestamp: bootTs.current });
  }, [mode, quiet, standby, orbitOn, settings?.discordRpc, settings?.discordAppId, settings?.rpcAsset]);

  const scale = SIZES[settings?.size ?? "medium"];
  const busy = mode === "thinking" || mode === "speaking";
  const dormant = quiet || standby;
  const showPanel = typing || !!reply || !!you;

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none" style={{ background: "transparent" }}>
      {hud && (
        <div data-testid="steps-hud" className="steps-hud">
          <div className="hud-title">[ PROTOCOL EXECUTION ]</div>
          {hud.steps.map((label, i) => (
            <div key={i} className={`step ${i < hud.index ? "done" : i === hud.index ? "active" : "pending"}`}>[{i + 1}/{hud.steps.length}] {label}</div>
          ))}
          <div className="abort">[ESC TO ABORT]</div>
        </div>
      )}
      {updateInfo && (
        <div data-testid="update-toast" className="jarvis-term update-toast absolute right-2 top-2 w-64 px-3 py-2 font-mono text-[11px] text-term-text">
          Firmware {updateInfo.tag.replace(/^v/, "")} ready on <button data-testid="update-open-button" className="text-primary underline" onClick={() => bridge()?.openUrl?.(updateInfo.url)}>GitHub</button>.
          {updateInfo.download && <UpdateButton />}
          <button data-testid="update-later-button" className="mt-1.5 block font-hud text-[10px] tracking-wider text-term-dim hover:text-primary"
            onClick={() => { const until = snoozeUpdate(updateInfo.tag); setUpdateInfo(null); window.setTimeout(() => bridge()?.checkUpdates?.(), until - Date.now() + 1000); const m = snoozeLine(until, titleWord(loadDossier()).toLowerCase()); flash(m); speak(m); }}>
            REMIND ME TONIGHT
          </button>
        </div>
      )}
      {decoys.length > 0 && (
        <div data-testid="iron-legion-local" className="pointer-events-none absolute inset-0">
          {decoys.map((d) => (
            <div key={d.id} data-testid={`iron-legion-decoy-${d.id}`} className={`decoy ${legionCollapsing ? "decoy-collapsing" : ""}`} style={{ transform: `translate(${d.x}px, ${d.y}px)` }}>
              <span className="decoy-bubble">{d.line}</span>
              <img src={reactor.url} alt="" draggable={false} />
            </div>
          ))}
        </div>
      )}
      <div className="absolute bottom-2 left-1/2 flex w-[340px] flex-col items-center gap-2" style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: "bottom center" }}>
        {showPanel && (
          <div data-hit className="jarvis-term w-full px-4 py-3 font-mono text-[13px] leading-relaxed">
            {typing ? (
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-1">
                <span className="text-term-dim">&gt; You:</span>
                <input
                  ref={inputRef}
                  autoFocus
                  data-testid="terminal-input"
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
              onDoubleClick={() => toggleStandby()}
              aria-label="Jarvis — click to talk, double-click for standby, drag to move"
              className={`jarvis-orb relative h-32 w-32 shrink-0 cursor-grab touch-none active:cursor-grabbing ${dormant ? "orb-dormant" : ""}`}
            >
              <img src={reactor.url} alt="" draggable={false}
                className={`pointer-events-none absolute inset-0 h-full w-full ${busy ? "animate-spin-fast" : "animate-spin-slow"} ${mode === "listening" || mode === "speaking" ? "animate-core-fast" : ""}`} />
            </button>
          </div>
          <div className={`jarvis-pill -mt-5 mb-1 flex items-center justify-center self-center transition-all duration-200 ${hover || typing ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}>
            <button aria-label="Type to Jarvis" data-testid="type-button" onClick={() => { setTyping(true); setReply(""); setYou(""); }}
              className={`px-3 py-1.5 hover:text-primary ${typing ? "text-primary" : ""}`}>
              <Pencil size={15} />
            </button>
            <span className="h-4 w-px bg-primary/40" />
            <button aria-label="Talk to Jarvis" data-testid="talk-button" onClick={() => (mode === "listening" ? (endListen(), setReply("")) : listenNow())}
              className={`px-3 py-1.5 hover:text-primary ${mode === "listening" ? "text-primary" : ""}`}>
              <AudioLines size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
