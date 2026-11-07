import { z } from "zod";

const token = z.string().regex(/^[a-f0-9]{64}$/);
export const remoteInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("pair"), token, name: z.string().trim().min(1).max(60) }),
  z.object({ op: z.literal("poll"), token, channels: z.array(z.string().trim().min(1).max(60)).max(100) }),
  z.object({ op: z.literal("revoke"), token }),
  z.object({ op: z.literal("status"), token }),
  z.object({ op: z.literal("send"), token, text: z.string().trim().min(1).max(1000), channel: z.string().max(60).optional() }),
  z.object({ op: z.literal("finish"), token, id: z.string().uuid(), status: z.enum(["done", "failed", "choose"]), result: z.string().max(1500) }),
]);
export type RemoteInput = z.infer<typeof remoteInput>;
export type RemoteJob = { id: string; text: string; channel: string | null; status: string; result: string };
export type RemoteResult = { error?: string; phoneToken?: string; online?: boolean; channels?: string[]; jobs?: RemoteJob[]; job?: RemoteJob | null; ok?: boolean };

export const remoteOnline = (lastSeen: string | null, now = Date.now()) => !!lastSeen && now - Date.parse(lastSeen) < 20000;