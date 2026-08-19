#!/usr/bin/env python3
"""Render Melofin app icons from geometry.

Mark: three thick capsule bars on a full-bleed brand gradient.
iOS / Android apply the home-screen mask — do not pre-round or stroke the plate.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "images"

WHITE = (255, 255, 255)
SPLASH_BG = (11, 6, 20)  # #0B0614, matches app.config splash
SCALE = 4

BRAND = (
    (147, 51, 234),  # #9333EA
    (217, 70, 239),  # #D946EF
    (251, 113, 133),  # #FB7185
)


def downsample(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.BOX)


def lerp(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, ...]:
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def bar_rects(size: int) -> list[tuple[float, float, float, float]]:
    u = size / 1024
    bar_w = 168 * u
    gap = 44 * u
    group_w = 3 * bar_w + 2 * gap
    left = (size - group_w) / 2
    baseline = 782 * u
    heights = (540 * u, 300 * u, 540 * u)
    return [
        (left + i * (bar_w + gap), baseline - height, left + i * (bar_w + gap) + bar_w, baseline)
        for i, height in enumerate(heights)
    ]


def paint_mark(draw: ImageDraw.ImageDraw, size: int, fill) -> None:
    radius = (168 * (size / 1024)) / 2
    for box in bar_rects(size):
        draw.rounded_rectangle(box, radius=radius, fill=fill)


def brand_gradient(size: int) -> Image.Image:
    h = size * 3
    strip = Image.new("RGB", (1, h))
    px = strip.load()
    for y in range(h):
        t = y / (h - 1)
        c = lerp(BRAND[0], BRAND[1], t / 0.48) if t < 0.48 else lerp(BRAND[1], BRAND[2], (t - 0.48) / 0.52)
        px[0, y] = c
    field = strip.resize((h, h), Image.Resampling.BILINEAR)
    field = field.rotate(-32, resample=Image.Resampling.BICUBIC, expand=False)
    left = (h - size) // 2
    return field.crop((left, left, left + size, left + size))


def render_icon(size: int = 1024) -> Image.Image:
    hi = size * SCALE
    im = brand_gradient(hi)
    paint_mark(ImageDraw.Draw(im), hi, WHITE)
    return downsample(im, size)


def render_splash(size: int = 1024) -> Image.Image:
    hi = size * SCALE
    im = Image.new("RGB", (hi, hi), SPLASH_BG)
    paint_mark(ImageDraw.Draw(im), hi, WHITE)
    return downsample(im, size)


def render_transparent_mark(size: int, padded: bool) -> Image.Image:
    hi = size * SCALE
    im = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    if padded:
        inset = int(hi * 0.16)
        inner = hi - inset * 2
        mark = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
        paint_mark(ImageDraw.Draw(mark, "RGBA"), inner, WHITE + (255,))
        im.paste(mark, (inset, inset), mark)
    else:
        paint_mark(ImageDraw.Draw(im, "RGBA"), hi, WHITE + (255,))
    return downsample(im, size)


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} {im.size} {im.mode}")


def main() -> None:
    icon = render_icon(1024)
    save(icon, ASSETS / "icon.png")
    save(render_splash(1024), ASSETS / "splash-icon.png")
    save(render_transparent_mark(512, padded=True), ASSETS / "android-icon-foreground.png")
    save(render_transparent_mark(432, padded=True), ASSETS / "android-icon-monochrome.png")
    save(downsample(brand_gradient(512 * SCALE), 512), ASSETS / "android-icon-background.png")
    save(downsample(icon, 48), ASSETS / "favicon.png")


if __name__ == "__main__":
    main()
