import { useEffect, useState } from "react";
import { bridge } from "@/lib/jarvis";
import type { UpdateProgress } from "@/lib/update";

// One-click self-update: downloads the GitHub release zip and lets the new version install itself.
export function UpdateButton({ className = "", label = "UPDATE NOW" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => bridge()?.onCmd((n, a) => { if (n === "update-progress") setStatus(a as UpdateProgress); }), []);

  const run = async () => {
    setBusy(true); setError(""); setStatus({ text: "Preparing update…", pct: 0 });
    const r = await bridge()?.installUpdate?.();
    if (!r?.ok) { setBusy(false); setStatus(null); setError(r?.error || "Updates run in the desktop app."); }
  };

  return (
    <div data-testid="update-panel" className="mt-1.5">
      <button data-testid="update-install-button" disabled={busy} onClick={run}
        className={`border border-primary/60 px-2 py-1 font-hud text-[10px] tracking-wider text-primary transition-colors hover:bg-primary/10 disabled:opacity-60 ${className}`}>
        {busy ? "UPDATING…" : label}
      </button>
      {status && (
        <div data-testid="update-progress" className="mt-1.5">
          <div className="h-1 w-full bg-primary/15"><div className="h-1 bg-primary transition-[width] duration-300" style={{ width: `${Math.round(status.pct * 100)}%` }} /></div>
          <p className="mt-1 font-mono text-[10px] text-term-dim">{status.text}</p>
        </div>
      )}
      {error && <p data-testid="update-error" className="mt-1 font-mono text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
