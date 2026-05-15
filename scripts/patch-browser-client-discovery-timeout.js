#!/usr/bin/env node
/**
 * Patch bundled browser-client discovery so one stale browser-use named pipe
 * cannot block the entire Chrome/browser backend bootstrap.
 */
const fs = require("fs");
const path = require("path");
const { SRC_DIR, relPath } = require("./patch-util");

const INFO_TIMEOUT_MS = 3000;

function browserClientPathsForPluginRoot(pluginRoot) {
  return [
    path.join(pluginRoot, "chrome", "scripts", "browser-client.mjs"),
    path.join(pluginRoot, "browser-use", "scripts", "browser-client.mjs"),
  ];
}

function patchSource(source) {
  const original = "async function _O(t,e){let r=null,n=\"pipe-connect\";try{let o=await kc.create(t);r=e(o),n=\"backend-info-request\";let i=await r.getInfo(),s=await LS(i).catch(a=>(ee(a),i));return{browser:{id:crypto.randomUUID().substring(8),api:r,info:xO(s)}}}catch(o){return await r?.close(),ee(o),{failure:`${n}/${jS(o)}`}}}";
  const replacement = "async function _O(t,e){let r=null,n=\"pipe-connect\";try{let o=await kc.create(t);r=e(o),n=\"backend-info-request\";let i=await Promise.race([r.getInfo(),new Promise((s,a)=>setTimeout(()=>a(new Error(`browser backend info request timed out after ${Number(globalThis.nodeRepl?.requestMeta?.[\"x-codex-browser-use-info-timeout-ms\"]??process.env.CODEX_BROWSER_USE_INFO_TIMEOUT_MS??" + INFO_TIMEOUT_MS + ")}ms`)),Number(globalThis.nodeRepl?.requestMeta?.[\"x-codex-browser-use-info-timeout-ms\"]??process.env.CODEX_BROWSER_USE_INFO_TIMEOUT_MS??" + INFO_TIMEOUT_MS + ")))]),s=await LS(i).catch(a=>(ee(a),i));return{browser:{id:crypto.randomUUID().substring(8),api:r,info:xO(s)}}}catch(o){return await r?.close(),ee(o),{failure:`${n}/${jS(o)}`}}}";
  if (source.includes(replacement)) return { source, changed: false, reason: "already patched" };
  if (!source.includes(original)) return { source, changed: false, failed: true, reason: "browser discovery function pattern not found" };
  return { source: source.replace(original, replacement), changed: true, reason: "added backend info timeout" };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const rootIdx = args.indexOf("--plugin-root");
  const pluginRoots = [];
  if (rootIdx !== -1) {
    const root = args[rootIdx + 1];
    if (!root) throw new Error("--plugin-root requires a path");
    pluginRoots.push(root);
  } else {
    pluginRoots.push(path.join(SRC_DIR, platform, "plugins", "openai-bundled", "plugins"));
  }
  let failures = 0;

  for (const pluginRoot of pluginRoots) {
    for (const filePath of browserClientPathsForPluginRoot(pluginRoot)) {
      if (!fs.existsSync(filePath)) continue;
      const source = fs.readFileSync(filePath, "utf8");
      const result = patchSource(source);
      console.log(`-- ${path.isAbsolute(filePath) ? filePath : relPath(filePath)}`);
      console.log(`   ${result.failed ? "[x]" : result.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} ${result.reason}`);
      if (result.failed) {
        failures += 1;
        continue;
      }
      if (result.changed && !isCheck) {
        fs.writeFileSync(filePath, result.source, "utf8");
        console.log("   [ok] browser-client discovery patched");
      }
    }
  }

  if (failures > 0) process.exit(1);
}

main();
