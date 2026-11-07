// Bridge between the Jarvis web pages and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvis", {
  desktop: true,
  moveBy: (dx, dy) => ipcRenderer.send("move-by", dx, dy),
  setIgnore: (ignore) => ipcRenderer.send("set-ignore", ignore),
  cmd: (name, arg) => ipcRenderer.send("cmd", name, arg),
  chat: (req) => ipcRenderer.invoke("chat", req),
  onCmd: (fn) => {
    const h = (_e, name, arg) => fn(name, arg);
    ipcRenderer.on("cmd", h);
    return () => ipcRenderer.removeListener("cmd", h);
  },
});
