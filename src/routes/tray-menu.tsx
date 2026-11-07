import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { bridge, loadSettings, VERSION, type Settings, type Size } from "@/lib/jarvis";

export const Route = createFileRoute("/tray-menu")({
  head: () => ({
    meta: [
      { title: "Jarvis Quick Menu" },
      { name: "description", content: "Quick controls for the Jarvis desktop mate." },
      { property: "og:title", content: "Jarvis Quick Menu" },
      { property: "og:description", content: "Quick controls for the Jarvis desktop mate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrayMenu,
});

const SIZES: Size[] = ["small", "medium", "large", "huge"];
const SPOTS = [["bottom-right", "Bottom right"], ["bottom-left", "Bottom left"], ["top-right", "Top right"], ["top-left", "Top left"], ["center", "Centre"]] as const;

function TrayMenu() {
  const [s, setS] = useState<Settings | null>(null);
  const [sub, setSub] = useState<"" | "size" | "move">("");
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const refresh = () => { setS(loadSettings()); setSub(""); };
    refresh();
    return bridge()?.onCmd((n) => n === "refresh" && refresh());
  }, []);
  const cmd = (n: string, a?: unknown) => {
    bridge()?.cmd(n, a);
    if (n === "size") setS((p) => (p ? { ...p, size: a as Size } : p));
  };

  const Item = ({ label, onClick, arrow, hint }: { label: string; onClick: () => void; arrow?: boolean; hint?: string }) => (
    <button onClick={onClick} className="group flex w-full items-center justify-between px-4 py-1.5 text-left font-sans text-[15px] font-medium text-term-text hover:bg-primary/10 hover:text-primary">
      <span>{label}</span>
      {hint && <span className="font-mono text-[10px] text-term-dim">{hint}</span>}
      {arrow && <ChevronRight size={14} className="text-term-dim group-hover:text-primary" />}
    </button>
  );

  return (
    <div className="flex h-screen w-screen items-end p-1 select-none">
      <div className="hud-panel w-full py-2">
        <div className="flex items-center gap-2 border-b border-primary/30 px-4 pb-2 font-hud text-sm tracking-widest text-primary">
          J.A.R.V.I.S <span className="text-term-dim">/ {VERSION}</span>
        </div>
        {sub === "" && (
          <div className="pt-1">
            <Item label="Open Mainframe" onClick={() => cmd("mainframe")} />
            <Item label="Show / hide Jarvis" onClick={() => cmd("toggle")} />
            <Item label="Talk now" onClick={() => cmd("talk")} />
            <Item label="Type a message" onClick={() => cmd("type")} />
            <Item label={`"Hey Jarvis"`} hint={s?.wakeWord ? "ON" : "OFF"} onClick={() => { cmd("wake"); setS((p) => (p ? { ...p, wakeWord: !p.wakeWord } : p)); }} />
            <Item label="Size" arrow onClick={() => setSub("size")} />
            <Item label="Move" arrow onClick={() => setSub("move")} />
            <Item label="Reboot systems" onClick={() => cmd("reload")} />
            <div className="my-1 border-t border-primary/30" />
            <Item label="Shut down Jarvis" onClick={() => cmd("quit")} />
          </div>
        )}
        {sub === "size" && (
          <div className="pt-1">
            <Item label="‹ Back" onClick={() => setSub("")} />
            {SIZES.map((z) => (
              <button key={z} onClick={() => cmd("size", z)} className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-[15px] capitalize text-term-text hover:bg-primary/10 hover:text-primary">
                <span className="flex h-4 w-4 items-center justify-center border border-primary/60">{s?.size === z && <Check size={12} className="text-primary" />}</span>
                {z}
              </button>
            ))}
          </div>
        )}
        {sub === "move" && (
          <div className="pt-1">
            <Item label="‹ Back" onClick={() => setSub("")} />
            {SPOTS.map(([k, l]) => <Item key={k} label={l} onClick={() => cmd("move", k)} />)}
          </div>
        )}
      </div>
    </div>
  );
}
