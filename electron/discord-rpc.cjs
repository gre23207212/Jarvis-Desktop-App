// Minimal Discord Rich Presence client over Discord's local IPC pipe — no external dependencies.
// Shows "Jarvis Desktop Companion" with the arc-reactor badge and a live activity line.

const net = require("net");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const OPS = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, ACK: 4 };
let socket = null;
let clientId = "";
let enabled = false;
let current = null;
let retryTimer = null;
let buffer = Buffer.alloc(0);

const pipePath = (i) => (process.platform === "win32"
  ? `\\\\.\\pipe\\discord-ipc-${i}`
  : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || os.tmpdir(), `discord-ipc-${i}`));

const frame = (op, payload) => {
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  const head = Buffer.alloc(8);
  head.writeUInt32LE(op, 0);
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data]);
};

function send(op, payload) {
  if (!socket) return false;
  try { socket.write(frame(op, payload)); return true; } catch { return false; }
}

function setActivity(activity) {
  current = activity;
  if (!socket || !clientId) return;
  send(OPS.FRAME, {
    cmd: "SET_ACTIVITY",
    args: { pid: process.pid, activity: activity || null },
    nonce: crypto.randomUUID(),
  });
}

function connect() {
  if (!enabled || socket) return;
  let attempt = 0;
  const tryNext = () => {
    if (!enabled || socket || attempt >= 10) {
      if (enabled && !socket) retryTimer = setTimeout(connect, 20000);
      return;
    }
    const s = net.connect(pipePath(attempt++));
    let settled = false;
    s.once("connect", () => {
      settled = true;
      socket = s;
      buffer = Buffer.alloc(0);
      send(OPS.HANDSHAKE, { v: 1, client_id: clientId });
      if (current) setActivity(current);
      s.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 8) {
          const op = buffer.readUInt32LE(0);
          const len = buffer.readUInt32LE(4);
          if (buffer.length < 8 + len) break;
          const payloadRaw = buffer.subarray(8, 8 + len);
          buffer = buffer.subarray(8 + len);
          let payload = null;
          try { payload = JSON.parse(payloadRaw.toString("utf8") || "null"); } catch { payload = null; }
          if (op === OPS.CLOSE) { closeSocket(); return; }
          if (op === OPS.PING) send(OPS.ACK, payload);
        }
      });
      s.on("error", () => closeSocket());
      s.on("close", () => closeSocket());
    });
    s.once("error", () => {
      s.destroy();
      if (!settled) { settled = true; tryNext(); }
      else closeSocket();
    });
  };
  tryNext();
}

function closeSocket() {
  if (socket) { try { socket.destroy(); } catch { /* already gone */ } }
  socket = null;
  if (enabled) { if (retryTimer) clearTimeout(retryTimer); retryTimer = setTimeout(connect, 5000); }
}

module.exports = {
  /** Enables the presence and (re)connects with the given Discord application ID. */
  setEnabled(on, id) {
    enabled = !!on && !!id;
    if (id) clientId = String(id);
    if (!enabled) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      closeSocket();
      return;
    }
    connect();
  },
  setActivity(activity) {
    setActivity(activity);
  },
};
