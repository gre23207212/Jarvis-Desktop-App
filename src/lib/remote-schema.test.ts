import { expect, it } from "vitest";
import { remoteInput, remoteOnline, pairingCode, pairingValid, PAIRING_TTL_MS, createPairingCode } from "./remote-schema";
import { thirdPerson } from "./jarvis";

it("rejects missing or malformed phone capabilities", () => {
  expect(remoteInput.safeParse({ op: "send", token: "1234", text: "join VC" }).success).toBe(false);
});
it("rejects invalid remote completion states", () => {
  expect(remoteInput.safeParse({ op: "finish", token: "a".repeat(64), id: "e7de83e3-f322-4023-b64a-a6c70a7d1c6", status: "queued", result: "" }).success).toBe(false);
});
it("requires a recent PC heartbeat", () => {
  const now = Date.parse("2026-11-07T03:00:00Z");
  expect(remoteOnline("2026-11-07T02:59:55Z", now)).toBe(true);
  expect(remoteOnline("2026-11-07T02:59:00Z", now)).toBe(false);
});
it("relays user messages with they/them and plural verbs", () => {
  expect(thirdPerson("I will be a second")).toBe("they will be a second");
  expect(thirdPerson("I am getting my bag; wait for me")).toBe("they are getting their bag; wait for them");
});
it("accepts grouped PC pairing codes but rejects incorrect lengths", () => {
  expect(pairingCode.parse("abcd-2345-efgh")).toBe("ABCD2345EFGH");
  expect(pairingCode.safeParse("123456").success).toBe(false);
  expect(pairingCode.safeParse("IIII-OOOO-1111").success).toBe(false);
});
it("generates a twelve-character random code", () => {
  expect(pairingCode.parse(createPairingCode())).toHaveLength(12);
});
it("expires pairing codes after ten minutes", () => {
  expect(PAIRING_TTL_MS).toBe(600000);
  const now = Date.parse("2026-11-07T03:00:00Z");
  expect(pairingValid(new Date(now + PAIRING_TTL_MS).toISOString(), now)).toBe(true);
  expect(pairingValid(new Date(now).toISOString(), now)).toBe(false);
});