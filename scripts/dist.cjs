// Builds the Windows app. Run with: npm run dist
// Output: electron-release/Jarvis Desktop-win32-x64/Jarvis Desktop.exe — opening it shows the Jarvis install wizard.
// Assembles the app directly from the local Electron runtime (node_modules/electron/dist) so it never
// depends on a download cache, then stamps the Jarvis icon and name into the exe.
const fs = require("fs");
const path = require("path");

const NAME = "Jarvis Desktop";
const root = path.join(__dirname, "..");
const runtime = path.join(root, "node_modules", "electron", "dist");
const out = path.join(root, "electron-release", `${NAME}-win32-x64`);
const exe = path.join(out, `${NAME}.exe`);

(async () => {
  if (!fs.existsSync(path.join(runtime, "electron.exe"))) {
    console.error("Electron's Windows runtime is missing. Run:  node node_modules\\electron\\install.js  then try again.");
    process.exit(1);
  }
  console.log("Building " + NAME + "...");
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(runtime, out, { recursive: true });
  fs.renameSync(path.join(out, "electron.exe"), exe);
  // Remove Electron's placeholder app so only Jarvis can load.
  fs.rmSync(path.join(out, "resources", "default_app.asar"), { force: true });

  const app = path.join(out, "resources", "app");
  fs.cpSync(path.join(root, "electron"), path.join(app, "electron"), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "jarvis-desktop", productName: NAME, version: pkg.version || "1.0.0", main: "electron/main.cjs",
  }, null, 2));

  try {
    const ResEdit = await import("resedit");
    const PE = await import("pe-library");
    const data = fs.readFileSync(exe);
    const exeFile = PE.NtExecutable.from(data, { ignoreCert: true });
    const res = PE.NtExecutableResource.from(exeFile);
    const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, "electron", "icon.ico")));
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
    const id = groups.length ? groups[0].id : 1;
    const lang = groups.length ? groups[0].lang : 1033;
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
    const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
    if (vi) {
      for (const l of vi.getAllLanguagesForStringValues()) {
        vi.setStringValues(l, {
          FileDescription: NAME, ProductName: NAME, InternalName: NAME,
          OriginalFilename: `${NAME}.exe`, CompanyName: "Vraith",
        });
      }
      vi.outputToResourceEntries(res.entries);
    }
    res.outputResource(exeFile);
    fs.writeFileSync(exe, Buffer.from(exeFile.generate()));
    console.log("Jarvis icon applied.");
  } catch (e) {
    console.warn("Could not stamp the icon into the exe (app still works):", e.message);
  }
  console.log("\nDone! Open this to install Jarvis:\n  " + exe);
})().catch((e) => { console.error(e); process.exit(1); });
