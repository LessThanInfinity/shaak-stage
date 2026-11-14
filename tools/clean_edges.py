"""
Remove the thin light fringe around background-removed character art.

Cut-out tools often leave a 1-2px ring of the ORIGINAL background colour along the outline,
kept fully opaque. On a dark map that shows up as a faint light line around the character.

This tool fixes it once, offline (so the module needs no expensive render-time filter):
  1. Recolours the outer edge band with colours grown outward from the clean interior, so the
     light fringe disappears but thin hair strands / tassels are kept (nothing is eroded).
  2. Softens the hard 1-bit edge slightly (anti-aliasing), without growing the shape.

Originals are never modified. Each input X.png is written to <out>/X_clean.png.

Usage:
  python tools/clean_edges.py "path/to/image.png" "path/to/folder" --out "path/to/output"
Options:
  --band N      width of the edge band to recolour, in px (default 2; try 3 for big images)
  --feather F   edge softening radius in px (default 0.7; 0 = off)
  --shrink N    also trim N px off the outline (default 0; use 1 if a faint line remains)
Needs: Pillow and numpy  (pip install pillow numpy)
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def box3(x):
    """Sum over each pixel's 3x3 neighbourhood (works for HxW and HxWxC)."""
    pad = [(1, 1), (1, 1)] + [(0, 0)] * (x.ndim - 2)
    p = np.pad(x, pad)
    h, w = x.shape[:2]
    return sum(p[dy : dy + h, dx : dx + w] for dy in range(3) for dx in range(3))


def clean(im, band=2, feather=0.7, shrink=0):
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    solid = a > 127

    # Core = pixels at least `band` px away from the outline: trusted, uncontaminated colour.
    mask = Image.fromarray((solid * 255).astype(np.uint8))
    core = np.array(mask.filter(ImageFilter.MinFilter(2 * band + 1))) > 0
    known = core.copy()
    col = np.where(core[..., None], rgb, 0.0)

    # Grow colour outward one ring at a time into the band (and any thin strands touching it).
    for _ in range(band + 1):
        wsum = box3(known.astype(np.float32))
        csum = box3(col * known[..., None])
        grow = (~known) & (wsum > 0) & (a > 0)
        avg = csum / np.maximum(wsum, 1)[..., None]
        col[grow] = avg[grow]
        known |= grow
    out_rgb = np.where((known & (a > 0))[..., None], col, rgb)

    # Optional trim, then soften the edge. Alpha never grows beyond the original shape.
    alpha_img = Image.fromarray(a.astype(np.uint8))
    if shrink > 0:
        alpha_img = alpha_img.filter(ImageFilter.MinFilter(2 * shrink + 1))
    if feather > 0:
        soft = np.array(alpha_img.filter(ImageFilter.GaussianBlur(feather))).astype(np.float32)
        new_a = np.where(np.array(alpha_img) > 0, soft, 0.0)
    else:
        new_a = np.array(alpha_img).astype(np.float32)

    out = np.dstack([out_rgb, new_a]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="PNG files and/or folders")
    ap.add_argument("--out", required=True, help="output folder (created if missing)")
    ap.add_argument("--band", type=int, default=2)
    ap.add_argument("--feather", type=float, default=0.7)
    ap.add_argument("--shrink", type=int, default=0)
    args = ap.parse_args()

    files = []
    for item in map(Path, args.inputs):
        files += sorted(item.glob("*.png")) if item.is_dir() else [item]
    files = [f for f in files if f.suffix.lower() == ".png" and not f.stem.endswith("_clean")]
    if not files:
        sys.exit("No PNG files found.")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in files:
        dest = out_dir / f"{f.stem}_clean.png"
        clean(Image.open(f), args.band, args.feather, args.shrink).save(dest, optimize=True)
        print(f"{f.name} -> {dest}")


if __name__ == "__main__":
    main()
