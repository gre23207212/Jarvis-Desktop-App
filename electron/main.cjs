// Jarvis Desktop Mate — transparent, always-on-top companion with a custom tray menu and Mainframe window.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { app, BrowserWindow, Tray, nativeImage, screen, session, ipcMain, shell, desktopCapturer, globalShortcut } = require("electron");

const BASE = process.env.JARVIS_URL || "https://pocket-jarvis-desktop-mate.lovable.app";
const ICON = path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png");
const REACTOR_PNG = path.join(__dirname, "icon.png");
const trayIcon = () => nativeImage.createFromPath(REACTOR_PNG).resize({ width: process.platform === "darwin" ? 22 : 24, height: process.platform === "darwin" ? 22 : 24 });
const W = 380, H = 520;

let mate, menu, mainframe, tray;

app.setAppUserModelId("Jarvis.DesktopMate");
app.setName("Jarvis Desktop");

// ---------- Install / uninstall (custom screens, per-user, no admin) ----------
const IS_WIN = process.platform === "win32";
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), "Programs", "Jarvis Desktop");
const UNINST_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\JarvisDesktopMate";
const SRC_DIR = path.dirname(process.execPath);
const INSTALLED_EXE = path.join(INSTALL_DIR, path.basename(process.execPath));
const shortcutPaths = () => ({
  desktop: path.join(app.getPath("desktop"), "Jarvis Desktop.lnk"),
  start: path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Jarvis Desktop.lnk"),
});
const MODE = process.argv.includes("--uninstall") ? "uninstall"
  : IS_WIN && app.isPackaged && !process.argv.includes("--portable") && !SRC_DIR.toLowerCase().startsWith(INSTALL_DIR.toLowerCase()) ? "install"
  : "run";
let setupWin;

function openSetup(mode) {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.focus(); return; }
  setupWin = new BrowserWindow({
    width: 640, height: 400, frame: false, transparent: true, resizable: false, backgroundColor: "#00000000",
    title: mode === "install" ? "Install Jarvis" : "Remove Jarvis", icon: ICON, webPreferences: webPrefs,
  });
  setupWin.loadFile(path.join(__dirname, "setup.html"), { query: { mode } });
  setupWin.on("closed", () => { setupWin = null; if (MODE !== "run") app.quit(); });
}

const reg = (args) => new Promise((res) => spawn("reg", args, { stdio: "ignore", windowsHide: true }).on("exit", res).on("error", res));

async function installJarvis(step, opts) {
      step("Copying Jarvis's systems…", 0.1);
      // During a self-update the old Jarvis may still be closing, so retry until its files are free.
      for (let i = 0; i < 20; i++) {
        try { await fs.promises.rm(INSTALL_DIR, { recursive: true, force: true }); break; }
        catch (err) { if (i === 19) throw err; await new Promise((r) => setTimeout(r, 500)); }
      }
      await fs.promises.cp(SRC_DIR, INSTALL_DIR, { recursive: true, force: true });
      step("Creating shortcuts…", 0.75);
      const icon = INSTALLED_EXE; // the exe carries the Jarvis icon
      const link = { target: INSTALLED_EXE, cwd: INSTALL_DIR, icon, iconIndex: 0, appUserModelId: "Jarvis.DesktopMate", description: "Jarvis Desktop" };
      const sc = shortcutPaths();
      fs.mkdirSync(path.dirname(sc.start), { recursive: true });
      shell.writeShortcutLink(sc.start, link);
      if (opts.desktop) shell.writeShortcutLink(sc.desktop, link);
      step("Registering with Windows…", 0.9);
      const add = (name, type, data) => reg(["add", UNINST_KEY, "/v", name, "/t", type, "/d", data, "/f"]);
      await add("DisplayName", "REG_SZ", "Jarvis Desktop");
      await add("DisplayIcon", "REG_SZ", icon);
      await add("Publisher", "REG_SZ", "Jarvis");
      await add("DisplayVersion", "REG_SZ", app.getVersion());
      await add("InstallLocation", "REG_SZ", INSTALL_DIR);
      await add("UninstallString", "REG_SZ", `"${INSTALLED_EXE}" --uninstall`);
      await add("NoModify", "REG_DWORD", "1");
      await add("NoRepair", "REG_DWORD", "1");
      app.setLoginItemSettings({ openAtLogin: !!opts.startup, path: INSTALLED_EXE });
      step("Online. Launching Jarvis…", 1);
      spawn(INSTALLED_EXE, [], { detached: true, stdio: "ignore", cwd: INSTALL_DIR }).unref();
      setTimeout(() => app.quit(), 900);
      return { ok: true };
}

// Self-update hand-off: no wizard, keeps the previous shortcut/startup choices, then relaunches.
async function runSilentUpdate() {
  try {
    await installJarvis(() => {}, { desktop: process.argv.includes("--desktop"), startup: process.argv.includes("--startup") });
  } catch (err) {
    const { dialog } = require("electron");
    dialog.showErrorBox("Jarvis update failed", `${(err && err.message) || err}\n\nRun this file again to retry:\n${process.execPath}`);
    app.quit();
  }
}

ipcMain.on("setup-close", () => setupWin && setupWin.close());
ipcMain.on("setup-min", () => setupWin && setupWin.minimize());
ipcMain.handle("setup-run", async (e, mode, opts = {}) => {
  const step = (text, pct) => e.sender.send("setup-progress", { text, pct });
  try {
    if (mode === "install") return await installJarvis(step, opts);
    step("Removing shortcuts…", 0.3);
    const sc = shortcutPaths();
    for (const p of [sc.desktop, sc.start]) fs.rmSync(p, { force: true });
    app.setLoginItemSettings({ openAtLogin: false, path: INSTALLED_EXE });
    step("Unregistering…", 0.6);
    await reg(["delete", UNINST_KEY, "/f"]);
    step("Wiping saved data…", 0.8);
    // Saved channels, voices, memory, settings and sir.md all live in userData; erase them too.
    await session.defaultSession.clearStorageData().catch(() => {});
    const DATA_DIR = app.getPath("userData");
    step("Goodbye, sir.", 1);
    // Files can't be deleted while Jarvis is running, so a tiny helper waits for us to exit.
    spawn("cmd.exe", ["/c", `ping 127.0.0.1 -n 3 >nul & rmdir /s /q "${INSTALL_DIR}" & rmdir /s /q "${DATA_DIR}"`], { detached: true, stdio: "ignore", windowsHide: true, cwd: os.tmpdir() }).unref();
    setTimeout(() => app.quit(), 900);
    return { ok: true };
  } catch (err) {
    const msg = String((err && err.message) || err);
    return { error: /EBUSY|EPERM/.test(msg) ? "Jarvis is still running from the install folder. Quit him from the tray and try again." : msg };
  }
});

