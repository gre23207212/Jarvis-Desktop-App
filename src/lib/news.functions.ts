import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { recentStories, type NewsStory } from "./welcome";

export const getRecentNews = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ topic: z.string().trim().min(1).max(100) }).parse(input))
  .handler(async ({ data }): Promise<{ stories: NewsStory[]; error?: string }> => {
    try {
      const query = encodeURIComponent(`${data.topic} when:2d`);
      const response = await fetch(`https://news.google.com/rss/search?q=${query}&hl=en-GB&gl=GB&ceid=GB:en`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("News unavailable");
      const xml = await response.text();
      if (xml.length > 2000000) throw new Error("Feed too large");
      const parsed = new XMLParser({ ignoreAttributes: true, processEntities: false }).parse(xml);
      const raw = parsed?.rss?.channel?.item;
      const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const stories = recentStories(items, Date.now());
      return stories.length ? { stories } : { stories: [], error: "I couldn't find recent headlines for that topic, boss." };
    } catch {
      return { stories: [], error: "I couldn't reach the news right now, boss. I won't make up an update." };
    }
  });