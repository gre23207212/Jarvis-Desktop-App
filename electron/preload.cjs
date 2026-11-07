// Bridge between the Jarvis web pages and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

const onCmd = (fn) => {
  const h = (_e, name, arg) => fn(name, arg);
  ipcRenderer.on("cmd", h);
  return () => ipcRenderer.removeListener("cmd", h);
};

contextBridge.exposeInMainWorld("jarvis", {
  desktop: true,
  moveBy: (dx, dy) => ipcRenderer.send("move-by", dx, dy),
  setIgnore: (ignore) => ipcRenderer.send("set-ignore", ignore),
  cmd: (name, arg) => ipcRenderer.send("cmd", name, arg),
  chat: (req) => ipcRenderer.invoke("chat", req),
  localSetup: (model) => ipcRenderer.invoke("local-setup", model),
  localStatus: (model) => ipcRenderer.invoke("local-status", model),
  listApps: () => ipcRenderer.invoke("apps-list"),
  openApp: (name) => ipcRenderer.invoke("open-app", name),
  spotifyPlay: (query) => ipcRenderer.invoke("spotify-play", query),
  discordJoin: (link) => ipcRenderer.invoke("discord-join", link),
  discordMute: () => ipcRenderer.invoke("discord-mute"),
  cableMic: (on, opts) => ipcRenderer.invoke("cable-mic", on, opts),
  audioDevices: () => ipcRenderer.invoke("audio-devices"),
  voiceWav: (text, voiceName) => ipcRenderer.invoke("voice-wav", text, voiceName),
  openUrl: (url) => ipcRenderer.send("open-url", url),
  onCmd,
});

contextBridge.exposeInMainWorld("jarvisSetup", {
  run: (mode, opts) => ipcRenderer.invoke("setup-run", mode, opts),
  close: () => ipcRenderer.send("setup-close"),
  min: () => ipcRenderer.send("setup-min"),
  onProgress: (fn) => ipcRenderer.on("setup-progress", (_e, p) => fn(p)),
});
