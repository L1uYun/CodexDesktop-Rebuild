#!/usr/bin/env node
/**
 * build-from-upstream.js — Patch upstream Codex and repackage
 *
 * For macOS and Windows: no forge needed.
 * Takes the upstream app, patches ASAR in-place, replaces codex CLI, outputs distributable.
 *
 * Usage:
 *   node scripts/build-from-upstream.js --platform mac-arm64
 *   node scripts/build-from-upstream.js --platform mac-x64
 *   node scripts/build-from-upstream.js --platform win
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const OUT_DIR = path.join(PROJECT_ROOT, "out");
const REBUILD_PRODUCT_NAME = "Codex Rebuild";
const REBUILD_EXE_NAME = "CodexRebuild.exe";
const REBUILD_CLI_NAME = "codex-rebuild.exe";
const REBUILD_APP_USER_MODEL_ID = "com.openai.codex.rebuild";
const REBUILD_WINDOWS_IDENTITY = "OpenAI.CodexRebuild";
const REBUILD_CODEX_HOME_DIR = "CodexRebuildHome";
const REBUILD_ICON_PATH = path.join(PROJECT_ROOT, "resources", "codex-rebuild.ico");
const RCEDIT_PATH = path.join(PROJECT_ROOT, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");

const TARGET_TRIPLE_MAP = {
  "mac-arm64": "aarch64-apple-darwin",
  "mac-x64": "x86_64-apple-darwin",
  "win": "x86_64-pc-windows-msvc",
};

// ─── Helpers ────────────────────────────────────────────────────

function clearDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { count += copyRecursive(s, d); }
    else if (e.isSymbolicLink()) {
      const target = fs.readlinkSync(s);
      try { fs.symlinkSync(target, d); } catch {}
      count++;
    } else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

function resolveCodexVendor(platform) {
  const triple = TARGET_TRIPLE_MAP[platform];
  if (!triple) return null;
  const binName = platform === "win" ? "codex.exe" : "codex";

  // Try platform-specific package (0.128+)
  const PKG_MAP = { "mac-arm64": "codex-darwin-arm64", "mac-x64": "codex-darwin-x64", "win": "codex-win32-x64" };
  const platPkg = PKG_MAP[platform];
  if (platPkg) {
    const p = path.join(PROJECT_ROOT, "node_modules", "@cometix", platPkg, "vendor", triple, "codex", binName);
    if (fs.existsSync(p)) return p;
  }
  // Try old-style vendor (pre-0.128)
  const localPath = path.join(PROJECT_ROOT, "node_modules", "@cometix", "codex", "vendor", triple, "codex", binName);
  if (fs.existsSync(localPath)) return localPath;

  // npm pack fallback — fetch platform-specific package
  // First get latest cometix base version, then append platform suffix
  const PLAT_SUFFIX = {
    "mac-arm64": "darwin-arm64", "mac-x64": "darwin-x64",
    "win": "win32-x64",
    "linux-x64": "linux-x64", "linux-arm64": "linux-arm64",
  };
  const suffix = PLAT_SUFFIX[platform];
  if (!suffix) return null;

  let baseVer;
  try {
    baseVer = execSync("npm view @cometix/codex version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch { return null; }

  // e.g. "0.128.0-cometix" → "@cometix/codex@0.128.0-cometix-darwin-x64"
  const platPkgSpec = `@cometix/codex@${baseVer}-${suffix}`;
  console.log(`   [codex] fetching ${platPkgSpec} via npm pack...`);
  const tmpDir = path.join(require("os").tmpdir(), "cometix-codex-pack");
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const tgzName = execSync(`npm pack ${platPkgSpec} --pack-destination "${tmpDir}"`, {
      cwd: tmpDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    }).trim().split("\n").pop();
    const extractDir = path.join(tmpDir, "extracted");
    clearDir(extractDir);
    execSync(`tar xzf "${path.join(tmpDir, tgzName)}" -C "${extractDir}"`, { stdio: "pipe" });
    const p = path.join(extractDir, "package", "vendor", triple, "codex", binName);
    if (fs.existsSync(p)) return p;
  } catch (e) {
    console.log(`   [!] npm pack failed: ${e.message}`);
  }
  return null;
}

// ─── macOS build ────────────────────────────────────────────────

function buildMac(platform) {
  const platformDir = path.join(SRC_DIR, platform);
  const asarDir = path.join(platformDir, "_asar");

  if (!fs.existsSync(asarDir)) {
    console.error(`[x] ${platform}/_asar/ not found. Run sync-upstream first.`);
    process.exit(1);
  }

  // 1. Find the .app in the ZIP extract cache
  const tempDir = path.join(require("os").tmpdir(), "codex-sync");
  const variant = platform === "mac-arm64" ? "arm64" : "x64";
  const extractDir = path.join(tempDir, `${variant}-extract`);

  // Find Codex.app
  let appPath = null;
  if (fs.existsSync(extractDir)) {
    const findApp = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "Codex.app" && e.isDirectory()) return path.join(dir, e.name);
        if (e.isDirectory()) { const r = findApp(path.join(dir, e.name)); if (r) return r; }
      }
      return null;
    };
    appPath = findApp(extractDir);
  }

  if (!appPath) {
    console.error(`[x] Codex.app not found in cache. Run sync-upstream first.`);
    process.exit(1);
  }

  console.log(`   [source] ${appPath}`);

  // 2. Copy .app to output (ditto preserves symlinks + resource forks)
  const outAppDir = path.join(OUT_DIR, platform);
  clearDir(outAppDir);
  const outApp = path.join(outAppDir, "Codex.app");
  console.log("   [copy] Codex.app -> out/");
  execSync(`ditto "${appPath}" "${outApp}"`);

  const resourcesDir = path.join(outApp, "Contents", "Resources");

  // 3. Repack patched ASAR
  const asarPath = path.join(resourcesDir, "app.asar");
  console.log("   [asar pack] _asar/ -> app.asar");
  execSync(`npx asar pack "${asarDir}" "${asarPath}"`);

  // 4. Update ASAR integrity hash in Info.plist
  const infoPlist = path.join(outApp, "Contents", "Info.plist");
  if (fs.existsSync(infoPlist)) {
    updateAsarIntegrity(asarPath, infoPlist);
  }

  // 5. Strip original signature + quarantine
  console.log("   [codesign] removing original signature");
  try { execSync(`codesign --remove-signature "${outApp}"`, { stdio: "pipe" }); } catch {}
  try { execSync(`xattr -rd com.apple.quarantine "${outApp}"`, { stdio: "pipe" }); } catch {}

  // 6. Replace codex CLI
  replaceCodex(platform, resourcesDir, "codex");

  // 7. Ad-hoc re-sign (prevents "damaged app" Gatekeeper error)
  console.log("   [codesign] ad-hoc signing");
  try {
    execSync(`codesign --sign - --force --deep "${outApp}"`, { stdio: "pipe" });
    console.log("   [ok] ad-hoc signed");
  } catch (e) {
    console.log(`   [!] ad-hoc sign failed: ${e.message}`);
  }

  // 8. Create DMG
  const version = getVersion(asarDir);
  const dmgName = `Codex-${platform}-${version}.dmg`;
  const dmgPath = path.join(OUT_DIR, dmgName);
  console.log(`   [dmg] ${dmgName}`);
  execSync(`hdiutil create -volname Codex -srcfolder "${outAppDir}" -ov -format UDZO "${dmgPath}"`, { stdio: "pipe" });
  const sizeMB = (fs.statSync(dmgPath).size / 1048576).toFixed(1);
  console.log(`   [ok] ${dmgPath} (${sizeMB} MB)`);
}

// ─── Windows build ──────────────────────────────────────────────

function buildWin(platform) {
  const platformDir = path.join(SRC_DIR, platform);
  const asarDir = path.join(platformDir, "_asar");

  if (!fs.existsSync(asarDir)) {
    console.error(`[x] win/_asar/ not found. Run sync-upstream first.`);
    process.exit(1);
  }

  // Windows: use the MSIX extract cache
  const tempDir = path.join(require("os").tmpdir(), "codex-sync");
  const extractDir = path.join(tempDir, "win-extract");
  const appDir = path.join(extractDir, "app");

  if (!fs.existsSync(appDir)) {
    console.error(`[x] MSIX extract not found. Run sync-upstream first.`);
    process.exit(1);
  }

  // Copy app/ to output
  const outAppDir = path.join(OUT_DIR, "win");
  clearDir(outAppDir);
  const outApp = path.join(outAppDir, "Codex-win32-x64");
  console.log("   [copy] MSIX app/ -> out/");
  copyRecursive(appDir, outApp);

  const resourcesDir = path.join(outApp, "resources");
  patchRebuildAsarMetadata(asarDir);
  patchRebuildBootstrap(asarDir);
  ensureRebuildIcon();
  patchRebuildResourceIcons(resourcesDir);

  const rebuildExePath = path.join(outApp, REBUILD_EXE_NAME);
  const upstreamExePath = path.join(outApp, "Codex.exe");
  if (fs.existsSync(upstreamExePath)) {
    fs.copyFileSync(upstreamExePath, rebuildExePath);
    patchRebuildExeResources(rebuildExePath);
    console.log("   [exe] added CodexRebuild.exe launcher");
  } else {
    console.log("   [!] Codex.exe not found for CodexRebuild.exe launcher");
  }

  // Compute old ASAR header hash (before repack)
  const asarPath = path.join(resourcesDir, "app.asar");
  const oldHash = computeAsarHeaderHash(asarPath);
  console.log(`   [integrity] old hash: ${oldHash.slice(0, 16)}...`);

  // Repack patched ASAR
  console.log("   [asar pack] _asar/ -> app.asar");
  execSync(`npx asar pack "${asarDir}" "${asarPath}"`);

  // Compute new hash and patch exe
  const newHash = computeAsarHeaderHash(asarPath);
  console.log(`   [integrity] new hash: ${newHash.slice(0, 16)}...`);

  if (oldHash !== newHash) {
    // Find Codex.exe in app root
    const exePath = path.join(outApp, "Codex.exe");
    if (fs.existsSync(exePath)) {
      patchExeHash(exePath, oldHash, newHash);
    } else {
      console.log("   [!] Codex.exe not found for hash patching");
    }
    if (fs.existsSync(rebuildExePath)) {
      patchExeHash(rebuildExePath, oldHash, newHash);
    } else {
      console.log("   [!] CodexRebuild.exe not found for hash patching");
    }
  }

  // Add rebuilt codex CLI without replacing upstream codex.exe
  addRebuildCodex(platform, resourcesDir, REBUILD_CLI_NAME);

  // Create ZIP
  const version = getVersion(asarDir);
  const zipName = `Codex-win-x64-${version}.zip`;
  const zipPath = path.join(OUT_DIR, zipName);
  console.log(`   [zip] ${zipName}`);
  execSync(`7zz a -tzip -mx=5 "${zipPath}" .`, { cwd: outApp });

  const sizeMB = (fs.statSync(zipPath).size / 1048576).toFixed(1);
  console.log(`   [ok] ${zipPath} (${sizeMB} MB)`);
}

// ─── ASAR integrity ─────────────────────────────────────────────

function computeAsarHeaderHash(asarPath) {
  const crypto = require("crypto");
  const buf = fs.readFileSync(asarPath);
  const headerSize = buf.readUInt32LE(12);
  const header = buf.slice(16, 16 + headerSize);
  return crypto.createHash("sha256").update(header).digest("hex");
}

function patchExeHash(exePath, oldHash, newHash) {
  const buf = fs.readFileSync(exePath);
  const oldBuf = Buffer.from(oldHash, "ascii");
  const idx = buf.indexOf(oldBuf);
  if (idx < 0) {
    console.log("   [!] old hash not found in exe");
    return;
  }
  Buffer.from(newHash, "ascii").copy(buf, idx);
  fs.writeFileSync(exePath, buf);
  console.log(`   [integrity] exe hash patched at offset ${idx}`);
}

function patchRebuildAsarMetadata(asarDir) {
  const pkgPath = path.join(asarDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.log("   [!] package.json not found for Rebuild metadata patch");
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.name = "openai-codex-rebuild-electron";
  pkg.productName = REBUILD_PRODUCT_NAME;
  pkg.description = "Codex Rebuild";
  pkg.codexWindowsPackageIdentity = REBUILD_WINDOWS_IDENTITY;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log("   [identity] patched ASAR package metadata for Codex Rebuild");
}

function patchRebuildBootstrap(asarDir) {
  const bootstrapPath = path.join(asarDir, ".vite", "build", "bootstrap.js");
  if (!fs.existsSync(bootstrapPath)) {
    console.log("   [!] bootstrap.js not found for Rebuild identity patch");
    return;
  }
  let text = fs.readFileSync(bootstrapPath, "utf-8");
  const marker = "process.platform===`win32`&&r.basename(process.execPath).toLowerCase()===`codexrebuild.exe`";
  if (text.includes(marker)) {
    text = patchBootstrapCodexHomeOverride(text);
    text = patchBootstrapAppUserModelOverride(text);
    fs.writeFileSync(bootstrapPath, text, "utf-8");
    console.log("   [identity] bootstrap Rebuild isolation already present");
    return;
  }
  const needle = "let n=require(`electron`),r=require(`node:path`);";
  if (!text.includes(needle)) {
    console.log("   [!] bootstrap require pattern not found for Rebuild identity patch");
    return;
  }
  const injection = [
    needle,
    `if(process.platform===\`win32\`&&r.basename(process.execPath).toLowerCase()===\`codexrebuild.exe\`){`,
    `process.env.CODEX_HOME||(process.env.CODEX_HOME=r.join(n.app.getPath(\`appData\`),\`${REBUILD_CODEX_HOME_DIR}\`));`,
    `process.env.CODEX_ELECTRON_USER_DATA_PATH||(process.env.CODEX_ELECTRON_USER_DATA_PATH=r.join(n.app.getPath(\`appData\`),\`CodexRebuild\`));`,
    `process.env.CODEX_CLI_PATH||(process.env.CODEX_CLI_PATH=r.join(process.resourcesPath,\`${REBUILD_CLI_NAME}\`));`,
    `n.app.setName(\`${REBUILD_PRODUCT_NAME}\`);`,
    `n.app.setAppUserModelId(\`${REBUILD_APP_USER_MODEL_ID}\`)`,
    `}`,
  ].join("");
  text = text.replace(needle, injection);
  text = patchBootstrapAppUserModelOverride(text);
  fs.writeFileSync(bootstrapPath, text, "utf-8");
  console.log("   [identity] injected Rebuild userData/AppUserModelID bootstrap patch");
}

function patchBootstrapCodexHomeOverride(text) {
  const userDataExpr = "process.env.CODEX_ELECTRON_USER_DATA_PATH||(process.env.CODEX_ELECTRON_USER_DATA_PATH=r.join(n.app.getPath(`appData`),`CodexRebuild`));";
  const codexHomeExpr = `process.env.CODEX_HOME||(process.env.CODEX_HOME=r.join(n.app.getPath(\`appData\`),\`${REBUILD_CODEX_HOME_DIR}\`));`;
  if (text.includes(codexHomeExpr)) return text;
  if (!text.includes(userDataExpr)) {
    console.log("   [!] bootstrap CODEX_HOME insertion point not found");
    return text;
  }
  console.log("   [identity] patched bootstrap CODEX_HOME isolation");
  return text.replace(userDataExpr, `${codexHomeExpr}${userDataExpr}`);
}

function patchBootstrapAppUserModelOverride(text) {
  const original = "process.platform===`win32`&&n.app.setAppUserModelId(t.b(x));";
  const replacement = "process.platform===`win32`&&n.app.setAppUserModelId(r.basename(process.execPath).toLowerCase()===`codexrebuild.exe`?`com.openai.codex.rebuild`:t.b(x));";
  if (text.includes(replacement)) return text;
  if (!text.includes(original)) {
    console.log("   [!] bootstrap AppUserModelID override pattern not found");
    return text;
  }
  console.log("   [identity] patched bootstrap AppUserModelID override");
  return text.replace(original, replacement);
}

function ensureRebuildIcon() {
  if (fs.existsSync(REBUILD_ICON_PATH)) return;
  const scriptPath = path.join(__dirname, "make-rebuild-icon.ps1");
  execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -OutputPath "${REBUILD_ICON_PATH}"`, { stdio: "pipe" });
  console.log("   [icon] generated resources/codex-rebuild.ico");
}

function patchRebuildResourceIcons(resourcesDir) {
  const iconPath = path.join(resourcesDir, "icon.ico");
  fs.copyFileSync(REBUILD_ICON_PATH, iconPath);
  fs.copyFileSync(REBUILD_ICON_PATH, path.join(resourcesDir, "codex-rebuild.ico"));
  console.log("   [icon] patched Electron resource icons for Codex Rebuild");
}

function patchRebuildExeResources(exePath) {
  if (!fs.existsSync(RCEDIT_PATH)) {
    console.log("   [!] rcedit not found, skipping exe resource patch");
    return;
  }
  const args = [
    `"${exePath}"`,
    "--set-version-string", "FileDescription", `"${REBUILD_PRODUCT_NAME}"`,
    "--set-version-string", "ProductName", `"${REBUILD_PRODUCT_NAME}"`,
    "--set-version-string", "InternalName", `"${REBUILD_EXE_NAME}"`,
    "--set-version-string", "OriginalFilename", `"${REBUILD_EXE_NAME}"`,
    "--set-version-string", "CompanyName", `"Codex Rebuild"`,
    "--set-icon", `"${REBUILD_ICON_PATH}"`,
  ];
  execSync(`"${RCEDIT_PATH}" ${args.join(" ")}`, { stdio: "pipe" });
  console.log("   [identity] patched CodexRebuild.exe icon and version metadata");
}

function updateAsarIntegrity(asarPath, infoPlistPath) {
  const newHash = computeAsarHeaderHash(asarPath);
  execSync(`plutil -replace ElectronAsarIntegrity.Resources/app\\\\.asar.hash -string "${newHash}" "${infoPlistPath}"`, { stdio: "pipe" });
  execSync(`plutil -replace ElectronAsarIntegrity.Resources/app\\\\.asar.algorithm -string "SHA256" "${infoPlistPath}"`, { stdio: "pipe" });

  // Verify
  const verify = execSync(`plutil -extract ElectronAsarIntegrity.Resources/app\\\\.asar.hash raw "${infoPlistPath}"`, { encoding: "utf-8" }).trim();
  if (verify === newHash) {
    console.log(`   [integrity] hash updated: ${newHash.slice(0, 16)}...`);
  } else {
    console.log(`   [!] integrity verify failed`);
  }
}

// ─── Shared ─────────────────────────────────────────────────────

function replaceCodex(platform, resourcesDir, binName) {
  const vendor = resolveCodexVendor(platform);
  if (vendor) {
    const dest = path.join(resourcesDir, binName);
    fs.copyFileSync(vendor, dest);
    try { fs.chmodSync(dest, 0o755); } catch {}
    console.log(`   [codex] replaced with @cometix/codex`);
  } else {
    console.log(`   [!] @cometix/codex not found, keeping upstream codex`);
  }
}

function addRebuildCodex(platform, resourcesDir, binName) {
  const vendor = resolveCodexVendor(platform);
  if (vendor) {
    const dest = path.join(resourcesDir, binName);
    fs.copyFileSync(vendor, dest);
    try { fs.chmodSync(dest, 0o755); } catch {}
    console.log(`   [codex] added ${binName} from @cometix/codex`);
  } else {
    console.log(`   [!] @cometix/codex not found, skipping ${binName}`);
  }
}

function getVersion(asarDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(asarDir, "package.json"), "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const platIdx = args.indexOf("--platform");
  const platform = platIdx !== -1 ? args[platIdx + 1] : null;

  if (!platform || !["mac-arm64", "mac-x64", "win"].includes(platform)) {
    console.error("[x] Usage: build-from-upstream.js --platform <mac-arm64|mac-x64|win>");
    process.exit(1);
  }

  console.log(`\n== Build from upstream: ${platform} ==\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (platform.startsWith("mac")) {
    buildMac(platform);
  } else {
    buildWin(platform);
  }
}

main();
