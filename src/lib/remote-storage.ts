const KEY = "jarvis-remote-desktop";
export function readRemoteToken(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function storeRemoteToken(token: string) {
  if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("jarvis-remote-changed"));
}
export function createRemoteToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}