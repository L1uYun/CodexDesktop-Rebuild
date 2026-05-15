#!/usr/bin/env node
/**
 * Enable Chrome browser-use backend wiring for the Windows Rebuild app.
 *
 * The renderer can mention the Chrome plugin while desktop feature availability
 * still reports browser-use as unavailable. In that state the main process does
 * not generate the node_repl MCP server config, so @chrome never becomes a
 * callable tool. Rebuild keeps the upstream gate for official Codex.exe and
 * only forces Chrome browser-use when running as CodexRebuild.exe on Windows.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function patchSource(source) {
  const original = "async function Ht({appServerConnection:e,desktopFeatureAvailability:t,hostConfig:n,isPackaged:r,repoRoot:i,resourcesPath:a,resolveCodexPath:o,resolveNodePath:s,resolveNodeReplPath:c,resolvePrimaryRuntimeNodePath:l,shouldUseWslPaths:u,platform:d,trustedBrowserClientSha256s:f=et}){let p=t.inAppBrowserUse||t.externalBrowserUse,m=t.computerUse&&t.computerUseNodeRepl,h=Jt(t);if(!p&&!m)return null;";
  const replacement = "async function Ht({appServerConnection:e,desktopFeatureAvailability:t,hostConfig:n,isPackaged:r,repoRoot:i,resourcesPath:a,resolveCodexPath:o,resolveNodePath:s,resolveNodeReplPath:c,resolvePrimaryRuntimeNodePath:l,shouldUseWslPaths:u,platform:d,trustedBrowserClientSha256s:f=et}){d===`win32`&&process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)&&(t={...t,externalBrowserUse:!0,externalBrowserUseAllowed:!0});let p=t.inAppBrowserUse||t.externalBrowserUse,m=t.computerUse&&t.computerUseNodeRepl,h=Jt(t);if(!p&&!m)return null;";
  if (source.includes(replacement)) return { source, changed: false, reason: "already patched" };
  if (!source.includes(original)) return { source, changed: false, failed: true, reason: "browser-use feature availability pattern not found" };
  return { source: source.replace(original, replacement), changed: true, reason: "forced Rebuild Chrome browser-use availability" };
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
    console.log(`   ${result.failed ? "[x]" : result.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} ${result.reason}`);
    if (result.failed) {
      failures += 1;
      continue;
    }
    if (result.changed && !isCheck) {
      fs.writeFileSync(target.path, result.source, "utf8");
      console.log("   [ok] browser-use feature availability patched");
    }
  }

  if (failures > 0) process.exit(1);
}

main();
