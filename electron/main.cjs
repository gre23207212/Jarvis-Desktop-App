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
    title: "Jarvis", icon: ICON, webPreferences: { ...webPrefs, autoplayPolicy: "no-user-gesture-required" },
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
    width: 460, height: Math.min(720, wa.height - 20), frame: false, transparent: true, resizable: false,
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
  public static void Set(string id, int role) { ((IPolicy)new PolicyClient()).SetDefaultEndpoint(id, role); }
}`;
let savedMics = null; // your mic for each Windows role (console, multimedia, communications)
ipcMain.handle("cable-mic", async (_e, on) => {
  if (!IS_WIN) return { error: "Windows only" };
  const head = `Add-Type -TypeDefinition @'\n${AUDIO_CS}\n'@\n`;
  if (on) {
    const r = await ps(`${head}$cable = [JAudio]::Find(1, 'CABLE Output')
if (-not $cable) { 'nocable'; exit }
$prev = @(0,1,2 | ForEach-Object { [JAudio]::Default(1, $_) }) -join '|'
0,1,2 | ForEach-Object { [JAudio]::Set($cable, $_) }
"ok:$prev"`);
    if (r.includes("nocable")) return { error: "VB-Cable isn't installed" };
    const m = r.match(/ok:(.*)$/m);
    if (!m) return { error: "Couldn't switch the microphone" };
    if (!savedMics) savedMics = m[1]; // keep the very first one if called twice
    return { ok: true };
  }
  if (!savedMics) return { ok: true };
  const ids = savedMics;
  savedMics = null;
  const r = await ps(`${head}$ids = $env:JIDS.Split('|')
for ($i = 0; $i -lt 3; $i++) { if ($ids[$i]) { [JAudio]::Set($ids[$i], $i) } }
'ok'`, { JIDS: ids });
  return r.endsWith("ok") ? { ok: true } : { error: "Couldn't restore the microphone" };
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
  tray.setToolTip("Jarvis Desktop");
  tray.on("click", showMenu);
  tray.on("right-click", showMenu);
});

app.on("window-all-closed", () => app.quit());
