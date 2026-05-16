#!/usr/bin/env node
/**
 * Enable automations for the Windows Rebuild app.
 *
 * Upstream keeps parts of automations behind Statsig gates:
 * - 1488233300: heartbeat automations
 * - 3075919032: sidebar Automations nav item
 *
 * When the heartbeat gate is false the renderer does not publish the global
 * heartbeat-enabled state or per-thread renderer state, so manual automation
 * runs still work while scheduled heartbeat runs never become eligible. When
 * the sidebar gate is false the /automations route still exists, but the
 * Automations entry does not appear in the desktop sidebar.
 *
 * Rebuild packages a fixed product surface and cannot rely on upstream Statsig
 * rollout state, so this patch forces only those specific gates to true inside
 * the webview bundle while preserving the original hook call order.
 */
const fs = require("fs");
const path = require("path");
const { locateBundles, relPath } = require("./patch-util");

const AUTOMATION_GATES = [
  { id: "1488233300", label: "heartbeat automation" },
  { id: "3075919032", label: "automation sidebar nav" },
];

function patchGate(source, gate) {
  const patchedGateAssignment = new RegExp(
    String.raw`\b[A-Za-z_$][\w$]*=\([A-Za-z_$][\w$]*\(\`${gate.id}\`\),!0\)`,
    "g",
  );
  const gateAssignment = new RegExp(
    String.raw`\b([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(\`${gate.id}\`\)`,
    "g",
  );
  let count = 0;
  let alreadyPatched = 0;
  source.replace(patchedGateAssignment, () => {
    alreadyPatched += 1;
    return "";
  });
  const next = source.replace(gateAssignment, (_, localName, hookName) => {
    count += 1;
    return `${localName}=(${hookName}(\`${gate.id}\`),!0)`;
  });
  return { source: next, changed: next !== source, count, alreadyPatched, gate };
}

function patchSource(source) {
  const results = [];
  let next = source;
  for (const gate of AUTOMATION_GATES) {
    const result = patchGate(next, gate);
    next = result.source;
    results.push(result);
  }
  return { source: next, changed: next !== source, results };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win"].includes(arg)) || "win";
  const targets = locateBundles({ dir: "assets", pattern: /\.js$/, platform });
  const patchedCalls = new Map(AUTOMATION_GATES.map((gate) => [gate.id, 0]));
  const alreadyPatchedCalls = new Map(AUTOMATION_GATES.map((gate) => [gate.id, 0]));
  let sawHeartbeatAutomationCode = false;
  let sawSidebarAutomationNavCode = false;

  for (const target of targets) {
    const source = fs.readFileSync(target.path, "utf8");
    if (
      source.includes("heartbeat-automations-enabled-changed") ||
      source.includes("heartbeat-automation-thread-state-changed")
    ) {
      sawHeartbeatAutomationCode = true;
    }
    if (
      source.includes("sidebarElectron.inboxRouteNavLink") ||
      source.includes("metadata:{item:`automations`}")
    ) {
      sawSidebarAutomationNavCode = true;
    }
    if (!AUTOMATION_GATES.some((gate) => source.includes(gate.id))) continue;

    const result = patchSource(source);
    console.log(`-- ${relPath(target.path)}`);
    for (const gateResult of result.results) {
      patchedCalls.set(gateResult.gate.id, patchedCalls.get(gateResult.gate.id) + gateResult.count);
      alreadyPatchedCalls.set(
        gateResult.gate.id,
        alreadyPatchedCalls.get(gateResult.gate.id) + gateResult.alreadyPatched,
      );
      if (gateResult.count === 0 && gateResult.alreadyPatched === 0) continue;
      console.log(
        `   ${gateResult.changed ? (isCheck ? "[?]" : "[*]") : "[ok]"} ${gateResult.gate.label} gate calls: ${gateResult.count}`,
      );
      if (gateResult.alreadyPatched > 0) {
        console.log(`   [ok] preserved hook gate assignments already patched: ${gateResult.alreadyPatched}`);
      }
    }

    if (result.changed && !isCheck) {
      fs.writeFileSync(target.path, result.source, "utf8");
      console.log("   [ok] automation feature gates patched");
    }
  }

  const missing = [];
  for (const gate of AUTOMATION_GATES) {
    if (patchedCalls.get(gate.id) > 0 || alreadyPatchedCalls.get(gate.id) > 0) continue;
    if (gate.id === "1488233300" && sawHeartbeatAutomationCode) continue;
    if (gate.id === "3075919032" && sawSidebarAutomationNavCode) continue;
    missing.push(gate);
  }
  if (missing.length > 0) {
    for (const gate of missing) {
      console.error(`[x] ${gate.label} gate ${gate.id} not found`);
    }
    process.exit(1);
  }

  for (const gate of AUTOMATION_GATES) {
    if (patchedCalls.get(gate.id) === 0 && alreadyPatchedCalls.get(gate.id) > 0) {
      console.log(`[ok] ${gate.label} gate ${gate.id} already patched`);
    }
  }
}

main();
