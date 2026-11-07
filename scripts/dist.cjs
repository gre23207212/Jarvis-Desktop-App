// Builds the Windows app. Run with: npm run dist
// Output: electron-release/Jarvis-win32-x64/Jarvis.exe — opening it shows the custom Jarvis install wizard.
const { packager } = require("@electron/packager");
const path = require("path");

(async () => {
  const root = path.join(__dirname, "..");
  const out = await packager({
    dir: root,
    name: "Jarvis",
    executableName: "Jarvis",
    platform: "win32",
    arch: "x64",
    out: path.join(root, "electron-release"),
    overwrite: true,
    icon: path.join(root, "electron", "icon.ico"),
    prune: true,
    ignore: [/^\/node_modules/, /^\/src/, /^\/public/, /^\/electron-release/, /^\/supabase/, /^\/scripts/, /^\/dist/, /^\/\.git/, /^\/\.env/],
  });
  console.log("\nDone! Open this to install Jarvis:\n  " + path.join(out[0], "Jarvis.exe"));
})().catch((e) => { console.error(e); process.exit(1); });
