"""
Strip checkerboard backgrounds from new otter world assets.

The checkerboard is a repeating light-gray (#CCC) / white (#FFF) grid
baked into the PNG pixels. Strategy: convert to RGBA, flood-fill from
each corner with a color tolerance of 30 to catch anti-aliased edges,
then save in place.
"""

import os
from PIL import Image, ImageDraw

ASSETS_DIR = os.path.join(
    os.path.dirname(__file__), '..', 'frontend', 'public', 'ott'
)

FILES = [
    'ott-sliding.png',
    'ott-corner-left.png',
    'ott-corner-right.png',
    'ott-bank-header.png',
    'ott-in-holt.png',
    'ott-holding-rock.png',
    'ott-paw-print.png',
    'ott-kelp-wrap.png',
    'ott-sleeping-kelp.png',
    'ott-with-pup.png',
]

TOLERANCE = 30

# The checkerboard has two colors that alternate in a grid.
# Both must be recognized as "background" during flood-fill.
CHECKER_COLORS = [
    (204, 204, 204),  # #CCCCCC — light gray squares
    (255, 255, 255),  # #FFFFFF — white squares
]


def color_distance(c1, c2):
    """Euclidean distance between two RGB(A) tuples (only first 3 channels)."""
    return sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])) ** 0.5


def is_checkerboard_pixel(px, tolerance):
    """Check if a pixel is close to either checkerboard color."""
    return any(color_distance(px, c) <= tolerance for c in CHECKER_COLORS)


def flood_fill_transparent(img, start_x, start_y, tolerance):
    """Flood-fill from (start_x, start_y), making checkerboard pixels transparent."""
    pixels = img.load()
    w, h = img.size
    start_px = pixels[start_x, start_y]

    # Only start if the seed pixel looks like checkerboard or is already transparent
    # (transparent seeds expand through to find remaining checkerboard neighbors)
    if len(start_px) == 4 and start_px[3] == 0:
        pass  # allow — will expand through transparent region
    elif not is_checkerboard_pixel(start_px, tolerance):
        return 0

    visited = set()
    stack = [(start_x, start_y)]
    count = 0

    while stack:
        x, y = stack.pop()
        if (x, y) in visited:
            continue
        if x < 0 or x >= w or y < 0 or y >= h:
            continue

        visited.add((x, y))
        px = pixels[x, y]

        # Already-transparent pixels: don't count them but DO expand through them
        if len(px) == 4 and px[3] == 0:
            stack.extend([
                (x + 1, y), (x - 1, y),
                (x, y + 1), (x, y - 1),
            ])
            continue

        if is_checkerboard_pixel(px, tolerance):
            pixels[x, y] = (px[0], px[1], px[2], 0)
            count += 1
            stack.extend([
                (x + 1, y), (x - 1, y),
                (x, y + 1), (x, y - 1),
            ])

    return count


def process_image(filepath):
    img = Image.open(filepath).convert('RGBA')
    w, h = img.size
    total_pixels = w * h

    transparent_before = sum(
        1 for x in range(w) for y in range(h)
        if img.getpixel((x, y))[3] == 0
    )

    # Build seed points: corners, edge midpoints, and points every 50px along edges
    seeds = [
        (0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
        (w // 2, 0), (w // 2, h - 1),
        (0, h // 2), (w - 1, h // 2),
    ]
    # Add points along all four edges every 50 pixels
    for step in range(0, w, 50):
        seeds.append((step, 0))
        seeds.append((step, h - 1))
    for step in range(0, h, 50):
        seeds.append((0, step))
        seeds.append((w - 1, step))

    filled = 0
    for sx, sy in seeds:
        filled += flood_fill_transparent(img, sx, sy, TOLERANCE)

    transparent_after = sum(
        1 for x in range(w) for y in range(h)
        if img.getpixel((x, y))[3] == 0
    )

    pct = (transparent_after / total_pixels) * 100

    img.save(filepath, 'PNG')
    return {
        'total': total_pixels,
        'transparent_before': transparent_before,
        'transparent_after': transparent_after,
        'filled': filled,
        'pct': pct,
    }


if __name__ == '__main__':
    print('Stripping checkerboard backgrounds from new assets...\n')

    for fname in FILES:
        fpath = os.path.join(ASSETS_DIR, fname)
        if not os.path.exists(fpath):
            print(f'  SKIP  {fname} — file not found')
            continue

        stats = process_image(fpath)
        print(
            f'  OK    {fname:30s}  '
            f'{stats["transparent_after"]:>7d}/{stats["total"]} transparent '
            f'({stats["pct"]:.1f}%)  '
            f'[+{stats["filled"]} filled]'
        )

    print('\nDone.')
