# Jarvis Desktop Mate

A voice-enabled desktop companion with local and cloud brains, app controls, and saved memory.

## Windows desktop package

Run `npm install`, then `npm run dist`. The desktop shell loads the published Jarvis pages.

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
