# Golden Tarantula Crawl

This pet asset is derived from the user's local `golden-tarantula-cutout.png`.
The OpenGameArt `Giant Spider 32x32` sheet was used only as a gait reference for alternating leg timing, not as visual source art.

## Crawl algorithm

The pet uses two synchronized motion layers:

1. Window motion is a correlated random walk. It keeps `heading`, `speed`, and floating-point `x/y` state. Every tick slightly perturbs heading, eases speed inside a crawl range, then integrates velocity with elapsed time. Screen edges add a steering vector back toward the work area center. If the pet is dragged to a non-primary monitor, a stronger steering vector points it back toward the primary monitor.
2. Sprite motion is an 8-phase alternating gait. Leg groups A and B move in opposite stride phases: when one diagonal set reaches forward, the opposing set pushes backward. The body stays fixed except for a 1 px bob. Leg movement is produced by binary masks and integer-pixel translations, with no blurred layers, to avoid ghosting. Eight atlas rows provide 45-degree facing movement from east through northeast.
3. Only one process owns window movement. A loopback owner lock prevents the launch and attach helpers from both moving the same avatar window, which avoids visible jumps.

Regenerate from the local source image:

```powershell
python scripts\pet-assets\generate-golden-tarantula-crawl.py
```

Install into the active Codex pet folder:

```powershell
Copy-Item resources\pets\golden-tarantula-crawl\* C:\Users\84618\.codex\pets\golden-tarantula\ -Force
```
