// Builds native packages.  npm run dist            → package for the current OS
//                                   node scripts/dist.cjs --target=win|mac|linux
// Outputs into electron-release/:
//   win   → Jarvis Desktop-win32-x64/ (Jarvis Desktop.exe with the install wizard)
//   mac   → Jarvis Desktop-darwin-{x64,arm64}/ (Jarvis Desktop.app) + .dmg on macOS hosts
//   linux → Jarvis Desktop-linux-x64/ + .tar.gz + .AppImage (when appimagetool is available)
const fs = require("fs");
const path = require("path");

const NAME = "Jarvis Desktop";
const root = path.join(__dirname, "..");
const outDir = path.join(root, "electron-release");
const argTarget = (process.argv.find((a) => a.startsWith("--target=")) || "").split("=")[1];
const target = argTarget || ({ win32: "win", darwin: "mac" }[process.platform] || "linux");

const appPayload = () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return {
    pkg,
    packageJson: JSON.stringify({
      name: "jarvis-desktop", productName: NAME, version: pkg.version || "1.4.0", main: "electron/main.cjs",
    }, null, 2),
  };
};

/** Stage the payload @electron/packager expects: a folder with package.json + electron/. */
async function packWithPackager(platform, arch, extra = {}) {
  const packager = (await import("@electron/packager")).default;
  const staging = path.join(outDir, "_staging");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const { packageJson } = appPayload();
  fs.writeFileSync(path.join(staging, "package.json"), packageJson);
  fs.cpSync(path.join(root, "electron"), path.join(staging, "electron"), { recursive: true });
  const paths = await packager({
    dir: staging,
    out: outDir,
    name: NAME,
    platform,
    arch,
    overwrite: true,
    appBundleId: "app.jarvis.desktop",
    appCategoryType: "public.app-category.utilities",
    extendInfo: {
      NSMicrophoneUsageDescription: "Jarvis listens for the \"Hey Jarvis\" wake word so he can answer you.",
      NSCameraUsageDescription: "Jarvis can join video calls on your behalf.",
      NSScreenCaptureUsageDescription: "Jarvis shares your screen when you ask him to.",
      LSMinimumSystemVersion: "10.15",
    },
    ...extra,
  });
  fs.rmSync(staging, { recursive: true, force: true });
  return paths;
}

