#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path.home() / ".codex" / "pets" / "golden-tarantula" / "golden-tarantula-cutout.png"
OUTPUT = ROOT / "resources" / "pets" / "golden-tarantula-crawl"
CELL_W = 192
CELL_H = 208


def base_frame() -> Image.Image:
    image = Image.open(SOURCE).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit(f"source has no visible pixels: {SOURCE}")
    sprite = image.crop(bbox).rotate(90, expand=True, resample=Image.Resampling.NEAREST)
    scale = min(178 / sprite.width, 150 / sprite.height)
    sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    frame.alpha_composite(sprite, ((CELL_W - sprite.width) // 2, (CELL_H - sprite.height) // 2))
    return frame


def shifted(frame: Image.Image, x: int, y: int, *, mirror: bool = False) -> Image.Image:
    source = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if mirror else frame
    out = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    out.alpha_composite(source, (x, y))
    return out


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    base = base_frame()
    sheet = Image.new("RGBA", (8 * CELL_W, 9 * CELL_H), (0, 0, 0, 0))
    # The image itself stays crisp. These tiny offsets create a crawl rhythm
    # without local limb warping, alpha ghosts, or direction-flip smear.
    offsets = [(0, 0), (1, -1), (2, 0), (1, 1), (0, 0), (-1, -1), (-2, 0), (-1, 1)]
    rows = [
        ("idle", False, [(0, 0), (0, 0), (0, 1), (0, 0), (0, 0), (0, -1), (0, 0), (0, 0)]),
        ("waving", False, offsets),
        ("running-left", True, offsets),
        ("jumping", False, [(0, 0), (0, -2), (0, -4), (0, -2), (0, 0), (0, 1), (0, 0), (0, 0)]),
        ("failed", False, [(0, 1)] * 8),
        ("review", False, [(0, 0), (0, 0), (1, 0), (0, 0), (0, 0), (-1, 0), (0, 0), (0, 0)]),
        ("running", False, offsets),
        ("running-right", False, offsets),
        ("sleeping", False, [(0, 2)] * 8),
    ]
    for row, (_name, mirror, row_offsets) in enumerate(rows):
        for column, (x, y) in enumerate(row_offsets):
            sheet.alpha_composite(shifted(base, x, y, mirror=mirror), (column * CELL_W, row * CELL_H))
    sheet.save(OUTPUT / "spritesheet.png")
    sheet.crop((0, 0, 6 * CELL_W, CELL_H)).save(OUTPUT / "idle-preview-strip.png")
    sheet.crop((0, 7 * CELL_H, 8 * CELL_W, 8 * CELL_H)).save(OUTPUT / "running-preview-strip.png")
    base.save(OUTPUT / "default-preview.png")
    (OUTPUT / "pet.json").write_text(
        json.dumps(
            {
                "displayName": "Golden Tarantula Crawl",
                "description": "A realistic Chaco golden knee tarantula derived from the existing cutout, using crisp side-facing crawl frames.",
                "spritesheetPath": "spritesheet.png",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
