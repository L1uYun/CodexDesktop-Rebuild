#!/usr/bin/env node
/**
 * Guard local thread analytics helpers against sparse or malformed turn items.
 *
 * Rebuild can render local archived sessions created by older or interrupted
 * app-server runs. Those sessions may hydrate a turn with a sparse `items`
 * array. Upstream analytics helpers assume every item is present and has a
 * `type`, which throws during local archived thread navigation before the
 * thread can render.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function patchSource(source) {
  const originalCombined =
    "function Xv(e){for(let t of e.items){if(t.type===`userMessage`)return t.id;if(t.type===`steeringUserMessage`)return t.restoreMessage.id}return null}function Zv(e){let t=null;for(let n of e.items)n.type===`agentMessage`&&(t=n.id);return t}function Qv(e){let t=new Set;for(let n of e.params.input)for(let e of ey(n))$v(t,e);for(let n of e.items)if(n.type===`commandExecution`)for(let e of n.commandActions??[])for(let n of ny(e))$v(t,n);return Array.from(t).sort()}";
  const replacementCombined =
    "function Xv(e){for(let t of e.items??[]){if(t?.type===`userMessage`)return t.id;if(t?.type===`steeringUserMessage`)return t.restoreMessage?.id??null}return null}function Zv(e){let t=null;for(let n of e.items??[])n?.type===`agentMessage`&&(t=n.id);return t}function Qv(e){let t=new Set;for(let n of e.params.input)for(let e of ey(n))$v(t,e);for(let n of e.items??[])if(n?.type===`commandExecution`)for(let e of n.commandActions??[])for(let n of ny(e))$v(t,n);return Array.from(t).sort()}";

  let patched = source;
  patched = patched.replace(originalCombined, replacementCombined);
  patched = patched
    .replaceAll("for(let t of e.items){if(t.type===`userMessage`)", "for(let t of e.items??[]){if(t?.type===`userMessage`)")
    .replaceAll("if(t.type===`steeringUserMessage`)return t.restoreMessage.id", "if(t?.type===`steeringUserMessage`)return t.restoreMessage?.id??null")
    .replaceAll("for(let n of e.items)n.type===`agentMessage`", "for(let n of e.items??[])n?.type===`agentMessage`")
    .replaceAll("for(let n of e.items)if(n.type===`commandExecution`)", "for(let n of e.items??[])if(n?.type===`commandExecution`)");

  const hasAnyGuard =
    patched.includes("e.items??[]") &&
    (patched.includes("?.type===`agentMessage`") || patched.includes("?.type===`commandExecution`") || patched.includes("?.type===`userMessage`"));
  if (patched === source && hasAnyGuard) {
    return { source, changed: false, failed: false, reason: "local thread item guards already patched" };
  }
  if (patched === source) {
    return { source, changed: false, failed: true, reason: "local thread analytics helper pattern not found" };
  }
  return {
    source: patched,
    changed: true,
    failed: false,
    reason: "added Rebuild local thread item guards",
  };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({ dir: "assets", pattern: /^app-server-manager-signals-.*\.js$/, platform });
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
      console.log("   [ok] local thread item guards patched");
    }
  }

  if (targets.length === 0) {
    console.error("[x] app-server-manager-signals webview bundle not found");
    failures += 1;
  }
  if (failures > 0) process.exit(1);
}

main();
