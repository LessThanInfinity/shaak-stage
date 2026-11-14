/**
 * Tracks how much of the right edge Foundry's sidebar occupies, so portraits stay clear of it.
 *
 * Deliberately cheap: it only reports a number. Subscribers move their element with a CSS
 * `transform` (compositor-only), never `right`/`left`, and never via a CSS variable on <html>
 * (changing an inherited custom property on the root restyles the whole page every frame,
 * which is what made collapsing the chat choppy).
 */
const subscribers = new Set();
let offset = 0;
let started = false;

function measure() {
  const sb = document.getElementById("sidebar");
  const left = sb ? sb.getBoundingClientRect().left : window.innerWidth;
  return Math.max(0, Math.round(window.innerWidth - left));
}

/** Re-measure now (and again after the collapse animation has had time to finish). */
export function refreshSidebar() {
  const o = measure();
  if (o === offset) return;
  offset = o;
  for (const fn of subscribers) fn(o);
}

function start() {
  if (started) return;
  started = true;
  offset = measure();
  const sb = document.getElementById("sidebar");
  if (sb && "ResizeObserver" in window) new ResizeObserver(refreshSidebar).observe(sb);
  window.addEventListener("resize", refreshSidebar);
}

export function getSidebarOffset() {
  return offset;
}

/** Subscribe to offset changes; the callback also fires once immediately. */
export function onSidebar(fn) {
  start();
  subscribers.add(fn);
  fn(offset);
}
