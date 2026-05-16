#!/usr/bin/env node
/**
 * Keep the Plugins experience visible in Rebuild after upstream feature-gate
 * churn. Official 26.513.3673.0 made the Plugins settings row depend on the
 * `apps` experimental feature being present and enabled. Rebuild vendors the
 * bundled plugins and should expose the plugin UI regardless of that remote
 * gate state.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function patchSource(source) {
  const replacements = [
    {
      name: "apps feature gate",
      original: "function Re(e){return e.name===`apps`&&e.enabled}",
      patched: "function Re(e){return e.name===`apps`?!0:e.name===`plugins`&&e.enabled}",
    },
    {
      name: "plugins feature lookup",
      original: "function Le(e){return e.name===`plugins`}",
      patched: "function Le(e){return e.name===`plugins`||e.name===`apps`}",
    },
  ];

  let next = source;
  const changes = [];
  const missing = [];

  for (const item of replacements) {
    if (next.includes(item.patched)) {
      changes.push(`${item.name} already patched`);
      continue;
    }
    if (!next.includes(item.original)) {
      missing.push(`${item.name} pattern not found`);
      continue;
    }
    next = next.replace(item.original, item.patched);
    changes.push(`${item.name} patched`);
  }

  if (missing.length > 0) {
    return { source: next, changed: next !== source, failed: true, reason: missing.join("; ") };
  }
  return { source: next, changed: next !== source, reason: changes.join("; ") };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({
    dir: "assets",
    pattern: /^agent-settings-.*\.js$/,
    platform,
  });

  if (targets.length === 0) {
    console.error("[x] agent settings bundle not found");
    process.exit(1);
  }

  let failures = 0;
  for (const target of targets) {
    const source = fs.readFileSync(target.path, "utf8");
    const result = patchSource(source);
    console.log(`-- ${relPath(target.path)}`);
    console.log(`   ${result.failed ? "[x]" : result.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} ${result.reason}`);
    if (result.failed) {
      failures += 1;
      continue;
    }
    if (result.changed && !isCheck) {
      fs.writeFileSync(target.path, result.source, "utf8");
      console.log("   [ok] plugins experience feature patched");
    }
  }

  if (failures > 0) process.exit(1);
}

main();