if (MODE === "run" && !app.requestSingleInstanceLock()) app.quit();

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
    title: "Jarvis Desktop", icon: ICON, webPreferences: { ...webPrefs, autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false },
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
  // Sit just above the tray icon (or the overflow flyout icon), never on top of it.
  const above = Math.round(pt.y - mh - 8);
  const y = above >= workArea.y ? above : Math.round(tb.y + (tb.height || 0) + 8);
  menu.setPosition(x, y);
  menu.webContents.send("cmd", "refresh");
  menu.show();
  menu.focus();
}

function openMainframe() {
  if (mainframe && !mainframe.isDestroyed()) { mainframe.show(); mainframe.focus(); return; }
  const wa = screen.getPrimaryDisplay().workArea;
  mainframe = new BrowserWindow({
    width: 520, height: Math.min(760, wa.height - 20), frame: false, transparent: true, resizable: false,
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
    case "uninstall": return openSetup("uninstall");
    case "always-on-top": mate.setAlwaysOnTop(!!arg, "floating"); return;
    case "startup":
      try { app.setLoginItemSettings({ openAtLogin: !!arg, ...(typeof INSTALLED_EXE !== "undefined" ? { path: INSTALLED_EXE } : {}) }); } catch { /* ignore */ }
      return;
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

// ---------- Skills: apps, Spotify, Discord, voice into VB-Cable ----------
// "Clip that": saves a screen recording into Videos\Jarvis Clips and shows it in Explorer.
ipcMain.handle("save-clip", async (_e, b64, opts = {}) => {
  try {
    const dir = path.join(app.getPath("videos"), "Jarvis Clips");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `Clip ${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.webm`);
    fs.writeFileSync(file, Buffer.from(String(b64), "base64"));
    if (!opts || opts.openFolder !== false) shell.showItemInFolder(file);
    return { ok: true, file };
  } catch (err) { return { error: String((err && err.message) || err) }; }
});
ipcMain.on("open-url", (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

let appCache = null;
function scanApps() {
  if (appCache) return appCache;
  const roots = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    app.getPath("desktop"),
  ];
  const found = new Map();
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(ent.name)) {
        const name = ent.name.replace(/\.(lnk|url)$/i, "");
        if (!/uninstall|readme|help|documentation|website/i.test(name) && !found.has(name.toLowerCase())) found.set(name.toLowerCase(), { name, path: p });
      }
    }
  };
  roots.forEach((r) => walk(r, 0));
  appCache = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  setTimeout(() => (appCache = null), 60000);
  return appCache;
}
const URI_APPS = { spotify: "spotify:", discord: "discord://", steam: "steam://open/main", settings: "ms-settings:", "microsoft store": "ms-windows-store:" };

ipcMain.handle("apps-list", () => scanApps().map((a) => a.name));
ipcMain.handle("open-app", async (_e, query) => {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return { error: "no app" };
  const apps = scanApps();
  const hit = apps.find((a) => a.name.toLowerCase() === q) || apps.find((a) => a.name.toLowerCase().startsWith(q)) || apps.find((a) => a.name.toLowerCase().includes(q))
    || apps.find((a) => q.split(/\s+/).every((w) => a.name.toLowerCase().includes(w)));
  if (hit) { const err = await shell.openPath(hit.path); return err ? { error: err } : { ok: true, name: hit.name }; }
  if (URI_APPS[q]) { await shell.openExternal(URI_APPS[q]).catch(() => {}); return { ok: true, name: query }; }
  return { error: "not found" };
});

const ps = (script, env = {}) => new Promise((res) => {
  const p = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, env: { ...process.env, ...env } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.on("exit", () => res(out.trim()));
  p.on("error", () => res(""));
});

// Opens Spotify, brings it forward on the main screen, visibly types the search, then plays the top result.
ipcMain.handle("spotify-play", async (_e, query) => {
  if (!IS_WIN) return { error: "Windows only" };
  await shell.openExternal("spotify:").catch(() => {});
  const script = `
$w = New-Object -ComObject WScript.Shell
Add-Type 'using System;using System.Runtime.InteropServices;public class J{[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);}'
$p = $null
for ($i = 0; $i -lt 30 -and -not $p; $i++) { Start-Sleep -Milliseconds 500; $p = Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
if (-not $p) { 'nospotify'; exit }
[J]::ShowWindow($p.MainWindowHandle, 3) | Out-Null
[J]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
$null = $w.AppActivate($p.Id)
Start-Sleep -Milliseconds 1200
$w.SendKeys('^k'); Start-Sleep -Milliseconds 700
foreach ($c in $env:JQ.ToCharArray()) { $k = [string]$c; if ('+^%~(){}[]'.Contains($k)) { $k = '{' + $k + '}' }; $w.SendKeys($k); Start-Sleep -Milliseconds 75 }
Start-Sleep -Milliseconds 1800
$w.SendKeys('+{ENTER}')
'ok'`;
  const r = await ps(script, { JQ: String(query).slice(0, 120) });
  return r.endsWith("ok") ? { ok: true } : { error: r === "nospotify" ? "Spotify didn't open. Is it installed?" : "Couldn't control Spotify." };
});

