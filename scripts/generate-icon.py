"""Regenerate LucentCue's original SVG, PNG, and Windows icon.

Requires Python 3 and Pillow. Run from any directory: python scripts/generate-icon.py
This is an optional asset-authoring tool, not an application dependency.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
EVERGREEN = "#193c2d"
IVORY = "#f5f0e5"
SCALE = 4


def spark(cx, cy, radius):
    """Four cubic curves form an original concave, four-point spark."""
    r = radius
    return (cx, cy - r), [
        ((cx + r * .10, cy - r * .30), (cx + r * .30, cy - r * .10), (cx + r, cy)),
        ((cx + r * .30, cy + r * .10), (cx + r * .10, cy + r * .30), (cx, cy + r)),
        ((cx - r * .10, cy + r * .30), (cx - r * .30, cy + r * .10), (cx - r, cy)),
        ((cx - r * .30, cy - r * .10), (cx - r * .10, cy - r * .30), (cx, cy - r)),
    ]


def svg_path(start, curves):
    result = f"M {start[0]:g} {start[1]:g} "
    for controls in curves:
        result += "C " + " ".join(f"{x:g} {y:g}" for x, y in controls) + " "
    return result + "Z"


def polygon(start, curves):
    points = [start]
    previous = start
    for first, second, end in curves:
        for step in range(1, 65):
            t = step / 64
            u = 1 - t
            points.append(tuple(u ** 3 * previous[i] + 3 * u ** 2 * t * first[i]
                                + 3 * u * t ** 2 * second[i] + t ** 3 * end[i] for i in (0, 1)))
        previous = end
    return [(round(x * SCALE), round(y * SCALE)) for x, y in points]


ASSETS.mkdir(exist_ok=True)
sparks = [spark(236, 280, 138), spark(382, 126, 43)]
paths = "\n".join(f'  <path d="{svg_path(*shape)}" fill="{IVORY}"/>' for shape in sparks)
(ASSETS / "icon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">\n'
    '  <title id="title">LucentCue</title>\n'
    f'  <rect x="16" y="16" width="480" height="480" rx="112" fill="{EVERGREEN}"/>\n'
    + paths + '\n</svg>\n', encoding="utf-8")
image = Image.new("RGBA", (512 * SCALE, 512 * SCALE))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((16 * SCALE, 16 * SCALE, 496 * SCALE, 496 * SCALE), radius=112 * SCALE, fill=EVERGREEN)
for shape in sparks:
    draw.polygon(polygon(*shape), fill=IVORY)
image = image.resize((512, 512), Image.Resampling.LANCZOS)
image.save(ASSETS / "icon.png", optimize=True)
image.save(ASSETS / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
print("Generated assets/icon.svg, icon.png (512px), and icon.ico (16/32/48/256px).")
