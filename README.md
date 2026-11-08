# Jarvis Desktop Mate

A voice-enabled desktop companion with local and cloud brains, app controls, and saved memory.

## Windows desktop package

Extract the source ZIP, open a terminal in the extracted folder, and run:

```sh
npm install
npm run dev:desktop   # test with the pages from this source (new features included)
npm start             # test with the published hosted pages
npm run dist          # build the Windows app
```

`npm run dist` creates `electron-release/Jarvis Desktop-win32-x64/Jarvis Desktop.exe`. Opening that file starts the custom Jarvis install wizard. Keep the whole output folder together, not just the executable.

The packaged app and `npm start` load the published Jarvis pages. Publish web changes before using them in the packaged app; `npm run dev:desktop` is the way to try them first.

If Electron reports that it is not installed correctly, run `node node_modules/electron/install.js`, then try again. Make sure your drive has room for dependencies and the Windows package.

## Discord voice messages

Save voice-channel names and links in Mainframe → Skills. When several channels are saved, Jarvis asks which one to join, lists their names, and listens for your answer. Say the saved channel name, or type it; say “cancel” to stop. The message from your original request is retained for the selected call.

Install VB-Cable using the Mainframe link and set Discord's Input Device to **Default** once. Jarvis temporarily switches the Windows default microphone to CABLE Output for the message, then attempts to restore the previous microphone. Playback is routed directly to CABLE Input, so the Windows default speakers do not need changing. Jarvis does not automatically change Discord's device settings.

The selected voice is requested for call speech, with a male English voice fallback if Windows cannot match it. Voice availability depends on installed Windows voices. Windows audio switching, live microphone recognition, and real Discord calls could not be tested in this environment.

Call messages use they/them for the user. After successful message playback, Jarvis attempts to mute your microphone in Discord and leaves it muted until you unmute yourself. If muting cannot be confirmed, the result tells you to mute manually.

## Phone remote

Publish the latest app and use the updated desktop shell. On your PC, open Mainframe → Skills → Phone Remote → Pair phone. Jarvis displays a 12-character code and the phone page address. Open https://pocket-jarvis-desktop-mate.lovable.app/pairing on your phone, enter that code, and press Link PC. The code expires after ten minutes and works once. Keep it private. Disconnect in Mainframe to revoke phone access; generating a new code also disconnects the old pairing. The phone remembers its connection until you forget it or disconnect it on the PC.

For a separate phone-only `YOUR-PROJECT.vercel.app/pairing` address, import this repository into Vercel with Root Directory `vercel-pairing`, framework Other, no build or install command, and Output Directory `public`. See `vercel-pairing/README.md`. This keeps desktop pages on the existing hosted app and forwards only the phone experience; publish the latest Jarvis pages first.

Leave the PC awake, online, and running Jarvis. On the phone, select a saved voice channel and type a command or press Speak, then Stop to transcribe it. Review the text and press Send to PC. Phone recording requires microphone permission and internet access; transcription uses AI credits. The phone displays PC status and command results. The remote does not wake a sleeping PC and only accepts Discord voice commands.

Commands are relayed through the backend, and recent command text/results are stored there. Cloud conversation memory is not enabled by this feature. Queued commands expire after two minutes instead of running much later, and claimed commands are not automatically repeated after interruption.

## Memory

Saved facts and recent conversation stay in this computer's browser storage. Say “Remember that…” to save a fact or “Forget everything” to clear memory. Manage individual facts in Mainframe. Relevant memory is sent to the selected AI provider when chatting; it does not sync between computers.

## Startup welcome and news

Opening the desktop app (including `npm start` or Windows startup) welcomes you as boss with the PC's local date and time, then offers recent news. Say yes or type yes; Jarvis asks which topic interests you and saves it in memory. On later launches it offers that topic again. Say “different topic” to change it or “no thanks” to skip. Clearing memory removes the topic too.

Headlines are fetched from Google News public RSS only after you opt in, include publisher links and dates, and are limited to recent dated stories. Unavailable news is reported rather than invented. Jarvis ends with a friendly reminder about “Hey Jarvis” and the pencil icon. Voice replies follow your existing voice setting. Reloading the companion or opening Mainframe does not repeat the greeting.

The welcome, real news retrieval, remembered topic and decline flow were checked in the browser with a simulated desktop connection and speech completion. Actual Windows startup, audible playback and microphone answers still need testing on your PC. Publish the latest pages and use the updated desktop source to allow launch speech without clicking first.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Feature suite (v1.4)

**Global hotkeys** (work system-wide, Windows/macOS/Linux):
- `Ctrl+Alt+T` summons Jarvis and focuses the terminal input; `Ctrl+Alt+P` toggles the Quiet Protocol (wake-word and listening muted, reactor dims to dormant low-energy blue); `Ctrl+Alt+H` hides/reveals him; `Ctrl+Alt+C` unsnaps him from any docked window back to free-floating mode.

