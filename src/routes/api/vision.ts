import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  question: z.string().min(1).max(1000),
  image: z.string().startsWith("data:image/").max(6_000_000),
});

export const Route = createFileRoute("/api/vision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "I couldn't see that, sir." }, { status: 400 });
        const key = process.env["JARVIS_AI"] || process.env["OPENAI_API_KEY"];
        if (!key) return Response.json({ error: "Vision is not configured." }, { status: 503 });
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are J.A.R.V.I.S., a polite, dry British AI assistant created by Vraith. Answer screenshot questions in 1-3 short spoken sentences, plain text." },
              { role: "user", content: [{ type: "text", text: parsed.data.question }, { type: "image_url", image_url: { url: parsed.data.image } }] },
            ],
          }),
        });
        if (!r.ok) return Response.json({ error: "I couldn't make out your screen, sir." }, { status: r.status });
        const result = await r.json() as { choices?: { message?: { content?: string } }[] };
        return Response.json({ text: result.choices?.[0]?.message?.content ?? "" });
      },
    },
  },
});
