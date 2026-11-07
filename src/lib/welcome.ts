import { forget, loadMemory, remember } from "./memory";

const TOPIC_PREFIX = "My startup news topic is: ";
export const READY_MESSAGE = 'Do you need me for anything, boss? Say "Hey Jarvis" followed by your request, or use the pencil icon to type a message.';
export type WelcomeStage = "offer" | "topic" | null;

export function newsTopic() {
  return loadMemory().facts.find((fact) => fact.startsWith(TOPIC_PREFIX))?.slice(TOPIC_PREFIX.length) ?? "";
}
export function saveNewsTopic(topic: string) {
  for (const fact of loadMemory().facts.filter((value) => value.startsWith(TOPIC_PREFIX))) forget(fact);
  remember(TOPIC_PREFIX + topic.trim().slice(0, 100));
}
export function startupGreeting(now: Date, topic: string) {
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = now.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  return `Hey, boss. Today's date is ${date}, and the current time is ${time}. Would you like to know ${topic ? `the recent news about ${topic}` : "any recent news"}?`;
}
export function welcomeAnswer(stage: WelcomeStage, text: string, topic: string): { kind: "finish" | "topic" | "news" | "other"; topic?: string } {
  const t = text.trim();
  if (!stage) return { kind: "other" };
  if (/^(?:no\b|nope\b|not now\b|cancel\b|never mind\b|stop\b)/i.test(t)) return { kind: "finish" };
  if (stage === "topic") return { kind: "news", topic: t.slice(0, 100) };
  if (/\b(?:different|change|another|new topic)\b/i.test(t)) return { kind: "topic" };
  if (/^(?:yes\b|yeah\b|yep\b|sure\b|please\b|go ahead\b|okay\b|ok\b)/i.test(t)) return topic ? { kind: "news", topic } : { kind: "topic" };
  return { kind: "other" };
}

export type NewsStory = { title: string; url: string; source: string; published: string };
export function recentStories(items: { title?: unknown; link?: unknown; pubDate?: unknown; source?: unknown }[], now: number): NewsStory[] {
  return items.flatMap((item) => {
    if (typeof item.title !== "string" || typeof item.link !== "string" || typeof item.pubDate !== "string") return [];
    const at = Date.parse(item.pubDate);
    if (!Number.isFinite(at) || now - at > 72 * 60 * 60 * 1000 || at > now + 300000 || !item.link.startsWith("https://")) return [];
    const source = typeof item.source === "string" ? item.source : "Public news";
    return [{ title: item.title.slice(0, 300), url: item.link, source: source.slice(0, 100), published: new Date(at).toISOString() }];
  }).slice(0, 3);
}