/**
 * In-module edge cleanup for cut-out art. Same method as tools/clean_edges.py:
 *   1. Recolour the outer edge band with colours grown outward from the clean interior, which
 *      removes the light fringe left by background removal but keeps thin hair strands.
 *   2. Soften the hard 1-bit edge slightly, without growing the shape.
 * Runs once per image, on the GM's client, and the result is uploaded as ONE file per actor.
 * Everything here may throw; callers must catch and fall back to the original image.
 */

const BAND = 2; // px of outline to recolour
const MAX_PIXELS = 20_000_000; // refuse absurdly large images rather than freeze the browser

const nextTick = () => new Promise((r) => setTimeout(r));

async function loadImage(src) {
  const im = new Image();
  im.decoding = "async";
  im.src = src;
  await im.decode();
  return im;
}

/** Binary erosion by a square of radius r. Pixels outside the image count as set (no edge bite). */
function erode(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && !mask[row + xx]) {
          v = 0;
          break;
        }
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 1;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h && !tmp[yy * w + x]) {
          v = 0;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Soften alpha with a [1 2 1]/4 kernel in each direction (about a 0.7px gaussian). */
function softenAlpha(a, w, h) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const l = a[row + (x > 0 ? x - 1 : 0)];
      const c = a[row + x];
      const r = a[row + (x < w - 1 ? x + 1 : w - 1)];
      tmp[row + x] = (l + 2 * c + r) / 4;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const dn = (y < h - 1 ? y + 1 : h - 1) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) out[row + x] = (tmp[up + x] + 2 * tmp[row + x] + tmp[dn + x]) / 4;
  }
  return out;
}

/** @returns {Promise<Blob>} a cleaned PNG of the image at `src`. */
export async function cleanImage(src) {
  const im = await loadImage(src);
  const w = im.naturalWidth;
  const h = im.naturalHeight;
  if (!w || !h) throw new Error("image has no size");
  if (w * h > MAX_PIXELS) throw new Error(`image too large to clean (${w}x${h})`);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(im, 0, 0);
    const img = ctx.getImageData(0, 0, w, h); // throws if the canvas is tainted (cross-origin art)
    const px = img.data;
    const n = w * h;
    await nextTick(); // let the UI breathe between the heavy steps

    const alpha = new Uint8Array(n);
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      alpha[i] = px[i * 4 + 3];
      solid[i] = alpha[i] > 127 ? 1 : 0;
    }

    // Trusted interior: at least BAND px away from the outline.
    const known = erode(solid, w, h, BAND);
    await nextTick();

    // Grow colour outward one ring at a time into the edge band.
    const rgb = new Uint8ClampedArray(px); // working copy (colour only matters)
    for (let it = 0; it <= BAND; it++) {
      const adds = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (known[i] || alpha[i] === 0) continue;
          let c = 0, r = 0, g = 0, b = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              const j = yy * w + xx;
              if (!known[j]) continue;
              c++;
              r += rgb[j * 4];
              g += rgb[j * 4 + 1];
              b += rgb[j * 4 + 2];
            }
          }
          if (c) adds.push(i, Math.round(r / c), Math.round(g / c), Math.round(b / c));
        }
      }
      for (let k = 0; k < adds.length; k += 4) {
        const i = adds[k];
        rgb[i * 4] = adds[k + 1];
        rgb[i * 4 + 1] = adds[k + 2];
        rgb[i * 4 + 2] = adds[k + 3];
        known[i] = 1;
      }
      await nextTick();
    }

    const soft = softenAlpha(alpha, w, h);
    for (let i = 0; i < n; i++) {
      if (alpha[i] === 0) continue; // never grow the shape
      px[i * 4] = rgb[i * 4];
      px[i * 4 + 1] = rgb[i * 4 + 1];
      px[i * 4 + 2] = rgb[i * 4 + 2];
      px[i * 4 + 3] = Math.round(soft[i]);
    }
    ctx.putImageData(img, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("couldn't encode the cleaned image");
    return blob;
  } finally {
    canvas.width = canvas.height = 0; // release the pixel buffer
  }
}

/* ------------------------------ files ------------------------------ */

const filePicker = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

async function makeDirs(dir) {
  const fp = filePicker();
  let acc = "";
  for (const part of dir.split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part;
    try {
      await fp.createDirectory("data", acc, {});
    } catch {
      /* already exists */
    }
  }
}

/**
 * Upload `blob` as `<dir>/<name>` (overwriting any file of that name) and return its path.
 * If the first attempt fails the folder probably doesn't exist yet, so create it and retry once.
 */
export async function uploadPng(blob, dir, name) {
  const fp = filePicker();
  const file = new File([blob], name, { type: "image/png" });
  const attempt = async () => {
    const res = await fp.upload("data", dir, file, {}, { notify: false });
    if (!res || res.status === "error" || res.status === "failure") throw new Error(res?.message ?? "upload failed");
    return typeof res.path === "string" && res.path ? res.path : `${dir}/${name}`;
  };
  try {
    return await attempt();
  } catch {
    await makeDirs(dir);
    return await attempt();
  }
}

/** Does this path resolve to an image on the server right now? */
export async function imageExists(path) {
  try {
    const res = await fetch(path, { method: "HEAD" });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}
