// Jarvis Desktop Mate — a transparent, always-on-top companion window.
const path = require("path");
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, session } = require("electron");

const MATE_URL = process.env.JARVIS_URL || "https://pocket-jarvis-desktop-mate.lovable.app/mate";

let win;
let tray;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const w = 300, h = 380;
  win = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + workArea.width - w - 20,
    y: workArea.y + workArea.height - h - 10,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true);
  win.loadURL(MATE_URL);
}

app.whenReady().then(() => {
  // Allow the microphone so you can talk to Jarvis.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
  createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "tray.png")));
  tray.setToolTip("Jarvis");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show / hide Jarvis", click: () => (win.isVisible() ? win.hide() : win.show()) },
      { label: "Reload", click: () => win.reload() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
});

app.on("window-all-closed", () => app.quit());
