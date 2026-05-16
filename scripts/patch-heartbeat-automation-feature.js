#!/usr/bin/env node
/**
 * Enable heartbeat automations for the Windows Rebuild app.
 *
 * Upstream keeps conversation heartbeat automations behind Statsig gate
 * 1488233300. When the gate is false the renderer does not publish the global
 * heartbeat-enabled state or per-thread renderer state, so manual automation
 * runs still work while scheduled heartbeat runs never become eligible.
 *
 * Rebuild packages a fixed product surface and cannot rely on upstream Statsig
 * rollout state, so this patch forces only that specific gate to true inside
 * the webview bundle.
 */
const fs = require("fs");
const path = require("path");
const { locateBundles, relPath } = require("./patch-util");

const HEARTBEAT_GATE_ID = "1488233300";

function patchSource(source) {
  const gateCall = new RegExp(String.raw`\b[A-Za-z_$][\w$]*\(\`${HEARTBEAT_GATE_ID}\`\)`, "g");
  let count = 0;
  const next = source.replace(gateCall, () => {
    count += 1;
    return "!0";
  });
  return { source: next, changed: next !== source, count };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({ dir: "assets", pattern: /\.js$/, platform });
  let patchedCalls = 0;
  let sawHeartbeatAutomationCode = false;

  for (const target of targets) {
    const source = fs.readFileSync(target.path, "utf8");
    if (
      source.includes("heartbeat-automations-enabled-changed") ||
      source.includes("heartbeat-automation-thread-state-changed")
    ) {
      sawHeartbeatAutomationCode = true;
    }
    if (!source.includes(HEARTBEAT_GATE_ID)) continue;

    const result = patchSource(source);
    patchedCalls += result.count;
    console.log(`-- ${relPath(target.path)}`);
    console.log(`   ${result.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} heartbeat automation gate calls: ${result.count}`);

    if (result.changed && !isCheck) {
      fs.writeFileSync(target.path, result.source, "utf8");
      console.log("   [ok] heartbeat automation feature patched");
    }
  }

  if (patchedCalls === 0) {
    if (sawHeartbeatAutomationCode) {
      console.log(`[ok] heartbeat automation gate ${HEARTBEAT_GATE_ID} already patched`);
      return;
    }
    console.error(`[x] heartbeat automation gate ${HEARTBEAT_GATE_ID} not found`);
    process.exit(1);
  }
}

main();
