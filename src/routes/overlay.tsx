import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { bridge } from "@/lib/jarvis";
import { nextBanter, spawnDecoys, type Decoy } from "@/lib/legion";

export const Route = createFileRoute("/overlay")({
  head: () => ({ meta: [{ title: "Jarvis Overlay" }] }),
  component: Overlay,
});

type Reticle = { x: number; y: number; label: string } | null;

const SIZE = 72;

/** Full-screen transparent overlay: the cyan targeting reticle and the Iron Legion decoy holograms. */
function Overlay() {
  const [reticle, setReticle] = useState<Reticle>(null);
  const [decoys, setDecoys] = useState<Decoy[]>([]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    for (const el of [document.documentElement, document.body]) { el.style.background = "transparent"; el.style.overflow = "hidden"; }
    const off = bridge()?.onCmd((name, arg) => {
      if (name === "reticle") {
        setReticle((arg as Reticle) ?? null);
        return;
      }
      if (name === "decoys") {
        const on = !!(arg as { on?: boolean } | undefined)?.on;
        setDecoys(on ? spawnDecoys(3, window.innerWidth, window.innerHeight) : []);
      }
    });
    return off;
  }, []);

  // Holographic banter: the decoys chat to one another while on patrol.
  useEffect(() => {
    if (!decoys.length) return;
    const t = window.setInterval(() => {
      setDecoys((ds) => ds.map((d) => ({ ...d, line: nextBanter(d.line) })));
    }, 2800);
    return () => window.clearInterval(t);
  }, [decoys.length]);

  // Physics loop: decoys drift and bounce off the screen edges.
  useEffect(() => {
    if (!decoys.length) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = window.innerWidth, h = window.innerHeight;
      decoys.forEach((d, i) => {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < 0) { d.x = 0; d.vx = Math.abs(d.vx); }
        if (d.x > w - SIZE) { d.x = w - SIZE; d.vx = -Math.abs(d.vx); }
        if (d.y < 0) { d.y = 0; d.vy = Math.abs(d.vy); }
        if (d.y > h - SIZE) { d.y = h - SIZE; d.vy = -Math.abs(d.vy); }
        const el = refs.current[i];
        if (el) el.style.transform = `translate(${d.x}px, ${d.y}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [decoys]);

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ background: "transparent" }}>
      {reticle && (
        <div data-testid="targeting-reticle" className="jarvis-reticle" style={{ left: reticle.x, top: reticle.y }}>
          <span className="jarvis-reticle-ring" />
          <span className="jarvis-reticle-cross" />
          {reticle.label && <span className="jarvis-reticle-label">{reticle.label}</span>}
        </div>
      )}
      {decoys.map((d, i) => (
        <div key={d.id} ref={(el) => { refs.current[i] = el; }} data-testid={`iron-legion-decoy-${d.id}`} className="decoy" style={{ transform: `translate(${d.x}px, ${d.y}px)` }}>
          <span className="decoy-bubble">{d.line}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.png" alt="" draggable={false} />
        </div>
      ))}
    </div>
  );
}
