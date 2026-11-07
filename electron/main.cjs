// Jarvis Desktop Mate — transparent, always-on-top companion with a custom tray menu and Mainframe window.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { app, BrowserWindow, Tray, nativeImage, screen, session, ipcMain, shell } = require("electron");

const BASE = process.env.JARVIS_URL || "https://pocket-jarvis-desktop-mate.lovable.app";
const ICON = path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png");
const W = 380, H = 520;

let mate, menu, mainframe, tray;

app.setAppUserModelId("Jarvis.DesktopMate");

// ---------- Install / uninstall (custom screens, per-user, no admin) ----------
const IS_WIN = process.platform === "win32";
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), "Programs", "Jarvis");
const UNINST_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\JarvisDesktopMate";
const SRC_DIR = path.dirname(process.execPath);
const INSTALLED_EXE = path.join(INSTALL_DIR, path.basename(process.execPath));
const shortcutPaths = () => ({
  desktop: path.join(app.getPath("desktop"), "Jarvis.lnk"),
  start: path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Jarvis.lnk"),
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

ipcMain.on("setup-close", () => setupWin && setupWin.close());
ipcMain.on("setup-min", () => setupWin && setupWin.minimize());
ipcMain.handle("setup-run", async (e, mode, opts = {}) => {
  const step = (text, pct) => e.sender.send("setup-progress", { text, pct });
  try {
    if (mode === "install") {
      step("Copying Jarvis's systems…", 0.1);
      await fs.promises.rm(INSTALL_DIR, { recursive: true, force: true }).catch(() => {});
      await fs.promises.cp(SRC_DIR, INSTALL_DIR, { recursive: true, force: true });
      step("Creating shortcuts…", 0.75);
      const icon = path.join(INSTALL_DIR, path.relative(SRC_DIR, path.join(__dirname, "icon.ico")));
      const link = { target: INSTALLED_EXE, cwd: INSTALL_DIR, icon, iconIndex: 0, appUserModelId: "Jarvis.DesktopMate", description: "Jarvis Desktop Mate" };
      const sc = shortcutPaths();
      fs.mkdirSync(path.dirname(sc.start), { recursive: true });
      shell.writeShortcutLink(sc.start, link);
      if (opts.desktop) shell.writeShortcutLink(sc.desktop, link);
      step("Registering with Windows…", 0.9);
      const add = (name, type, data) => reg(["add", UNINST_KEY, "/v", name, "/t", type, "/d", data, "/f"]);
      await add("DisplayName", "REG_SZ", "Jarvis Desktop Mate");
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
    step("Removing shortcuts…", 0.3);
    const sc = shortcutPaths();
    for (const p of [sc.desktop, sc.start]) fs.rmSync(p, { force: true });
    app.setLoginItemSettings({ openAtLogin: false, path: INSTALLED_EXE });
    step("Unregistering…", 0.6);
    await reg(["delete", UNINST_KEY, "/f"]);
    step("Goodbye, sir.", 1);
    // Files can't be deleted while Jarvis is running, so a tiny helper waits for us to exit.
    spawn("cmd.exe", ["/c", `ping 127.0.0.1 -n 3 >nul & rmdir /s /q "${INSTALL_DIR}"`], { detached: true, stdio: "ignore", windowsHide: true, cwd: os.tmpdir() }).unref();
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
    width: 480, height: Math.min(1040, wa.height - 20), frame: false, transparent: true, resizable: false,
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
  return { ok: true };
});

// Windows' own voice rendered to a WAV so Jarvis can play it into any output (e.g. VB-Cable).
ipcMain.handle("voice-wav", async (_e, text) => {
  if (!IS_WIN) return { error: "Windows only" };
  const file = path.join(os.tmpdir(), `jarvis-say-${Date.now()}.wav`);
  await ps(`Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-GB' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.SetOutputToWaveFile($env:JF); $s.Speak($env:JT); $s.Dispose()`, { JF: file, JT: String(text).slice(0, 600) });
  try { const b = fs.readFileSync(file); fs.rmSync(file, { force: true }); return { wav: b.toString("base64") }; } catch { return { error: "voice failed" }; }
});

app.on("second-instance", () => mate && mate.show());

app.whenReady().then(() => {
  if (MODE !== "run") return openSetup(MODE);
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
