/** Pick the installed app a friend named in the call, e.g. "we're on Valorant" -> "VALORANT". */
const NOT_GAMES = /\b(discord|chrome|edge|firefox|spotify|steam|epic games launcher|uninstall|setup|update|helper|settings|notepad|explorer|jarvis|vb-?audio|readme)\b/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function findGame(speech: string, apps: string[]): string | null {
  const said = ` ${norm(speech)} `;
  if (!said.trim()) return null;
  let best: string | null = null;
  for (const app of apps) {
    if (NOT_GAMES.test(app)) continue;
    const name = norm(app);
    if (name.length < 3) continue;
    // whole name, or name without a trailing edition word ("Rocket League Beta" -> "rocket league")
    const short = name.replace(/\s+(beta|launcher|game|edition|remastered)$/, "");
    if (said.includes(` ${name} `) || (short.length >= 3 && said.includes(` ${short} `))) {
      if (!best || name.length > norm(best).length) best = app;
    }
  }
  return best;
}

export const ASK_GAME = "What are you all playing today?";
