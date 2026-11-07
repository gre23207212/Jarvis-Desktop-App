# Jarvis Desktop Mate

A voice-enabled desktop companion with local and cloud brains, app controls, and saved memory.

## Windows desktop package

Extract the source ZIP, open a terminal in the extracted folder, and run:

```sh
npm install
npm start
```

Use `npm run dist` to create `electron-release/Jarvis-win32-x64/Jarvis.exe`. Opening that file starts the custom Jarvis install wizard. Keep the whole output folder together, not just the executable.

The desktop shell loads the published Jarvis pages. Publish web changes before testing them in the desktop app; this source archive does not update the hosted pages itself.

If Electron reports that it is not installed correctly, run `node node_modules/electron/install.js`, then try again. Make sure your drive has room for dependencies and the Windows package.

## Discord voice messages

Save voice-channel names and links in Mainframe → Skills. When several channels are saved, Jarvis asks which one to join, lists their names, and listens for your answer. Say the saved channel name, or type it; say “cancel” to stop. The message from your original request is retained for the selected call.

Install VB-Cable using the Mainframe link and set Discord's Input Device to **Default** once. Jarvis temporarily switches the Windows default microphone to CABLE Output for the message, then attempts to restore the previous microphone. Playback is routed directly to CABLE Input, so the Windows default speakers do not need changing. Jarvis does not automatically change Discord's device settings.

The selected voice is requested for call speech, with a male English voice fallback if Windows cannot match it. Voice availability depends on installed Windows voices. Windows audio switching, live microphone recognition, and real Discord calls could not be tested in this environment.

Call messages use they/them for the user. After successful message playback, Jarvis attempts to mute your microphone in Discord and leaves it muted until you unmute yourself. If muting cannot be confirmed, the result tells you to mute manually.

## Phone remote

Publish the latest app and use the updated desktop shell. On your PC, open Mainframe → Skills → Phone Remote → Pair phone. Jarvis displays a 12-character code and the phone page address. Open https://pocket-jarvis-desktop-mate.lovable.app/remote on your phone, enter that code, and press Link PC. The code expires after ten minutes and works once. Keep it private. Disconnect in Mainframe to revoke phone access; generating a new code also disconnects the old pairing. The phone remembers its connection until you forget it or disconnect it on the PC.

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

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
