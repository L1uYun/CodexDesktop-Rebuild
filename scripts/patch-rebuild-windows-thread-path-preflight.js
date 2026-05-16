#!/usr/bin/env node
/**
 * Keep Rebuild's Windows thread paths aligned with the Codex CLI.
 *
 * The CLI may keep an active thread path as an extended-length Windows path
 * (`\\?\C:\...`). If the desktop app later asks to resume the same thread
 * using the normal `C:\...` spelling, the CLI rejects it as a stale path even
 * though both strings point to the same file. Rebuild shares the user's
 * CODEX_HOME with the official app, so normalize active local thread paths at
 * startup before automations try to resume them.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

const PREFLIGHT_MARKER = "CODEX_REBUILD_STATE_PATH_PREFLIGHT_DONE";

function runtimeSnippet() {
  return `if(!process.env.${PREFLIGHT_MARKER}){process.env.${PREFLIGHT_MARKER}=\`1\`;try{let e=require(\`node:fs\`),t=require(\`node:path\`),i=t.join(__codexRebuildHome,\`state_5.sqlite\`);if(e.existsSync(i)){let e=require(\`better-sqlite3\`),n=new e(i),a=s=>typeof s==\`string\`&&/^[A-Za-z]:\\\\/.test(s)&&!s.startsWith(\`\\\\\\\\?\\\\\`)?\`\\\\\\\\?\\\\\`+s:s,o=n.prepare(\`update threads set rollout_path = ? where id = ?\`),c=n.prepare(\`update threads set cwd = ? where id = ?\`),l=0;n.exec(\`CREATE TRIGGER IF NOT EXISTS codex_rebuild_threads_rollout_path_win_ext_ai AFTER INSERT ON threads WHEN length(NEW.rollout_path) > 3 AND substr(NEW.rollout_path,2,2) = ':\\\\' AND substr(NEW.rollout_path,1,4) != '\\\\\\\\?\\\\' BEGIN UPDATE threads SET rollout_path = '\\\\\\\\?\\\\' || NEW.rollout_path WHERE id = NEW.id; END;CREATE TRIGGER IF NOT EXISTS codex_rebuild_threads_rollout_path_win_ext_au AFTER UPDATE OF rollout_path ON threads WHEN length(NEW.rollout_path) > 3 AND substr(NEW.rollout_path,2,2) = ':\\\\' AND substr(NEW.rollout_path,1,4) != '\\\\\\\\?\\\\' BEGIN UPDATE threads SET rollout_path = '\\\\\\\\?\\\\' || NEW.rollout_path WHERE id = NEW.id; END;\`);n.transaction(()=>{for(let e of n.prepare(\`select id, rollout_path, cwd from threads where archived = 0\`).iterate()){let t=a(e.rollout_path);t!==e.rollout_path&&(o.run(t,e.id),l++);let n=a(e.cwd);n!==e.cwd&&(c.run(n,e.id),l++)}})();l>0&&console.log(\`[rebuild] normalized Windows thread paths: \${l}\`);n.close()}}catch(e){console.warn(\`[rebuild] Windows thread path preflight failed\`,e)}}`;
}

function patchSource(source) {
  if (source.includes(PREFLIGHT_MARKER)) {
    if (source.includes("codex_rebuild_threads_rollout_path_win_ext_ai")) {
      return { source, changed: false, reason: "already patched" };
    }
    const start = source.indexOf(`if(!process.env.${PREFLIGHT_MARKER}){`);
    const endMarker = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
    const end = source.indexOf(endMarker, start);
    if (start >= 0 && end > start) {
      return {
        source: `${source.slice(0, start)}${runtimeSnippet()}${source.slice(end)}`,
        changed: true,
        reason: "upgraded trigger preflight",
      };
    }
    return { source, changed: false, reason: "old preflight found but replacement point missing" };
  }
  const homeExpr = "process.env.CODEX_HOME||(process.env.CODEX_HOME=__codexRebuildHome);";
  if (!source.includes(homeExpr)) return { source, changed: false, reason: "CODEX_HOME insertion point missing" };
  return { source: source.replace(homeExpr, `${runtimeSnippet()}${homeExpr}`), changed: true, reason: "patched" };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({ dir: "build", pattern: /^bootstrap\.js$/, platform });
  let patched = 0;
  let seen = 0;

  for (const target of targets) {
    const source = fs.readFileSync(target.path, "utf8");
    if (!source.includes("codexrebuild.exe")) continue;
    seen += 1;
    const result = patchSource(source);
    console.log(`-- ${relPath(target.path)}`);
    console.log(`   ${result.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} ${result.reason}`);
    if (result.changed) {
      patched += 1;
      if (!isCheck) fs.writeFileSync(target.path, result.source, "utf8");
    }
  }

  if (seen === 0) {
    console.error("[x] Rebuild bootstrap not found");
    process.exit(1);
  }
}

main();
