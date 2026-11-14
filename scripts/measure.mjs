/**
 * Image analysis helpers. Both run on the GM's client only, when an actor is staged, on a small
 * downscaled canvas that is released immediately. Results are cached in memory per image path.
 */
const SCAN_WIDTH = 160;
const ALPHA_THRESHOLD = 12; // of 255; ignores faint edge fuzz
const SIL_MAX_HEIGHT = 512; // silhouettes are flat black, so low-res is fine and keeps the payload small

const boxCache = new Map();
const silCache = new Map();

async function load(src) {
  const im = new Image();
  im.decoding = "async";
  im.src = src;
  await im.decode();
  return im;
}

/**
 * Visible (non-transparent) bounding box as fractions [l, t, r, b] of the image.
 * null = couldn't measure (portrait then uses the full image).
 */
export async function measureBox(src) {
  if (boxCache.has(src)) return boxCache.get(src);
  let result = null;
  try {
    const im = await load(src);
    const w = im.naturalWidth;
    const h = im.naturalHeight;
    if (w && h) {
      const sw = Math.min(SCAN_WIDTH, w);
      const sh = Math.max(1, Math.round((h * sw) / w));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, sw, sh);
      const data = ctx.getImageData(0, 0, sw, sh).data;
      canvas.width = canvas.height = 0; // free the backing store

      let l = sw, t = sh, r = -1, b = -1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (data[(y * sw + x) * 4 + 3] > ALPHA_THRESHOLD) {
            if (x < l) l = x;
            if (x > r) r = x;
            if (y < t) t = y;
            if (y > b) b = y;
          }
        }
      }
      if (r >= 0) result = [l / sw, t / sh, (r + 1) / sw, (b + 1) / sh].map((n) => Math.round(n * 1000) / 1000);
    }
  } catch {
    /* cross-origin taint, broken path, etc. */
  }
  boxCache.set(src, result);
  return result;
}

/**
 * A flat-black copy of the image (same shape, same aspect ratio) as a data URL.
 * This is what players receive for an unknown character, so the real image path never reaches them.
 * Returns null on failure; callers must NOT fall back to the real image.
 */
export async function makeSilhouette(src) {
  if (silCache.has(src)) return silCache.get(src);
  let url = null;
  try {
    const im = await load(src);
    const w = im.naturalWidth;
    const h = im.naturalHeight;
    if (w && h) {
      const k = Math.min(1, SIL_MAX_HEIGHT / h);
      const cw = Math.max(1, Math.round(w * k));
      const ch = Math.max(1, Math.round(h * k));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(im, 0, 0, cw, ch);
      ctx.globalCompositeOperation = "source-in"; // keep alpha, replace colour
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      url = canvas.toDataURL("image/webp", 0.8); // falls back to PNG where webp encoding isn't supported
      canvas.width = canvas.height = 0;
    }
  } catch {
    /* tainted canvas etc. */
  }
  if (url) silCache.set(src, url);
  return url;
}
