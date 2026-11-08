# JARVIS Desktop
### Your desktop. Under your command.

**JARVIS Desktop** is a voice-controlled AI companion that lives on your computer. Open apps, organise windows across monitors, manage media, run desktop commands and interact with supported Discord features from a compact, futuristic interface.

**Current version:** 1.5.3 · **Platforms:** Windows, macOS and Linux · **Status:** Active development

---

## What can JARVIS do?

| Capability | What it does |
| --- | --- |
| **Voice and chat** | Talk to JARVIS using natural-language requests or type commands. |
| **Application control** | Open installed apps and games, focus windows, minimise, maximise and close supported windows. |
| **Multiple monitors** | Move supported application windows between connected displays. |
| **Visible desktop automation** | On Windows, move the real cursor to supported controls so you can see the action taking place. |
| **Discord integration** | Open saved channels, attempt mute/deafen controls, and send messages through the visible Discord interface. |
| **Music and media** | Play, pause, skip and adjust volume in supported players. |
| **Personal dossier** | Save preferences, notes and facts for more personalised responses. |
| **Desktop companion** | Use the animated reactor, floating companion, global shortcuts and Mainframe controls. |
| **Phone remote** | Pair a phone with a running desktop session for supported remote commands. |
| **Release updates** | Check GitHub Releases for newer versions; the Windows installed build supports an in-app update flow. |

Some integrations are experimental and depend on your operating system, permissions, installed applications and their current interfaces.

## Download and install

Open the [latest release](../../releases/latest), expand **Assets** and select the file for your system.

| Operating system | Release asset | Notes |
| --- | --- | --- |
| **Windows 10/11 (64-bit)** | `Jarvis-Desktop-win32-x64-vVERSION.zip` | Extract the entire ZIP, then run the included application. Keep its files together. |
| **macOS (Apple Silicon)** | `Jarvis-Desktop-darwin-arm64-vVERSION.dmg` | For Macs with Apple silicon processors. |
| **macOS (Intel)** | `Jarvis-Desktop-darwin-x64-vVERSION.dmg` | For Intel-based Macs. |
| **Linux (64-bit)** | Linux release archive | Extract and run according to the included package. |

Only download assets that are actually attached to the release. Availability can vary between versions. Packages may not be code-signed or notarised; review operating-system security prompts before running them.

### Getting started

1. Download the correct package for your computer.
2. Install or extract JARVIS and launch it.
3. Open **Mainframe → Settings** to configure your microphone, voice, AI provider and desktop preferences.
4. Give the application the operating-system permissions required for the features you want.
5. Try a voice command, or use the text input.

### Example commands

```text
Hey Jarvis, open Spotify.
Hey Jarvis, move Discord to my main monitor.
Hey Jarvis, minimise Chrome.
Hey Jarvis, mute me on Discord.
Hey Jarvis, send a message to #general saying I'll be back soon.
Hey Jarvis, what can you do?
Hey Jarvis, check for updates.
```

Commands involving Discord, window controls or other desktop applications depend on the installed desktop bridge and may require additional setup.

## Discord setup

For supported Discord controls, run the Discord desktop application and keep it signed in. Save text or voice channel links in **Mainframe → Skills** before referring to them by name.

**Mute, deafen and message automation (Windows):** JARVIS attempts to bring Discord forward, locate its controls, move the real mouse cursor and perform the requested action. The Discord UI can change; always confirm the intended action actually happened. Don't move the mouse while an automated sequence is running.

**Speaking into a Discord voice channel:** The voice relay uses a virtual audio cable on Windows. Install VB-CABLE, check that both cable devices are available and set Discord's input to follow the appropriate device. JARVIS cannot guarantee that Discord will follow a changed Windows default microphone when a specific input device is selected.

Never share private Discord tokens, credentials or personal channel invitations in public issues.

## Updates and versions

JARVIS uses **GitHub Releases** to find published versions. On Windows, the installed desktop application includes a check/download/install workflow. Use **Mainframe → Check for Updates** or ask JARVIS to check.

Automatic checks run at startup and periodically while the app is open. **Downloading a newer release is not the same as having completed a verified installation**; check the version shown by the desktop application after restarting.

The macOS and Linux builds are available as release downloads, but the same one-click installation workflow is not implemented on those platforms.

For a history of published changes, use [GitHub Releases](../../releases). This README deliberately keeps the release notes in one place rather than duplicating a long changelog.

## Run from source

You need Node.js, npm and Git. The desktop runtime is Electron; the application interface uses React, TypeScript and TanStack Start.

```bash
git clone https://github.com/gre23207212/pocket-jarvis-desktop-mate.git
cd pocket-jarvis-desktop-mate
npm install
npm run dev:desktop
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the web development server. |
| `npm run dev:desktop` | Run the local development pages in Electron. |
| `npm start` | Launch the desktop shell using the configured published site. |
| `npm test` | Run automated tests. |
| `npm run build` | Build the web application. |
| `npm run dist` | Package the desktop application. |

The packaged desktop shell uses a hosted interface by default. **Publishing changes to the web interface and building a new desktop package are separate steps.** Avoid changing its configured hosted origin without providing a working replacement.

### Development and release process

1. Make changes on a branch and review the diff.
2. Run `npm test` and `npm run build`.
3. Test desktop-specific features on the target operating system.
4. Merge approved changes into `main`.
5. Create a version tag, then check the GitHub Actions build and published assets.
6. Download and test the actual release package before announcing the update as verified.

Do not commit passwords, API keys, session tokens or other secrets.

## Troubleshooting

**JARVIS cannot hear me.** Check microphone permissions, the selected input device and whether another app is using the microphone.

**Discord commands do nothing.** Check that Discord is running and signed in, your saved channel links are correct, and the desktop bridge is active. Discord UI automation may need adjustment when Discord updates.

**Voice messages don't reach Discord.** Verify both VB-CABLE devices and Discord's selected microphone. Virtual audio routing is separate from normal speaker playback.

**An update isn't detected.** Confirm a newer GitHub Release exists, that its platform package is attached, and that your internet connection can reach GitHub. Check the desktop shell version, not just the web interface version.

**The app opens but the interface is outdated.** The desktop shell and hosted interface can be updated independently. Make sure the latest interface has been published.

**A release package doesn't launch.** Extract the entire archive rather than running an executable from inside the ZIP. Keep the application files together and report the exact error in an issue.

## Privacy and safety

JARVIS can interact with local applications, your microphone and selected online services. Only enable features you trust, review permissions and avoid placing sensitive information in public logs or bug reports. Local preferences and dossier information may be stored on your computer; cloud AI requests may be processed by the configured provider.

---