async function buildWin() {
  // Assembles the app directly from the local Electron runtime (node_modules/electron/dist) so it never
  // depends on a download cache, then stamps the Jarvis icon and name into the exe.
  const runtime = path.join(root, "node_modules", "electron", "dist");
  const out = path.join(outDir, `${NAME}-win32-x64`);
  const exe = path.join(out, `${NAME}.exe`);
  if (process.platform === "win32") await require("./ensure-electron.cjs").ensureElectron({ platform: "win32", arch: "x64", quiet: true });
  if (!fs.existsSync(path.join(runtime, "electron.exe"))) {
    console.error("Electron's Windows runtime is missing. Run:  node scripts\\ensure-electron.cjs  then try again (build Windows packages on Windows).");
    process.exit(1);
  }
  console.log(`Building ${NAME} (Windows x64)...`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(runtime, out, { recursive: true });
  fs.renameSync(path.join(out, "electron.exe"), exe);
  fs.rmSync(path.join(out, "resources", "default_app.asar"), { force: true });

  const app = path.join(out, "resources", "app");
  fs.cpSync(path.join(root, "electron"), path.join(app, "electron"), { recursive: true });
  const { packageJson } = appPayload();
  fs.writeFileSync(path.join(app, "package.json"), packageJson);

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
  const zipName = `Jarvis-Desktop-win32-x64-v${appPayload().pkg.version}.zip`;
  const zipPath = path.join(outDir, zipName);
  fs.rmSync(zipPath, { force: true });
  console.log(`Creating ${zipName} (attach this to a GitHub release for one-click updates)...`);
  const base = path.basename(out);
  await (process.platform === "win32"
    ? run("tar", ["-a", "-c", "-f", zipName, base], { cwd: outDir })
    : run("zip", ["-qry", zipName, base], { cwd: outDir })
  ).catch(() => console.warn("Couldn't create the zip; compress the folder yourself for GitHub releases."));
  console.log(`\nDone! Open this to install Jarvis:\n  ${exe}`);
  if (fs.existsSync(zipPath)) console.log(`Upload for updates:\n  ${zipPath}`);
}

const run = (cmd, args, opts = {}) => new Promise((res, rej) => {
  const { spawn } = require("child_process");
  const p = spawn(cmd, args, { stdio: "inherit", ...opts });
  p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
  p.on("error", rej);
});

async function buildMac() {
  console.log(`Building ${NAME} (macOS Intel + Apple Silicon)...`);
  const paths = [];
  paths.push(...(await packWithPackager("darwin", "x64")));
  paths.push(...(await packWithPackager("darwin", "arm64")));
  console.log("macOS permissions (microphone, screen capture) prompt on first launch via the Info.plist entries.");
  if (process.platform === "darwin") {
    for (const bundleDir of paths) {
      // Electron Packager returns the containing directory, not the .app path.
      const appPath = path.join(bundleDir, `${NAME}.app`);
      if (!fs.existsSync(appPath)) throw new Error(`Missing macOS app bundle: ${appPath}`);
      const arch = /arm64/.test(bundleDir) ? "arm64" : "x64";
      const dmg = path.join(outDir, `Jarvis-Desktop-darwin-${arch}-v${appPayload().pkg.version}.dmg`);
      console.log(`Creating ${path.basename(dmg)}...`);
      await run("hdiutil", ["create", "-volname", NAME, "-srcfolder", appPath, "-ov", "-format", "UDZO", dmg]);
      if (!fs.existsSync(dmg)) throw new Error(`Missing macOS disk image: ${dmg}`);
    }
  } else {
    throw new Error("macOS .dmg packages must be built on a macOS host.");
  }
  console.log(`\nDone! Artifacts in ${outDir}`);
}

async function buildLinux() {
  console.log(`Building ${NAME} (Linux x64)...`);
  const paths = await packWithPackager("linux", "x64");
  for (const dir of paths.filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory())) {
    const base = path.basename(dir);
    const tar = path.join(outDir, `${base}.tar.gz`);
    console.log(`Creating ${path.basename(tar)}...`);
    await run("tar", ["-czf", tar, "-C", outDir, base]);
    // AppImage (best effort): needs appimagetool; skipped cleanly when unavailable.
    const appBin = path.join(dir, "jarvis-desktop");
    try {
      let tool = "appimagetool";
      if (!process.platform.startsWith("win") && !(await run(tool, ["--version"]).catch(() => false))) throw new Error("missing");
      console.log("Creating AppImage...");
      const appDir = path.join(outDir, "_appimage", "Jarvis.AppDir");
      fs.rmSync(path.join(outDir, "_appimage"), { recursive: true, force: true });
      fs.mkdirSync(path.join(appDir, "usr"), { recursive: true });
      fs.cpSync(dir, path.join(appDir, "usr", "bin"), { recursive: true });
      fs.symlinkSync(path.join("usr", "bin", path.basename(appBin)), path.join(appDir, "AppRun"));
      fs.writeFileSync(path.join(appDir, "jarvis.desktop"), [
        "[Desktop Entry]", "Type=Application", `Name=${NAME}`, `Exec=${path.basename(appBin)}`,
        "Icon=jarvis", "Categories=Utility;", "X11WMClass=Jarvis Desktop",
      ].join("\n"));
      await run(tool, [appDir, path.join(outDir, `${NAME}-linux-x64.AppImage`)], { cwd: outDir });
    } catch {
      console.log("appimagetool not available — produced the folder + .tar.gz. Build the AppImage on Linux with appimagetool, or use the CI workflow.");
    }
    fs.rmSync(path.join(outDir, "_appimage"), { recursive: true, force: true });
  }
  console.log(`\nDone! Artifacts in ${outDir} (X11 window placement + Wayland dock via the always-on-top companion).`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  if (target === "win") await buildWin();
  else if (target === "mac") await buildMac();
  else if (target === "linux") await buildLinux();
  else { console.error(`Unknown target ${target}. Use win, mac or linux.`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
