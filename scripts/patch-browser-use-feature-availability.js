#!/usr/bin/env node
/**
 * Enable Chrome browser-use backend wiring for the Windows Rebuild app.
 *
 * The renderer can mention the Chrome plugin while desktop feature availability
 * still reports browser-use as unavailable. In that state the main process does
 * not generate the node_repl MCP server config, so @chrome never becomes a
 * callable tool. The bundled marketplace reconciler can also omit the Chrome
 * plugin from the runtime marketplace, so the session has no plugin MCP entry
 * to install. The native-pipe bridge is also keyed only from inAppBrowserUse
 * upstream, while Chrome uses externalBrowserUse. Rebuild keeps the upstream
 * gate for official Codex.exe and only forces Chrome browser-use when running
 * as CodexRebuild.exe on Windows.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function patchSource(source) {
  const reconcileOriginal = "function ea(t){let n=t.env??process.env,r=t.resourcesPath??Zi({env:n}),i=e.bn(t.buildFlavor),a=t.runtimeMarketplaceRoot??Qi({codexHome:t.codexHome,marketplaceName:i}),o=$i({env:n}),s=t.platform??process.platform,c=null,l=null,u=Promise.resolve(),d=e=>ti.filter(r=>r.isAvailable({buildFlavor:t.buildFlavor,env:n,features:e,platform:s})),f=()=>{if(c==null)return u;let e=d(c),t=e.map(e=>e.name),n=JSON.stringify({marketplacePluginNames:t});";
  const reconcileReplacement = "function ea(t){let n=t.env??process.env,r=t.resourcesPath??Zi({env:n}),i=e.bn(t.buildFlavor),a=t.runtimeMarketplaceRoot??Qi({codexHome:t.codexHome,marketplaceName:i}),o=$i({env:n}),s=t.platform??process.platform,c=null,l=null,u=Promise.resolve(),d=e=>(s===`win32`&&process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)&&(e={...e,externalBrowserUse:!0,externalBrowserUseAllowed:!0}),ti.filter(r=>r.isAvailable({buildFlavor:t.buildFlavor,env:n,features:e,platform:s}))),f=()=>{if(c==null)return u;let e=d(c),t=e.map(e=>e.name),n=JSON.stringify({marketplacePluginNames:t});";
  const availabilityOriginal = "async function Ht({appServerConnection:e,desktopFeatureAvailability:t,hostConfig:n,isPackaged:r,repoRoot:i,resourcesPath:a,resolveCodexPath:o,resolveNodePath:s,resolveNodeReplPath:c,resolvePrimaryRuntimeNodePath:l,shouldUseWslPaths:u,platform:d,trustedBrowserClientSha256s:f=et}){let p=t.inAppBrowserUse||t.externalBrowserUse,m=t.computerUse&&t.computerUseNodeRepl,h=Jt(t);if(!p&&!m)return null;";
  const availabilityReplacement = "async function Ht({appServerConnection:e,desktopFeatureAvailability:t,hostConfig:n,isPackaged:r,repoRoot:i,resourcesPath:a,resolveCodexPath:o,resolveNodePath:s,resolveNodeReplPath:c,resolvePrimaryRuntimeNodePath:l,shouldUseWslPaths:u,platform:d,trustedBrowserClientSha256s:f=et}){d===`win32`&&process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)&&(t={...t,externalBrowserUse:!0,externalBrowserUseAllowed:!0});let p=t.inAppBrowserUse||t.externalBrowserUse,m=t.computerUse&&t.computerUseNodeRepl,h=Jt(t);if(!p&&!m)return null;";
  const availabilityOriginalV2 = "async function Zt({appServerConnection:e,desktopFeatureAvailability:t,hostConfig:n,isPackaged:r,repoRoot:i,resourcesPath:a,resolveCodexPath:o,resolveNodePath:s,resolveNodeReplPath:c,resolvePrimaryRuntimeNodePath:l,shouldUseWslPaths:u,platform:d,trustedBrowserClientSha256s:f=nt}){let p=t.inAppBrowserUse||t.externalBrowserUse,m=t.computerUse&&t.computerUseNodeRepl,h=rn(t);if(!p&&!m)return null;";
  const availabilityReplacementV2 = "async function Zt({appServerConnection:e,desktopFeatureAvailability:t,hostConfig:n,isPackaged:r,repoRoot:i,resourcesPath:a,resolveCodexPath:o,resolveNodePath:s,resolveNodeReplPath:c,resolvePrimaryRuntimeNodePath:l,shouldUseWslPaths:u,platform:d,trustedBrowserClientSha256s:f=nt}){d===`win32`&&process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)&&(t={...t,externalBrowserUse:!0,externalBrowserUseAllowed:!0});let p=t.inAppBrowserUse||t.externalBrowserUse,m=t.computerUse&&t.computerUseNodeRepl,h=rn(t);if(!p&&!m)return null;";
  const pipeOriginal = "function $e({setBrowserUseNativePipeEnabled:e}){return{setDesktopFeatureAvailability:t=>{t.inAppBrowserUse!=null&&e(t.inAppBrowserUse)},dispose:()=>{e(!1)}}}";
  const pipeReplacement = "function $e({setBrowserUseNativePipeEnabled:e}){return{setDesktopFeatureAvailability:t=>{(t.inAppBrowserUse!=null||t.externalBrowserUse!=null)&&e(t.inAppBrowserUse||t.externalBrowserUse)},dispose:()=>{e(!1)}}}";
  const pipeOriginalV2 = "function tt({setBrowserUseNativePipeEnabled:e}){return{setDesktopFeatureAvailability:t=>{t.inAppBrowserUse!=null&&e(t.inAppBrowserUse)},dispose:()=>{e(!1)}}}";
  const pipeReplacementV2 = "function tt({setBrowserUseNativePipeEnabled:e}){return{setDesktopFeatureAvailability:t=>{(t.inAppBrowserUse!=null||t.externalBrowserUse!=null)&&e(t.inAppBrowserUse||t.externalBrowserUse)},dispose:()=>{e(!1)}}}";
  const chromeForceReloadOriginal = "{forceReload:!0,name:dt,isAvailable:({buildFlavor:e,features:t})=>t.externalBrowserUseAllowed&&sr(e)}";
  const chromeForceReloadReplacement = "{forceReload:!(process.platform===`win32`&&process.execPath.toLowerCase().endsWith(`codexrebuild.exe`)),name:dt,isAvailable:({buildFlavor:e,features:t})=>t.externalBrowserUseAllowed&&sr(e)}";

  let next = source;
  const changes = [];
  const missing = [];

  if (next.includes(reconcileReplacement)) {
    changes.push("bundled marketplace reconcile already patched");
  } else if (next.includes(reconcileOriginal)) {
    next = next.replace(reconcileOriginal, reconcileReplacement);
    changes.push("forced Rebuild Chrome bundled marketplace reconcile");
  } else {
    missing.push("bundled marketplace reconcile pattern not found");
  }

  if (next.includes(availabilityReplacement)) {
    changes.push("availability already patched");
  } else if (next.includes(availabilityOriginal)) {
    next = next.replace(availabilityOriginal, availabilityReplacement);
    changes.push("forced Rebuild Chrome browser-use availability");
  } else if (next.includes(availabilityReplacementV2)) {
    changes.push("availability already patched");
  } else if (next.includes(availabilityOriginalV2)) {
    next = next.replace(availabilityOriginalV2, availabilityReplacementV2);
    changes.push("forced Rebuild Chrome browser-use availability");
  } else {
    missing.push("browser-use feature availability pattern not found");
  }

  if (next.includes(pipeReplacement)) {
    changes.push("native pipe already patched");
  } else if (next.includes(pipeOriginal)) {
    next = next.replace(pipeOriginal, pipeReplacement);
    changes.push("enabled native pipe for external browser-use");
  } else if (next.includes(pipeReplacementV2)) {
    changes.push("native pipe already patched");
  } else if (next.includes(pipeOriginalV2)) {
    next = next.replace(pipeOriginalV2, pipeReplacementV2);
    changes.push("enabled native pipe for external browser-use");
  } else {
    missing.push("browser-use native pipe pattern not found");
  }

  if (next.includes(chromeForceReloadReplacement)) {
    changes.push("Chrome force reload already patched");
  } else if (next.includes(chromeForceReloadOriginal)) {
    next = next.replace(chromeForceReloadOriginal, chromeForceReloadReplacement);
    changes.push("disabled Rebuild Chrome forced reload on Windows");
  } else {
    missing.push("Chrome force reload pattern not found");
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
