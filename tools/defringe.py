"""
defringe.py - remove the pale outline ("halo") that background-removed PNGs show on dark maps.

Why it happens: the semi-transparent pixels along a cut-out's edge still carry colour from the
ORIGINAL light background, so on a dark scene they read as a thin white line. This tool leaves the
art and its shape alone and only repairs those edge pixels: their colour is replaced with the colour
of the nearest solid pixels, and the faintest edge alpha is trimmed a little.

Usage:
  python tools/defringe.py <input.png|folder> [-o OUT_DIR] [--suffix _clean] [--tighten 0.10]

Never overwrites the originals: results go to OUT_DIR (default: next to the input, with the suffix).
Needs: pip install pillow numpy
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """Separable box blur of an (H, W, ...) array using cumulative sums (edge-replicated)."""
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
        hi = np.take(c, range(k, c.shape[axis]), axis=axis)
        lo = np.take(c, range(0, c.shape[axis] - k), axis=axis)
        a = (hi - lo) / k
    return a


def erode(mask: np.ndarray) -> np.ndarray:
    """3x3 binary erosion."""
    p = np.pad(mask, 1, mode="constant", constant_values=False)
    out = mask.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out &= p[1 + dy : 1 + dy + mask.shape[0], 1 + dx : 1 + dx + mask.shape[1]]
    return out


def defringe(im: Image.Image, tighten: float = 0.10, radius: int = 3) -> Image.Image:
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3] / 255.0

    solid = alpha >= 0.98
    source = erode(erode(solid))  # trustworthy colour: solid AND 2px away from any soft edge
    w = source.astype(np.float64)

    # Normalised convolution: spread the trusted colour outward into the edge pixels.
    num = rgb.astype(np.float64) * w[..., None]
    den = w.copy()
    for _ in range(3):  # three box passes ~ a gaussian
        num = box_blur(num, radius)
        den = box_blur(den, radius)
    fill = num / np.maximum(den[..., None], 1e-6)

    repair = (~source) & (alpha > 0) & (den > 1e-4)
    rgb[repair] = fill[repair]

    if tighten > 0:  # trim the faintest, most contaminated edge alpha
        alpha = np.clip((alpha - tighten) / (1.0 - tighten), 0.0, 1.0)

    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255.0]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=None)
    ap.add_argument("--suffix", default="_clean")
    ap.add_argument("--tighten", type=float, default=0.10, help="trim faint edge alpha (0 = off)")
    args = ap.parse_args()

    files = sorted(args.input.glob("*.png")) if args.input.is_dir() else [args.input]
    files = [f for f in files if not f.stem.endswith(args.suffix)]
    if not files:
        print("no PNGs found", file=sys.stderr)
        return 1
    for f in files:
        dest_dir = args.out or f.parent
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{f.stem}{args.suffix}.png"
        defringe(Image.open(f), args.tighten).save(dest, optimize=True)
        print(f"{f.name} -> {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
