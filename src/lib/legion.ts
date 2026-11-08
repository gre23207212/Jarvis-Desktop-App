// "Iron Legion Protocol": three holographic decoy reactors that fly around and banter.

export type Decoy = { id: number; x: number; y: number; vx: number; vy: number; line: string };

export const BANTER: string[] = [
  "All systems nominal, sir.",
  "Targeting sensors calibrated.",
  "Perimeter sweep complete.",
  "Reactor output at one hundred percent.",
  "Legion unit two, reporting in.",
  "Scanning for anomalies… none found.",
  "Do mind the décor, sir.",
  "Holographics stable on this vector.",
  "I have the watch. Relax.",
  "Deployment radius holding steady.",
];

export function spawnDecoys(count: number, width: number, height: number, rand: () => number = Math.random): Decoy[] {
  const out: Decoy[] = [];
  for (let i = 0; i < count; i++) {
    const speed = 40 + rand() * 60;
    const angle = rand() * Math.PI * 2;
    out.push({
      id: i + 1,
      x: Math.round(width * (0.2 + 0.6 * ((i + rand()) / count))),
      y: Math.round(height * (0.2 + 0.5 * rand())),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      line: BANTER[Math.floor(rand() * BANTER.length) % BANTER.length] ?? "Standing by.",
    });
  }
  return out;
}

/** Advances decoys by dt seconds, bouncing them off the screen edges. */
export function stepDecoys(decoys: Decoy[], width: number, height: number, dt = 0.016, size = 72): Decoy[] {
  return decoys.map((d) => {
    let { x, y, vx, vy } = d;
    x += vx * dt;
    y += vy * dt;
    if (x < 0) { x = 0; vx = Math.abs(vx); }
    if (x > width - size) { x = width - size; vx = -Math.abs(vx); }
    if (y < 0) { y = 0; vy = Math.abs(vy); }
    if (y > height - size) { y = height - size; vy = -Math.abs(vy); }
    return { ...d, x, y, vx, vy };
  });
}

export function nextBanter(current: string, rand: () => number = Math.random): string {
  const pool = BANTER.filter((l) => l !== current);
  return pool[Math.floor(rand() * pool.length) % pool.length] ?? current;
}
