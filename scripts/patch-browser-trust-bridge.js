#!/usr/bin/env node
/**
 * Post-build patch: keep browser-use native-pipe trust on the narrow upstream
 * hash allowlist.
 *
 * node_repl injects import.meta.__codexNativePipe into imported modules whose
 * source hash is listed in NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S. Include
 * both the packaged Rebuild copy and the user's openai-bundled cache copy:
 * plugin skills may import either one. Do not use NODE_REPL_TRUSTED_CODE_PATHS
 * for the bundled Chrome plugin: trusting the full plugin directory makes
 * Codex Rebuild hang during startup on Windows.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { homedir } = require("os");
const { locateBundles, relPath, SRC_DIR } = require("./patch-util");

const DANGEROUS_TRUSTED_PATH_EXPRS = [
  "NODE_REPL_TRUSTED_CODE_PATHS:p+(o.platform===`win32`?`\\\\plugins\\\\cache\\\\openai-bundled\\\\chrome`:`/plugins/cache/openai-bundled/chrome`)",
  "NODE_REPL_TRUSTED_CODE_PATHS:i.default.join(p,`plugins`,`cache`,`openai-bundled`,`chrome`)",
];

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findBrowserClientHashes(platform) {
  const pluginRoots = [
    path.join(SRC_DIR, platform, "plugins", "openai-bundled", "plugins"),
    path.join(
      process.env.APPDATA || path.join(homedir(), "AppData", "Roaming"),
      "CodexRebuild",
      "bundled-marketplaces",
      "openai-bundled",
      "plugins",
    ),
    path.join(homedir(), ".codex", "plugins", "cache", "openai-bundled"),
  ];
  const candidates = pluginRoots.flatMap((pluginRoot) => [
    path.join(pluginRoot, "chrome", "scripts", "browser-client.mjs"),
    path.join(pluginRoot, "chrome", "0.1.7", "scripts", "browser-client.mjs"),
    path.join(pluginRoot, "browser-use", "scripts", "browser-client.mjs"),
    path.join(pluginRoot, "browser-use", "0.1.0-alpha2", "scripts", "browser-client.mjs"),
  ]);
  const hashes = candidates.filter((file) => fs.existsSync(file)).map(hashFile);
  return [...new Set(hashes)].sort();
}

function patchSource(source, hashes) {
  let next = source;
  const changes = [];

  for (const expr of DANGEROUS_TRUSTED_PATH_EXPRS) {
    if (next.includes(`,${expr}`)) {
      next = next.replace(`,${expr}`, "");
      changes.push("removed trusted code path env");
    }
  }

  if (hashes.length === 0) {
    return { changed: next !== source, source: next, reason: changes.join("; ") || "no bundled browser-client found" };
  }

  const allowlistPattern = /var et=\[[^\]]*\]/;
  const replacement = `var et=[${hashes.map((hash) => `\`${hash}\``).join(",")}]`;
  const current = next.match(allowlistPattern)?.[0];
  if (current != null) {
    if (current !== replacement) {
      next = next.replace(allowlistPattern, replacement);
      changes.push("updated browser-client hash allowlist");
    }
  } else {
    return { changed: next !== source, source: next, reason: changes.join("; ") || "browser-client hash allowlist not found", failed: true };
  }

  return {
    changed: next !== source,
    source: next,
    reason: changes.join("; ") || "browser-client hash allowlist already current",
  };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg));
  const targets = locateBundles({ dir: "build", pattern: /^main.*\.js$/, platform });

  if (targets.length === 0) {
    console.log("[ok] No main bundles found");
    return;
  }

  let failures = 0;
  for (const target of targets) {
    console.log(`\n-- [${target.platform}] ${relPath(target.path)}`);
    const hashes = findBrowserClientHashes(target.platform);
    if (hashes.length === 0) {
      console.log("   [x] bundled browser-client.mjs not found");
      failures += 1;
      continue;
    }
    console.log(`   [hash] ${hashes.join(",")}`);

    const source = fs.readFileSync(target.path, "utf8");
    const result = patchSource(source, hashes);
    if (result.failed) failures += 1;

    if (!result.changed) {
      console.log(`   [ok] ${result.reason}`);
      continue;
    }

    console.log(`   ${isCheck ? "[?]" : "[*]"} ${result.reason}`);
    if (!isCheck) {
      fs.writeFileSync(target.path, result.source, "utf8");
      console.log("   [ok] browser trust bridge patched");
    }
  }

  if (failures > 0) process.exit(1);
}

main();