ipcMain.handle("discord-join", async (_e, link) => {
  const m = String(link || "").match(/channels\/(\d+|@me)\/(\d+)/);
  if (!m) return { error: "Bad Discord link" };
  await shell.openExternal(`discord://-/channels/${m[1]}/${m[2]}`).catch(() => {});
  if (!IS_WIN) return { ok: true };
  // Discord stops on a "Join Voice" preview; bring it forward and click that button (centre of the chat area).
  // The button moves depending on who's already in the call, so find it by its name instead of a fixed spot.
  const r = await ps(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type 'using System;using System.Runtime.InteropServices;public class D{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int e);}'
$p = $null
for ($i = 0; $i -lt 20 -and -not $p; $i++) { Start-Sleep -Milliseconds 500; $p = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
if (-not $p) { 'nodiscord'; exit }
[D]::ShowWindow($p.MainWindowHandle, 3) | Out-Null
[D]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
$root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Join Voice')
for ($i = 0; $i -lt 24; $i++) {
  Start-Sleep -Milliseconds 500
  $b = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($b) {
    try { $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'ok'; exit } catch {}
    $rc = $b.Current.BoundingRectangle
    [D]::SetCursorPos([int]($rc.X + $rc.Width / 2), [int]($rc.Y + $rc.Height / 2)) | Out-Null
    [D]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60; [D]::mouse_event(4,0,0,0,0)
    'ok'; exit
  }
}
'nobutton'`).catch(() => "");
  if (r.endsWith("nobutton")) return { ok: true, joined: false };
  return { ok: true, joined: r.endsWith("ok") };
});

// Set self-mute, not a blind keyboard toggle: an already-muted microphone must stay muted.
ipcMain.handle("discord-mute", async () => {
  if (!IS_WIN) return { error: "Discord muting is Windows only" };
  const r = await ps(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type 'using System;using System.Runtime.InteropServices;public class DM{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'
$p = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { 'nodiscord'; exit }
[DM]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[DM]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
function Find-Mic($root, $label) {
  $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($item in $items) {
    if ($item.Current.IsOffscreen -or -not $item.Current.IsEnabled) { continue }
    $name = $item.Current.Name
    if ($name -match ('^' + $label + '(?:$|\\s*\\()') -and ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::CheckBox)) { return $item }
  }
  return $null
}
$clicked = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Milliseconds 250
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
  if (Find-Mic $root 'Unmute') { 'ok'; exit }
  if ($clicked) { continue }
  $button = Find-Mic $root 'Mute'
  if ($button) {
    try { $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); $clicked = $true } catch {
      try {
        $toggle = $button.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
        if ($toggle.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::Off) { $toggle.Toggle() }
        $clicked = $true
      } catch {}
    }
  }
}
'notconfirmed'`);
  return r.endsWith("ok") ? { ok: true } : { error: "Couldn't confirm Discord microphone is muted" };
});

// Jarvis's own voice rendered to a WAV so it can be played into any output (e.g. VB-Cable).
// End-user credentials stay on their PC; never use the publisher's account or log keys.
ipcMain.handle("eleven-voices", async (_e, key) => {
  try {
    if (typeof key !== "string" || !key) return { error: "Add your ElevenLabs key first." };
    const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { error: `ElevenLabs ${response.status}: ${await response.text()}` };
    const data = await response.json();
    return { voices: (data.voices || []).map((voice) => ({ id: voice.voice_id, name: voice.name, custom: voice.category !== "premade" })) };
  } catch { return { error: "Couldn't reach ElevenLabs." }; }
});
ipcMain.handle("eleven-speech", async (_e, request) => {
  try {
    const { text, key, voiceId, model } = request || {};
    if (typeof text !== "string" || !text || text.length > 5000 || typeof key !== "string" || !key || typeof voiceId !== "string" || !voiceId) return { error: "Check your ElevenLabs voice settings." };
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model || "eleven_flash_v2_5" }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { error: `ElevenLabs ${response.status}: ${await response.text()}` };
    return { audio: Buffer.from(await response.arrayBuffer()).toString("base64") };
  } catch { return { error: "Couldn't reach ElevenLabs. Using your system voice." }; }
});
// Uses the same Windows voice the mate speaks with (e.g. "Microsoft George"), falling back to any male English voice.
ipcMain.handle("voice-wav", async (_e, text, voiceName) => {
  if (!IS_WIN) return { error: "Windows only" };
  const file = path.join(os.tmpdir(), `jarvis-say-${Date.now()}.wav`);
  const env = { JF: file, JT: String(text).slice(0, 600), JV: String(voiceName || "") };
  await ps(`Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
function Wait-Op($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$v = $all | Where-Object { $env:JV -and $env:JV.StartsWith($_.DisplayName) } | Select-Object -First 1
if (-not $v) { $v = $all | Where-Object { $_.Language -eq 'en-GB' -and [string]$_.Gender -eq 'Male' } | Select-Object -First 1 }
if (-not $v) { $v = $all | Where-Object { $_.Language -like 'en-*' -and [string]$_.Gender -eq 'Male' } | Select-Object -First 1 }
if ($v) { $s.Voice = $v }
try { $s.Options.AudioPitch = 0.9 } catch {}
$st = Wait-Op ($s.SynthesizeTextToStreamAsync($env:JT)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$size = [uint32]$st.Size
$r = New-Object Windows.Storage.Streams.DataReader($st.GetInputStreamAt(0))
$null = Wait-Op ($r.LoadAsync($size)) ([uint32])
$bytes = New-Object byte[] $size
$r.ReadBytes($bytes)
[IO.File]::WriteAllBytes($env:JF, $bytes)`, env);
  if (!fs.existsSync(file)) {
    // Older Windows: classic voices, still preferring a male one.
    await ps(`Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Male) } catch {}
$s.SetOutputToWaveFile($env:JF); $s.Speak($env:JT); $s.Dispose()`, env);
  }
  try { const b = fs.readFileSync(file); fs.rmSync(file, { force: true }); return { wav: b.toString("base64") }; } catch { return { error: "voice failed" }; }
});

