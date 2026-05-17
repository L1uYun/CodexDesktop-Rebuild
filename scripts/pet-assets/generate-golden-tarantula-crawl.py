#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path.home() / ".codex" / "pets" / "golden-tarantula" / "golden-tarantula-cutout.png"
OUTPUT = ROOT / "resources" / "pets" / "golden-tarantula-crawl"
CELL_W = 192
CELL_H = 208


LEGS = [
    ((0.10, 0.56), (0.31, 0.48), (0.43, 0.52), (0.28, 0.66), (0.08, 0.72)),
    ((0.14, 0.46), (0.34, 0.41), (0.45, 0.46), (0.30, 0.55), (0.11, 0.60)),
    ((0.22, 0.36), (0.40, 0.37), (0.48, 0.43), (0.33, 0.46), (0.18, 0.48)),
    ((0.34, 0.24), (0.47, 0.34), (0.51, 0.45), (0.42, 0.38), (0.31, 0.30)),
    ((0.58, 0.36), (0.74, 0.37), (0.90, 0.45), (0.86, 0.52), (0.67, 0.45), (0.55, 0.43)),
    ((0.57, 0.47), (0.78, 0.48), (0.96, 0.61), (0.93, 0.69), (0.73, 0.57), (0.55, 0.52)),
    ((0.55, 0.57), (0.74, 0.64), (0.88, 0.83), (0.82, 0.90), (0.66, 0.70), (0.52, 0.61)),
    ((0.48, 0.61), (0.60, 0.71), (0.63, 0.95), (0.56, 0.96), (0.51, 0.76), (0.44, 0.64)),
]

ANCHORS = [(0.38, 0.52), (0.40, 0.47), (0.45, 0.43), (0.47, 0.39), (0.57, 0.43), (0.56, 0.52), (0.54, 0.61), (0.49, 0.64)]
PARITY = [1, -1, 1, -1, -1, 1, -1, 1]


def load_base() -> tuple[Image.Image, tuple[int, int], int, int]:
    image = Image.open(SOURCE).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit(f"source has no visible pixels: {SOURCE}")
    trim = image.crop(bbox).rotate(90, expand=True, resample=Image.Resampling.BICUBIC)
    scale = min(178 / trim.width, 150 / trim.height)
    sprite = trim.resize((round(trim.width * scale), round(trim.height * scale)), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    pos = ((CELL_W - sprite.width) // 2, (CELL_H - sprite.height) // 2)
    cell.alpha_composite(sprite, pos)
    return cell, pos, sprite.width, sprite.height


def split_layers(base: Image.Image, base_pos: tuple[int, int], base_w: int, base_h: int) -> tuple[Image.Image, list[Image.Image]]:
    leg_layers = []
    leg_union = Image.new("L", (CELL_W, CELL_H), 0)
    for polygon in LEGS:
        mask = Image.new("L", (CELL_W, CELL_H), 0)
        points = [(base_pos[0] + x * base_w, base_pos[1] + y * base_h) for x, y in polygon]
        ImageDraw.Draw(mask).polygon(points, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(0.45))
        layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        layer.alpha_composite(base)
        layer.putalpha(ImageChops.multiply(base.getchannel("A"), mask))
        leg_layers.append(layer)
        leg_union = ImageChops.lighter(leg_union, mask)
    body = base.copy()
    body.putalpha(ImageChops.subtract(base.getchannel("A"), leg_union.point(lambda p: 255 if p > 18 else 0)))
    return body, leg_layers


def rotate_layer(layer: Image.Image, degrees: float, anchor: tuple[float, float], base_pos: tuple[int, int], base_w: int, base_h: int) -> Image.Image:
    ax = base_pos[0] + anchor[0] * base_w
    ay = base_pos[1] + anchor[1] * base_h
    pad = 90
    large = Image.new("RGBA", (CELL_W + pad * 2, CELL_H + pad * 2), (0, 0, 0, 0))
    large.alpha_composite(layer, (pad, pad))
    rotated = large.rotate(degrees, center=(ax + pad, ay + pad), resample=Image.Resampling.BICUBIC)
    return rotated.crop((pad, pad, pad + CELL_W, pad + CELL_H))


def make_frame(
    body: Image.Image,
    leg_layers: list[Image.Image],
    base_pos: tuple[int, int],
    base_w: int,
    base_h: int,
    phase: float,
    *,
    direction: str,
    strength: float,
    idle: bool,
) -> Image.Image:
    frame = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    body_bob = -1.0 * max(0, math.sin(phase * math.pi)) if not idle else 0.3 * math.sin(phase * math.tau)
    body_layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    body_layer.alpha_composite(body, (0, round(body_bob)))
    frame.alpha_composite(body_layer)
    for index, layer in enumerate(leg_layers):
        wave = math.sin(phase * math.tau + PARITY[index] * math.pi / 2)
        degrees = wave * 3.8 * strength
        if index in (3, 7):
            degrees *= 0.65
        if idle:
            degrees *= 0.22
        leg = rotate_layer(layer, degrees, ANCHORS[index], base_pos, base_w, base_h)
        travel = 1.3 * wave * strength * (1 if index < 4 else -1)
        lift = -0.7 * abs(wave) * strength
        if idle:
            travel *= 0.2
            lift *= 0.15
        shifted = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        shifted.alpha_composite(leg, (round(travel), round(lift)))
        frame.alpha_composite(shifted)
    if direction == "left":
        return frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if direction == "up":
        return frame.rotate(270, resample=Image.Resampling.BICUBIC, expand=False)
    if direction == "down":
        return frame.rotate(90, resample=Image.Resampling.BICUBIC, expand=False)
    return frame


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    base, base_pos, base_w, base_h = load_base()
    body, leg_layers = split_layers(base, base_pos, base_w, base_h)
    sheet = Image.new("RGBA", (8 * CELL_W, 9 * CELL_H), (0, 0, 0, 0))
    rows = [
        ("idle", "right", 0.25, True, 6),
        ("waving", "right", 0.55, False, 8),
        ("running-left", "left", 1.0, False, 8),
        ("jumping", "right", 0.7, False, 8),
        ("failed", "right", 0.2, True, 8),
        ("review", "down", 0.35, True, 8),
        ("running", "down", 0.85, False, 8),
        ("running-right", "right", 1.0, False, 8),
        ("sleeping", "right", 0.08, True, 8),
    ]
    for row, (_name, direction, strength, idle, count) in enumerate(rows):
        for column in range(8):
            frame = make_frame(body, leg_layers, base_pos, base_w, base_h, (column % count) / count, direction=direction, strength=strength, idle=idle)
            sheet.alpha_composite(frame, (column * CELL_W, row * CELL_H))
    sheet.save(OUTPUT / "spritesheet.png")
    sheet.crop((0, 0, 6 * CELL_W, CELL_H)).save(OUTPUT / "idle-preview-strip.png")
    sheet.crop((0, 7 * CELL_H, 8 * CELL_W, 8 * CELL_H)).save(OUTPUT / "running-preview-strip.png")
    base.save(OUTPUT / "default-preview.png")
    (OUTPUT / "pet.json").write_text(
        json.dumps(
            {
                "displayName": "Golden Tarantula Crawl",
                "description": "A realistic Chaco golden knee tarantula derived from the existing cutout, with leg-swing crawl frames.",
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
