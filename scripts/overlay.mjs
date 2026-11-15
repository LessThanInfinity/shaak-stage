import { ID } from "./state.mjs";
import { onSidebar } from "./sidebar.mjs";

/**
 * The on-screen portraits. A handful of <figure>/<img> pairs. No canvas, no PIXI, no per-frame work.
 * Animations are short Web Animations calls (compositor-only: opacity + transform).
 *
 * Layout: the speaker is flush against the sidebar edge; (optionally) the other staged characters
 * stand behind and to the side of them, smaller and dimmed.
 *
 * Sizing: each entry carries `box` = its visible (non-transparent) area as fractions [l, t, r, b].
 * Every <figure> is sized to that visible area and the <img> is positioned inside it with the
 * transparent padding hanging outside, so every character's VISIBLE height matches.
 */

const MAX_WIDTH_FRACTION = 0.45; // speaker's visible width never exceeds this share of the screen
const EXTRA_SCALE = 0.62; // lineup members are this much smaller than the speaker
const TUCK = 0.7; // how far each lineup member sits behind the one in front (1 = side by side)
const FULL = [0, 0, 1, 1];

let root, main, mainImg, plate;
const extras = []; // [{ fig, img }] pool, grown on demand
let current = []; // [{ entry, fig, img, nw, nh }] what is on screen; [0] is the speaker
let offset = 0; // px of the right edge taken by the sidebar
let token = 0; // guards async decodes against rapid state changes
let shownKey = null; // slot id of the speaker currently visible (decides whether to animate)
let prev = null; // { id, hidden } of the last painted speaker (detects a reveal)

const srcOf = (entry) => entry.img ?? entry.sil;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mount() {
  root = document.createElement("div");
  root.id = "shaak-stage";
  root.hidden = true;

  main = document.createElement("figure");
  main.className = "ss-main";
  mainImg = document.createElement("img");
  mainImg.alt = "";
  mainImg.decoding = "async";
  mainImg.draggable = false;
  plate = document.createElement("figcaption");
  plate.className = "ss-plate";
  main.append(mainImg, plate);
  root.append(main);
  document.body.append(root);

  applySettings();
  // Keep clear of the sidebar. Moving is a transform only (cheap); the full re-layout (which
  // depends on the sidebar width only for the lineup cut-off) is debounced until things settle.
  onSidebar((o) => {
    offset = o;
    applyOffset();
    layoutSoon();
  });
  window.addEventListener("resize", layoutSoon); // sizes are viewport-relative
}

function applyOffset() {
  if (!root) return;
  root.style.transform = root.dataset.side === "left" || !offset ? "" : `translateX(${-offset}px)`;
}

let layoutTimer = 0;
function layoutSoon() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(layout, 120);
}

export function applySettings() {
  if (!root) return;
  root.dataset.side = game.settings.get(ID, "side");
  root.dataset.style = game.settings.get(ID, "style");
  applyOffset();
  layout();
}

function getExtra(i) {
  while (extras.length <= i) {
    const fig = document.createElement("figure");
    fig.className = "ss-extra";
    fig.hidden = true;
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    fig.append(img);
    root.append(fig);
    extras.push({ fig, img });
  }
  return extras[i];
}

/** Size one figure to its visible area and position its image inside; returns the figure width. */
function place(c, targetH, maxW) {
  const left = root.dataset.side === "left";
  const [l, t, r, b] = c.entry.box ?? FULL;
  const cw = Math.max(r - l, 0.01); // visible width, fraction of image
  const ch = Math.max(b - t, 0.01); // visible height, fraction of image
  let s = targetH / (ch * c.nh); // image scale that makes the VISIBLE height = targetH
  if (cw * c.nw * s > maxW) s = maxW / (cw * c.nw); // very wide art: cap by width instead
  const iw = c.nw * s;
  const ih = c.nh * s;
  c.fig.style.width = `${cw * iw}px`;
  c.fig.style.height = `${ch * ih}px`;
  const st = c.img.style;
  st.width = `${iw}px`;
  st.height = `${ih}px`;
  st.bottom = `${-(1 - b) * ih}px`; // feet on the bottom edge
  if (left) {
    st.left = `${-l * iw}px`;
    st.right = "auto";
  } else {
    st.right = `${-(1 - r) * iw}px`;
    st.left = "auto";
  }
  return cw * iw;
}