// Swaps the Windows default microphone to VB-Cable ("CABLE Output") while Jarvis talks in a call, then puts yours back.
// Discord set to Input Device "Default" follows this automatically, so nothing needs clicking in Discord.
const AUDIO_CS = `
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct PKey { public Guid fmt; public int pid; }
[StructLayout(LayoutKind.Explicit)] public struct PVar { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr pad; }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropStore { int GetCount(out int c); int GetAt(int i, out PKey k); int GetValue(ref PKey k, out PVar v); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDev { int Activate(ref Guid iid, int ctx, IntPtr p, out IntPtr o); int OpenPropertyStore(int a, out IPropStore s); int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); int GetState(out int s); }
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevs { int GetCount(out int n); int Item(int i, out IMMDev d); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMEnum { int EnumAudioEndpoints(int flow, int mask, out IMMDevs d); int GetDefaultAudioEndpoint(int flow, int role, out IMMDev d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMEnum {}
[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicy {
  int A([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr x); int B([MarshalAs(UnmanagedType.LPWStr)] string id, int b, IntPtr x);
  int C([MarshalAs(UnmanagedType.LPWStr)] string id); int D([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr x, IntPtr y);
  int E([MarshalAs(UnmanagedType.LPWStr)] string id, int b, IntPtr x, IntPtr y); int F([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr x);
  int G([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr x); int H([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr x);
  int I([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr k, IntPtr v); int J([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr k, IntPtr v);
  int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyClient {}
public static class JAudio {
  static IMMEnum En() { return (IMMEnum)new MMEnum(); }
  public static string Default(int flow, int role) { IMMDev d; if (En().GetDefaultAudioEndpoint(flow, role, out d) != 0 || d == null) return ""; string id; d.GetId(out id); return id; }
  public static string Find(int flow, string match) {
    IMMDevs all; En().EnumAudioEndpoints(flow, 1, out all); int n; all.GetCount(out n);
    PKey k = new PKey(); k.fmt = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.pid = 14;
    for (int i = 0; i < n; i++) { IMMDev d; all.Item(i, out d); IPropStore s; d.OpenPropertyStore(0, out s); PVar v; s.GetValue(ref k, out v);
      string name = v.p == IntPtr.Zero ? "" : Marshal.PtrToStringUni(v.p);
      if (name.IndexOf(match, StringComparison.OrdinalIgnoreCase) >= 0) { string id; d.GetId(out id); return id; } }
    return "";
  }
  public static string List(int flow) {
    IMMDevs all; En().EnumAudioEndpoints(flow, 1, out all); int n; all.GetCount(out n); string o = "";
    PKey k = new PKey(); k.fmt = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.pid = 14;
    for (int i = 0; i < n; i++) { IMMDev d; all.Item(i, out d); IPropStore s; d.OpenPropertyStore(0, out s); PVar v; s.GetValue(ref k, out v);
      if (v.p != IntPtr.Zero) o += Marshal.PtrToStringUni(v.p) + "\n"; }
    return o;
  }
  public static void Set(string id, int role) { ((IPolicy)new PolicyClient()).SetDefaultEndpoint(id, role); }
}`;
let savedAudio = null; // previous Windows default mic + speakers ids, per role
const AUDIO_HEAD = () => `Add-Type -TypeDefinition @'\n${AUDIO_CS}\n'@\n`;
ipcMain.handle("audio-devices", async () => {
  if (!IS_WIN) return { inputs: [], outputs: [] };
  const r = await ps(`${AUDIO_HEAD()}'IN'; [JAudio]::List(1); 'OUT'; [JAudio]::List(0)`);
  const [, ins = "", outs = ""] = r.split(/^(?:IN|OUT)\r?$/m);
  const clean = (t) => t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return { inputs: clean(ins), outputs: clean(outs) };
});
// on: Windows default mic -> cable output, default speakers -> cable input. off: back to chosen defaults (or what was set before).
ipcMain.handle("cable-mic", async (_e, on, opts = {}) => {
  if (!IS_WIN) return { error: "Windows only" };
  if (on) {
    if (savedAudio) return { error: "Audio relay is already active." };
    const r = await ps(`${AUDIO_HEAD()}$mic = [JAudio]::Find(1, $env:JCO); $spk = [JAudio]::Find(0, $env:JCI)
if (-not $mic) { 'nocable'; exit }
$pm = @(0,1,2 | ForEach-Object { [JAudio]::Default(1, $_) }) -join '|'
$ps = @(0,1,2 | ForEach-Object { [JAudio]::Default(0, $_) }) -join '|'
0,1,2 | ForEach-Object { [JAudio]::Set($mic, $_); if ($spk -and $env:JKEEP -ne 'yes') { [JAudio]::Set($spk, $_) } }
"ok:$pm;$ps"`, { JCO: opts.cableOut || "CABLE Output", JCI: opts.cableIn || "CABLE Input", JKEEP: opts.preserveOutput ? "yes" : "no" });
    if (r.includes("nocable")) return { error: "VB-Cable isn't installed" };
    const m = r.match(/ok:(.*)$/m);
    if (!m) return { error: "Couldn't switch audio devices" };
    if (!savedAudio) savedAudio = m[1];
    return { ok: true };
  }
  const [pm = "", pspk = ""] = (savedAudio || ";").split(";");
  savedAudio = null;
  const r = await ps(`${AUDIO_HEAD()}$pm = $env:JPM.Split('|'); $pspk = $env:JPS.Split('|')
$mic = if ($env:JDI) { [JAudio]::Find(1, $env:JDI) } else { '' }
$spk = if ($env:JDO) { [JAudio]::Find(0, $env:JDO) } else { '' }
for ($i = 0; $i -lt 3; $i++) {
  $a = if ($mic) { $mic } else { $pm[$i] }; if ($a) { [JAudio]::Set($a, $i) }
  $b = if ($spk) { $spk } else { $pspk[$i] }; if ($b) { [JAudio]::Set($b, $i) } }
'ok'`, { JPM: pm, JPS: pspk, JDI: opts.defaultIn || "", JDO: opts.defaultOut || "" });
  return r.trim().endsWith("ok") ? { ok: true } : { error: "Couldn't restore audio devices" };
});

// ---------- Global hotkeys, reticle overlay, docking physics, window & media control ----------
let snapTimer = null, orbitTimer = null, overlay = null, shareWin = null, lastEscAt = 0, escGrabbed = false;

const stopDocking = () => {
  if (snapTimer) { clearInterval(snapTimer); snapTimer = null; }
  if (orbitTimer) { clearInterval(orbitTimer); orbitTimer = null; }
};

const run = (cmd, args, opts = {}) => new Promise((res) => {
  const p = spawn(cmd, args, { windowsHide: true, ...opts });
  let out = "";
  p.stdout?.on("data", (d) => (out += d));
  p.on("exit", () => res(out.trim()));
  p.on("error", () => res(""));
});
const osa = (script) => run("osascript", ["-e", script]);

// Active-window bounds per platform. Wayland has no global window list; returns null and Jarvis stays put.
async function activeWindowRect() {
  try {
    if (IS_WIN) {
      const r = await ps(`Add-Type 'using System;using System.Runtime.InteropServices;public struct JRect{public int L,T,R,B;}public class JWin{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out JRect r);}'
$h=[JWin]::GetForegroundWindow(); if ($h -eq [IntPtr]::Zero) { 'none'; exit }
$r=New-Object JRect; [JWin]::GetWindowRect($h,[ref]$r) | Out-Null
"$($r.L),$($r.T),$($r.R),$($r.B)"`);
      const [l, t, rt, b] = r.split(",").map(Number);
      if (![l, t, rt, b].every(Number.isFinite)) return null;
      const rect = { x: l, y: t, w: rt - l, h: b - t };
      return rect.w > 120 && rect.h > 120 ? rect : null;
    }
    if (process.platform === "darwin") {
      const r = await osa('tell application "System Events" to tell (first application process whose frontmost is true) to get {position, size} of front window');
      const [x, y, w, h] = String(r).split(",").map(Number);
      return [x, y, w, h].every(Number.isFinite) && w > 120 && h > 120 ? { x, y, w, h } : null;
    }
    if (process.platform === "linux") {
      const r = await run("sh", ["-c", "xdotool getactivewindow getwindowgeometry --shell 2>/dev/null"]);
      const env = Object.fromEntries(String(r).split("\n").filter(Boolean).map((l) => l.split("=")));
      const x = Number(env.X), y = Number(env.Y), w = Number(env.WIDTH), h = Number(env.HEIGHT);
      return [x, y, w, h].every(Number.isFinite) && w > 120 && h > 120 ? { x, y, w, h } : null;
    }
  } catch { /* no active-window info on this platform */ }
  return null;
}

// The reactor lives in the bottom-middle of the 380x520 window, so parking the window's bottom edge
// near a title bar's top-right corner docks the reactor onto that title bar.
async function dockToActive() {
  if (!mate || mate.isDestroyed()) return;
  const r = await activeWindowRect();
  if (!r) return;
  mate.setPosition(Math.round(r.x + r.w - W + 50), Math.round(r.y - H + 170));
}

