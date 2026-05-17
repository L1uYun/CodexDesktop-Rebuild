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
const REBUILD_BUNDLED_MARKETPLACE_ENV = "CODEX_REBUILD_BUNDLED_MARKETPLACE_ROOT";
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

function getExactChildPath(dir, childName) {
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((name) => name === childName);
  return match ? path.join(dir, match) : null;
}

function findInstalledOfficialWindowsAppDir() {
  const envDir = process.env.CODEX_OFFICIAL_APP_DIR;
  if (envDir && fs.existsSync(path.join(envDir, "Codex.exe"))) return envDir;

  const windowsApps = path.join(process.env.ProgramFiles || "C:\\Program Files", "WindowsApps");
  if (!fs.existsSync(windowsApps)) return null;
  let candidates = [];
  try {
    candidates = fs.readdirSync(windowsApps)
      .filter((name) => /^OpenAI\.Codex_\d+\.\d+\.\d+\.\d+_x64__/.test(name))
      .sort()
      .reverse();
  } catch {
    return null;
  }
  for (const name of candidates) {
    const appDir = path.join(windowsApps, name, "app");
    if (fs.existsSync(path.join(appDir, "Codex.exe"))) return appDir;
  }
  return null;
}

function findWindowsElectronLauncher(platformDir) {
  const syncedLauncher = getExactChildPath(platformDir, "Codex.exe");
  if (syncedLauncher) return syncedLauncher;

  const installedAppDir = findInstalledOfficialWindowsAppDir();
  if (installedAppDir) return path.join(installedAppDir, "Codex.exe");

  return null;
}

function findWindowsOfficialAppDirForRuntime(platformDir) {
  const launcher = getExactChildPath(platformDir, "Codex.exe");
  if (launcher) return platformDir;
  return findInstalledOfficialWindowsAppDir();
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

  if (!fs.existsSync(path.join(platformDir, "codex.exe"))) {
    console.error(`[x] win resources not found. Run sync-upstream first.`);
    process.exit(1);
  }

  runPatchScript("patch-browser-client-discovery-timeout.js", "win");
  runPatchScript("patch-browser-trust-bridge.js", "win");
  runPatchScript("patch-plugin-auth.js", "win");
  runPatchScript("patch-plugins-experience-feature.js", "win");
  runPatchScript("patch-browser-use-feature-availability.js", "win");
  runPatchScript("patch-browser-use-js-repl-feature.js", "win");
  runPatchScript("patch-browser-tool-call-guidance.js");
  runPatchScript("patch-heartbeat-automation-feature.js", "win");
  runPatchScript("patch-archived-chats-local-fallback.js", "win");
  runPatchScript("patch-local-thread-item-guards.js", "win");

  // Copy synced Windows resources to output.
  const outAppDir = path.join(OUT_DIR, "win");
  clearDir(outAppDir);
  const outApp = path.join(outAppDir, "Codex-win32-x64");
  console.log("   [copy] src/win resources -> out/");
  copyWindowsResources(platformDir, outApp);

  const resourcesDir = path.join(outApp, "resources");
  const officialLauncherPath = findWindowsElectronLauncher(platformDir);
  if (!officialLauncherPath) {
    console.error("[x] Windows Electron launcher Codex.exe not found. Set CODEX_OFFICIAL_APP_DIR to the official app directory.");
    process.exit(1);
  }
  const officialAppDir = findWindowsOfficialAppDirForRuntime(platformDir);
  const originalAsarPath = officialAppDir ? path.join(officialAppDir, "resources", "app.asar") : null;
  if (originalAsarPath && fs.existsSync(originalAsarPath)) {
    fs.copyFileSync(originalAsarPath, path.join(resourcesDir, "app.asar"));
  }
  if (officialAppDir) {
    copyWindowsRuntimeRoot(officialAppDir, outApp);
    console.log(`   [copy] Windows Electron runtime root: ${officialAppDir}`);
  } else {
    console.log("   [!] Windows Electron runtime root not found; launcher may not start");
  }
  const outOfficialLauncherPath = path.join(outApp, "Codex.exe");
  fs.copyFileSync(officialLauncherPath, outOfficialLauncherPath);
  console.log(`   [exe] using Windows Electron launcher: ${officialLauncherPath}`);

  patchRebuildAsarMetadata(asarDir);
  patchRebuildBootstrap(asarDir);
  runPatchScript("patch-rebuild-windows-thread-path-preflight.js", "win");
  patchRebuildAvatarAutoOpen(asarDir);
  patchRebuildAvatarDefaultSize(asarDir);
  patchRebuildAvatarAutoMove(asarDir);
  patchRebuildWindowsImmediateExit(asarDir);
  patchRebuildChildProcessGoneFatal(asarDir);
  patchRebuildBundledMarketplaceRoot(asarDir);
  ensureRebuildIcon();
  patchRebuildResourceIcons(resourcesDir);

  const rebuildExePath = path.join(outApp, REBUILD_EXE_NAME);
  if (fs.existsSync(outOfficialLauncherPath)) {
    fs.copyFileSync(outOfficialLauncherPath, rebuildExePath);
    patchRebuildExeResources(rebuildExePath);
    console.log("   [exe] added CodexRebuild.exe launcher");
  } else {
    console.log("   [!] Codex.exe not found for CodexRebuild.exe launcher");
  }

  // Compute old ASAR header hash (before repack)
  const asarPath = path.join(resourcesDir, "app.asar");
  const oldHash = fs.existsSync(asarPath) ? computeAsarHeaderHash(asarPath) : null;
  if (oldHash) {
    console.log(`   [integrity] old hash: ${oldHash.slice(0, 16)}...`);
  } else {
    console.log("   [integrity] old app.asar missing; exe hash patch will be skipped");
  }

  // Repack patched ASAR
  console.log("   [asar pack] _asar/ -> app.asar");
  execSync(`npx asar pack "${asarDir}" "${asarPath}"`);

  // Compute new hash and patch exe
  const newHash = computeAsarHeaderHash(asarPath);
  console.log(`   [integrity] new hash: ${newHash.slice(0, 16)}...`);

  if (oldHash && oldHash !== newHash) {
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

  // Add a Rebuild-named CLI next to the upstream CLI. Keep it version-matched
  // with the official desktop app because the app-server protocol is coupled
  // to the Electron bundle.
  addRebuildCodex(platform, resourcesDir, REBUILD_CLI_NAME);
  copyCodexPlusPlus(resourcesDir);

  // Create ZIP
  const version = getVersion(asarDir);
  const zipName = `Codex-win-x64-${version}.zip`;
  const zipPath = path.join(OUT_DIR, zipName);
  console.log(`   [zip] ${zipName}`);
  createZip(outApp, zipPath);

  const sizeMB = (fs.statSync(zipPath).size / 1048576).toFixed(1);
  console.log(`   [ok] ${zipPath} (${sizeMB} MB)`);
}

function createZip(sourceDir, zipPath) {
  const sevenZip = findExecutable(["7zz", "7z", "7za"]);
  if (sevenZip) {
    execSync(`"${sevenZip}" a -tzip -mx=5 "${zipPath}" .`, { cwd: sourceDir });
    return;
  }
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
  const tar = findExecutable(["tar"]);
  if (!tar) throw new Error("No zip tool found: install 7-Zip or ensure tar is on PATH");
  execSync(`"${tar}" -a -cf "${zipPath}" .`, { cwd: sourceDir });
  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP was not created: ${zipPath}`);
  }
}

function findExecutable(names) {
  for (const name of names) {
    try {
      return execSync(`where ${name}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/)[0]?.trim() || null;
    } catch {}
  }
  return null;
}

