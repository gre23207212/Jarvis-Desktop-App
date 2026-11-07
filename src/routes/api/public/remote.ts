import { createFileRoute } from "@tanstack/react-router";
import { remoteInput } from "@/lib/remote-schema";

// Phone pages are served from other domains (Vercel), so this endpoint allows CORS.
// Every op is authorized by a hashed single-use code or device capability token in handleRemote.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export const Route = createFileRoute("/api/public/remote")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const parsed = remoteInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400, headers: cors });
        const { handleRemote } = await import("@/lib/remote.server");
        return Response.json(await handleRemote(parsed.data), { headers: cors });
      },
    },
  },
});
