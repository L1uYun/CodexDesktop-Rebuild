#!/usr/bin/env node
/**
 * Keep the Archived chats settings page useful when ChatGPT cloud task history
 * is unreachable.
 *
 * Upstream combines two sources on this page:
 * - cloud archived tasks from /wham/tasks/list?task_filter=archived
 * - local archived threads from the app-server list-archived-threads command
 *
 * Network failures from the cloud query currently mark the whole page as an
 * error, hiding the local archived_sessions data that Rebuild intentionally
 * shares through CODEX_HOME. For Rebuild, treat cloud archived task failures as
 * an empty cloud page so the existing local archived threads query can render.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function patchSource(source) {
  const original =
    "async function K(e){try{return await a.safeGet(`/wham/tasks/list`,{parameters:{query:{limit:20,cursor:e,task_filter:`archived`}}})}catch(e){if(e instanceof m&&(e.status===401||e.status===403||e.status===404))return{items:[],cursor:null};throw e}}";
  const replacement =
    "async function K(e){try{return await a.safeGet(`/wham/tasks/list`,{parameters:{query:{limit:20,cursor:e,task_filter:`archived`}}})}catch(e){return{items:[],cursor:null}}}";

  if (source.includes(replacement)) {
    return { source, changed: false, failed: false, reason: "archived chats local fallback already patched" };
  }
  if (!source.includes(original)) {
    return { source, changed: false, failed: true, reason: "archived cloud task query pattern not found" };
  }
  return {
    source: source.replace(original, replacement),
    changed: true,
    failed: false,
    reason: "enabled Rebuild archived chats local fallback",
  };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({ dir: "assets", pattern: /^data-controls-.*\.js$/, platform });
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
      console.log("   [ok] archived chats local fallback patched");
    }
  }

  if (targets.length === 0) {
    console.error("[x] data-controls webview bundle not found");
    failures += 1;
  }
  if (failures > 0) process.exit(1);
}

main();
