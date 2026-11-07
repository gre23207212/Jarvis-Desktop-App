import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Smartphone, Unplug, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { remoteRequest } from "@/lib/remote.functions";
import { createRemoteToken, readRemoteToken, storeRemoteToken } from "@/lib/remote-storage";
import { bridge } from "@/lib/jarvis";

export function PhonePairing() {
  const request = useServerFn(remoteRequest);
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const pair = async () => {
    if (!bridge()) { setStatus("Pair from Jarvis on your PC."); return; }
    setBusy(true);
    try {
      const old = readRemoteToken();
      if (old) { const result = await request({ data: { op: "revoke", token: old } }); if (result.error) throw new Error(result.error); }
      const token = createRemoteToken();
      const result = await request({ data: { op: "pair", token, name: "Main PC" } });
      if (!result.pairingCode) throw new Error(result.error ?? "Pairing failed.");
      storeRemoteToken(token);
      setCode(result.pairingCode.match(/.{1,4}/g)?.join("-") ?? result.pairingCode);
      setExpiresAt(result.expiresAt ?? "");
      setLink(`${window.location.origin}/pairing`);
      setStatus("Code ready. Keep it private.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Pairing failed."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      const token = readRemoteToken();
      if (token) { const result = await request({ data: { op: "revoke", token } }); if (result.error) throw new Error(result.error); }
      storeRemoteToken(""); setLink(""); setCode(""); setStatus("Phone disconnected.");
    } catch { setStatus("Could not disconnect. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 font-mono text-xs text-term-text">
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={pair}><Smartphone size={14} />Pair phone</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={disconnect}><Unplug size={14} />Disconnect</Button>
    </div>
    {code && <div className="space-y-2"><p className="text-term-dim">PAIRING CODE</p><div className="flex items-center gap-2"><output aria-label="Phone pairing code" className="min-w-0 flex-1 break-all font-hud text-lg text-primary">{code}</output><Button size="icon" variant="outline" aria-label="Copy pairing code" onClick={() => navigator.clipboard.writeText(code).then(() => setStatus("Code copied.")).catch(() => setStatus("Select the code to copy it."))}><Copy size={14} /></Button></div><p className="text-term-dim">Expires at {expiresAt ? new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} · Single use</p></div>}
    {link && <a className="block break-all text-primary underline" href={link} target="_blank" rel="noopener noreferrer">{link}</a>}
    {status && <p role="status" className="text-term-dim">{status}</p>}
  </div>;
}