ipcMain.on("snap-to-active", () => {
  if (orbitTimer) { clearInterval(orbitTimer); orbitTimer = null; }
  if (!snapTimer) snapTimer = setInterval(dockToActive, 1200);
  dockToActive();
});
ipcMain.on("unsnap", () => stopDocking());
ipcMain.on("orbit", (_e, on) => {
  if (snapTimer) { clearInterval(snapTimer); snapTimer = null; }
  if (orbitTimer) { clearInterval(orbitTimer); orbitTimer = null; }
  if (!on) return;
  orbitTimer = setInterval(() => {
    if (!mate || mate.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(p);
    const tx = Math.min(Math.max(p.x + 36, d.workArea.x), d.workArea.x + d.workArea.width - W);
    const ty = Math.min(Math.max(p.y + 36, d.workArea.y), d.workArea.y + d.workArea.height - H);
    const [cx, cy] = mate.getPosition();
    if (Math.abs(cx - tx) < 4 && Math.abs(cy - ty) < 4) return;
    mate.setPosition(Math.round(cx + (tx - cx) * 0.25), Math.round(cy + (ty - cy) * 0.25));
  }, 40);
});

// ---------- OS window & app management ----------
const WAPP = `Add-Type 'using System;using System.Runtime.InteropServices;public class JWX{[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern IntPtr PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);}'
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.ProcessName -match $env:JWA }
if (-not $procs) { 'notfound'; exit }
foreach ($p in $procs) {
  if ($env:JWACT -eq 'minimize') { [JWX]::ShowWindow($p.MainWindowHandle, 6) | Out-Null }
  elseif ($env:JWACT -eq 'maximize') { [JWX]::ShowWindow($p.MainWindowHandle, 3) | Out-Null; [JWX]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }
  elseif ($env:JWACT -eq 'focus') { [JWX]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [JWX]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }
  else { [JWX]::PostMessage($p.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
}
'ok'`;

// Move a matching top-level window using native Windows coordinates, preserving its size.
// This does not hijack the user's mouse or simulate a drag.
const MOVE_WINDOW_PS = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type 'using System;using System.Runtime.InteropServices;public class JWM { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r); [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint flags); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd); [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; } }'
$procs = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.ProcessName -match $env:JWA })
if (-not $procs.Count) { 'notfound'; exit }
$monitors = @([System.Windows.Forms.Screen]::AllScreens)
$target = if ($env:JWACT -eq 'move-main') { $monitors | Where-Object { $_.Primary } | Select-Object -First 1 } else { $monitors | Where-Object { -not $_.Primary } | Select-Object -First 1 }
if (-not $target) { 'nomonitor'; exit }
$p = $procs[0]
[JWM]::ShowWindow($p.MainWindowHandle,9) | Out-Null
$rect = New-Object JWM+RECT
if (-not [JWM]::GetWindowRect($p.MainWindowHandle,[ref]$rect)) { 'failed'; exit }
$w = [Math]::Min([Math]::Max(200,$rect.Right-$rect.Left),$target.WorkingArea.Width)
$h = [Math]::Min([Math]::Max(150,$rect.Bottom-$rect.Top),$target.WorkingArea.Height)
$x = $target.WorkingArea.X + [int](($target.WorkingArea.Width-$w)/2)
$y = $target.WorkingArea.Y + [int](($target.WorkingArea.Height-$h)/2)
if ([JWM]::SetWindowPos($p.MainWindowHandle,[IntPtr]::Zero,$x,$y,$w,$h,0x0044)) { 'ok' } else { 'failed' }
`;

ipcMain.handle("window-control", async (_e, action, appQ) => {
  const act = ["minimize", "maximize", "focus", "close", "move-main", "move-secondary"].includes(String(action)) ? String(action) : "";
  const q = String(appQ || "").trim();
  if (!act || !q) return { error: "Which app, sir?" };
  try {
    if (IS_WIN) {
      const r = await ps(act.startsWith("move-") ? MOVE_WINDOW_PS : WAPP, { JWA: q.replace(/[.*+?^${}()|[\]\\]/g, ".*"), JWACT: act });
      return r.includes("notfound") ? { error: "notfound" } : r.includes("nomonitor") ? { error: "No secondary monitor is connected." } : r.includes("failed") ? { error: "Windows could not move that application." } : { ok: true };
    }
    if (act.startsWith("move-")) return { error: "Moving windows between monitors is currently supported on Windows." };
    if (process.platform === "darwin") {
      const name = q.replace(/"/g, "");
      if (act === "focus") { await osa(`tell application "${name}" to activate`); return { ok: true }; }
      if (act === "close") { await osa(`tell application "${name}" to quit`); return { ok: true }; }
      if (act === "minimize") {
        const r = await osa(`tell application "System Events" to tell process "${name}" to click (first button whose subrole is "AXMinimizeButton") of window 1`);
        return r ? { ok: true } : { error: "notfound" };
      }
      return { error: "notfound" };
    }
    if (process.platform === "linux") {
      // X11 window placement via wmctrl/xdotool.
      const hasTool = await run("sh", ["-c", "command -v wmctrl"]).then((r) => !!r).catch(() => false);
      if (!hasTool) return { error: "Install wmctrl and xdotool for window control on Linux, sir." };
      if (act === "focus") await run("wmctrl", ["-a", q]);
      else if (act === "close") await run("wmctrl", ["-c", q]);
      else await run("sh", ["-c", `xdotool search --name '${q.replace(/'/g, "")}' windowminimize 2>/dev/null`]);
      return { ok: true };
    }
  } catch (err) { return { error: String((err && err.message) || err) }; }
  return { error: "Window control needs a desktop OS, sir." };
});

// ---------- Universal media engine: virtual media keys + now playing ----------
const MKEYS = { playpause: "0xB3", next: "0xB0", previous: "0xB1", volumemute: "0xAD", volumeup: "0xAF", volumedown: "0xAE" };
const MWIN = `Add-Type 'using System;using System.Runtime.InteropServices;public class JMK{[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte e,uint f,UIntPtr d);}'
$k=[byte]$env:JK
[JMK]::keybd_event($k,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[JMK]::keybd_event($k,0,2,[UIntPtr]::Zero)
'ok'`;

