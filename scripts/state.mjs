import { measureBox, makeSilhouette } from "./measure.mjs";

export const ID = "shaak-stage";

/**
 * Two stores, deliberately split so unknown characters can't leak to players:
 *
 * PUBLIC  world setting "state" (synced to every client, persisted):
 *   { stage: [entry], speaker: slotId|null, lineup: boolean }
 *   entry = { id: slotId, hidden, box, scale, name?, img?, sil? }
 *     - revealed: name + img
 *     - unknown : sil only (a pre-rendered black silhouette). NO name, NO image path, NO actor id.
 *
 * PRIVATE client setting "gm" (the GM's own browser, never sent to players):
 *   { map: { slotId: actorId }, presets: [...] }
 *   Maps public slots back to real actors so the GM panel can show/reveal them.
 *
 * Only the GM writes either one.
 */

export function getState() {
  const s = game.settings.get(ID, "state") ?? {};
  return {
    stage: Array.isArray(s.stage) ? s.stage : [],
    speaker: s.speaker ?? null,
    lineup: s.lineup !== false
  };
}

function getGM() {
  const g = game.settings.get(ID, "gm") ?? {};
  return { map: g.map ?? {}, presets: g.presets ?? [] };
}

/** Write public state and the private slot map together (map is pruned to staged slots). */
async function commit(next, map) {
  if (!game.user.isGM) return;
  const gm = getGM();
  const keep = new Set(next.stage.map((e) => e.id));
  const pruned = {};
  for (const [slot, actorId] of Object.entries(map ?? gm.map)) if (keep.has(slot)) pruned[slot] = actorId;
  await game.settings.set(ID, "gm", { ...gm, map: pruned });
  await game.settings.set(ID, "state", next);
}

const warn = (key) => ui.notifications.warn(game.i18n.localize(`SHAAKSTAGE.${key}`));

export function actorFor(slot) {
  const id = getGM().map[slot];
  return id ? game.actors.get(id) : null;
}

/** What the GM should see for an entry (real name/art, even for unknown characters). */
export function gmView(entry) {
  const actor = actorFor(entry.id);
  return {
    actor,
    name: actor?.name ?? entry.name ?? game.i18n.localize("SHAAKSTAGE.Unknown"),
    img: actor ? actor.getFlag(ID, "art") || actor.img : (entry.img ?? entry.sil)
  };
}

/**
 * If a cleaned copy of this image sits next to it ("<name>_clean.png", as written by
 * tools/clean_edges.py), use that instead. One cheap HEAD request, only when staging an actor.
 * Anything that can't be confirmed as an existing image falls back to the original path.
 */
async function preferClean(src) {
  if (!src || !game.settings.get(ID, "preferClean")) return src;
  if (/^([a-z]+:)?\/\//i.test(src) || /_clean\.[a-z0-9]+$/i.test(src)) return src; // external URL / already clean
  const candidate = `${src.replace(/\.[^./\\]+$/, "")}_clean.png`;
  if (candidate === src) return src;
  try {
    const res = await fetch(candidate, { method: "HEAD" });
    if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) return candidate;
  } catch {
    /* offline / blocked: just use the original */
  }
  return src;
}

/** Build the public entry for an actor. Returns null if an unknown-silhouette couldn't be made. */
async function build(actor, hidden, slot) {
  // flag `art` overrides the stage image; then prefer a cleaned copy of whichever image that is
  const src = await preferClean(actor.getFlag(ID, "art") || actor.img);
  const entry = {
    id: slot,
    hidden: !!hidden,
    box: await measureBox(src), // visible area, so portraits are sized by what you can see
    scale: Number(actor.getFlag(ID, "scale")) || 1 // flag `scale` for giants / small folk
  };
  if (hidden) {
    const sil = await makeSilhouette(src);
    if (!sil) {
      ui.notifications.error(game.i18n.localize("SHAAKSTAGE.SilhouetteFailed"));
      return null;
    }
    entry.sil = sil;
  } else {
    entry.name = actor.name;
    entry.img = src;
  }
  return entry;
}

const clone = (o) => foundry.utils.deepClone(o);
const newSlot = () => foundry.utils.randomID();

// Ignore a repeat of the same action within a short window (stray double-clicks).
const lastAction = new Map();
function tooSoon(key, ms = 450) {
  const now = performance.now();
  if (now - (lastAction.get(key) ?? -Infinity) < ms) return true;
  lastAction.set(key, now);
  return false;
}