function copyWindowsResources(srcDir, outApp) {
  fs.mkdirSync(outApp, { recursive: true });
  const resourcesDir = path.join(outApp, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === "_asar") continue;
    const sourcePath = path.join(srcDir, entry.name);
    const targetRoot = isWindowsRootResource(entry.name) ? outApp : resourcesDir;
    const targetPath = path.join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(sourcePath, targetPath);
    } else if (!entry.isSymbolicLink()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyWindowsRuntimeRoot(appDir, outApp) {
  for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (entry.name === "resources") continue;
    const sourcePath = path.join(appDir, entry.name);
    const targetPath = path.join(outApp, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(sourcePath, targetPath);
    } else if (!entry.isSymbolicLink()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyCodexPlusPlus(resourcesDir) {
  const sourcePackage = path.join(PROJECT_ROOT, "CodexPlusPlus", "codex_session_delete");
  if (!fs.existsSync(sourcePackage)) {
    console.log("   [!] CodexPlusPlus source package not found");
    return;
  }
  const targetRoot = path.join(resourcesDir, "CodexPlusPlus");
  const targetPackage = path.join(targetRoot, "codex_session_delete");
  if (fs.existsSync(targetRoot)) fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  copyRecursive(sourcePackage, targetPackage);
  console.log("   [plusplus] bundled CodexPlusPlus Python package");
}

function isWindowsRootResource(name) {
  return [
    "Codex.exe",
    "icon.ico",
    "chrome_100_percent.pak",
    "chrome_200_percent.pak",
    "d3dcompiler_47.dll",
    "dxcompiler.dll",
    "dxil.dll",
    "ffmpeg.dll",
    "icudtl.dat",
    "libEGL.dll",
    "libGLESv2.dll",
    "LICENSE",
    "LICENSES.chromium.html",
    "locales",
    "resources.pak",
    "snapshot_blob.bin",
    "v8_context_snapshot.bin",
    "version",
    "vk_swiftshader_icd.json",
    "vk_swiftshader.dll",
    "vulkan-1.dll",
  ].includes(name);
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
    text = patchBootstrapCodexHomeMirror(text);
    text = patchBootstrapWindowsStatePathPreflight(text);
    text = patchBootstrapRebuildRuntimeEnv(text);
    text = patchBootstrapRebuildLifecycleTrace(text);
    text = patchBootstrapRebuildAvatarAutoOpen(text);
    text = patchBootstrapRebuildPlusPlusAutoStart(text);
    text = patchBootstrapAppUserModelOverride(text);
    text = patchBootstrapRebuildProductNameOverride(text);
    text = patchBootstrapRebuildUpdaterSkip(text);
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
    getRebuildCodexHomeMirrorRuntimeSnippet(),
    getRebuildRuntimeEnvSnippet(),
    `process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);`,
    `process.env.CODEX_ELECTRON_USER_DATA_PATH||(process.env.CODEX_ELECTRON_USER_DATA_PATH=r.join(n.app.getPath(\`appData\`),\`CodexRebuild\`));`,
    `process.env.${REBUILD_BUNDLED_MARKETPLACE_ENV}||(process.env.${REBUILD_BUNDLED_MARKETPLACE_ENV}=r.join(n.app.getPath(\`appData\`),\`CodexRebuild\`,\`bundled-marketplaces\`));`,
    `process.env.CODEX_CLI_PATH||(process.env.CODEX_CLI_PATH=r.join(process.resourcesPath,\`${REBUILD_CLI_NAME}\`));`,
    `n.app.setName(\`${REBUILD_PRODUCT_NAME}\`);`,
    `n.app.setAppUserModelId(\`${REBUILD_APP_USER_MODEL_ID}\`)`,
    `}`,
  ].join("");
  text = text.replace(needle, injection);
  text = patchBootstrapWindowsStatePathPreflight(text);
  text = patchBootstrapRebuildRuntimeEnv(text);
  text = patchBootstrapRebuildLifecycleTrace(text);
  text = patchBootstrapRebuildAvatarAutoOpen(text);
  text = patchBootstrapRebuildPlusPlusAutoStart(text);
  text = patchBootstrapAppUserModelOverride(text);
  text = patchBootstrapRebuildProductNameOverride(text);
  text = patchBootstrapRebuildUpdaterSkip(text);
  fs.writeFileSync(bootstrapPath, text, "utf-8");
  console.log("   [identity] injected Rebuild userData/AppUserModelID bootstrap patch");
}

function patchBootstrapCodexHomeMirror(text) {
  const legacyCodexHomeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=r.join(n.app.getPath(`appData`),`CodexRebuildHome`));";
  const userDataExpr = "process.env.CODEX_ELECTRON_USER_DATA_PATH||(process.env.CODEX_ELECTRON_USER_DATA_PATH=r.join(n.app.getPath(`appData`),`CodexRebuild`));";
  const mirrorExpr = `${getRebuildCodexHomeMirrorRuntimeSnippet()}${getRebuildWindowsStatePathPreflightRuntimeSnippet()}process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);`;
  const marketplaceExpr = `process.env.${REBUILD_BUNDLED_MARKETPLACE_ENV}||(process.env.${REBUILD_BUNDLED_MARKETPLACE_ENV}=r.join(n.app.getPath(\`appData\`),\`CodexRebuild\`,\`bundled-marketplaces\`));`;
  text = text.replace(legacyCodexHomeExpr, "");
  const rebuildHomeStart = "var __codexRebuildFs=require(`node:fs`),__codexRebuildSourceHome=r.join(require(`node:os`).homedir(),`.codex`),__codexRebuildHome=r.join(n.app.getPath(`appData`),`CodexRebuildHome`);";
  while (text.includes(rebuildHomeStart)) {
    const start = text.indexOf(rebuildHomeStart);
    const end = text.indexOf("process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);", start);
    if (end < 0) break;
    text = text.slice(0, start) + text.slice(end + "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);".length);
  }
  const currentHomeExpr = getRebuildCodexHomeMirrorRuntimeSnippet();
  const codeHomeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  if (text.includes(currentHomeExpr) && text.includes(codeHomeExpr)) {
    if (text.includes(marketplaceExpr)) return text;
    if (!text.includes(userDataExpr)) {
      console.log("   [!] bootstrap marketplace insertion point not found");
      return text;
    }
    return text.replace(userDataExpr, `${marketplaceExpr}${userDataExpr}`);
  }
  if (text.includes(mirrorExpr) && text.includes(marketplaceExpr)) return text;
  if (!text.includes(userDataExpr)) {
    console.log("   [!] bootstrap Codex home mirror insertion point not found");
    return text;
  }
  console.log("   [identity] patched bootstrap CODEX_HOME mirror isolation");
  return text.replace(userDataExpr, `${mirrorExpr}${userDataExpr}${text.includes(marketplaceExpr) ? "" : marketplaceExpr}`);
}

function getRebuildCodexHomeMirrorRuntimeSnippet() {
  return `var __codexRebuildHome=r.join(require(\`node:os\`).homedir(),\`.codex\`);`;
}

function getRebuildWindowsStatePathPreflightRuntimeSnippet() {
  return `if(!process.env.CODEX_REBUILD_STATE_PATH_PREFLIGHT_DONE){process.env.CODEX_REBUILD_STATE_PATH_PREFLIGHT_DONE=\`1\`;try{let e=require(\`node:fs\`),t=require(\`node:path\`),i=t.join(__codexRebuildHome,\`state_5.sqlite\`);if(e.existsSync(i)){let e=require(\`better-sqlite3\`),n=new e(i),a=s=>typeof s==\`string\`&&/^[A-Za-z]:\\\\/.test(s)&&!s.startsWith(\`\\\\\\\\?\\\\\`)?\`\\\\\\\\?\\\\\`+s:s,o=n.prepare(\`update threads set rollout_path = ? where id = ?\`),c=n.prepare(\`update threads set cwd = ? where id = ?\`),l=0;n.exec(\`CREATE TRIGGER IF NOT EXISTS codex_rebuild_threads_rollout_path_win_ext_ai AFTER INSERT ON threads WHEN length(NEW.rollout_path) > 3 AND substr(NEW.rollout_path,2,2) = ':\\\\' AND substr(NEW.rollout_path,1,4) != '\\\\\\\\?\\\\' BEGIN UPDATE threads SET rollout_path = '\\\\\\\\?\\\\' || NEW.rollout_path WHERE id = NEW.id; END;CREATE TRIGGER IF NOT EXISTS codex_rebuild_threads_rollout_path_win_ext_au AFTER UPDATE OF rollout_path ON threads WHEN length(NEW.rollout_path) > 3 AND substr(NEW.rollout_path,2,2) = ':\\\\' AND substr(NEW.rollout_path,1,4) != '\\\\\\\\?\\\\' BEGIN UPDATE threads SET rollout_path = '\\\\\\\\?\\\\' || NEW.rollout_path WHERE id = NEW.id; END;\`);n.transaction(()=>{for(let e of n.prepare(\`select id, rollout_path, cwd from threads where archived = 0\`).iterate()){let t=a(e.rollout_path);t!==e.rollout_path&&(o.run(t,e.id),l++);let n=a(e.cwd);n!==e.cwd&&(c.run(n,e.id),l++)}})();l>0&&console.log(\`[rebuild] normalized Windows thread paths: \${l}\`);n.close()}}catch(e){console.warn(\`[rebuild] Windows thread path preflight failed\`,e)}}`;
}

function patchBootstrapWindowsStatePathPreflight(text) {
  const preflightExpr = getRebuildWindowsStatePathPreflightRuntimeSnippet();
  if (text.includes("CODEX_REBUILD_STATE_PATH_PREFLIGHT_DONE")) {
    if (text.includes("codex_rebuild_threads_rollout_path_win_ext_ai")) return text;
    const start = text.indexOf("if(!process.env.CODEX_REBUILD_STATE_PATH_PREFLIGHT_DONE){");
    const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
    const end = text.indexOf(homeExpr, start);
    if (start >= 0 && end > start) {
      console.log("   [identity] upgraded Rebuild Windows thread path preflight");
      return `${text.slice(0, start)}${preflightExpr}${text.slice(end)}`;
    }
  }
  const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  if (!text.includes(homeExpr)) {
    console.log("   [!] bootstrap Windows state path preflight insertion point not found");
    return text;
  }
  console.log("   [identity] patched Rebuild Windows thread path preflight");
  return text.replace(homeExpr, `${preflightExpr}${homeExpr}`);
}

function getRebuildRuntimeEnvSnippet() {
  return `process.env.BUILD_FLAVOR||(process.env.BUILD_FLAVOR=\`prod\`);process.env.NODE_ENV||(process.env.NODE_ENV=\`production\`);`;
}

function patchBootstrapRebuildRuntimeEnv(text) {
  const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  const runtimeExpr = getRebuildRuntimeEnvSnippet();
  if (text.includes(runtimeExpr)) return text;
  if (!text.includes(homeExpr)) {
    console.log("   [!] bootstrap runtime env insertion point not found");
    return text;
  }
  console.log("   [identity] patched Rebuild runtime env for production automation store");
  return text.replace(homeExpr, `${runtimeExpr}${homeExpr}`);
}

function getRebuildPlusPlusAutoStartRuntimeSnippet() {
  const port = "19439";
  return [
    "if(!process.env.CODEX_REBUILD_PLUS_PLUS_LAUNCHED&&!process.env.CODEX_REBUILD_PLUS_PLUS_AUTOSTART_DONE){process.env.CODEX_REBUILD_PLUS_PLUS_AUTOSTART_DONE=`1`;try{",
    "let e=require(`node:fs`),t=require(`node:path`),i=require(`node:child_process`),a=t.join(process.resourcesPath,`CodexPlusPlus`),o=t.join(a,`codex_session_delete`,`cli.py`);",
    `n.app.commandLine.appendSwitch(\`remote-debugging-port\`,\`${port}\`),n.app.commandLine.appendSwitch(\`remote-debugging-address\`,\`127.0.0.1\`),n.app.commandLine.appendSwitch(\`remote-allow-origins\`,\`http://127.0.0.1:${port}\`);`,
    "if(e.existsSync(o)){let e=process.env.CODEX_PLUS_PLUS_PYTHON||`D:\\\\Python3.11.1\\\\pythonw.exe`,n=e.toLowerCase().endsWith(`pythonw.exe`)||e.toLowerCase().endsWith(`python.exe`)?[e]:[`pythonw.exe`],s={...process.env,PYTHONPATH:a+(process.env.PYTHONPATH?`;`+process.env.PYTHONPATH:``),CODEX_PLUS_PLUS_WATCHER_TAKEOVER:``};",
    `for(let e of n){try{i.spawn(e,[\`-m\`,\`codex_session_delete\`,\`attach\`,\`--app-dir\`,t.dirname(process.execPath),\`--debug-port\`,\`${port}\`],{cwd:a,env:s,detached:!0,stdio:\`ignore\`,windowsHide:!0}).unref(),globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(\`plusplus-attach\`,\`python=\${e}\`);break}catch(e){globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(\`plusplus-attach-failed\`,e&&e.message||String(e))}}}`,
    "}catch(e){globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(`plusplus-autostart-error`,e&&e.stack||String(e))}}",
  ].join("");
}

function patchBootstrapRebuildPlusPlusAutoStart(text) {
  if (text.includes("CODEX_REBUILD_PLUS_PLUS_AUTOSTART_DONE")) {
    let refreshed = text
      .replaceAll("if(!process.env.CODEX_REBUILD_PLUS_PLUS_AUTOSTART_DONE){", "if(!process.env.CODEX_REBUILD_PLUS_PLUS_LAUNCHED&&!process.env.CODEX_REBUILD_PLUS_PLUS_AUTOSTART_DONE){")
      .replaceAll("`9239`", "`19339`")
      .replaceAll("http://127.0.0.1:9239", "http://127.0.0.1:19339")
      .replaceAll("--debug-port`,`9239`", "--debug-port`,`19339`")
      .replaceAll("`19339`", "`19439`")
      .replaceAll("http://127.0.0.1:19339", "http://127.0.0.1:19439")
      .replaceAll("--debug-port`,`19339`", "--debug-port`,`19439`");
    if (!refreshed.includes("remote-debugging-address")) {
      refreshed = refreshed.replace(
        "n.app.commandLine.appendSwitch(`remote-debugging-port`,`19439`),n.app.commandLine.appendSwitch(`remote-allow-origins`,`http://127.0.0.1:19439`);",
        "n.app.commandLine.appendSwitch(`remote-debugging-port`,`19439`),n.app.commandLine.appendSwitch(`remote-debugging-address`,`127.0.0.1`),n.app.commandLine.appendSwitch(`remote-allow-origins`,`http://127.0.0.1:19439`);"
      );
    }
    if (refreshed !== text) {
      console.log("   [plusplus] refreshed bootstrap PlusPlus attach port");
    }
    return refreshed;
  }
  const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  if (!text.includes(homeExpr)) {
    console.log("   [!] bootstrap PlusPlus autostart insertion point not found");
    return text;
  }
  console.log("   [plusplus] patched bootstrap PlusPlus attach autostart");
  return text.replace(homeExpr, `${getRebuildPlusPlusAutoStartRuntimeSnippet()}${homeExpr}`);
}

function getRebuildAvatarAutoOpenRuntimeSnippet() {
  return [
    "(()=>{if(globalThis.__codexRebuildAvatarAutoOpenVersion!==4){globalThis.__codexRebuildAvatarAutoOpenVersion=4;try{",
    "setTimeout(()=>{try{if(we&&!we.isDestroyed())M.avatarOverlayManager.open(we.webContents).then(()=>{globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(`avatar-auto-open-official`)},e=>{globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(`avatar-auto-open-official-failed`,e&&e.stack||String(e))})}catch(e){globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(`avatar-auto-open-official-error`,e&&e.stack||String(e))}},4000);",
    "}catch(e){globalThis.__codexRebuildTrace&&globalThis.__codexRebuildTrace(`avatar-auto-open-install-failed`,e&&e.stack||String(e))}}})()",
  ].join("");
}

function patchBootstrapRebuildAvatarAutoOpen(text) {
  const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  const legacyVersionStart = text.indexOf("if(globalThis.__codexRebuildAvatarAutoOpenVersion");
  if (legacyVersionStart >= 0) {
    const legacyEnd = text.indexOf(homeExpr, legacyVersionStart);
    if (legacyEnd > legacyVersionStart) {
      console.log("   [avatar] upgraded Rebuild avatar auto-open");
      text = `${text.slice(0, legacyVersionStart)}${text.slice(legacyEnd)}`;
    }
  }
  const legacyStart = text.indexOf("if(!globalThis.__codexRebuildAvatarAutoOpenInstalled){");
  if (legacyStart >= 0) {
    const legacyEnd = text.indexOf(homeExpr, legacyStart);
    if (legacyEnd > legacyStart) {
      console.log("   [avatar] upgraded Rebuild avatar auto-open");
      text = `${text.slice(0, legacyStart)}${text.slice(legacyEnd)}`;
    }
  }
  if (text.includes("__codexRebuildAvatarAutoOpenVersion")) return text;
  return text;
}

function patchRebuildAvatarAutoOpen(asarDir) {
  const buildDir = path.join(asarDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    console.log("   [!] build dir not found for Rebuild avatar auto-open patch");
    return;
  }
  let patched = false;
  for (const entry of fs.readdirSync(buildDir)) {
    if (!/^main.*\.js$/.test(entry)) continue;
    const filePath = path.join(buildDir, entry);
    let text = fs.readFileSync(filePath, "utf-8");
    const legacyStart = text.indexOf(",(()=>{if(globalThis.__codexRebuildAvatarAutoOpenVersion");
    const legacyEndNeedle = ",A=Date.now(),await oe.deepLinks.flushPendingDeepLinks()";
    if (legacyStart >= 0) {
      const legacyEnd = text.indexOf(legacyEndNeedle, legacyStart);
      if (legacyEnd > legacyStart) {
        console.log("   [avatar] upgraded Rebuild avatar auto-open");
        text = `${text.slice(0, legacyStart)}${text.slice(legacyEnd)}`;
      }
    }
    if (text.includes("__codexRebuildAvatarAutoOpenVersion")) {
      patched = true;
      continue;
    }
    const startupExpr = "we&&(k.add(t.r({ensureLocalWindow:M.ensureLocalWindow,errorReporter:g,globalState:j.globalState,isMacOS:T,windowManager:M.windowManager})),ce(we)),w(`local window ensured`,A,{hostId:t.m,localWindowVisible:we?.isVisible()??!1})";
    if (!text.includes(startupExpr)) continue;
    text = text.replace(startupExpr, `${startupExpr},${getRebuildAvatarAutoOpenRuntimeSnippet()}`);
    fs.writeFileSync(filePath, text, "utf-8");
    patched = true;
    console.log(`   [avatar] patched Rebuild avatar auto-open in ${entry}`);
  }
  if (!patched) console.log("   [!] main avatar auto-open insertion point not found");
}

function patchRebuildAvatarAutoMove(asarDir) {
  const buildDir = path.join(asarDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    console.log("   [!] build dir not found for Rebuild avatar auto-move patch");
    return;
  }
  let patched = false;
  for (const entry of fs.readdirSync(buildDir)) {
    if (!/^main.*\.js$/.test(entry)) continue;
    const filePath = path.join(buildDir, entry);
    let text = fs.readFileSync(filePath, "utf-8");
    const methodNeedle = "setElementSize(e,{mascot:t,tray:n}){";
    const methodPatch = "autoMove(e,t,r){let i=this.window;if(i==null||i.isDestroyed()||i.webContents.id!==e||!Number.isFinite(t)||!Number.isFinite(r))return;this.cancelMomentum();let a=this.getLayout(i),o={x:t+a.mascot.left,y:r+a.mascot.top,width:this.anchor.width,height:this.anchor.height},s=n.screen.getDisplayNearestPoint(FU(o)).bounds,c=n.screen.getDisplayNearestPoint(n.screen.getCursorScreenPoint()).bounds,l=VU(s,c)?s:{x:Math.min(s.x,c.x),y:Math.min(s.y,c.y),width:Math.max(s.x+s.width,c.x+c.width)-Math.min(s.x,c.x),height:Math.max(s.y+s.height,c.y+c.height)-Math.min(s.y,c.y)};this.anchor=o,this.applyLayout(i,l),this.persistWindowBounds(i)}";
    if (text.includes(methodPatch) && text.includes("avatar-overlay-auto-move")) {
      patched = true;
      continue;
    }
    text = text.replace(/autoMove\(e,t,r\)\{let i=this\.window;if\(i==null\|\|i\.isDestroyed\(\)\|\|i\.webContents\.id!==e\|\|!Number\.isFinite\(t\)\|\|!Number\.isFinite\(r\)\)return;this\.cancelMomentum\(\);let a=this\.getLayout\(i\),o=\{x:t\+a\.mascot\.left,y:r\+a\.mascot\.top,width:this\.anchor\.width,height:this\.anchor\.height\};this\.anchor=o,this\.applyLayout\(i,n\.screen\.getDisplayNearestPoint\(FU\(o\)\)\.bounds\),this\.persistWindowBounds\(i\)\}/, "");
    if (!text.includes(methodNeedle)) continue;
    if (!text.includes(methodPatch)) text = text.replace(methodNeedle, `${methodPatch}${methodNeedle}`);
    const caseNeedle = "case`avatar-overlay-element-size-changed`:this.avatarOverlayManager.setElementSize(r.id,{isTrayVisible:i.isTrayVisible,mascot:i.mascot,tray:i.tray});break;";
    const casePatch = `${caseNeedle}case\`avatar-overlay-auto-move\`:this.avatarOverlayManager.autoMove(r.id,i.left,i.top);break;`;
    if (!text.includes("case`avatar-overlay-auto-move`")) {
      if (!text.includes(caseNeedle)) continue;
      text = text.replace(caseNeedle, casePatch);
    }
    fs.writeFileSync(filePath, text, "utf-8");
    patched = true;
    console.log(`   [avatar] patched Rebuild avatar auto-move in ${entry}`);
  }
  if (!patched) console.log("   [!] avatar auto-move insertion point not found");
}

function patchRebuildAvatarDefaultSize(asarDir) {
  const buildDir = path.join(asarDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    console.log("   [!] build dir not found for Rebuild avatar default size patch");
    return;
  }
  let patched = false;
  for (const entry of fs.readdirSync(buildDir)) {
    if (!/^main.*\.js$/.test(entry)) continue;
    const filePath = path.join(buildDir, entry);
    let text = fs.readFileSync(filePath, "utf-8");
    if (text.includes("SU={width:88,height:95}")) {
      patched = true;
      continue;
    }
    const original = "SU={width:112,height:121}";
    const replacement = "SU={width:88,height:95}";
    if (!text.includes(original)) continue;
    text = text.replace(original, replacement);
    fs.writeFileSync(filePath, text, "utf-8");
    patched = true;
    console.log(`   [avatar] patched Rebuild avatar default size in ${entry}`);
  }
  if (!patched) console.log("   [!] avatar default size pattern not found");
}

function getRebuildLifecycleTraceRuntimeSnippet() {
  return `try{let e=require(\`node:fs\`),t=require(\`node:path\`),i=t.join(n.app.getPath(\`appData\`),\`CodexRebuild\`,\`rebuild-lifecycle.log\`),a=(...n)=>{try{e.mkdirSync(t.dirname(i),{recursive:!0});e.appendFileSync(i,new Date().toISOString()+\` \`+n.map(e=>typeof e==\`string\`?e:JSON.stringify(e)).join(\` \`)+\`\\n\`)}catch{}};globalThis.__codexRebuildTrace=a;a(\`trace-installed\`,\`execPath=\${process.execPath}\`,\`argv=\${JSON.stringify(process.argv)}\`,\`ppid=\${process.ppid}\`);let o=n.app.exit.bind(n.app),s=n.app.quit.bind(n.app);n.app.exit=(...e)=>(a(\`app.exit\`,e,new Error().stack),o(...e));n.app.quit=(...e)=>(a(\`app.quit\`,e,new Error().stack),s(...e));n.app.on(\`ready\`,()=>a(\`ready\`));n.app.on(\`browser-window-created\`,()=>a(\`browser-window-created\`));n.app.on(\`second-instance\`,(e,t)=>a(\`second-instance\`,JSON.stringify(t)));n.app.on(\`before-quit\`,()=>a(\`before-quit\`));n.app.on(\`will-quit\`,()=>a(\`will-quit\`));n.app.on(\`window-all-closed\`,()=>a(\`window-all-closed\`));process.on(\`exit\`,e=>a(\`process.exit-event\`,String(e)));process.on(\`beforeExit\`,e=>a(\`process.beforeExit\`,String(e)));process.on(\`uncaughtException\`,e=>a(\`uncaughtException\`,e&&e.stack||String(e)));process.on(\`unhandledRejection\`,e=>a(\`unhandledRejection\`,e&&e.stack||String(e)))}catch{}`;
}

function patchBootstrapRebuildLifecycleTrace(text) {
  const traceExpr = getRebuildLifecycleTraceRuntimeSnippet();
  if (text.includes("rebuild-lifecycle.log") && text.includes("browser-window-created")) return text;
  const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  if (!text.includes(homeExpr)) {
    console.log("   [!] bootstrap lifecycle trace insertion point not found");
    return text;
  }
  console.log("   [identity] patched Rebuild lifecycle trace");
  return text.replace(homeExpr, `${traceExpr}${homeExpr}`);
}

function patchBootstrapAppUserModelOverride(text) {
  const original = "process.platform===`win32`&&n.app.setAppUserModelId(t.b(x));";
  const replacement = "process.platform===`win32`&&n.app.setAppUserModelId(r.basename(process.execPath).toLowerCase()===`codexrebuild.exe`?`com.openai.codex.rebuild`:t.b(x));";
  const originalV2 = "process.platform===`win32`&&n.app.setAppUserModelId(t.S(x));";
  const replacementV2 = "process.platform===`win32`&&n.app.setAppUserModelId(process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)?`com.openai.codex.rebuild`:t.S(x));";
  if (text.includes(replacement)) return text;
  if (text.includes(replacementV2)) return text;
  if (text.includes(originalV2)) {
    console.log("   [identity] patched bootstrap AppUserModelID override");
    return text.replace(originalV2, replacementV2);
  }
  if (!text.includes(original)) {
    console.log("   [!] bootstrap AppUserModelID override pattern not found");
    return text;
  }
  console.log("   [identity] patched bootstrap AppUserModelID override");
  return text.replace(original, replacement);
}

function patchBootstrapRebuildProductNameOverride(text) {
  const original = "n.app.setName(e.G(x)),n.app.setPath(`userData`,";
  const replacement = "n.app.setName(process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)?`Codex Rebuild`:e.G(x)),n.app.setPath(`userData`,";
  if (text.includes(replacement)) return text;
  if (!text.includes(original)) {
    console.log("   [!] bootstrap product name override pattern not found");
    return text;
  }
  console.log("   [identity] patched bootstrap product name override");
  return text.replace(original, replacement);
}

function patchBootstrapRebuildUpdaterSkip(text) {
  const original = "await i.initialize();try{";
  const badReplacement = "r.basename(process.execPath).toLowerCase()===`codexrebuild.exe`||await i.initialize();try{";
  const replacement = "process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)||await i.initialize();try{";
  text = text.replace(badReplacement, original);
  if (text.includes(replacement)) return text;
  if (!text.includes(original)) {
    console.log("   [!] bootstrap updater skip pattern not found");
    return text;
  }
  console.log("   [identity] patched bootstrap updater skip for CodexRebuild.exe");
  return text.replace(original, replacement);
}

function patchRebuildWindowsImmediateExit(asarDir) {
  const buildDir = path.join(asarDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    console.log("   [!] build dir not found for Rebuild Windows immediate exit patch");
    return;
  }
  let patched = false;
  for (const entry of fs.readdirSync(buildDir)) {
    if (!/^main.*\.js$/.test(entry)) continue;
    const filePath = path.join(buildDir, entry);
    let text = fs.readFileSync(filePath, "utf-8");
    const original = "te=()=>{MG({exitImmediately:E&&n.app.isPackaged,";
    const replacement = "te=()=>{MG({exitImmediately:E&&n.app.isPackaged&&!process.execPath.toLowerCase().endsWith(`codexrebuild.exe`),";
    if (text.includes(replacement)) {
      patched = true;
      continue;
    }
    if (!text.includes(original)) continue;
    text = text.replace(original, replacement);
    fs.writeFileSync(filePath, text, "utf-8");
    patched = true;
    console.log(`   [identity] patched Rebuild Windows immediate update exit in ${entry}`);
  }
  if (!patched) console.log("   [!] Rebuild Windows immediate exit pattern not found");
}

function patchRebuildChildProcessGoneFatal(asarDir) {
  const buildDir = path.join(asarDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    console.log("   [!] build dir not found for Rebuild child-process-gone patch");
    return;
  }
  let patched = false;
  for (const entry of fs.readdirSync(buildDir)) {
    if (!/^main.*\.js$/.test(entry)) continue;
    const filePath = path.join(buildDir, entry);
    let text = fs.readFileSync(filePath, "utf-8");
    const original = "n.app.on(`child-process-gone`,(e,t)=>{if(t.reason!==`clean-exit`){";
    const replacement = "n.app.on(`child-process-gone`,(e,t)=>{if(process.execPath.toLowerCase().endsWith(`codexrebuild.exe`))return;if(t.reason!==`clean-exit`){";
    if (text.includes(replacement)) {
      patched = true;
      continue;
    }
    if (!text.includes(original)) continue;
    text = text.replace(original, replacement);
    fs.writeFileSync(filePath, text, "utf-8");
    patched = true;
    console.log(`   [identity] patched Rebuild child-process-gone fatal handler in ${entry}`);
  }
  if (!patched) console.log("   [!] Rebuild child-process-gone fatal pattern not found");
}

function patchRebuildBundledMarketplaceRoot(asarDir) {
  const buildDir = path.join(asarDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    console.log("   [!] build dir not found for bundled marketplace patch");
    return;
  }
  let patched = false;
  for (const entry of fs.readdirSync(buildDir)) {
    if (!/^main.*\.js$/.test(entry)) continue;
    const filePath = path.join(buildDir, entry);
    let text = fs.readFileSync(filePath, "utf-8");
    const original = "function Ri(t){return(0,i.join)(t.codexHome,`.tmp`,`bundled-marketplaces`,t.marketplaceName??e.Mn)}";
    const replacement = `function Ri(t){let n=(t.env??process.env).${REBUILD_BUNDLED_MARKETPLACE_ENV}?.trim();return n?(0,i.join)(n,t.marketplaceName??e.Mn):(0,i.join)(t.codexHome,\`.tmp\`,\`bundled-marketplaces\`,t.marketplaceName??e.Mn)}`;
    if (text.includes(replacement)) {
      patched = true;
      continue;
    }
    if (!text.includes(original)) continue;
    text = text.replace(original, replacement);
    fs.writeFileSync(filePath, text, "utf-8");
    patched = true;
    console.log(`   [identity] patched Rebuild bundled marketplace root in ${entry}`);
  }
  if (!patched) console.log("   [!] bundled marketplace root pattern not found");
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

function runPatchScript(scriptName, platform) {
  const scriptPath = path.join(__dirname, scriptName);
  execSync(`node "${scriptPath}" ${platform}`, { cwd: PROJECT_ROOT, stdio: "inherit" });
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
  const upstream = path.join(resourcesDir, platform === "win" ? "codex.exe" : "codex");
  if (fs.existsSync(upstream)) {
    const dest = path.join(resourcesDir, binName);
    fs.copyFileSync(upstream, dest);
    try { fs.chmodSync(dest, 0o755); } catch {}
    console.log(`   [codex] added ${binName} from upstream app CLI`);
    return;
  }

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
  const patchOnly = args.includes("--patch-only");

  if (!platform || !["mac-arm64", "mac-x64", "win"].includes(platform)) {
    console.error("[x] Usage: build-from-upstream.js --platform <mac-arm64|mac-x64|win>");
    process.exit(1);
  }

  console.log(`\n== Build from upstream: ${platform} ==\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (patchOnly) {
    const asarDir = path.join(SRC_DIR, platform, "_asar");
    if (!fs.existsSync(asarDir)) {
      console.error(`[x] ${platform}/_asar/ not found. Run sync-upstream first.`);
      process.exit(1);
    }
    patchRebuildAsarMetadata(asarDir);
    patchRebuildBootstrap(asarDir);
    patchRebuildAvatarAutoOpen(asarDir);
    patchRebuildAvatarDefaultSize(asarDir);
    patchRebuildAvatarAutoMove(asarDir);
    patchRebuildWindowsImmediateExit(asarDir);
    patchRebuildChildProcessGoneFatal(asarDir);
    patchRebuildBundledMarketplaceRoot(asarDir);
    return;
  }

  if (platform.startsWith("mac")) {
    buildMac(platform);
  } else {
    buildWin(platform);
  }
}

main();