ipcMain.handle("media-key", async (_e, action) => {
  const act = String(action || "");
  try {
    if (IS_WIN) {
      const code = MKEYS[act];
      if (!code) return { error: "Unknown media action" };
      await ps(MWIN, { JK: code });
      return { ok: true };
    }
    if (process.platform === "darwin") {
      const map = { playpause: "playpause", next: "next track", previous: "previous track" };
      if (map[act]) {
        const spotify = String(await osa('exists process "Spotify"')).trim() === "true";
        await osa(`tell application "${spotify ? "Spotify" : "Music"}" to ${map[act]}`);
        return { ok: true };
      }
      if (act === "volumeup" || act === "volumedown") {
        await osa(`set volume output volume (((output volume of (get volume settings)) as integer) ${act === "volumeup" ? "+" : "-"} 10)`);
        return { ok: true };
      }
      if (act === "volumemute") { await osa("set volume output muted (not (output muted of (get volume settings)))"); return { ok: true }; }
      return { error: "Unknown media action" };
    }
    if (process.platform === "linux") {
      const map = { playpause: "play-pause", next: "next", previous: "previous", volumeup: "volume-up", volumedown: "volume-down", volumemute: "volume-mute" };
      const arg = map[act];
      if (!arg) return { error: "Unknown media action" };
      await run("sh", ["-c", `playerctl ${arg} 2>/dev/null || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.$(playerctl -l 2>/dev/null | head -1) /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.${arg === "play-pause" ? "PlayPause" : arg.replace(/-(\w)/g, (_m, c) => c.toUpperCase())} 2>/dev/null`]);
      return { ok: true };
    }
  } catch (err) { return { error: String((err && err.message) || err) }; }
  return { error: "Media keys need a desktop OS, sir." };
});

ipcMain.handle("now-playing", async () => {
  try {
    if (IS_WIN) {
      const r = await ps(`$names = 'Spotify','MusicBee','foobar2000','Winamp','AIMP'
foreach ($n in $names) {
  $p = Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
  if ($p) { "$($p.ProcessName)|$($p.MainWindowTitle)"; exit }
}
foreach ($b in 'chrome','msedge','brave','firefox') {
  $p = Get-Process -Name $b -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match '\\s-\\sYouTube\\s*$' } | Select-Object -First 1
  if ($p) { "YouTube|$($p.MainWindowTitle)"; exit }
}
'none'`);
      if (!r || r === "none") return { playing: null };
      const i = r.indexOf("|");
      const player = r.slice(0, i).trim();
      const title = r.slice(i + 1).trim();
      return player && title ? { playing: { player, title } } : { playing: null };
    }
    if (process.platform === "darwin") {
      for (const app of ["Spotify", "Music"]) {
        const exists = String(await osa(`exists process "${app}"`)).trim() === "true";
        if (!exists) continue;
        const info = String(await osa(`tell application "${app}" to (name of current track) & "|" & (artist of current track)`));
        const [name, artist] = info.split("|");
        if (name) return { playing: { player: app, title: artist ? `${artist} - ${name}` : name } };
      }
      return { playing: null };
    }
    if (process.platform === "linux") {
      const r = await run("sh", ["-c", 'playerctl metadata --format "{{player}}|{{artist}} - {{title}}" 2>/dev/null']);
      if (r && r.includes("|")) {
        const i = r.indexOf("|");
        return { playing: { player: r.slice(0, i).replace(/^mpris:org\.mpris\.MediaPlayer2\./, ""), title: r.slice(i + 1).trim() } };
      }
      return { playing: null };
    }
  } catch { /* fall through */ }
  return { playing: null };
});

// ---------- Discord deep integration ----------
// Deafen: same state-aware toggle logic as muting — an already-deafened mic must stay put.
ipcMain.handle("discord-deafen", async () => {
  if (!IS_WIN) return { error: "Discord deafening is Windows only" };
  const r = await ps(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type 'using System;using System.Runtime.InteropServices;public class DD{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'
$p = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { 'nodiscord'; exit }
[DD]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[DD]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
function Find-DN($root, $label) {
  $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($item in $items) {
    if ($item.Current.IsOffscreen -or -not $item.Current.IsEnabled) { continue }
    if ($item.Current.Name -match ('^' + $label + '(?:$|\\s*\\()') -and ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::CheckBox)) { return $item }
  }
  return $null
}
$clicked = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Milliseconds 250
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
  if (Find-DN $root 'Undeafen') { 'ok'; exit }
  if ($clicked) { continue }
  $button = Find-DN $root 'Deafen'
  if ($button) { try { $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); $clicked = $true } catch { try { $button.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle(); $clicked = $true } catch {} } }
}
'notconfirmed'`);
  return r.endsWith("ok") ? { ok: true } : { error: "Couldn't confirm Discord deafen state" };
});

// Sends a text message into a saved Discord text channel: opens the channel, finds the message box, types, Enter.
ipcMain.handle("discord-message", async (_e, link, text) => {
  const m = String(link || "").match(/channels\/(\d+|@me)\/(\d+)/);
  const msg = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1800);
  if (!m || !msg) return { error: "I need a saved channel link and a message, sir." };
  await shell.openExternal(`discord://-/channels/${m[1]}/${m[2]}`).catch(() => {});
  if (!IS_WIN) return { ok: true, typed: false };
  const r = await ps(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type 'using System;using System.Runtime.InteropServices;public class DMsg{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'
$p = $null
for ($i = 0; $i -lt 20 -and -not $p; $i++) { Start-Sleep -Milliseconds 500; $p = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
if (-not $p) { 'nodiscord'; exit }
[DMsg]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[DMsg]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 1500
$root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
$box = $null
for ($i = 0; $i -lt 12 -and -not $box; $i++) {
  Start-Sleep -Milliseconds 400
  $cands = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
  foreach ($c in $cands) { if ($c.Current.Name -match 'Message' -and -not $c.Current.IsOffscreen) { $box = $c; break } }
}
if (-not $box) { 'nobox'; exit }
try { $box.SetFocus() } catch {}
Start-Sleep -Milliseconds 300
$w = New-Object -ComObject WScript.Shell
foreach ($ch in $env:JMSG.ToCharArray()) { $k = [string]$ch; if ('+^%~(){}[]'.Contains($k)) { $k = '{' + $k + '}' }; $w.SendKeys($k); Start-Sleep -Milliseconds 18 }
Start-Sleep -Milliseconds 300
$w.SendKeys('{ENTER}')
'ok'`, { JMSG: msg });
  return r.endsWith("ok") ? { ok: true } : r.endsWith("nodiscord") ? { error: "Discord didn't open, sir." } : { error: "I couldn't reach the message box, sir. Open the channel once and ask again." };
});

// Opens Discord's user settings straight to Voice & Video and tries to set the device dropdowns.
ipcMain.handle("discord-audio-settings", async (_e, input, output) => {
  if (!IS_WIN) return { error: "Discord settings automation is Windows only" };
  const r = await ps(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type 'using System;using System.Runtime.InteropServices;public class DSet{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'
$p = Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { 'nodiscord'; exit }
[DSet]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[DSet]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 800
$w = New-Object -ComObject WScript.Shell
$w.SendKeys('^{,}')
Start-Sleep -Milliseconds 1500
$root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
$nav = $null
for ($i = 0; $i -lt 10 -and -not $nav; $i++) {
  Start-Sleep -Milliseconds 400
  $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($item in $items) { if ($item.Current.Name -match 'Voice (& )?Video' -and $item.Current.IsEnabled -and -not $item.Current.IsOffscreen) { $nav = $item; break } }
}
if (-not $nav) { 'nonav'; exit }
try { $nav.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } catch { try { $nav.SetFocus() } catch {} }
Start-Sleep -Milliseconds 1200
$set = $false
foreach ($pair in @(@('Input Device', $env:JIN), @('Output Device', $env:JOUT))) {
  $label = $pair[0]; $want = $pair[1]
  if (-not $want) { continue }
  $combo = $null
  $combos = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ComboBox)))
  foreach ($c in $combos) { if (-not $c.Current.IsOffscreen) { $combo = $c; break } }
  if (-not $combo) { continue }
  try {
    $cp = $combo.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
    $cp.Expand(); Start-Sleep -Milliseconds 600
    $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)))
    foreach ($it in $items) { if ($it.Current.Name -match $want) { try { $it.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); $set = $true } catch {} ; break } }
    Start-Sleep -Milliseconds 300
    try { $cp.Collapse() } catch {}
  } catch {}
}
if ($set) { 'ok' } else { 'partial' }`, { JIN: String(input || "Default"), JOUT: String(output || "Default") });
  if (r.endsWith("nonav")) return { error: "I opened Discord's settings but couldn't find the Voice & Video section, sir." };
  if (!r.endsWith("ok") && !r.endsWith("partial")) return { error: "Discord didn't open, sir." };
  return { ok: r.endsWith("ok"), partial: r.endsWith("partial"), note: "Voice & Video is open. If a dropdown resisted, set Input Device to Default once — I keep Windows' devices switched for you." };
});

