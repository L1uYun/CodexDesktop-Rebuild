# Upstream Sync Runbook

This runbook captures the Windows sync and recovery process used after the
official Codex app moved to `26.513.4821.0`. Use it whenever official Codex is
updated and Rebuild needs to be regenerated, reinstalled, and revalidated.

## Source Projects

This repository carries work from:

- `Haleclipse/CodexDesktop-Rebuild`: the desktop rebuild baseline.
- `BigPizzaV3/CodexPlusPlus`: the external Codex++ enhancement launcher, vendored
  in `CodexPlusPlus/`.
- The installed official OpenAI Codex app: the Electron runtime, launcher, CLI,
  and upstream ASAR source of truth.

## Sync Goal

After every official Codex update, Rebuild should:

- Use the current official Windows Electron runtime files.
- Use the current official `Codex.exe` launcher as `CodexRebuild.exe`.
- Use the current official CLI copied as `resources/codex-rebuild.exe`.
- Keep Rebuild isolated under `AppData\Roaming\CodexRebuild`.
- Share `CODEX_HOME` with official Codex at `%USERPROFILE%\.codex`.
- Preserve the Windows path preflight for stale `C:\...` versus `\\?\C:\...`
  thread paths.
- Keep automation gates and Chrome/browser-use trust patches applied.
- Keep Archived chats usable from local `archived_sessions` when ChatGPT cloud
  task history is unreachable.
- Keep CodexPlusPlus watcher in observe-only mode by default.

## Official App Discovery

Prefer the newest installed official Codex app under WindowsApps:

```powershell
Get-ChildItem "C:\Program Files\WindowsApps" -Directory |
  Where-Object { $_.Name -match '^OpenAI\.Codex_\d+\.\d+\.\d+\.\d+_x64__' } |
  Sort-Object Name -Descending |
  Select-Object -First 5 FullName
```

For a known installed version, set:

```powershell
$env:CODEX_OFFICIAL_APP_DIR = "C:\Program Files\WindowsApps\OpenAI.Codex_26.513.4821.0_x64__2p2nqsd0c76g0\app"
```

The build script also auto-discovers this path when `CODEX_OFFICIAL_APP_DIR` is
unset.

## Rebuild From Official ASAR

Run from the repository root:

```powershell
$official = Join-Path $env:CODEX_OFFICIAL_APP_DIR "resources\app.asar"
$asarDir = "src\win\_asar"

Remove-Item $asarDir -Recurse -Force -ErrorAction SilentlyContinue
npx asar extract $official $asarDir
node scripts\build-from-upstream.js --platform win
```

Expected build signals:

- `Windows Electron runtime root` points at the official app directory.
- `using Windows Electron launcher` points at official `Codex.exe`.
- `patched Rebuild Windows thread path preflight`.
- `patched Rebuild lifecycle trace`.
- `patched bootstrap AppUserModelID override`.
- `patched bootstrap product name override`.
- `patched bootstrap updater skip for CodexRebuild.exe`.
- Browser-use and automation gate patch scripts report `[ok]`.
- `added CodexRebuild.exe launcher`.
- `added codex-rebuild.exe from upstream app CLI`.
- `integrity exe hash patched` appears for the launcher hash offsets.

## Install Locally

Only stop Rebuild processes under `D:\software\CodexRebuild`. Do not kill the
official Codex app.

```powershell
$target = "D:\software\CodexRebuild"
$src = "out\win\Codex-win32-x64"

Get-Process -ErrorAction SilentlyContinue |
  Where-Object { try { $_.Path -like "$target\*" } catch { $false } } |
  ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Force -Path $target | Out-Null
robocopy $src $target /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

& "$target\resources\codex-rebuild.exe" --version
```

Use `robocopy` for the install copy. Plain `Copy-Item -Recurse` has failed on
the vendored plugin `node_modules` tree with transient "Could not find a part of
the path" errors, leaving `D:\software\CodexRebuild` half-installed.

The CLI version should match the official app bundle. For the 2026-05-16 sync it
was:

```text
codex-cli 0.131.0-alpha.9
```

## CodexPlusPlus Watcher Rule

