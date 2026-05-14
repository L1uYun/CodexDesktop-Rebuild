#!/usr/bin/env node
/**
 * Validate the browser-use trust bridge inputs without starting Codex Desktop.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { locateBundles, relPath, SRC_DIR } = require("./patch-util");

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function browserClientPaths(platform) {
  const pluginRoot = path.join(SRC_DIR, platform, "plugins", "openai-bundled", "plugins");
  return [
    path.join(pluginRoot, "chrome", "scripts", "browser-client.mjs"),
    path.join(pluginRoot, "browser-use", "scripts", "browser-client.mjs"),
  ];
}

function extractAllowlist(source) {
  const match = source.match(/var et=\[([^\]]*)\]/);
  if (!match) return null;
  return Array.from(match[1].matchAll(/[a-fA-F0-9]{64}/g), (item) => item[0].toLowerCase());
}

function main() {
  const platform = process.argv.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) ?? "win";
  const [target] = locateBundles({ dir: "build", pattern: /^main.*\.js$/, platform });
  if (!target) throw new Error(`No main bundle found for ${platform}`);

  const source = fs.readFileSync(target.path, "utf8");
  const allowlist = extractAllowlist(source);
  if (!allowlist) throw new Error(`Browser-client hash allowlist not found in ${relPath(target.path)}`);
  if (source.includes("NODE_REPL_TRUSTED_CODE_PATHS")) {
    throw new Error(`Dangerous NODE_REPL_TRUSTED_CODE_PATHS is still present in ${relPath(target.path)}`);
  }

  const missing = [];
  for (const clientPath of browserClientPaths(platform)) {
    if (!fs.existsSync(clientPath)) {
      missing.push(clientPath);
      continue;
    }
    const digest = hashFile(clientPath);
    const ok = allowlist.includes(digest);
    console.log(`${ok ? "[ok]" : "[x]"} ${digest} ${relPath(clientPath)}`);
    if (!ok) throw new Error(`browser-client hash is not trusted: ${relPath(clientPath)}`);
  }
  if (missing.length > 0) {
    throw new Error(`Missing browser-client files:\n${missing.map(relPath).join("\n")}`);
  }

  console.log(`[ok] ${relPath(target.path)} trusts bundled browser-client hashes`);
}

main();
