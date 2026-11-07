import { createFileRoute } from "@tanstack/react-router";

// Turns a short voice clip into text using the saved ChatGPT key.
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["JARVIS_AI"];
        if (!key) return Response.json({ error: "No ChatGPT key saved for hearing, sir." }, { status: 500 });
        const form = await request.formData().catch(() => null);
        const file = form?.get("audio");
        if (!(file instanceof File) || file.size > 5_000_000) return Response.json({ error: "Invalid audio" }, { status: 400 });
        const out = new FormData();
        out.append("file", file, "clip.webm");
        out.append("model", "gpt-4o-mini-transcribe");
        out.append("language", "en");
        const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: out,
        });
        if (!r.ok) return Response.json({ error: "I couldn't make that out, sir." }, { status: r.status });
        const j = (await r.json()) as { text?: string };
        return Response.json({ text: j.text ?? "" });
      },
    },
  },
});
