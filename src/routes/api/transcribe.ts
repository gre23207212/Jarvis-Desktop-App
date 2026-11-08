import { createFileRoute } from "@tanstack/react-router";

// Turns a short voice clip into text with the built-in speech-to-text model.
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const file = form?.get("audio");
        if (!(file instanceof File) || file.size > 5_000_000) return Response.json({ error: "Invalid audio" }, { status: 400 });
        const { transcribeAudio, GatewayError } = await import("@lovable.dev/ai-gateway");
        try {
          const r = await transcribeAudio({
            model: "openai/gpt-transcribe",
            file: new File([file], "clip.webm", { type: file.type || "audio/webm" }),
            language: "en",
            response_format: "json",
          });
          const text = typeof r === "string" ? r : ((r as { text?: string }).text ?? "");
          return Response.json({ text });
        } catch (e) {
          if (e instanceof GatewayError) {
            const status = e.httpStatus ?? 500;
            return Response.json({ error: status === 402 ? "My hearing needs AI credits topping up, sir." : "I couldn't make that out, sir." }, { status });
          }
          throw e;
        }
      },
    },
  },
});
