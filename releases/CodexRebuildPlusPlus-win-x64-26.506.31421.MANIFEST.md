# Codex Rebuild Plus Plus Windows package

Original file: `CodexRebuildPlusPlus-win-x64-26.506.31421.zip`
SHA256: `64bd7483a23166c3ff64e7633054944115b9a05edeae5b07f0918c57b30cbda4`
Size: 611143942 bytes

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
- `CodexRebuildPlusPlus-win-x64-26.506.31421.zip.part07` (44912902 bytes)
