from __future__ import annotations

from pathlib import Path


APP_NAME = "CodexRebuild++"
SHORTCUT_NAME = "CodexRebuild++.lnk"
UNINSTALL_KEY_NAME = "CodexRebuildPlusPlus"
UNINSTALL_DISPLAY_NAME = "CodexRebuild++"
WATCHER_RUN_NAME = "CodexRebuildPlusPlusWatcher"
WATCHER_STARTUP_SHORTCUT_NAME = "CodexRebuildPlusPlusWatcher.lnk"
WATCHER_DESCRIPTION = "CodexRebuild++ watcher (auto-inject CodexRebuild on start)"
DEFAULT_APP_DIR = Path("D:/software/CodexRebuild")
DEFAULT_DEBUG_PORT = 19339
APP_EXECUTABLE_NAMES = ("CodexRebuild.exe", "Codex.exe", "codex.exe")
PROCESS_NAME_FILTER = "Name='CodexRebuild.exe' OR Name='Codex.exe' OR Name='codex.exe'"
HELPER_DATA_DIR_NAME = ".codex-rebuild-plus-plus"
