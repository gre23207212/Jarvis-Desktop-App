import { expect, it } from "vitest";
import config from "../../vercel-pairing/vercel.json";

it("opens the pairing page by default", () => {
  expect(config.redirects.find((redirect) => redirect.source === "/")?.destination).toBe("/pairing");
});
it("does not forward desktop pages or chat commands", () => {
  const sources = config.rewrites.map((rewrite) => rewrite.source);
  expect(sources).toContain("/pairing");
  for (const path of ["/", "/mate", "/mainframe", "/tray-menu", "/api/chat", "/:path*"]) expect(sources).not.toContain(path);
});