The previous flash/crash loop was not caused by the Rebuild launcher itself. It
was caused by the CodexPlusPlus watcher:

```text
pythonw.exe -m codex_session_delete watch --debug-port 9239
```

The old watcher killed a normally started `CodexRebuild.exe` and relaunched it
with:

```text
--remote-debugging-port=<port> --remote-allow-origins=http://127.0.0.1:<port>
```

That relaunch path made the window appear to flash, hang, and disappear. The
watcher is now observe-only by default. It should log:

```text
watcher started (... takeover_enabled=False)
Codex running without CDP (...); takeover disabled
```

Only enable takeover intentionally for debugging:

```powershell
$env:CODEX_PLUS_PLUS_WATCHER_TAKEOVER = "1"
python -m codex_session_delete watch --debug-port 9239
```

## Stability Verification

Start the watcher and Rebuild:

```powershell
Start-Process "D:\Python3.11.1\pythonw.exe" `
  -ArgumentList @("-m","codex_session_delete","watch","--debug-port","9239") `
  -WindowStyle Hidden

Start-Process "D:\software\CodexRebuild\CodexRebuild.exe"
```

Observe for at least 90 seconds:

```powershell
$target = "D:\software\CodexRebuild"
for ($i = 1; $i -le 18; $i++) {
  Start-Sleep -Seconds 5
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { try { $_.Path -like "$target\*" } catch { $false } } |
    Select-Object Id,ProcessName,Responding,MainWindowTitle,StartTime,Path |
    Format-Table -AutoSize
}
```

Expected result:

- Main `CodexRebuild.exe` remains alive.
- It may briefly report `Responding=False` during startup, but it should recover.
- No new top-level Rebuild process should appear with `--remote-debugging-port`.
- `codex-rebuild.exe app-server --analytics-default-enabled` remains under
  Rebuild.
- `node_repl.exe` and stdio app-server children may appear after tool runtime
  initialization.

Check the logs:

```powershell
Get-Content "$env:USERPROFILE\.codex-rebuild-plus-plus\watcher.log" -Tail 40
Get-Content "$env:APPDATA\CodexRebuild\rebuild-lifecycle.log" -Tail 80
```

The lifecycle log should contain `trace-installed`, `ready`, and
`browser-window-created`. It must not contain temporary diagnostic environment
dumps.

## Automation Verification

Build output should apply:

- `scripts/patch-heartbeat-automation-feature.js`
- `scripts/patch-rebuild-windows-thread-path-preflight.js`
- `scripts/patch-archived-chats-local-fallback.js`
- `scripts/patch-local-thread-item-guards.js`

Expected build log lines include:

```text
heartbeat automation gate calls
automation sidebar nav gate calls
automation feature gates patched
patched Rebuild Windows thread path preflight
```

If an automation resume error mentions stale path mismatch:

```text
cannot resume running thread ... stale path:
requested `C:\...`
active `\\?\C:\...`
```

then rerun the build/install path. The preflight should normalize active thread
paths and create SQLite triggers:

- `codex_rebuild_threads_rollout_path_win_ext_ai`
- `codex_rebuild_threads_rollout_path_win_ext_au`

## Archived Chats Verification

Build output should apply:

```text
archived chats local fallback patched
local thread item guards patched
```

The Settings > Archived chats page combines cloud archived tasks from:

```text
/wham/tasks/list?task_filter=archived
```

and local archived threads from:

```text
%USERPROFILE%\.codex\archived_sessions
```

If the cloud request fails with `ERR_CONNECTION_RESET`, Rebuild should treat the
cloud page as empty and still show local archived chats. Without this patch, the
cloud query error hides the local archived threads behind:

```text
Could not load archived chats.
```

## Chrome / Browser-Use Verification

Build output should apply:

- `scripts/patch-browser-trust-bridge.js`
- `scripts/patch-plugin-auth.js`
- `scripts/patch-plugins-experience-feature.js`
- `scripts/patch-browser-use-feature-availability.js`
- `scripts/patch-browser-use-js-repl-feature.js`
- `scripts/patch-browser-client-discovery-timeout.js`

Expected build log lines include:

```text
browser trust bridge patched
plugins experience feature patched
browser-use feature availability patched
browser-use js_repl feature patched
```

