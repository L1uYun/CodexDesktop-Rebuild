#!/usr/bin/env node
/**
 * Install the patched Windows ASAR into an existing Codex Rebuild directory.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_INSTALL_DIR = "D:\\software\\CodexRebuild";
const ASAR_SRC_DIR = path.join(PROJECT_ROOT, "src", "win", "_asar");

function computeAsarHeaderHash(asarPath) {
  const crypto = require("crypto");
  const buf = fs.readFileSync(asarPath);
  const headerSize = buf.readUInt32LE(12);
  const header = buf.slice(16, 16 + headerSize);
  return crypto.createHash("sha256").update(header).digest("hex");
}

function patchExeHash(exePath, oldHash, newHash) {
  if (!fs.existsSync(exePath)) return "missing";
  const buf = fs.readFileSync(exePath);
  const oldBuf = Buffer.from(oldHash, "ascii");
  const idx = buf.indexOf(oldBuf);
  if (idx < 0) return "old hash not found";
  Buffer.from(newHash, "ascii").copy(buf, idx);
  fs.writeFileSync(exePath, buf);
  return `patched at ${idx}`;
}

function main() {
  const installDir = process.argv[2] || DEFAULT_INSTALL_DIR;
  const resourcesDir = path.join(installDir, "resources");
  const asarPath = path.join(resourcesDir, "app.asar");

  if (!fs.existsSync(ASAR_SRC_DIR)) throw new Error(`Missing ASAR source: ${ASAR_SRC_DIR}`);
  if (!fs.existsSync(asarPath)) throw new Error(`Missing installed app.asar: ${asarPath}`);

  const oldHash = computeAsarHeaderHash(asarPath);
  console.log(`[old] ${oldHash}`);

  execFileSync("npx", ["asar", "pack", ASAR_SRC_DIR, asarPath], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const newHash = computeAsarHeaderHash(asarPath);
  console.log(`[new] ${newHash}`);

  if (oldHash !== newHash) {
    for (const exeName of ["Codex.exe", "CodexRebuild.exe"]) {
      const result = patchExeHash(path.join(installDir, exeName), oldHash, newHash);
      console.log(`[exe] ${exeName}: ${result}`);
    }
  }
}

main();