**Desktop physics**: say *"dock to my window"* (or use Mainframe → Settings → Dock to active window) and the arc reactor magnetically docks to the top-right title bar of whatever app is focused (X11/Windows/macOS front window). *"Follow my cursor"* puts him in orbit at a slight offset; *"stop following my cursor"* ends it. Double-click the reactor for standby (descending repulsor hum) and double-click again to wake (rising repulsor hum).

**Personal dossier (`sir.md`)**: Mainframe → Personal Dossier holds name, title/honorific ("Sir", "Boss", "Mr. Stark"), games, music, coding stack and standing notes. Saving writes `sir.md` into the app data folder and injects the profile into the system prompt and the startup welcome, so he addresses you by your title and tailors suggestions.

**Window & app management**: *"Jarvis, minimize Chrome"* / *"bring Discord to the front"* / *"close Steam"* — window state via native APIs (Win32 ShowWindow/WM_CLOSE, AppleScript, wmctrl/xdotool).

**Universal media engine**: *"pause"*, *"skip"*, *"previous"*, *"volume up/down"*, *"mute the volume"* via virtual media keys (Win32 keybd_event, AppleScript, playerctl/MPRIS), and *"what's playing?"* reads Spotify, MusicBee, foobar2000, Winamp, AIMP, YouTube-in-browser and MPRIS players.

**Discord**: *"mute me on Discord"* / *"deafen"* (state-aware UIA toggles), *"send a message to #general…"* (types into the saved text channel), *"open Discord audio settings"* (opens Voice & Video and attempts the device dropdowns), plus Rich Presence showing **Jarvis Desktop Companion** with the arc-reactor badge and live activity — wired to Application ID `1568940559886852136` by default (upload your badge as an art asset named `jarvis` in the developer portal).

**Live screen share**: *"share my screen"* opens the Live Share view — primary monitor (with system loopback audio) or a single window, 720p/1080p/1440p at 15/30/60 fps with live stats.

**Rolling instant replay**: the buffer records continuously (GPU encoder where available: NVENC/QuickSync/VCN — shown in the Mainframe); *"clip that"* saves the preceding 30/45/60 seconds to `Videos/Jarvis Clips`.

**Automated protocols**: multi-step jobs (Spotify, Discord relay, custom mods) run under a Steps HUD — `[ PROTOCOL EXECUTION ] ▸ [1/3] … [ESC TO ABORT]` — with a cyan holographic reticle sweeping the screen; pressing `ESC` aborts instantly and restores manual control.

**Iron Legion Protocol**: *"activate Iron Legion"* (or *"deploy decoys"*) spawns three mini holographic reactors that fly the monitor and banter; press `ESC` twice (or hold) within 1.5s to disband.

**Tactical modules & skill mods**: Mainframe → MODS toggles each built-in module and lets you add custom mods — a trigger phrase plus one command per line — executed step-by-step under the protocol HUD.

**Auto-update checker**: checks `github.com/gre23207212/pocket-jarvis-desktop-mate` releases on boot and every 3 hours; Jarvis announces a new firmware patch and the tray tooltip shows the version.

**Cross-platform packages**: `node scripts/dist.cjs --target=win|mac|linux` builds Windows x64 (installer wizard), macOS x64 + Apple Silicon `.app` (with mic/camera/screen permission strings; `.dmg` on Mac hosts) and Linux `.tar.gz` + `.AppImage` (X11 placement; Wayland uses the always-on-top dock). A GitHub Actions workflow (`.github/workflows/build.yml`) builds all three on tag push.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## One-click updates

Jarvis checks GitHub releases on launch and every 3 hours. When a newer version is found, the companion shows an **Update now** button (also in Mainframe → Check for updates). Jarvis downloads the release zip, unpacks it, closes, installs the new version over the old one (keeping your desktop shortcut, startup choice, settings and memory) and restarts.

To publish an update:
1. Raise `"version"` in `package.json` (for example `1.4.0` → `1.5.0`).
2. Run `npm run dist`. It creates `electron-release/Jarvis-Desktop-win32-x64-v1.5.0.zip`.
3. On GitHub, create a release with tag `v1.5.0` and attach that zip.

The repository must be public: GitHub hides releases of private repositories from the app. One-click updates work in the installed Windows app; in other cases Jarvis links to the release page instead.

## Discord "Playing Jarvis" status

Jarvis shows on your Discord profile as soon as he starts (application ID 1568940559886852136). Requirements:
- The Discord **desktop** app is running on the same PC (the browser version can't show it).
- Discord → User Settings → Activity Privacy → **Share your detected activities with others** is on.
- For the arc-reactor picture: Discord Developer Portal → your app → Rich Presence → Art Assets → upload an image (at least 512×512) named exactly `jarvis`. Without it the status still shows, just without the picture. New art can take a few minutes to appear.
- Turn it off any time in Mainframe → Settings → Broadcast Jarvis as your active app.

## Screens come from Lovable

The desktop app loads its screens from https://pocket-jarvis-desktop-mate.lovable.app. After changing the code, push it to GitHub, then press **Publish** in Lovable. Changes to the `electron/` folder only need `npm run dist`.

## Uninstalling

Uninstalling Jarvis erases everything he saved: Discord channels, voices, memory, settings and sir.md. Installing him again starts fresh. One-click updates keep your data.
