import { remoteOnline, createPairingCode, PAIRING_TTL_MS, type RemoteInput, type RemoteResult } from "./remote-schema";
import { parseAction, parseWake } from "./jarvis";

/** Capability tokens authorize one device only; all database rows are private to these handlers. */
export async function handleRemote(data: RemoteInput): Promise<RemoteResult> {
    const hash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (data.op === "link") {
      const phoneToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      // Matching and consumption are one atomic update: only one phone wins.
      const { data: linked, error } = await db.from("jarvis_remote_devices")
        .update({ phone_hash: await hash(phoneToken), pairing_hash: null, pairing_expires_at: null })
        .eq("pairing_hash", await hash(data.code)).eq("revoked", false)
        .gt("pairing_expires_at", new Date().toISOString()).select("id").maybeSingle();
      return error || !linked ? { error: "That code is incorrect, expired, or already used. Generate a new code on your PC." } : { phoneToken };
    }
    const digest = await hash(data.token);
    if (data.op === "pair") {
      const phoneToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const code = createPairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
      const { error } = await db.from("jarvis_remote_devices").insert({ desktop_hash: digest, phone_hash: await hash(phoneToken), name: data.name, pairing_hash: await hash(code), pairing_expires_at: expiresAt });
      return error ? { error: "Could not pair this PC. Try again." } : { pairingCode: code, expiresAt };
    }
    const desktop = ["poll", "finish", "revoke"].includes(data.op);
    const { data: device, error } = await db.from("jarvis_remote_devices").select("id,channels,last_seen").eq(desktop ? "desktop_hash" : "phone_hash", digest).eq("revoked", false).maybeSingle();
    if (error || !device) return { error: "This phone pairing is invalid or has been disconnected." };
    if (data.op === "revoke") {
      const { error } = await db.from("jarvis_remote_devices").update({ revoked: true }).eq("id", device.id);
      return error ? { error: "Could not disconnect the phone." } : { ok: true };
    }
    if (data.op === "poll") {
      const { error } = await db.from("jarvis_remote_devices").update({ last_seen: new Date().toISOString(), channels: data.channels }).eq("id", device.id);
      if (error) return { error: "PC connection unavailable." };
      const cutoff = new Date(Date.now() - 120000).toISOString();
      await db.from("jarvis_remote_commands").update({ status: "failed", result: "Command expired. Send it again when your PC is online." }).eq("device_id", device.id).eq("status", "queued").lt("created_at", cutoff);
      const { data: queued } = await db.from("jarvis_remote_commands").select("id").eq("device_id", device.id).eq("status", "queued").order("created_at").limit(1).maybeSingle();
      if (!queued) return { job: null };
      const { data: job } = await db.from("jarvis_remote_commands").update({ status: "running" }).eq("device_id", device.id).eq("id", queued.id).eq("status", "queued").select("id,text,channel,status,result").maybeSingle();
      return { job };
    }
    if (data.op === "finish") {
      const { error } = await db.from("jarvis_remote_commands").update({ status: data.status, result: data.result }).eq("device_id", device.id).eq("id", data.id).eq("status", "running");
      return error ? { error: "Could not update the command result." } : { ok: true };
    }
    const channels = Array.isArray(device.channels) ? device.channels.filter((value): value is string => typeof value === "string") : [];
    if (data.op === "send") {
      if (!remoteOnline(device.last_seen)) return { error: "Your PC is offline. Leave Jarvis running on your PC and try again." };
      const text = parseWake(data.text) ?? data.text;
      if (parseAction(text)?.kind !== "discord") return { error: "Send a Discord voice-channel request, including the message you want Jarvis to say." };
      if (data.channel && !channels.includes(data.channel)) return { error: "That saved channel is no longer available." };
      const { error } = await db.from("jarvis_remote_commands").insert({ device_id: device.id, text, channel: data.channel || null });
      return error ? { error: "Could not send the command." } : { ok: true };
    }
    const { data: jobs, error: jobsError } = await db.from("jarvis_remote_commands").select("id,text,channel,status,result").eq("device_id", device.id).order("created_at", { ascending: false }).limit(10);
    return jobsError ? { error: "Could not read your PC's status." } : { online: remoteOnline(device.last_seen), channels, jobs: jobs ?? [] };
}
