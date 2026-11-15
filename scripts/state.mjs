import { measureBox, makeSilhouette } from "./measure.mjs";
import { cleanImage, uploadPng, imageExists } from "./clean.mjs";

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

/* ---------- cleaned art (one file per actor) ----------
 * <cleanDir>/<actorId>.png holds the cleaned copy. The actor's flag `shaak-stage.clean` records
 * which original image it was made from, so a changed portrait is noticed and re-cleaned.
 * Any failure falls back to the original image: cleaning must never break staging.
 */

export function getCleanDir() {
  const dir = String(game.settings.get(ID, "cleanDir") ?? "").trim().replace(/^\/+|\/+$/g, "");
  return dir || `worlds/${game.world.id}/shaak-stage-clean`;
}

const withVersion = (rec) => `${rec.path}?v=${rec.v}`; // cache-bust: the file is overwritten in place

// Clean one image at a time: it is CPU-heavy, and loading a preset would otherwise start many at once.
let cleanQueue = Promise.resolve();
const enqueue = (fn) => {
  const run = cleanQueue.then(fn, fn);
  cleanQueue = run.catch(() => {});
  return run;
};

async function runClean(actor, original) {
  const dir = getCleanDir();
  const blob = await cleanImage(original);
  const path = await uploadPng(blob, dir, `${actor.id}.png`);
  const rec = { src: original, path, v: Date.now() };
  await actor.setFlag(ID, "clean", rec);
  return rec;
}

/**
 * Pick the image to stage for an actor: an existing matching clean copy, else (if allowed) a fresh
 * clean, else the original. `force` re-cleans even if a copy exists (the manual "clean" button).
 * Returns { src, status } where status is "existing" | "cleaned" | "original" | "failed".
 */
export async function resolveArt(actor, { force = false } = {}) {
  const original = actor.getFlag(ID, "art") || actor.img;
  if (!original) return { src: original, status: "original" };
  try {
    const rec = actor.getFlag(ID, "clean");
    if (!force && rec?.src === original && rec.path && (await imageExists(rec.path))) {
      return { src: withVersion(rec), status: "existing" };
    }
    if (!game.user.isGM || (!force && !game.settings.get(ID, "autoClean"))) return { src: original, status: "original" };
    const fresh = await enqueue(() => runClean(actor, original));
    return { src: withVersion(fresh), status: "cleaned" };
  } catch (err) {
    console.warn(`${ID} | could not clean the image for "${actor.name}"; using the original.`, err);
    ui.notifications.warn(game.i18n.format("SHAAKSTAGE.CleanFailed", { name: actor.name }));
    return { src: original, status: "failed" };
  }
}

/** Build the public entry for an actor. Returns null if an unknown-silhouette couldn't be made. */
async function build(actor, hidden, slot, { force = false } = {}) {
  // flag `art` overrides the stage image; then use its cleaned copy if there is/can be one
  const { src } = await resolveArt(actor, { force });
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

  /** Manual "clean": re-clean the image of a staged character and refresh it on stage. */
  async cleanSlot(slot) {
    if (!game.user.isGM || tooSoon(`clean:${slot}`, 1500)) return;
    const e = getState().stage.find((x) => x.id === slot);
    const actor = actorFor(slot);
    if (!e || !actor) return warn("ActorMissing");
    ui.notifications.info(game.i18n.format("SHAAKSTAGE.Cleaning", { name: actor.name }));
    const { status } = await resolveArt(actor, { force: true });
    if (status === "failed") return; // already warned; keep what is on stage as it is
    const entry = await build(actor, e.hidden, slot); // uses the clean copy that was just written
    if (!entry) return;
    const s = clone(getState());
    const i = s.stage.findIndex((x) => x.id === slot);
    if (i < 0) return;
    s.stage[i] = entry;
    await commit(s);
    if (status === "cleaned") ui.notifications.info(game.i18n.format("SHAAKSTAGE.Cleaned", { name: actor.name }));
  },

  /** For macros: (re)clean any actor's art without staging them. Returns the status. */
  async cleanActor(actorOrId) {
    const actor = typeof actorOrId === "string" ? game.actors.get(actorOrId) : actorOrId;
    if (!game.user.isGM || !actor) return "failed";
    return (await resolveArt(actor, { force: true })).status;
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
