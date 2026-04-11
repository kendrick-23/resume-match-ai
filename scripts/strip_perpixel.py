"""
Per-pixel checkerboard removal for assets where flood-fill leaves interior
gray/white squares intact because they're enclosed by the illustration outline.

Strategy: scan every pixel, make it transparent if:
  - Nearly achromatic: max(r,g,b) - min(r,g,b) <= 20
  - Light: min(r,g,b) >= 170

This catches #CCC (204,204,204) and #FFF (255,255,255) while safely
skipping Ott's cream belly (~245,221,196, chroma ~49) and teal (#2BB5C0).

Backs up original to <filename>.bak before writing.
"""

import os
import shutil
import numpy as np
from PIL import Image

ASSETS_DIR = os.path.join(
    os.path.dirname(__file__), '..', 'frontend', 'public', 'ott'
)

FILES = [
    'ott-corner-right.png',
]

LIGHT_THRESHOLD = 170
CHROMA_THRESHOLD = 20


def process(filepath):
    shutil.copy2(filepath, filepath + '.bak')

    im = Image.open(filepath).convert('RGBA')
    arr = np.array(im, dtype=np.int16)
    h, w = arr.shape[:2]

    rgb = arr[:, :, :3]
    mn = rgb.min(axis=2)
    mx = rgb.max(axis=2)

    is_checker = (mn >= LIGHT_THRESHOLD) & ((mx - mn) <= CHROMA_THRESHOLD)

    result = arr.copy().astype(np.uint8)
    result[is_checker, 3] = 0

    count = int(is_checker.sum())
    pct = 100.0 * count / (h * w)

    Image.fromarray(result, 'RGBA').save(filepath, 'PNG', optimize=True)
    return w, h, count, pct


if __name__ == '__main__':
    print('Per-pixel checkerboard strip\n')
    for fname in FILES:
        fpath = os.path.join(ASSETS_DIR, fname)
        if not os.path.exists(fpath):
            print(f'  MISSING: {fname}')
            continue
        w, h, count, pct = process(fpath)
        print(f'  {fname}  {w}x{h}  {count} px removed ({pct:.1f}%)')
        print(f'  Backup saved to {fpath}.bak')
    print('\nDone.')
