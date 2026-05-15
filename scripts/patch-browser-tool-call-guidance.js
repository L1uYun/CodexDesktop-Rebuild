#!/usr/bin/env node
/**
 * Patch bundled browser skills so Rebuild does not prompt the model to call
 * flattened MCP tool names such as mcp__node_repl__js.
 *
 * Some providers emit that flattened name as a custom tool call, while the
 * Rebuild router expects the structured MCP shape (server node_repl, tool js).
 * The app-server then rejects it as "unsupported call: mcp__node_repl__js".
 */
const fs = require("fs");
const path = require("path");
const { homedir } = require("os");
const { PROJECT_ROOT, SRC_DIR, relPath } = require("./patch-util");

const DEFAULT_PLUGIN_ROOTS = [
  path.join(SRC_DIR, "win", "plugins", "openai-bundled", "plugins"),
  path.join(
    process.env.APPDATA || path.join(homedir(), "AppData", "Roaming"),
    "CodexRebuild",
    "bundled-marketplaces",
    "openai-bundled",
    "plugins",
  ),
  path.join(homedir(), ".codex", "plugins", "cache", "openai-bundled"),
];

const REPLACEMENTS = [
  [
    "Run browser setup code through the Node REPL `js` tool. In this environment the callable tool id typically appears as `mcp__node_repl__js`; `js_reset` only clears state and is not the execution tool.",
    "Run browser setup code through the Node REPL `js` tool. Use the structured MCP tool named `js` from the `node_repl` server; `js_reset` only clears state and is not the execution tool.",
  ],
  [
    "Use tool discovery for `node_repl js`, then `mcp__node_repl__js`, then `js`, then `node_repl js JavaScript execution`; run the bootstrap cell with the Node REPL `js` tool once it is exposed.",
    "Use tool discovery for `node_repl js`, then `js`, then `node_repl js JavaScript execution`; run the bootstrap cell with the Node REPL `js` tool once it is exposed.",
  ],
  [
    "Only the Node REPL `js` tool (`mcp__node_repl__js`) can be used to control the Chrome extension.",
    "Only the Node REPL `js` tool from the `node_repl` MCP server can be used to control the Chrome extension.",
  ],
  [
    "Only the Node REPL `js` tool (`mcp__node_repl__js`) can be used to control the in-app browser.",
    "Only the Node REPL `js` tool from the `node_repl` MCP server can be used to control the in-app browser.",
  ],
];

function parseArgs() {
  const args = process.argv.slice(2);
  const roots = [];
  let isCheck = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--check") {
      isCheck = true;
    } else if (arg === "--plugin-root") {
      const root = args[i + 1];
      if (!root) throw new Error("--plugin-root requires a path");
      roots.push(root);
      i += 1;
    }
  }
  return { isCheck, roots: roots.length > 0 ? roots : DEFAULT_PLUGIN_ROOTS };
}

function skillFiles(pluginRoot) {
  return [
    path.join(pluginRoot, "chrome", "skills", "chrome", "SKILL.md"),
    path.join(pluginRoot, "chrome", "0.1.7", "skills", "chrome", "SKILL.md"),
    path.join(pluginRoot, "browser-use", "skills", "browser", "SKILL.md"),
    path.join(pluginRoot, "browser-use", "0.1.0-alpha2", "skills", "browser", "SKILL.md"),
  ];
}

function patchSkill(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let next = original;
  const applied = [];

  for (const [from, to] of REPLACEMENTS) {
    if (next.includes(from)) {
      next = next.replaceAll(from, to);
      applied.push(from);
    }
  }

  return { source: next, changed: next !== original, applied };
}

function displayPath(filePath) {
  const relative = path.relative(PROJECT_ROOT, filePath);
  return relative.startsWith("..") ? filePath : relPath(filePath);
}

function main() {
  const { isCheck, roots } = parseArgs();
  let failures = 0;
  let seen = 0;
  let changed = 0;

  for (const pluginRoot of roots) {
    if (!fs.existsSync(pluginRoot)) continue;
    for (const filePath of skillFiles(pluginRoot)) {
      if (!fs.existsSync(filePath)) continue;
      seen += 1;
      const result = patchSkill(filePath);
      const label = displayPath(filePath);
      if (!result.changed) {
        if (fs.readFileSync(filePath, "utf8").includes("mcp__node_repl__js")) {
          console.log(`[x] ${label}: flattened node_repl guidance still present`);
          failures += 1;
        } else {
          console.log(`[ok] ${label}: already patched`);
        }
        continue;
      }
      changed += 1;
      console.log(`${isCheck ? "[?]" : "[*]"} ${label}: removed flattened node_repl tool guidance`);
      if (!isCheck) fs.writeFileSync(filePath, result.source, "utf8");
    }
  }

  if (seen === 0) {
    console.log("[ok] No bundled browser skill files found");
  } else {
    console.log(`[summary] ${seen} skill file(s), ${changed} change(s)`);
  }

  if (failures > 0) process.exit(1);
}

main();
