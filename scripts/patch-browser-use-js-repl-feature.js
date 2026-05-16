#!/usr/bin/env node
/**
 * Enable the JS REPL tool flag for Rebuild browser-use threads.
 *
 * The browser-use MCP server config can be generated while the merged thread
 * config still carries "features.js_repl": false. In that state the model sees
 * the browser skills, but the callable node_repl/js tool is not exposed. Keep
 * the upstream default untouched unless the Windows Rebuild availability patch
 * is present in the same bundle.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

const AVAILABILITY_PATCH_MARKER =
  "process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)&&(t={...t,externalBrowserUse:!0,externalBrowserUseAllowed:!0})";
const ORIGINAL = 'Bt={"features.js_repl":!1}';
const REPLACEMENT = 'Bt={"features.js_repl":!0}';
const ORIGINAL_V2 = 'Yt={"features.js_repl":!1}';
const REPLACEMENT_V2 = 'Yt={"features.js_repl":!0}';

function patchSource(source) {
  if (!source.includes(AVAILABILITY_PATCH_MARKER)) {
    return {
      source,
      changed: false,
      failed: true,
      reason: "Rebuild browser-use availability patch marker not found",
    };
  }
  if (source.includes(REPLACEMENT) || source.includes(REPLACEMENT_V2)) {
    return { source, changed: false, reason: "already patched" };
  }
  if (source.includes(ORIGINAL)) {
    return {
      source: source.replace(ORIGINAL, REPLACEMENT),
      changed: true,
      reason: "enabled Rebuild browser-use js_repl tool flag",
    };
  }
  if (source.includes(ORIGINAL_V2)) {
    return {
      source: source.replace(ORIGINAL_V2, REPLACEMENT_V2),
      changed: true,
      reason: "enabled Rebuild browser-use js_repl tool flag",
    };
  }
  {
    return {
      source,
      changed: false,
      failed: true,
      reason: "browser-use js_repl feature pattern not found",
    };
  }
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({ dir: "build", pattern: /^main.*\.js$/, platform });
  let failures = 0;

  for (const target of targets) {
    const source = fs.readFileSync(target.path, "utf8");
    const result = patchSource(source);
    console.log(`-- ${relPath(target.path)}`);
    console.log(
      `   ${result.failed ? "[x]" : result.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} ${result.reason}`,
    );
    if (result.failed) {
      failures += 1;
      continue;
    }
    if (result.changed && !isCheck) {
      fs.writeFileSync(target.path, result.source, "utf8");
      console.log("   [ok] browser-use js_repl feature patched");
    }
  }

  if (failures > 0) process.exit(1);
}

main();
