param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = New-Object System.Collections.Generic.List[byte[]]

foreach ($size in $sizes) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 14, 165, 233),
    [System.Drawing.Color]::FromArgb(255, 16, 185, 129),
    45
  )
  $graphics.FillEllipse($brush, 1, 1, $size - 2, $size - 2)

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), ([Math]::Max(1, [Math]::Round($size * 0.05)))
  $graphics.DrawEllipse($pen, 2, 2, $size - 4, $size - 4)

  $fontSize = [Math]::Round($size * 0.56)
  $font = New-Object System.Drawing.Font "Segoe UI", $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $graphics.DrawString("R", $font, $textBrush, $rect, $format)

  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs.Add($stream.ToArray())

  $stream.Dispose()
  $textBrush.Dispose()
  $format.Dispose()
  $font.Dispose()
  $pen.Dispose()
  $brush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$outDir = Split-Path -Parent $OutputPath
if ($outDir) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$writer = New-Object System.IO.BinaryWriter([System.IO.File]::Create($OutputPath))
try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$pngs.Count)

  $offset = 6 + (16 * $pngs.Count)
  for ($i = 0; $i -lt $pngs.Count; $i++) {
    $size = $sizes[$i]
    $bytes = $pngs[$i]
    $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
    $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$bytes.Length)
    $writer.Write([UInt32]$offset)
    $offset += $bytes.Length
  }

  foreach ($bytes in $pngs) {
    $writer.Write($bytes)
  }
} finally {
  $writer.Dispose()
}
