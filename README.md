# Codex Desktop Rebuild

Cross-platform Electron rebuild for OpenAI Codex Desktop App.

This project is derived from two upstream projects:

- [OpenAI Codex](https://github.com/openai/codex), the original Codex CLI and runtime.
- [Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild), the cross-platform desktop rebuild baseline.

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
npm run check:browser-trust
```

## Project Structure

```
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
- [Cometix Space](https://github.com/Haleclipse) - [@cometix/codex](https://www.npmjs.com/package/@cometix/codex) binaries
- [Electron Forge](https://www.electronforge.io/) - Build toolchain

## License

This project rebuilds the Codex Desktop app for cross-platform distribution.
Original Codex CLI by OpenAI is licensed under Apache-2.0.
