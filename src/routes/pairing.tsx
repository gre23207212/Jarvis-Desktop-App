import { createFileRoute } from "@tanstack/react-router";
import { PhoneRemote } from "@/components/phone-remote";

export const Route = createFileRoute("/pairing")({
  head: () => ({ meta: [
    { title: "Jarvis Desktop — Pair Your Phone" },
    { name: "description", content: "Link your phone to Jarvis Desktop with the pairing code from your PC." },
    { property: "og:title", content: "Jarvis Desktop — Pair Your Phone" },
    { property: "og:description", content: "Enter your PC's pairing code to connect your Jarvis phone remote." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PhoneRemote,
});