export const Stage = {
  async add(actorOrId, { hidden = false } = {}) {
    if (!game.user.isGM) return;
    const actor = typeof actorOrId === "string" ? game.actors.get(actorOrId) : actorOrId;
    if (!actor) return;
    const gm = getGM();
    const state = clone(getState());
    // Re-adding an already-staged actor refreshes it in place.
    const existing = state.stage.find((e) => gm.map[e.id] === actor.id);
    const slot = existing?.id ?? newSlot();
    const entry = await build(actor, hidden, slot);
    if (!entry) return;
    const s = clone(getState()); // re-read after the async work
    const i = s.stage.findIndex((e) => e.id === slot);
    if (i >= 0) s.stage[i] = entry;
    else s.stage.push(entry);
    await commit(s, { ...getGM().map, [slot]: actor.id });
  },

  async remove(slot) {
    // One shared key: after a removal the next tile slides under the cursor, so a double-click
    // would otherwise remove two characters.
    if (tooSoon("remove")) return;
    const s = clone(getState());
    s.stage = s.stage.filter((e) => e.id !== slot);
    if (s.speaker === slot) s.speaker = null;
    await commit(s);
  },

  /**
   * Make `slot` the speaker. Speaking the current speaker again does NOTHING (so an accidental
   * double-click can never hide them). Use dismiss() to clear the speaker deliberately.
   */
  async speak(slot) {
    const s = clone(getState());
    if (!slot) {
      if (s.speaker === null) return;
      s.speaker = null;
    } else if (s.speaker === slot) {
      return;
    } else if (s.stage.some((e) => e.id === slot)) {
      s.speaker = slot;
    } else {
      return;
    }
    await commit(s);
  },

  /** For optional hotkeys: speak the Nth staged character (0-based). */
  speakIndex(i) {
    const e = getState().stage[i];
    return e ? Stage.speak(e.id) : undefined;
  },

  async toggleHidden(slot) {
    if (tooSoon(`hide:${slot}`)) return; // a double-click would reveal then immediately re-hide
    const e = getState().stage.find((x) => x.id === slot);
    if (!e) return;
    const actor = actorFor(slot);
    if (!actor) return warn("ActorMissing"); // e.g. staged from another browser: re-add the actor
    const entry = await build(actor, !e.hidden, slot);
    if (!entry) return;
    const s = clone(getState());
    const i = s.stage.findIndex((x) => x.id === slot);
    if (i < 0) return;
    s.stage[i] = entry;
    await commit(s);
  },

  dismiss() {
    return Stage.speak(null);
  },

  async clear() {
    const s = clone(getState());
    await commit({ stage: [], speaker: null, lineup: s.lineup }, {});
  },

  async setLineup(on) {
    const s = clone(getState());
    s.lineup = !!on;
    await commit(s);
  },

  /* ---------- presets (GM-only, stored in the GM's client settings) ---------- */

  listPresets() {
    return getGM().presets;
  },

  async savePreset(name) {
    if (!game.user.isGM) return;
    name = String(name ?? "").trim();
    if (!name) return;
    const { stage, speaker } = getState();
    const gm = getGM();
    const entries = stage.map((e) => ({ actorId: gm.map[e.id], hidden: e.hidden })).filter((e) => e.actorId);
    const presets = gm.presets.filter((p) => p.name !== name); // same name overwrites
    presets.push({ id: newSlot(), name, entries, speaker: gm.map[speaker] ?? null });
    await game.settings.set(ID, "gm", { ...gm, presets });
  },

  async loadPreset(id) {
    if (!game.user.isGM) return;
    const preset = getGM().presets.find((p) => p.id === id);
    if (!preset) return;
    // Build everything first, then ONE write, so players see the whole stage appear at once.
    const built = (
      await Promise.all(
        preset.entries.map(async (e) => {
          const actor = game.actors.get(e.actorId);
          if (!actor) return null;
          const entry = await build(actor, e.hidden, newSlot());
          return entry && { entry, actorId: actor.id };
        })
      )
    ).filter(Boolean);
    const missing = preset.entries.length - built.length;
    if (missing) warn("PresetMissing");
    const map = Object.fromEntries(built.map((b) => [b.entry.id, b.actorId]));
    const speaker = built.find((b) => b.actorId === preset.speaker)?.entry.id ?? null;
    await commit({ stage: built.map((b) => b.entry), speaker, lineup: getState().lineup }, map);
  },

  async deletePreset(id) {
    if (!game.user.isGM) return;
    const gm = getGM();
    await game.settings.set(ID, "gm", { ...gm, presets: gm.presets.filter((p) => p.id !== id) });
  }
};
