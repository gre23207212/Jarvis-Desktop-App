// Jarvis Desktop Mate — transparent, always-on-top companion with a custom tray menu and Mainframe window.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { app, BrowserWindow, Tray, nativeImage, screen, session, ipcMain } = require("electron");

const BASE = process.env.JARVIS_URL || "https://pocket-jarvis-desktop-mate.lovable.app";
const ICON = path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png");
const W = 380, H = 520;

let mate, menu, mainframe, tray;

app.setAppUserModelId("Jarvis.DesktopMate");
if (!app.requestSingleInstanceLock()) app.quit();

const webPrefs = { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") };
const CLEAR_CSS = "html,body,#root,body>div{background:transparent!important}html,body{overflow:hidden!important}::-webkit-scrollbar{display:none}";

function createMate() {
  const { workArea } = screen.getPrimaryDisplay();
  mate = new BrowserWindow({
    width: W, height: H,
    x: workArea.x + workArea.width - W - 10,
    y: workArea.y + workArea.height - H,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: false, hasShadow: false, backgroundColor: "#00000000",
    title: "Jarvis", icon: ICON, webPreferences: webPrefs,
  });
  mate.setAlwaysOnTop(true, "floating");
  mate.setVisibleOnAllWorkspaces(true);
  // Empty areas let clicks pass through to whatever is behind Jarvis.
  mate.setIgnoreMouseEvents(true, { forward: true });
  mate.webContents.on("did-finish-load", () => mate.webContents.insertCSS(CLEAR_CSS));
  mate.loadURL(BASE + "/mate");
  mate.on("closed", () => app.quit());
}

function createMenu() {
  menu = new BrowserWindow({
    width: 196, height: 250, show: false, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, backgroundColor: "#00000000", webPreferences: webPrefs,
  });
  menu.webContents.on("did-finish-load", () => menu.webContents.insertCSS(CLEAR_CSS));
  menu.loadURL(BASE + "/tray-menu");
  menu.on("blur", () => menu.hide());
}

function showMenu() {
  const tb = tray.getBounds();
  const pt = tb.width ? { x: tb.x + tb.width / 2, y: tb.y } : screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(pt);
  const [mw, mh] = menu.getSize();
  const x = Math.min(Math.max(Math.round(pt.x - mw / 2), workArea.x), workArea.x + workArea.width - mw);
  const y = pt.y > workArea.y + workArea.height / 2 ? workArea.y + workArea.height - mh - 4 : workArea.y + 4;
  menu.setPosition(x, y);
  menu.webContents.send("cmd", "refresh");
  menu.show();
  menu.focus();
}

function openMainframe() {
  if (mainframe && !mainframe.isDestroyed()) { mainframe.show(); mainframe.focus(); return; }
  mainframe = new BrowserWindow({
    width: 480, height: 760, frame: false, transparent: true, resizable: false,
    backgroundColor: "#00000000", title: "Jarvis Mainframe", icon: ICON, webPreferences: webPrefs,
  });
  mainframe.webContents.on("did-finish-load", () => mainframe.webContents.insertCSS(CLEAR_CSS));
  mainframe.loadURL(BASE + "/mainframe");
}

function moveTo(where) {
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const pos = {
    "bottom-right": [a.x + a.width - W - 10, a.y + a.height - H],
    "bottom-left": [a.x + 10, a.y + a.height - H],
    "top-right": [a.x + a.width - W - 10, a.y + 10],
    "top-left": [a.x + 10, a.y + 10],
    center: [a.x + (a.width - W) / 2, a.y + (a.height - H) / 2],
  }[where];
  if (pos) mate.setPosition(Math.round(pos[0]), Math.round(pos[1]));
  mate.show();
}

ipcMain.on("move-by", (e, dx, dy) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  const [x, y] = w.getPosition();
  w.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on("set-ignore", (e, ignore) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on("cmd", (e, name, arg) => {
  const sender = BrowserWindow.fromWebContents(e.sender);
  if (name !== "settings-changed" && sender === menu) menu.hide();
  switch (name) {
    case "mainframe": return openMainframe();
    case "toggle": return mate.isVisible() ? mate.hide() : mate.show();
    case "hide": return mate.hide();
    case "show": return mate.show();
    case "move": return moveTo(arg);
    case "reload": return mate.reload();
    case "quit": return app.quit();
    case "mf-close": return sender && sender.close();
    case "mf-min": return sender && sender.minimize();
    default:
      // size, wake, talk, type, settings-changed → let Jarvis handle it
      if (mate && !mate.isDestroyed()) mate.webContents.send("cmd", name, arg);
  }
});

// Local / custom brains are called from here so there are no browser restrictions.
ipcMain.handle("chat", async (_e, { url, key, model, messages }) => {
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (j.error && (j.error.message || j.error)) || "HTTP " + r.status };
    return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "" };
  } catch (err) {
    return { error: "Couldn't reach " + url + ". Is it running?" };
  }
});

