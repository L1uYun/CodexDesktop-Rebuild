#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path.home() / ".codex" / "pets" / "golden-tarantula" / "golden-tarantula-cutout.png"
OUTPUT = ROOT / "resources" / "pets" / "golden-tarantula-crawl"
CELL_W = 192
CELL_H = 208


def centered_base() -> Image.Image:
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


def binary_mask(base: Image.Image, polygons: list[list[tuple[int, int]]]) -> Image.Image:
    visible = base.getchannel("A").point(lambda value: 255 if value > 36 else 0)
    drawn = Image.new("L", base.size, 0)
    draw = ImageDraw.Draw(drawn)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    return ImageChops.multiply(visible, drawn)


def shifted_layer(base: Image.Image, mask: Image.Image, dx: int, dy: int) -> Image.Image:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    part = Image.new("RGBA", base.size, (0, 0, 0, 0))
    part.alpha_composite(base)
    part.putalpha(mask)
    layer.alpha_composite(part, (dx, dy))
    return layer


def crawl_frame(base: Image.Image, step: int) -> Image.Image:
    # Distal leg tips only. Keep the complete source image underneath so no
    # transparent holes can reveal the Codex UI behind the pet.
    top_a = binary_mask(
        base,
        [
            [(36, 48), (78, 28), (102, 42), (82, 58), (40, 66)],
            [(122, 38), (174, 44), (172, 66), (122, 62)],
        ],
    )
    bottom_a = binary_mask(
        base,
        [
            [(36, 142), (82, 130), (104, 146), (78, 164), (42, 170)],
            [(122, 142), (174, 132), (176, 154), (126, 166)],
        ],
    )
    top_b = binary_mask(
        base,
        [
            [(18, 76), (58, 62), (86, 72), (62, 90), (20, 96)],
            [(136, 72), (184, 82), (180, 104), (136, 98)],
        ],
    )
    bottom_b = binary_mask(
        base,
        [
            [(18, 110), (58, 104), (86, 116), (62, 134), (22, 136)],
            [(136, 110), (184, 106), (184, 128), (138, 136)],
        ],
    )

    phase = step % 8
    stride = [0, 2, 3, 2, 0, -2, -3, -2][phase]
    lift = [0, -1, -1, -1, 0, 1, 1, 1][phase]
    opposing_stride = -stride
    opposing_lift = -lift
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.alpha_composite(base)
    out.alpha_composite(shifted_layer(base, top_a, stride, lift))
    out.alpha_composite(shifted_layer(base, bottom_a, opposing_stride, opposing_lift))
    out.alpha_composite(shifted_layer(base, top_b, opposing_stride, lift))
    out.alpha_composite(shifted_layer(base, bottom_b, stride, opposing_lift))
    body_bob = [0, -1, -1, 0, 0, -1, -1, 0][phase]
    if body_bob:
        bobbed = Image.new("RGBA", base.size, (0, 0, 0, 0))
        bobbed.alpha_composite(out, (0, body_bob))
        out = bobbed
    return out


def idle_frame(base: Image.Image, step: int) -> Image.Image:
    offset = [0, 0, 1, 0, 0, -1, 0, 0][step % 8]
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.alpha_composite(base, (0, offset))
    return out


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    base = centered_base()
    sheet = Image.new("RGBA", (8 * CELL_W, 9 * CELL_H), (0, 0, 0, 0))
    rows = [
        ("idle", False, idle_frame),
        ("waving", False, crawl_frame),
        ("running-left", True, crawl_frame),
        ("jumping", False, crawl_frame),
        ("failed", False, idle_frame),
        ("review", False, crawl_frame),
        ("running", False, crawl_frame),
        ("running-right", False, crawl_frame),
        ("sleeping", False, idle_frame),
    ]
    for row, (_name, mirror, factory) in enumerate(rows):
        for column in range(8):
            frame = factory(base, column)
            if mirror:
                frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            sheet.alpha_composite(frame, (column * CELL_W, row * CELL_H))
    sheet.save(OUTPUT / "spritesheet.png")
    sheet.crop((0, 0, 6 * CELL_W, CELL_H)).save(OUTPUT / "idle-preview-strip.png")
    sheet.crop((0, 7 * CELL_H, 8 * CELL_W, 8 * CELL_H)).save(OUTPUT / "running-preview-strip.png")
    base.save(OUTPUT / "default-preview.png")
    (OUTPUT / "pet.json").write_text(
        json.dumps(
            {
                "displayName": "Golden Tarantula Crawl",
                "description": "A realistic Chaco golden knee tarantula derived from the existing cutout, using crisp alternating leg crawl frames.",
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
