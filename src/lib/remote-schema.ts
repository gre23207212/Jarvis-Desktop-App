import { z } from "zod";

const token = z.string().regex(/^[a-f0-9]{64}$/);
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const normalizePairingCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, "");
export const pairingCode = z.string().transform(normalizePairingCode).pipe(z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/));
export function createPairingCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => alphabet[byte % alphabet.length]).join("");
}
export const pairingValid = (expires: string | null, now = Date.now()) => !!expires && Date.parse(expires) > now;
export const remoteInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("link"), code: pairingCode }),
  z.object({ op: z.literal("pair"), token, name: z.string().trim().min(1).max(60) }),
  z.object({ op: z.literal("poll"), token, channels: z.array(z.string().trim().min(1).max(60)).max(100) }),
  z.object({ op: z.literal("revoke"), token }),
  z.object({ op: z.literal("status"), token }),
  z.object({ op: z.literal("send"), token, text: z.string().trim().min(1).max(1000), channel: z.string().max(60).optional() }),
  z.object({ op: z.literal("finish"), token, id: z.string().uuid(), status: z.enum(["done", "failed", "choose"]), result: z.string().max(1500) }),
]);
export type RemoteInput = z.infer<typeof remoteInput>;
export type RemoteJob = { id: string; text: string; channel: string | null; status: string; result: string };
export type RemoteResult = { error?: string; phoneToken?: string; pairingCode?: string; expiresAt?: string; online?: boolean; channels?: string[]; jobs?: RemoteJob[]; job?: RemoteJob | null; ok?: boolean };

export const remoteOnline = (lastSeen: string | null, now = Date.now()) => !!lastSeen && now - Date.parse(lastSeen) < 20000;