// ---------- One-click local brain: installs Ollama if needed, then downloads the model ----------
const OLLAMA = "http://127.0.0.1:11434";
const ping = () => fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(2000) }).then((r) => r.json()).catch(() => null);
const progress = (e, text, pct) => e.sender.send("cmd", "setup-progress", { text, pct });
const ollamaExe = () => [
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama app.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe"),
].find((p) => fs.existsSync(p));

async function waitForOllama(e, secs) {
  for (let i = 0; i < secs; i++) {
    if (await ping()) return true;
    progress(e, "Starting the local engine…", null);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

ipcMain.handle("local-status", async (_e, model) => {
  const tags = await ping();
  return { running: !!tags, hasModel: !!tags && (tags.models || []).some((m) => m.name === model || m.name === model + ":latest") };
});

ipcMain.handle("local-setup", async (e, model) => {
  try {
    if (!(await ping())) {
      let exe = ollamaExe();
      if (!exe) {
        if (process.platform !== "win32") return { error: "Automatic install is Windows-only. Install Ollama from ollama.com." };
        const file = path.join(os.tmpdir(), "OllamaSetup.exe");
        const r = await fetch("https://ollama.com/download/OllamaSetup.exe");
        if (!r.ok || !r.body) return { error: "Couldn't download the local engine." };
        const total = Number(r.headers.get("content-length")) || 0;
        let got = 0;
        const out = fs.createWriteStream(file);
        for await (const chunk of r.body) {
          got += chunk.length;
          out.write(Buffer.from(chunk));
          progress(e, "Downloading the local engine…", total ? got / total : null);
        }
        await new Promise((res) => out.end(res));
        progress(e, "Installing the local engine…", null);
        await new Promise((res) => spawn(file, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], { stdio: "ignore" }).on("exit", res).on("error", res));
        exe = ollamaExe();
      }
      if (exe) spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
      if (!(await waitForOllama(e, 90))) return { error: "The local engine didn't start. Try again in a minute." };
    }
    progress(e, "Downloading " + model + "…", 0);
    const r = await fetch(OLLAMA + "/api/pull", { method: "POST", body: JSON.stringify({ model, stream: true }) });
    if (!r.ok || !r.body) return { error: "Couldn't start the model download." };
    let buf = "";
    const dec = new TextDecoder();
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        const j = JSON.parse(l);
        if (j.error) return { error: j.error };
        const gb = (n) => (n / 1e9).toFixed(1);
        progress(e, j.total ? `Downloading ${model}… ${gb(j.completed || 0)} / ${gb(j.total)} GB` : j.status, j.total ? (j.completed || 0) / j.total : null);
      }
    }
    progress(e, "Ready.", 1);
    return { ok: true };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

app.on("second-instance", () => mate && mate.show());

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === "media");
  createMate();
  createMenu();
  const img = nativeImage.createFromPath(path.join(__dirname, process.platform === "win32" ? "tray.ico" : "tray.png"));
  tray = new Tray(img);
  tray.setToolTip("Jarvis");
  tray.on("click", showMenu);
  tray.on("right-click", showMenu);
});

app.on("window-all-closed", () => app.quit());
