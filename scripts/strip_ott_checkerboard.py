"""Strip the baked-in transparency-preview checkerboard from the Ott PNGs.

The 9 PNGs in frontend/public/ott/ were exported from an illustration tool
with the editor's checkerboard visible as actual pixel data — alpha=255 across
the entire image, with alternating gray (~200) and white (255) squares filling
the area that should be transparent.

Strategy:
  1. Build a "background candidate" mask: pixels that are nearly achromatic
     (max - min < 18) AND light (min >= 175). This catches both the gray and
     white checker squares but rejects Ott's cream belly (245,221,196) which
     has max-min ~49.
  2. Flood from the four corners across the mask. Anything reachable is
     background; everything else (Ott's body, fully enclosed by his dark
     brown outline) stays opaque.
  3. Set alpha=0 on the reachable pixels and save back in place.

Uses PIL.ImageDraw.floodfill (C-implemented) for speed — no scipy required.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OTT_DIR = Path(__file__).resolve().parents[1] / "frontend" / "public" / "ott"
FILES = [
    "ott-idle.png",
    "ott-waving.png",
    "ott-encouraging.png",
    "ott-coaching.png",
    "ott-thinking.png",
    "ott-waiting.png",
    "ott-excited.png",
    "ott-celebrating.png",
    "ott-sleeping.png",
]

# Tunables
LIGHT_THRESHOLD = 175       # min channel must be at least this to qualify as bg
CHROMA_THRESHOLD = 18       # max-min must be at most this (achromatic only)


def strip(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.int16)

    mn = rgb.min(axis=2)
    mx = rgb.max(axis=2)
    is_bg = (mn >= LIGHT_THRESHOLD) & ((mx - mn) <= CHROMA_THRESHOLD)

    # Build a binary RGB-mode image: white where bg-candidate, black elsewhere.
    # (PIL's L-mode floodfill is broken in some Pillow versions; RGB works.)
    mask_rgb = np.zeros((h, w, 3), dtype=np.uint8)
    mask_rgb[is_bg] = (255, 255, 255)
    mask_img = Image.fromarray(mask_rgb, mode="RGB")

    # Flood-fill the mask from each corner, painting reachable bg pixels red.
    SENTINEL = (255, 0, 0)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if tuple(mask_rgb[y, x]) == (255, 255, 255):
            ImageDraw.floodfill(mask_img, (x, y), SENTINEL, thresh=0)

    flooded = np.array(mask_img)
    transparent_mask = (
        (flooded[:, :, 0] == 255)
        & (flooded[:, :, 1] == 0)
        & (flooded[:, :, 2] == 0)
    )

    arr[transparent_mask, 3] = 0
    Image.fromarray(arr, "RGBA").save(path, "PNG", optimize=True)

    return {
        "name": path.name,
        "size": f"{w}x{h}",
        "pixels_total": h * w,
        "pixels_bg_candidate": int(is_bg.sum()),
        "pixels_made_transparent": int(transparent_mask.sum()),
    }


def main():
    print(f"Processing {len(FILES)} files in {OTT_DIR}")
    print("-" * 80)
    for name in FILES:
        path = OTT_DIR / name
        if not path.exists():
            print(f"  MISSING: {name}")
            continue
        stats = strip(path)
        pct = 100.0 * stats["pixels_made_transparent"] / stats["pixels_total"]
        print(
            f"  {stats['name']:25s} {stats['size']:>10s}  "
            f"transparent={stats['pixels_made_transparent']:>8d} ({pct:5.1f}%)"
        )
    print("-" * 80)
    print("Done.")


if __name__ == "__main__":
    main()
