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
  elevenVoices: (key) => ipcRenderer.invoke("eleven-voices", key),
  elevenSpeech: (req) => ipcRenderer.invoke("eleven-speech", req),
  saveClip: (b64, opts) => ipcRenderer.invoke("save-clip", b64, opts),
  openUrl: (url) => ipcRenderer.send("open-url", url),
  // Hotkeys, docking physics & standby
  snapToActive: () => ipcRenderer.send("snap-to-active"),
  unsnap: () => ipcRenderer.send("unsnap"),
  orbit: (on) => ipcRenderer.send("orbit", on),
  // OS window & app management
  windowControl: (action, app) => ipcRenderer.invoke("window-control", action, app),
  // Universal media engine
  mediaKey: (action) => ipcRenderer.invoke("media-key", action),
  nowPlaying: () => ipcRenderer.invoke("now-playing"),
  // Discord deep integration
  discordDeafen: () => ipcRenderer.invoke("discord-deafen"),
  discordMessage: (link, text) => ipcRenderer.invoke("discord-message", link, text),
  discordAudioSettings: (input, output) => ipcRenderer.invoke("discord-audio-settings", input, output),
  rpcActivity: (payload) => ipcRenderer.send("rpc-activity", payload),
  rpcDisable: () => ipcRenderer.send("rpc-disable"),
  appInfo: () => ipcRenderer.invoke("app-info"),
  // Live screen share
  openShare: () => ipcRenderer.send("open-share"),
  shareSources: () => ipcRenderer.invoke("share-sources"),
  gpuInfo: () => ipcRenderer.invoke("gpu-info"),
  // Auto-update checker + dossier file
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  dossierRead: () => ipcRenderer.invoke("dossier-read"),
  dossierWrite: (content) => ipcRenderer.invoke("dossier-write", content),
  onCmd,
});

contextBridge.exposeInMainWorld("jarvisSetup", {
  run: (mode, opts) => ipcRenderer.invoke("setup-run", mode, opts),
  close: () => ipcRenderer.send("setup-close"),
  min: () => ipcRenderer.send("setup-min"),
  onProgress: (fn) => ipcRenderer.on("setup-progress", (_e, p) => fn(p)),
});
