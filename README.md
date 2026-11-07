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

## Memory

Saved facts and recent conversation stay in this computer's browser storage. Say “Remember that…” to save a fact or “Forget everything” to clear memory. Manage individual facts in Mainframe. Relevant memory is sent to the selected AI provider when chatting; it does not sync between computers.

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
