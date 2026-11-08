// Full OS window & app management: "Jarvis, minimize Chrome" / "bring Discord to the front" / "close Steam".

export type WindowAction = "minimize" | "maximize" | "focus" | "close";

const strip = (t: string) => t.trim().replace(/[.!?]+$/, "").replace(/^(?:can you |could you |would you |please |jarvis,? )+/i, "").trim();

const PRONOUN = /^(?:it|this|that|them|everything|all|my screen|the screen|(?:my |the )?(?:apps?|programs?|applications?|games?))$/i;

export function parseWindowCommand(text: string): { action: WindowAction; app: string } | null {
  const s = strip(text);
  const clean = (raw: string | undefined): string => {
    let app = (raw ?? "").trim().replace(/^(?:the|my)\s+/i, "").replace(/\s+(?:app|application|program|window|process)\s*/i, " ").replace(/\s+(?:down|off|for me|please)\s*$/i, " ").replace(/\s+(?:to|into)\s+(?:the\s+)?front\s*$/i, " ").trim();
    app = app.replace(/\s+/g, " ");
    return app;
  };
  let m = s.match(/^minimi[sz]e\s+(.+)$/i);
  if (m) { const app = clean(m[1]); if (app && !PRONOUN.test(app)) return { action: "minimize", app }; }
  m = s.match(/^maximi[sz]e\s+(.+)$/i);
  if (m) { const app = clean(m[1]); if (app && !PRONOUN.test(app)) return { action: "maximize", app }; }
  m = s.match(/^(?:bring|switch to|focus|show|pull up)\s+(.+?)(?:\s+(?:to|in)?to?\s+(?:the\s+)?front|forward|up)?$/i);
  if (m) { const app = clean(m[1]); if (app && !PRONOUN.test(app) && !/^me\b/i.test(app)) return { action: "focus", app }; }
  m = s.match(/^(?:close|shut(?:\s+down)?|kill|quit|exit|terminate)\s+(.+)$/i);
  if (m) { const app = clean(m[1]); if (app && !PRONOUN.test(app)) return { action: "close", app }; }
  return null;
}

export const windowReply = (action: WindowAction, app: string, ok: boolean): string =>
  ok
    ? action === "minimize" ? `Minimising ${app}, sir.` : action === "maximize" ? `${app} is now front and centre, sir.` : action === "focus" ? `Bringing ${app} to the front, sir.` : `Closing ${app}, sir.`
    : `I couldn't find a window for ${app}, sir.`;
