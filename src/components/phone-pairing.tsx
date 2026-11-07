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
      if (!result.phoneToken) throw new Error(result.error ?? "Pairing failed.");
      storeRemoteToken(token);
      setLink(`${window.location.origin}/remote#${result.phoneToken}`);
      setStatus("Phone link ready. Keep it private.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Pairing failed."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      const token = readRemoteToken();
      if (token) { const result = await request({ data: { op: "revoke", token } }); if (result.error) throw new Error(result.error); }
      storeRemoteToken(""); setLink(""); setStatus("Phone disconnected.");
    } catch { setStatus("Could not disconnect. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 font-mono text-xs text-term-text">
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={pair}><Smartphone size={14} />Pair phone</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={disconnect}><Unplug size={14} />Disconnect</Button>
    </div>
    {link && <div className="flex items-center gap-2"><input aria-label="Private phone link" className="min-w-0 flex-1 border border-primary/40 bg-term-bg p-2" readOnly value={link} /><Button size="icon" variant="outline" aria-label="Copy private phone link" onClick={() => navigator.clipboard.writeText(link).then(() => setStatus("Link copied.")).catch(() => setStatus("Select the link to copy it."))}><Copy size={14} /></Button></div>}
    {status && <p role="status" className="text-term-dim">{status}</p>}
  </div>;
}