For Rebuild on Windows, `scripts/patch-browser-use-feature-availability.js`
must also disable forced reload for the bundled `chrome` plugin. The official
descriptor marks `chrome` with `forceReload: true`; when official Codex or the
Chrome extension native host is already using the shared
`%USERPROFILE%\.codex\plugins\cache\openai-bundled\chrome\latest` tree, a forced
uninstall/install can fail before the plugin reaches MCP registration.

If `@chrome` still reports a trust error:

```text
privileged native pipe bridge is not available; browser-client is not trusted
```

first confirm that the installed ASAR contains the patched browser-use flags and
that Rebuild was rebuilt from the newest official ASAR. Do not debug this by
falling back to a random Chrome CDP port; that bypasses the trust bridge being
validated.

If the Plugins page or settings row disappears, appears locked, or `@chrome`
never becomes a selectable plugin after an official update, check the upstream
experimental feature gate. Official `26.513.3673.0` made Plugins depend on the
`apps` experimental feature. Re-run the build/install path and confirm:

```powershell
node scripts\patch-plugins-experience-feature.js win --check
```

The check should report the `apps feature gate` and `plugins feature lookup` as
already patched or patchable. If it reports a missing pattern, inspect the new
`agent-settings-*.js` bundle before publishing Rebuild.

If the runtime marketplace is written with `browser`, `chrome`, and `latex`, but
`@chrome` still does not appear as a callable MCP tool, inspect
`%APPDATA%\CodexRebuild\sentry\scope_v3.json` for install failures:

```powershell
Select-String -Path "$env:APPDATA\CodexRebuild\sentry\scope_v3.json" `
  -Pattern "bundled_plugins_marketplace_install_failed|plugin_cache_windows_file_lock|pluginName=chrome" |
  Select-Object -Last 30
```

This signature means the plugin was discovered but failed during cache install:

```text
plugin_cache_windows_file_lock
failed to back up plugin cache entry: 拒绝访问。 (os error 5)
```

Check for the native host that locks the shared Chrome plugin cache:

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -match "\\.codex\\plugins\\cache\\openai-bundled\\chrome|extension-host"
  } |
  Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine |
  Format-List
```

If only the Chrome extension host remains, closing Chrome or stopping that
`extension-host.exe` process releases the lock for validation. The permanent
Rebuild fix is to avoid forced reload of the current `chrome` cache on Windows,
so a running official Codex/Chrome bridge does not prevent MCP registration.

## Failure Signatures

### ICU data error

```text
Invalid file descriptor to ICU data received
```

Cause: only the ASAR/resources were copied, not the official Electron runtime
root. Fix: ensure `copyWindowsRuntimeRoot()` copies DLLs, PAKs, and ICU data from
the official app root.

### ASAR integrity failure

```text
Integrity check failed for asar archive
```

Cause: the launcher still carries the official ASAR hash. Fix: keep the original
official `resources\app.asar` in the output before packing, compute old/new
hashes, and patch the launcher hash offsets.

### Rebuild flashes or relaunches with remote debugging

Check:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "codex_session_delete|CodexRebuild|remote-debugging-port" } |
  Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine |
  Format-List
```

If the parent is:

```text
pythonw.exe -m codex_session_delete launch --app-dir D:\software\CodexRebuild --debug-port 9239
```

then the watcher is still doing takeover. Update `CodexPlusPlus/` and confirm
`takeover_enabled=False`.

## Pre-Commit Checklist

Before pushing an upstream sync:

```powershell
python -m pytest CodexPlusPlus\tests\test_watcher.py CodexPlusPlus\tests\test_launcher_cli.py -q
git diff --cached --check
```

Run a staged sensitive-value scan:

```powershell
git diff --cached --name-only |
  ForEach-Object {
    if (Test-Path $_) {
      rg -n "sk-[A-Za-z0-9]|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|packyapi|127\.0\.0\.1:7890" $_
    }
  }
```

Do not commit generated directories:

- `node_modules/`
- `out/`
- `src/`
- `.pytest_cache/`
- `__pycache__/`
- `*.egg-info/`

Push to the user fork:

```powershell
git push mine master
```
