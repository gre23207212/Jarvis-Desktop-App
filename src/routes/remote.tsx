import { createFileRoute } from "@tanstack/react-router";
import { PhoneRemote } from "@/components/phone-remote";

export const Route = createFileRoute("/remote")({
  head: () => ({ meta: [
    { title: "Jarvis Phone Remote" },
    { name: "description", content: "Your private remote for sending Discord voice messages through Jarvis on your PC." },
    { property: "og:title", content: "Jarvis Phone Remote" },
    { property: "og:description", content: "Send a voice-channel message to your paired Jarvis desktop." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PhoneRemote,
});

