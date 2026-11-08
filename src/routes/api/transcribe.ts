import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const file = form?.get("audio");
        if (!(file instanceof File) || file.size > 5_000_000) return Response.json({ error: "Invalid audio" }, { status: 400 });
        const key = process.env["JARVIS_AI"] || process.env["OPENAI_API_KEY"];
        if (!key) return Response.json({ error: "Speech recognition is not configured." }, { status: 503 });
        const payload = new FormData();
        payload.append("file", file, file.name || "clip.webm");
        payload.append("model", "whisper-1");
        payload.append("language", "en");
        const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${key}` }, body: payload,
        });
        if (!r.ok) return Response.json({ error: "I couldn't make that out, sir." }, { status: r.status });
        const result = await r.json() as { text?: string };
        return Response.json({ text: result.text ?? "" });
      },
    },
  },
});
