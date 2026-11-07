// Jarvis Desktop Mate — transparent, always-on-top companion with a custom tray menu and Mainframe window.
const path = require("path");
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
    width: 250, height: 380, show: false, frame: false, transparent: true, resizable: false,
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
