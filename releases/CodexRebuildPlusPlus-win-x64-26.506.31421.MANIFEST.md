# Codex Rebuild Plus Plus Windows package

Original file: `CodexRebuildPlusPlus-win-x64-26.506.31421.zip`
SHA256: `a0b7702351e81e467f3ace2eeeb3c39759e62e91deaac697358684c797dbd45b`
Size: 628366089 bytes

Reconstruct on Windows PowerShell:
```powershell
$out = [System.IO.File]::Create(".\CodexRebuildPlusPlus-win-x64-26.506.31421.zip")
try {
  Get-ChildItem ".\CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part*" | Sort-Object Name | ForEach-Object {
    $in = [System.IO.File]::OpenRead($_.FullName)
    try { $in.CopyTo($out) } finally { $in.Dispose() }
  }
} finally {
  $out.Dispose()
}
Get-FileHash -Algorithm SHA256 .\CodexRebuildPlusPlus-win-x64-26.506.31421.zip
```

Parts:
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part01` (94371840 bytes)
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part02` (94371840 bytes)
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part03` (94371840 bytes)
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part04` (94371840 bytes)
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part05` (94371840 bytes)
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part06` (94371840 bytes)
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part07` (62135049 bytes)
