// npm run dev:desktop → starts the local Vite pages and opens Electron against them (tests unpublished changes).
const { spawn } = require("child_process");
const path = require("path");

const PORT = process.env.PORT || "5173";
const root = path.join(__dirname, "..");
const vite = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "dev", "--port", PORT, "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });

let app;
const launch = () => require("electron");
vite.stdout.on("data", (buf) => {
  process.stdout.write(buf);
  if (app || !/ready in/i.test(buf.toString())) return;
  app = spawn(launch(), ["."], { cwd: root, stdio: "inherit", env: { ...process.env, JARVIS_URL: `http://localhost:${PORT}` } });
  app.on("exit", (code) => { vite.kill(); process.exit(code ?? 0); });
});
vite.on("exit", (code) => { if (app) app.kill(); process.exit(code ?? 1); });
