import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Send, Square, Unplug, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { remoteRequest } from "@/lib/remote.functions";
import type { RemoteResult } from "@/lib/remote-schema";
import reactor from "@/assets/jarvis-reactor.png.asset.json";

export const Route = createFileRoute("/remote")({
  head: () => ({ meta: [
    { title: "Jarvis Phone Remote" },
    { name: "description", content: "Your private remote for sending Discord voice messages through Jarvis on your PC." },
    { property: "og:title", content: "Jarvis Phone Remote" },
    { property: "og:description", content: "Send a voice-channel message to your paired Jarvis desktop." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PhoneRemote,
});

function PhoneRemote() {
  const request = useServerFn(remoteRequest);
  const [token, setToken] = useState("");
  const [pairing, setPairing] = useState("");
  const [state, setState] = useState<RemoteResult>({});
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    const saved = localStorage.getItem("jarvis-phone-token") ?? "";
    if (/^[a-f0-9]{64}$/.test(fragment)) {
      localStorage.setItem("jarvis-phone-token", fragment);
      window.history.replaceState(null, "", window.location.pathname);
      setToken(fragment);
    } else setToken(saved);
    return () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); };
  }, []);
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { const result = await request({ data: { op: "status", token } }); if (!stopped) setState(result); }
      catch { if (!stopped) setState({ error: "PC status is unavailable. Try again shortly." }); }
      if (!stopped) timer = setTimeout(refresh, 3000);
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [token, request]);
  const send = async () => {
    setBusy(true); setNotice("");
    try {
      const result = await request({ data: { op: "send", token, text, channel: channel || undefined } });
      if (result.error) setNotice(result.error); else setNotice("Sent to your PC.");
    } catch { setNotice("Could not send. Try again."); }
    finally { setBusy(false); }
  };
  const record = async () => {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    setNotice("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => chunks.push(event.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false); setBusy(true);
        const fd = new FormData();
        fd.append("audio", new Blob(chunks, { type: rec.mimeType }), "phone-message");
        try {
          const result = await fetch("/api/transcribe", { method: "POST", body: fd }).then((response) => response.json());
          if (result.text) setText(result.text); else setNotice(result.error ?? "No speech heard. Try again.");
        } catch { setNotice("Could not transcribe. You can type instead."); }
        finally { setBusy(false); }
      };
      rec.start(); setRecording(true);
      window.setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 15000);
    } catch { setNotice("Microphone unavailable. You can type your message."); }
  };
  const channels = state.channels ?? [];
  return <main className="min-h-screen bg-term-bg px-5 py-8 text-term-text">
    <div className="mx-auto max-w-lg space-y-6">
      <header className="flex items-center gap-4 border-b border-primary/30 pb-5"><img src={reactor.url} alt="" className="h-16 w-16" /><div><h1 className="font-hud text-xl text-primary">JARVIS</h1><p className="font-mono text-xs text-term-dim">PHONE REMOTE</p></div></header>
      {!token ? <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const value = pairing.includes("#") ? pairing.split("#").pop() ?? "" : pairing.trim();
        if (!/^[a-f0-9]{64}$/.test(value)) { setNotice("Paste the private phone link from your PC's Mainframe."); return; }
        localStorage.setItem("jarvis-phone-token", value); setToken(value);
      }}><label className="block font-mono text-sm">Private phone link<input aria-label="Private phone link" value={pairing} onChange={(event) => setPairing(event.target.value)} className="mt-2 w-full border border-primary/40 bg-term-bg p-3" /></label><Button type="submit"><Monitor size={16} />Connect PC</Button></form> : <>
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-mono text-sm"><Monitor size={16} />Main PC · {state.online ? "Online" : "Offline"}</span><Button size="icon" variant="ghost" aria-label="Forget this phone pairing" onClick={() => { localStorage.removeItem("jarvis-phone-token"); setToken(""); setState({}); }}><Unplug size={18} /></Button></div>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          {!!channels.length && <fieldset><legend className="mb-2 font-mono text-xs text-term-dim">VOICE CHANNEL</legend><div className="flex flex-wrap gap-2">{channels.map((name) => <Button key={name} type="button" variant={channel === name ? "default" : "outline"} aria-pressed={channel === name} onClick={() => setChannel(name)}>{name}</Button>)}</div></fieldset>}
          <textarea aria-label="Message for Jarvis" placeholder="Hey Jarvis, join VC and tell my friend I will be a second." value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={5} className="w-full resize-y border border-primary/40 bg-term-bg p-3 font-mono text-sm outline-none focus:border-primary" />
          <div className="flex gap-3"><Button type="button" variant="outline" aria-label={recording ? "Stop recording" : "Record message"} disabled={busy} onClick={record}>{recording ? <Square size={17} /> : <Mic size={17} />}{recording ? "Stop" : "Speak"}</Button><Button type="submit" className="flex-1" disabled={busy || recording || !text.trim() || !state.online || (channels.length > 1 && !channel)}><Send size={17} />Send to PC</Button></div>
        </form>
        <section className="space-y-3 border-t border-primary/30 pt-5" aria-label="Command results">{state.jobs?.map((job) => <article key={job.id} className="border-b border-primary/20 pb-3 font-mono text-xs"><p className="text-term-dim">{job.text}</p><p className="mt-1 text-primary">{job.result || (job.status === "running" ? "Jarvis is working…" : job.status)}</p></article>)}</section>
      </>}
      {(notice || state.error) && <p role="status" className="break-words font-mono text-sm text-term-dim">{state.error || notice}</p>}
    </div>
  </main>;
}