// ---------- Discord Rich Presence (no extra dependencies; local IPC pipe) ----------
const rpc = require("./discord-rpc.cjs");
ipcMain.on("rpc-activity", (_e, payload) => {
  const p = payload || {};
  const id = String(p.appId || "").trim();
  if (!/^\d{5,30}$/.test(id)) return;
  rpc.setEnabled(true, id);
  rpc.setActivity({
    details: String(p.details || "Jarvis Desktop Companion").slice(0, 120),
    state: String(p.state || "All systems operational").slice(0, 120),
    startTimestamp: Number(p.startTimestamp) || Date.now(),
    assets: { large_image: String(p.asset || "jarvis"), large_text: "Jarvis Desktop Companion" },
    instance: true,
  });
});
ipcMain.on("rpc-disable", () => rpc.setEnabled(false));
ipcMain.handle("app-info", () => ({ version: app.getVersion() }));
// Show "Jarvis" on Discord from launch; the companion page refines the status line or turns it off.
const DISCORD_APP_ID = "1568940559886852136";
function bootPresence() {
  rpc.setEnabled(true, DISCORD_APP_ID);
  rpc.setActivity({
    details: "Jarvis Desktop Companion", state: "All systems operational", startTimestamp: Date.now(),
    assets: { large_image: "jarvis", large_text: "Jarvis Desktop Companion" }, instance: true,
  });
}

// ---------- Holographic reticle overlay + Iron Legion decoys (full-screen, click-through) ----------
function ensureOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, focusable: false, show: false, backgroundColor: "#00000000", webPreferences: webPrefs,
  });
  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.webContents.on("did-finish-load", () => overlay.webContents.insertCSS(CLEAR_CSS));
  overlay.loadURL(BASE + "/overlay");
  return overlay;
}

function reticleAt(x, y, label) {
  const w = ensureOverlay();
  const b = w.getBounds();
  w.webContents.send("cmd", "reticle", { x: Math.round(x - b.x), y: Math.round(y - b.y), label: String(label || "") });
  w.showInactive();
}

ipcMain.on("reticle-step", (_e, p) => {
  const { bounds } = screen.getPrimaryDisplay();
  const i = Number(p && p.index) || 0;
  const x = bounds.x + bounds.width * (0.3 + 0.45 * ((i * 0.37) % 1));
  const y = bounds.y + bounds.height * (0.3 + 0.4 * ((i * 0.61) % 1));
  reticleAt(x, y, p && p.label);
});
ipcMain.on("reticle-hide", () => {
  if (overlay && !overlay.isDestroyed()) { overlay.webContents.send("cmd", "reticle", null); overlay.hide(); }
});
ipcMain.on("decoys", (_e, on) => {
  if (!on) { if (overlay && !overlay.isDestroyed()) { overlay.webContents.send("cmd", "decoys", { on: false }); overlay.hide(); } return; }
  ensureOverlay().webContents.send("cmd", "decoys", { on: true });
  overlay.showInactive();
});

// ---------- Emergency abort / Iron Legion dismiss: temporary global ESC capture ----------
const grabEsc = (on) => {
  if (on === escGrabbed) return;
  escGrabbed = on;
  try {
    if (on) globalShortcut.register("Escape", () => {
      const held = Date.now() - lastEscAt <= 1500;
      lastEscAt = Date.now();
      if (mate && !mate.isDestroyed()) mate.webContents.send("cmd", "esc-hit", { held });
    });
    else globalShortcut.unregister("Escape");
  } catch { /* shortcuts unavailable */ }
};
ipcMain.on("grab-esc", () => grabEsc(true));
ipcMain.on("release-esc", () => { grabEsc(false); lastEscAt = 0; });

// ---------- Live screen share companion view ----------
ipcMain.on("open-share", () => {
  if (shareWin && !shareWin.isDestroyed()) { shareWin.show(); shareWin.focus(); return; }
  shareWin = new BrowserWindow({
    width: 920, height: 660, minWidth: 560, minHeight: 400, frame: false, backgroundColor: "#04080d",
    title: "Jarvis Live Share", icon: ICON, webPreferences: webPrefs,
  });
  shareWin.loadURL(BASE + "/share");
});

ipcMain.handle("share-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 1, height: 1 } });
    return sources
      .filter((s) => !/jarvis/i.test(s.name))
      .map((s) => ({ id: s.id, name: s.name || "Window", kind: s.id.startsWith("screen:") ? "screen" : "window" }));
  } catch (err) { return { error: String((err && err.message) || err) }; }
});

ipcMain.handle("gpu-info", async () => {
  try {
    const features = app.getGPUFeatureStatus();
    let vendor = "";
    try {
      const info = await app.getGPUInfo("basic");
      const dev = info && info.gpuDevice && info.gpuDevice[0];
      vendor = (dev && (dev.deviceString || dev.deviceVendor)) || "";
    } catch { /* ignore */ }
    return { vendor, videoEncode: features.video_encode || "", videoDecode: features.video_decode || "" };
  } catch { return { vendor: "", videoEncode: "", videoDecode: "" }; }
});

