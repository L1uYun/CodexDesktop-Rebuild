# Codex Desktop Rebuild

Cross-platform Electron rebuild for OpenAI Codex Desktop App.

This project is derived from two upstream projects:

- [OpenAI Codex](https://github.com/openai/codex), the original Codex CLI and runtime.
- [Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild), the cross-platform desktop rebuild baseline.
- [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus), the external Codex++ enhancement launcher included under `CodexPlusPlus/`.

This fork keeps the upstream rebuild workflow and adds Windows-focused Rebuild identity packaging, a separate `CodexRebuild.exe` launcher, and a narrow browser-use trust bridge based on the official `browser-client.mjs` SHA-256 allowlist.

## Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| macOS    | x64, arm64   | ✅     |
| Windows  | x64          | ✅     |
| Linux    | x64, arm64   | ✅     |

## Build

```bash
# Install dependencies
npm install

# Build for current platform
npm run build

# Build for specific platform
npm run build:mac-x64
npm run build:mac-arm64
npm run build:win-x64
npm run build:linux-x64
npm run build:linux-arm64

# Build all platforms
npm run build:all
```

## Development

```bash
npm run dev
```

## Upstream Sync

When the official Codex app updates, follow the Windows sync runbook in
[`docs/upstream-sync-runbook.md`](docs/upstream-sync-runbook.md). It captures the
runtime-copy, ASAR integrity, automation, Chrome/browser-use, and CodexPlusPlus
watcher checks needed to reproduce this Rebuild sync safely.

## CodexRebuild++

The `CodexPlusPlus/` directory vendors the Codex++ launcher and helper service so the Rebuild package and the PlusPlus integration can be versioned together in this repository.

For current Rebuild builds, launching `CodexRebuild.exe` automatically enables CDP on port `19339`, starts the bundled PlusPlus helper, and attaches Codex++ to the already running Rebuild window. The visible Codex++ entry is also pinned as a small fixed button in the upper-right corner, so it does not depend on Codex's native header layout. Manual PlusPlus launch/injection is still available from the `CodexPlusPlus/` project.

To intentionally restore watcher takeover behavior for debugging, set:

```powershell
$env:CODEX_PLUS_PLUS_WATCHER_TAKEOVER = "1"
python -m codex_session_delete watch --debug-port 19339
```

## Project Structure

```
├── CodexPlusPlus/       # Vendored Codex++ integration
├── src/
│   ├── .vite/build/     # Main process (Electron)
│   └── webview/         # Renderer (Frontend)
├── resources/
│   └── codex-rebuild.ico # Windows Rebuild icon
├── scripts/
│   ├── patch-browser-trust-bridge.js
│   ├── check-browser-trust-bridge.js
│   └── patch-copyright.js
├── forge.config.js      # Electron Forge config
└── package.json
```

## CI/CD

GitHub Actions automatically builds on:
- Push to `master`
- Tag `v*` → Creates draft release

## Credits

**© OpenAI · Cometix Space**

- [OpenAI Codex](https://github.com/openai/codex) - Original Codex CLI and runtime (Apache-2.0)
- [Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild) - Original cross-platform desktop rebuild project
- [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) - Original Codex++ external enhancement launcher
- [Cometix Space](https://github.com/Haleclipse) - [@cometix/codex](https://www.npmjs.com/package/@cometix/codex) binaries
- [Electron Forge](https://www.electronforge.io/) - Build toolchain

## License

This project rebuilds the Codex Desktop app for cross-platform distribution.
Original Codex CLI by OpenAI is licensed under Apache-2.0.
