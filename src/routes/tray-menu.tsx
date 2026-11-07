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
    <button onClick={onClick} className="group flex w-full items-center justify-between px-3 py-[3px] text-left font-sans text-[13px] font-medium text-term-text hover:bg-primary/10 hover:text-primary">
      <span>{label}</span>
      {hint && <span className="font-mono text-[10px] text-term-dim">{hint}</span>}
      {arrow && <ChevronRight size={12} className="text-term-dim group-hover:text-primary" />}
    </button>
  );

  return (
    <div className="flex h-screen w-screen items-end p-1 select-none">
      <div className="hud-panel w-full py-1.5">
        <div className="flex items-center gap-2 border-b border-primary/30 px-3 pb-1.5 font-hud text-[11px] tracking-widest text-primary">
          J.A.R.V.I.S <span className="text-term-dim">/ {VERSION}</span>
        </div>
        {sub === "" && (
          <div className="pt-1">
            <Item label="Open Mainframe" onClick={() => cmd("mainframe")} />
            <Item label="Hide / show Jarvis" onClick={() => cmd("toggle")} />
            <Item label={`"Hey Jarvis"`} hint={s?.wakeWord ? "ON" : "OFF"} onClick={() => { cmd("wake"); setS((p) => (p ? { ...p, wakeWord: !p.wakeWord } : p)); }} />
            <Item label="Size" arrow onClick={() => setSub("size")} />
            <Item label="Move" arrow onClick={() => setSub("move")} />
            <Item label="Reboot" onClick={() => cmd("reload")} />
            <div className="my-0.5 border-t border-primary/30" />
            <Item label="Quit Jarvis" onClick={() => cmd("quit")} />
          </div>
        )}
        {sub === "size" && (
          <div className="pt-1">
            <Item label="‹ Back" onClick={() => setSub("")} />
            {SIZES.map((z) => (
              <button key={z} onClick={() => cmd("size", z)} className="flex w-full items-center gap-2 px-3 py-[3px] text-left text-[13px] capitalize text-term-text hover:bg-primary/10 hover:text-primary">
                <span className="flex h-3.5 w-3.5 items-center justify-center border border-primary/60">{s?.size === z && <Check size={10} className="text-primary" />}</span>
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