// ---------- Personal dossier file (sir.md lives in the app's data folder) ----------
const DOSSIER_FILE = () => path.join(app.getPath("userData"), "sir.md");
ipcMain.handle("dossier-read", async () => {
  try { return { content: await fs.promises.readFile(DOSSIER_FILE(), "utf8") }; }
  catch { return { content: "" }; }
});
ipcMain.handle("dossier-write", async (_e, content) => {
  try { await fs.promises.writeFile(DOSSIER_FILE(), String(content || "").slice(0, 8000), "utf8"); return { ok: true }; }
  catch (err) { return { error: String((err && err.message) || err) }; }
});

// ---------- GitHub auto-update checker: on boot, then every 3 hours ----------
const REPO = "gre23207212/pocket-jarvis-desktop-mate";
const isNewerTag = (remote, local) => {
  const pa = String(remote).replace(/^v/i, "").split(/[.-]/).map(Number);
  const pb = String(local).replace(/^v/i, "").split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const a = pa[i] || 0, b = pb[i] || 0;
    if (a !== b) return a > b;
  }
  return false;
};
async function checkUpdates() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { "User-Agent": "Jarvis-Desktop-Mate" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    const tag = String(j.tag_name || "").trim();
    if (!tag) return null;
    const newer = isNewerTag(tag, app.getVersion());
    const asset = (j.assets || []).find((a) => /\.zip$/i.test(a.name) && /win/i.test(a.name)) || (j.assets || []).find((a) => /\.zip$/i.test(a.name));
    const payload = { tag, url: j.html_url || `https://github.com/${REPO}/releases/latest`, newer, download: asset ? asset.browser_download_url : null, size: asset ? asset.size : 0 };
    if (newer && mate && !mate.isDestroyed()) mate.webContents.send("cmd", "update-available", payload);
    if (newer && tray) tray.setToolTip(`Jarvis Desktop — v${tag.replace(/^v/, "")} ready on GitHub`);
    return payload;
  } catch { return null; }
}
ipcMain.handle("check-updates", () => checkUpdates());

// ---------- One-click self-update: download the release zip, unpack, hand over to the new installer ----------
const findExe = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && /^Jarvis.*\.exe$/i.test(e.name)) return p;
    if (e.isDirectory()) { const f = findExe(p); if (f) return f; }
  }
  return null;
};
let updating = false;
ipcMain.handle("install-update", async (e) => {
  if (updating) return { error: "Already updating, sir." };
  const progress = (text, pct) => { for (const w of [mate, mainframe]) if (w && !w.isDestroyed()) w.webContents.send("cmd", "update-progress", { text, pct }); };
  updating = true;
  try {
    if (!IS_WIN || !app.isPackaged) return { error: "One-click updates work in the installed Windows app." };
    const info = await checkUpdates();
    if (!info || !info.newer) return { error: "You're already on the latest release, sir." };
    if (!info.download) return { error: `Release ${info.tag} has no .zip attached on GitHub.` };
    const work = path.join(os.tmpdir(), `jarvis-update-${info.tag.replace(/[^\w.-]/g, "")}`);
    await fs.promises.rm(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const zip = path.join(work, "update.zip");
    progress("Downloading update…", 0);
    const r = await fetch(info.download, { headers: { "User-Agent": "Jarvis-Desktop-Mate" } });
    if (!r.ok || !r.body) return { error: `Download failed (HTTP ${r.status}).` };
    const total = Number(r.headers.get("content-length")) || info.size || 0;
    const out = fs.createWriteStream(zip);
    let got = 0, last = 0;
    for await (const chunk of r.body) {
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((res) => out.once("drain", res));
      if (total && Date.now() - last > 250) { last = Date.now(); progress(`Downloading update… ${Math.round((got / total) * 100)}%`, (got / total) * 0.8); }
    }
    await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));
    progress("Unpacking…", 0.85);
    const dest = path.join(work, "app");
    fs.mkdirSync(dest, { recursive: true });
    const code = await new Promise((res) => spawn("tar", ["-xf", zip, "-C", dest], { windowsHide: true, stdio: "ignore" }).on("exit", res).on("error", () => res(-1)));
    if (code !== 0) return { error: "Couldn't unpack the update zip." };
    const exe = findExe(dest);
    if (!exe) return { error: "The update zip doesn't contain Jarvis's .exe." };
    progress("Installing — Jarvis will restart in a moment…", 0.95);
    const args = ["--update"];
    if (fs.existsSync(shortcutPaths().desktop)) args.push("--desktop");
    if (app.getLoginItemSettings({ path: INSTALLED_EXE }).openAtLogin) args.push("--startup");
    spawn(exe, args, { detached: true, stdio: "ignore", cwd: path.dirname(exe) }).unref();
    setTimeout(() => app.quit(), 600);
    return { ok: true, tag: info.tag };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  } finally {
    updating = false;
  }
});

app.on("second-instance", () => mate && mate.show());

app.whenReady().then(() => {
  if (MODE === "install" && process.argv.includes("--update")) return runSilentUpdate();
  if (MODE !== "run") return openSetup(MODE);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === "media");
  // Let Jarvis hear the call: share what Windows is playing (system "loopback" audio), no picker.
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] })
      .then((sources) => {
        // Prefer the main monitor.
        const primary = String(screen.getPrimaryDisplay().id);
        const src = sources.find((s) => s.display_id === primary) || sources[0];
        cb(src ? { video: src, audio: "loopback" } : {});
      })
      .catch(() => cb({}));
  });
  createMate();
  createMenu();
  bootPresence();
  // Global hotkeys: summon + terminal focus, quiet protocol, hide/reveal, unsnap.
  try {
    globalShortcut.register("Ctrl+Alt+T", () => { if (mate && !mate.isDestroyed()) { mate.show(); mate.focus(); mate.webContents.send("cmd", "summon"); } });
    globalShortcut.register("Ctrl+Alt+P", () => { if (mate && !mate.isDestroyed()) mate.webContents.send("cmd", "quiet-protocol"); });
    globalShortcut.register("Ctrl+Alt+H", () => { if (mate && !mate.isDestroyed()) (mate.isVisible() ? mate.hide() : mate.show()); });
    globalShortcut.register("Ctrl+Alt+C", () => { stopDocking(); if (mate && !mate.isDestroyed()) mate.webContents.send("cmd", "unsnap"); });
  } catch { /* shortcuts unavailable */ }
  if (process.platform === "darwin") app.askForMediaAccess?.(["microphone"]).catch(() => {});
  checkUpdates();
  setInterval(checkUpdates, 3 * 60 * 60 * 1000);
  const img = trayIcon();
  tray = new Tray(img);
  tray.setToolTip("Jarvis Desktop");
  tray.on("click", showMenu);
  tray.on("right-click", showMenu);
});

app.on("will-quit", () => { try { globalShortcut.unregisterAll(); } catch { /* ignore */ } });

app.on("window-all-closed", () => app.quit());
