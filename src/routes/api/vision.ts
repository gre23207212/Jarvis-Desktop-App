import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Jarvis looks at one screenshot of the user's main screen and answers about it.
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
        const { generateChatCompletion, GatewayError } = await import("@lovable.dev/ai-gateway");
        try {
          const r = await generateChatCompletion({
            model: "openai/gpt-6.1-terra",
            messages: [
              { role: "system", content: "You are J.A.R.V.I.S., a polite, dry British AI assistant created by Vraith. You are looking at a screenshot of the user's screen. Answer in 1-3 short spoken sentences, plain text, addressing the user as sir." },
              { role: "user", content: [{ type: "text", text: parsed.data.question }, { type: "image_url", image_url: { url: parsed.data.image } }] },
            ],
          } as never);
          const text = (r as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
          return Response.json({ text });
        } catch (e) {
          if (e instanceof GatewayError) return Response.json({ error: e.httpStatus === 402 ? "My eyes need AI credits topping up, sir." : "I couldn't make out your screen, sir." }, { status: e.httpStatus ?? 500 });
          throw e;
        }
      },
    },
  },
});
