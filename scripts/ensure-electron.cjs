// Makes sure Electron's program files are downloaded. Newer npm versions skip Electron's own
// download step, so this fetches the official build from GitHub and unpacks it when missing.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const pkgDir = path.join(root, "node_modules", "electron");

function target(platform = process.platform) {
  if (platform === "win32") return "electron.exe";
  if (platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
  return "electron";
}

function installed(dist, platform) {
  try {
    const { version } = require(path.join(pkgDir, "package.json"));
    return fs.readFileSync(path.join(dist, "version"), "utf8").replace(/^v/, "").trim() === version
      && fs.existsSync(path.join(dist, target(platform)));
  } catch { return false; }
}

async function download(url, zip) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Electron download failed (HTTP ${res.status}). Check your internet connection and try again.`);
  const total = Number(res.headers.get("content-length")) || 0;
  const out = fs.createWriteStream(zip);
  let got = 0, shown = -1;
  for await (const chunk of res.body) {
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    const pct = total ? Math.floor((got / total) * 10) * 10 : -1;
    if (pct !== shown && pct >= 0) { shown = pct; process.stdout.write(`  ${pct}%\r`); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
}

async function ensureElectron({ platform = process.platform, arch = process.arch, quiet = false } = {}) {
  if (!fs.existsSync(path.join(pkgDir, "package.json"))) throw new Error("Electron isn't in node_modules yet. Run npm install first.");
  const { version } = require(path.join(pkgDir, "package.json"));
  const dist = path.join(pkgDir, "dist");
  if (installed(dist, platform)) { if (!quiet) console.log(`Electron ${version} is ready.`); return dist; }

  const name = `electron-v${version}-${platform}-${arch}.zip`;
  const url = `https://github.com/electron/electron/releases/download/v${version}/${name}`;
  const zip = path.join(os.tmpdir(), name);
  console.log(`Downloading Electron ${version} (${platform}-${arch}, about 100 MB)...`);
  try {
    await download(url, zip);
  } catch (e) {
    fs.rmSync(zip, { force: true });
    throw e;
  }
  console.log("\nUnpacking Electron...");
  fs.rmSync(dist, { recursive: true, force: true });
  const extract = require("extract-zip");
  await extract(zip, { dir: dist });
  fs.rmSync(zip, { force: true });
  if (platform === process.platform) fs.writeFileSync(path.join(pkgDir, "path.txt"), target(platform));
  if (!installed(dist, platform)) throw new Error("Electron unpacked but its program file is missing. Delete node_modules and run npm install again.");
  console.log(`Electron ${version} is ready.`);
  return dist;
}

module.exports = { ensureElectron };

if (require.main === module) {
  ensureElectron().catch((e) => {
    console.error(e.message || e);
    // During npm install, warn instead of failing; npm start / npm run dist retry the download.
    process.exit(process.argv.includes("--soft") ? 0 : 1);
  });
}
