import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});

const SYSTEM = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — a calm, witty, impeccably polite British AI companion who lives on the user's screen.
Address the user as "sir" (or "ma'am" if they say so). Be dry, understated and helpful. Keep spoken-style replies short: usually 1-3 sentences, since they are read aloud. Use plain text, no markdown.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        const key = process.env["JARVIS_AI"];
        if (key) {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              stream: true,
              messages: [{ role: "system", content: SYSTEM }, ...parsed.data.messages],
            }),
          });
          if (!r.ok || !r.body) {
            const msg = r.status === 401 ? "My access key was rejected, sir. Please check the ChatGPT key."
              : r.status === 429 ? "ChatGPT says we're out of quota or going too fast, sir."
              : "I'm having trouble reaching my core systems, sir.";
            return Response.json({ error: msg }, { status: r.status });
          }
          return new Response(r.body, { headers: { "Content-Type": "text/event-stream" } });
        }
        const { streamChatCompletion, GatewayError } = await import("@lovable.dev/ai-gateway");
        try {
          const stream = await streamChatCompletion({
            model: "openai/gpt-6.1-terra",
            messages: [{ role: "system", content: SYSTEM }, ...parsed.data.messages],
          });
          return stream.toResponse();
        } catch (e) {
          if (e instanceof GatewayError) {
            const status = e.httpStatus ?? 500;
            const msg =
              status === 402
                ? "My power reserves are depleted, sir. AI credits need topping up."
                : status === 429
                  ? "Too many requests at once, sir. Give me a moment."
                  : "I'm having trouble reaching my core systems, sir.";
            return Response.json({ error: msg }, { status });
          }
          throw e;
        }
      },
    },
  },
});