function layout() {
  if (!root || !current.length) return;
  const left = root.dataset.side === "left";
  const H = (game.settings.get(ID, "size") / 100) * window.innerHeight;
  const maxW = window.innerWidth * MAX_WIDTH_FRACTION;
  const avail = (window.innerWidth - offset) * 0.85; // lineup never crawls across the whole screen

  const setX = (c, d, z) => {
    c.fig.style[left ? "left" : "right"] = `${d}px`;
    c.fig.style[left ? "right" : "left"] = "auto";
    c.fig.style.zIndex = String(z);
  };

  const [speaker, ...others] = current;
  const mainW = place(speaker, H * (speaker.entry.scale || 1), maxW);
  setX(speaker, 0, 50);

  let cursor = mainW * TUCK;
  others.forEach((c, i) => {
    const w = place(c, H * EXTRA_SCALE * (c.entry.scale || 1), maxW * EXTRA_SCALE);
    if (cursor + w > avail) {
      c.fig.hidden = true;
      return;
    }
    c.fig.hidden = false;
    setX(c, cursor, 49 - i);
    cursor += w * TUCK;
  });
}

function hide() {
  token++;
  shownKey = null;
  prev = null;
  current = [];
  if (!root) return;
  root.hidden = true;
  // Drop the srcs so the browser can release decoded bitmaps while nobody is speaking.
  mainImg.removeAttribute("src");
  for (const x of extras) {
    x.fig.hidden = true;
    x.img.removeAttribute("src");
  }
}

export async function paint(state) {
  if (!root) return;
  const speaker = state.speaker ? state.stage.find((e) => e.id === state.speaker) : null;
  if (!speaker || !game.settings.get(ID, "enabled")) return hide();

  const max = game.settings.get(ID, "lineupMax");
  const others = state.lineup && max > 0 ? state.stage.filter((e) => e !== speaker).slice(0, max) : [];
  const my = ++token;

  // Unknown -> known on the current speaker: cross-fade silhouette into the real art.
  const crossfade = !root.hidden && prev?.id === speaker.id && prev.hidden && !speaker.hidden;

  const items = [{ entry: speaker, fig: main, img: mainImg }];
  others.forEach((entry, i) => items.push({ entry, ...getExtra(i) }));
  for (let i = others.length; i < extras.length; i++) {
    extras[i].fig.hidden = true;
    extras[i].img.removeAttribute("src");
  }

  let fade = null;
  await Promise.all(
    items.map(async (it, i) => {
      const src = srcOf(it.entry);
      let el = it.img;
      if (i === 0 && crossfade) {
        fade = el = new Image(); // load the real art off-DOM; main keeps showing the silhouette meanwhile
        el.decoding = "async";
        el.src = src;
      } else if (el.getAttribute("src") !== src) {
        el.src = src;
      } else {
        el = null;
      }
      if (el) {
        try {
          await el.decode(); // avoid showing half-loaded images
        } catch {
          /* broken path: show whatever the browser has */
        }
      }
      const dim = el ?? it.img;
      it.nw = dim.naturalWidth || 1;
      it.nh = dim.naturalHeight || 1;
    })
  );
  if (my !== token) return; // a newer paint superseded this one

  current = items;
  main.classList.toggle("is-unknown", speaker.hidden || crossfade);
  const showNames = state.names !== false; // GM can switch the name plate off for everyone (image only)
  if (!crossfade) {
    const label = speaker.hidden ? game.i18n.localize("SHAAKSTAGE.Unknown") : speaker.name;
    plate.textContent = showNames ? label : ""; // an empty plate is not drawn at all
  }
  for (const it of items.slice(1)) it.fig.classList.toggle("is-unknown", it.entry.hidden);

  const wasVisible = !root.hidden && shownKey === speaker.id;
  root.hidden = false;
  items.slice(1).forEach((it) => (it.fig.hidden = false));
  layout();
  shownKey = speaker.id;
  prev = { id: speaker.id, hidden: speaker.hidden };

  if (crossfade) doReveal(fade, speaker, my, showNames);
  else if (!wasVisible && !reducedMotion()) {
    const dx = root.dataset.side === "left" ? -40 : 40;
    main.animate(
      [
        { opacity: 0, transform: `translateX(${dx}px)` },
        { opacity: 1, transform: "none" }
      ],
      { duration: 220, easing: "ease-out" }
    );
  }
}

/** Fade the real art in over the silhouette, swapping the name plate halfway. */
function doReveal(fade, entry, my, showNames) {
  fade.className = "ss-fade";
  fade.style.cssText = mainImg.style.cssText; // same size/position as the silhouette beneath
  fade.style.opacity = "0";
  main.append(fade);
  const finish = () => {
    if (my === token) {
      mainImg.src = fade.src;
      main.classList.remove("is-unknown");
      plate.textContent = showNames ? entry.name : "";
    }
    fade.remove();
  };
  if (reducedMotion()) return finish();
  const a = fade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: "ease-in-out", fill: "forwards" });
  a.onfinish = finish;
  a.oncancel = () => fade.remove();
  setTimeout(() => {
    if (my === token) plate.textContent = showNames ? entry.name : "";
  }, 350);
}
