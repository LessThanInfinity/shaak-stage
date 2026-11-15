import { ID, Stage, getState, gmView, actorFor, isFavorite } from "./state.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const t = (k) => game.i18n.localize(`SHAAKSTAGE.${k}`);
const MAX_RESULTS = 60;
const STYLES = [
  ["persona", "Persona"],
  ["phoenix", "Phoenix"],
  ["ink", "Ink"],
  ["classic", "Classic"]
];

/* ---------- remember which sections are open (per browser) ---------- */
const readOpen = (key, fallback) => {
  try {
    const v = localStorage.getItem(`${ID}.panel.${key}`);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const writeOpen = (key, open) => {
  try {
    localStorage.setItem(`${ID}.panel.${key}`, open ? "1" : "0");
  } catch {
    /* storage unavailable: sections just reset to their defaults */
  }
};

/* ---------- drag & drop ---------- */

/** The JSON Foundry attaches when you drag a document ({ type, uuid }). */
function readDragData(ev) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try {
    const data = TE.getDragEventData(ev);
    if (data && Object.keys(data).length) return data;
  } catch {
    /* fall through to a plain parse */
  }
  try {
    return JSON.parse(ev.dataTransfer.getData("text/plain"));
  } catch {
    return null;
  }
}

/** Resolve a dropped Actor or Token to a WORLD actor, or warn and return null. */
async function actorFromDrop(data) {
  if (!data || !["Actor", "Token"].includes(data.type)) {
    ui.notifications.warn(t("DropNotActor"));
    return null;
  }
  let doc = null;
  try {
    const resolve = foundry.utils?.fromUuid ?? globalThis.fromUuid;
    doc = data.uuid ? await resolve(data.uuid) : null;
  } catch {
    /* unknown uuid: handled below */
  }
  if (!doc && data.type === "Actor" && data.id) doc = game.actors.get(data.id);
  let actor = data.type === "Token" ? doc?.actor : doc;
  if (actor?.documentName !== "Actor") {
    ui.notifications.warn(t("DropNotActor"));
    return null;
  }
  if (actor.pack) {
    // A compendium entry: staging records data on the actor, which needs a real world actor.
    ui.notifications.warn(t("DropImport"));
    return null;
  }
  actor = game.actors.get(actor.id) ?? actor; // an unlinked token's synthetic actor -> its world actor
  return actor;
}

/**
 * GM control panel. Plain DOM (no Handlebars, no full re-render on state changes):
 * the skeleton is built once; only the stage grid, controls, preset list and actor list are repainted.
 */
export class StagePanel extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "shaak-stage-panel",
    classes: ["shaak-stage-panel"],
    window: { title: "SHAAKSTAGE.Title", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 440, height: 720 },
    actions: {
      speak: StagePanel.#speak,
      toggleHidden: StagePanel.#toggleHidden,
      toggleFavorite: StagePanel.#toggleFavorite,
      remove: StagePanel.#remove,
      stageActor: StagePanel.#stageActor,
      stageHidden: StagePanel.#stageHidden,
      dismiss: StagePanel.#dismiss,
      clearStage: StagePanel.#clearStage,
      savePreset: StagePanel.#savePreset,
      loadPreset: StagePanel.#loadPreset,
      deletePreset: StagePanel.#deletePreset
    }
  };

  #root;
  #grid;
  #count;
  #results;
  #actorsTitle;
  #presets;
  #input;

  static #id = (target) => target.closest("[data-id]")?.dataset.id;
  static #speak(event, target) {
    Stage.speak(StagePanel.#id(target));
  }
  static #toggleHidden(event, target) {
    Stage.toggleHidden(StagePanel.#id(target));
  }
  static async #toggleFavorite(event, target) {
    // On a stage tile data-id is a stage slot; on a list row it is an actor id.
    const id = StagePanel.#id(target);
    const actor = game.actors.get(id) ?? actorFor(id);
    if (actor) await Stage.setFavorite(actor, !isFavorite(actor));
  }
  static #remove(event, target) {
    Stage.remove(StagePanel.#id(target));
  }
  static #stageActor(event, target) {
    Stage.add(StagePanel.#id(target));
  }
  static #stageHidden(event, target) {
    Stage.add(StagePanel.#id(target), { hidden: true });
  }
  static #dismiss() {
    Stage.dismiss();
  }
  static #clearStage() {
    Stage.clear();
  }
  static #loadPreset(event, target) {
    Stage.loadPreset(StagePanel.#id(target));
  }
  static #deletePreset(event, target) {
    Stage.deletePreset(StagePanel.#id(target));
  }
  static async #savePreset() {
    const name = await DialogV2.prompt({
      window: { title: t("SavePreset") },
      content: `<input type="text" name="name" placeholder="${t("PresetName")}" autofocus>`,
      ok: { label: t("SavePreset"), callback: (event, button) => button.form.elements.name.value },
      rejectClose: false
    });
    if (name) Stage.savePreset(name);
  }

  toggle() {
    return this.rendered ? this.close() : this.render({ force: true });
  }

  async _renderHTML() {
    const root = document.createElement("div");
    root.className = "ss-panel";
    const styleOptions = STYLES.map(([key]) => `<option value="${key}">${t(`Settings.Style.${key[0].toUpperCase()}${key.slice(1)}`)}</option>`).join("");
    root.innerHTML = `
      <div class="ss-drop-hint" aria-hidden="true">
        <span class="ss-drop-add">${t("DropAdd")}</span>
        <span class="ss-drop-unknown">${t("DropAddUnknown")}</span>
      </div>

      <div class="ss-scroll">
      <section class="ss-section ss-stage">
        <header class="ss-head">
          <h3>${t("OnStage")} <span class="ss-count"></span></h3>
          <div class="ss-toolbar">
            <button type="button" data-action="dismiss" title="${t("Dismiss")}"><i class="fa-solid fa-comment-slash"></i></button>
            <button type="button" data-action="clearStage" title="${t("ClearStage")}"><i class="fa-solid fa-broom"></i></button>
          </div>
        </header>
        <div class="ss-grid"></div>
      </section>

      <details class="ss-section ss-controls" data-key="display">
        <summary>${t("Display")}</summary>
        <div class="ss-controls-body">
          <div class="ss-field">
            <label for="ss-style">${t("StyleLabel")}</label>
            <select id="ss-style" name="style">${styleOptions}</select>
          </div>
          <div class="ss-field">
            <label>${t("SideLabel")}</label>
            <div class="ss-seg" role="group">
              <button type="button" data-side="left">${t("Left")}</button>
              <button type="button" data-side="right">${t("Right")}</button>
            </div>
          </div>
          <div class="ss-field">
            <label for="ss-size">${t("SizeLabel")}</label>
            <div class="ss-range">
              <input id="ss-size" type="range" name="size" min="30" max="100" step="5">
              <output class="ss-size-out"></output>
            </div>
          </div>
          <label class="ss-check"><input type="checkbox" name="names"> <span>${t("ShowNames")}</span></label>
          <label class="ss-check"><input type="checkbox" name="lineup"> <span>${t("ShowLineup")}</span></label>
          <p class="ss-note">${t("DisplayNote")}</p>
        </div>
      </details>

      <details class="ss-section ss-presets" data-key="presets">
        <summary>${t("Presets")}</summary>
        <ul class="ss-preset-list"></ul>
        <button type="button" class="ss-save" data-action="savePreset"><i class="fa-solid fa-floppy-disk"></i> ${t("SavePreset")}</button>
      </details>

      <section class="ss-section ss-actors">
        <header class="ss-head"><h3 class="ss-actors-title"></h3></header>
        <input type="search" placeholder="${t("SearchPlaceholder")}" autocomplete="off">
        <ul class="ss-results"></ul>
      </section>
      </div>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this.#root = result;
    this.#grid = result.querySelector(".ss-grid");
    this.#count = result.querySelector(".ss-count");
    this.#results = result.querySelector(".ss-results");
    this.#actorsTitle = result.querySelector(".ss-actors-title");
    this.#presets = result.querySelector(".ss-preset-list");
    this.#input = result.querySelector(".ss-actors input[type=search]");
    this.#input.addEventListener("input", foundry.utils.debounce(() => this.#paintResults(), 120));

    // collapsible sections remember whether they were open
    for (const d of result.querySelectorAll("details[data-key]")) {
      d.open = readOpen(d.dataset.key, d.dataset.key === "display");
      d.addEventListener("toggle", () => writeOpen(d.dataset.key, d.open));
    }
    this.#bindControls(result);
    this.#bindDrop(result);
    this.#paintAll(); // read the CURRENT stage straight away (see the note on _onRender)
  }

  /**
   * Foundry only marks an application `rendered` AFTER _replaceHTML returns, so painting must not be
   * gated on `this.rendered` there (that skipped the first paint and left a reopened panel blank until
   * something changed). Paint again here, once the window is live, so it always shows the latest state.
   */
  async _onRender(context, options) {
    await super._onRender?.(context, options);
    this.#paintAll();
  }

  _onClose(options) {
    super._onClose?.(options);
    this.#root = this.#grid = this.#count = this.#results = this.#actorsTitle = this.#presets = this.#input = null; // drop refs to the removed DOM
  }

  /** Called by main.mjs whenever the shared state changes. No-op while the panel is closed. */
  paint() {
    if (!this.#grid) return;
    this.#paintAll();
  }

  /** Cheap refresh of just the Display controls (called when a display setting changes). */
  paintControls() {
    if (this.#root) this.#paintControls();
  }

  #paintAll() {
    this.#paintStage();
    this.#paintControls();
    this.#paintPresets();
    this.#paintResults();
  }

  /* ---------- Display controls ---------- */

  #bindControls(root) {
    const sizeOut = root.querySelector(".ss-size-out");
    const applySize = foundry.utils.debounce((v) => game.settings.set(ID, "size", v), 40);
    root.addEventListener("input", (ev) => {
      if (ev.target.name !== "size") return;
      const v = Number(ev.target.value);
      sizeOut.textContent = `${v}%`; // instant feedback; the setting is written a moment later
      applySize(v);
    });
    root.addEventListener("change", (ev) => {
      const el = ev.target;
      if (el.name === "style") game.settings.set(ID, "style", el.value);
      else if (el.name === "names") Stage.setNames(el.checked);
      else if (el.name === "lineup") Stage.setLineup(el.checked);
    });
    root.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-side]");
      if (b) game.settings.set(ID, "side", b.dataset.side);
    });
  }

  #paintControls() {
    const root = this.#root;
    const { names, lineup } = getState();
    const side = game.settings.get(ID, "side");
    const size = Number(game.settings.get(ID, "size")) || 70;
    root.querySelector("select[name=style]").value = game.settings.get(ID, "style");
    for (const b of root.querySelectorAll("[data-side]")) {
      const on = b.dataset.side === side;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    root.querySelector("input[name=size]").value = String(size);
    root.querySelector(".ss-size-out").textContent = `${size}%`;
    root.querySelector("input[name=names]").checked = names;
    root.querySelector("input[name=lineup]").checked = lineup;
  }

  /* ---------- stage grid ---------- */

  #paintStage() {
    const { stage, speaker } = getState();
    this.#count.textContent = stage.length ? String(stage.length) : "";
    const thumbs = game.settings.get(ID, "thumbs");
    if (!stage.length) {
      const p = document.createElement("p");
      p.className = "ss-hint";
      p.textContent = t("EmptyStage");
      this.#grid.replaceChildren(p);
      return;
    }
    this.#grid.replaceChildren(
      ...stage.map((e, i) => {
        const view = gmView(e); // the GM sees real names/art, even for unknown characters
        const fav = isFavorite(view.actor);
        const tile = document.createElement("div");
        tile.className = "ss-tile";
        tile.classList.toggle("active", e.id === speaker);
        tile.classList.toggle("is-unknown", !!e.hidden);
        tile.dataset.id = e.id;
        tile.dataset.action = "speak";
        tile.tabIndex = 0;
        tile.title = t("Speak");

        if (thumbs && view.img) {
          const im = document.createElement("img");
          im.src = view.img;
          im.alt = "";
          im.loading = "lazy";
          im.decoding = "async";
          im.draggable = false;
          tile.append(im);
        }
        const num = document.createElement("span");
        num.className = "ss-tile-num";
        num.textContent = String(i + 1);
        const name = document.createElement("span");
        name.className = "ss-tile-name";
        name.textContent = view.name;
        tile.append(num, name);

        const btns = document.createElement("div");
        btns.className = "ss-tile-btns";
        btns.append(
          iconButton("toggleFavorite", "fa-star", fav ? t("Unfavorite") : t("Favorite"), fav ? "fa-solid" : "fa-regular"),
          iconButton("toggleHidden", e.hidden ? "fa-eye-slash" : "fa-eye", e.hidden ? t("Reveal") : t("Hide")),
          iconButton("remove", "fa-xmark", t("Remove"))
        );
        btns.firstChild.classList.toggle("is-fav", fav);
        tile.append(btns);
        return tile;
      })
    );
  }

  #paintPresets() {
    const presets = Stage.listPresets();
    if (!presets.length) {
      const li = document.createElement("li");
      li.className = "ss-hint";
      li.textContent = t("NoPresets");
      this.#presets.replaceChildren(li);
      return;
    }
    this.#presets.replaceChildren(
      ...presets.map((p) => {
        const li = document.createElement("li");
        li.dataset.id = p.id;
        const load = document.createElement("button");
        load.type = "button";
        load.className = "ss-row-main";
        load.dataset.action = "loadPreset";
        load.title = t("LoadPreset");
        load.textContent = `${p.name} (${p.entries.length})`;
        li.append(load, iconButton("deletePreset", "fa-trash", t("DeletePreset")));
        return li;
      })
    );
  }

  /* ---------- favorites + search ---------- */

  #paintResults() {
    const q = this.#input.value.trim().toLowerCase();
    this.#actorsTitle.textContent = q ? t("SearchResults") : t("Favorites");

    const staged = new Set(getState().stage.map((e) => gmView(e).actor?.id));
    let list = game.actors.contents.filter((a) => !staged.has(a.id));
    // Empty search = your favorites; typing searches every actor.
    list = q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list.filter((a) => isFavorite(a));
    list.sort((a, b) => Number(isFavorite(b)) - Number(isFavorite(a)) || a.name.localeCompare(b.name));

    const rows = list.slice(0, MAX_RESULTS).map((a) => {
      const fav = isFavorite(a);
      const li = document.createElement("li");
      li.dataset.id = a.id;
      const star = iconButton("toggleFavorite", "fa-star", fav ? t("Unfavorite") : t("Favorite"), fav ? "fa-solid" : "fa-regular");
      star.classList.add("ss-star");
      star.classList.toggle("is-fav", fav);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-row-main";
      btn.dataset.action = "stageActor";
      btn.title = t("Add");
      btn.textContent = a.name;
      li.append(star, btn, iconButton("stageHidden", "fa-user-secret", t("AddHidden")));
      return li;
    });

    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "ss-hint";
      li.textContent = q ? t("NoResults") : t("NoFavorites");
      rows.push(li);
    }
    this.#results.replaceChildren(...rows);
  }

  /**
   * Drop an actor (or token) from the sidebar anywhere on the panel to add it to the stage.
   * Hold Shift while dropping to add it as unknown (silhouette).
   */
  #bindDrop(root) {
    let depth = 0; // dragenter/dragleave also fire for every child element, so count them
    const carriesData = (ev) => ev.dataTransfer?.types?.includes("text/plain");
    const off = () => {
      depth = 0;
      root.classList.remove("ss-dropping", "ss-dropping-unknown");
    };
    root.addEventListener("dragenter", (ev) => {
      if (!carriesData(ev)) return;
      ev.preventDefault();
      depth++;
      root.classList.add("ss-dropping");
    });
    root.addEventListener("dragover", (ev) => {
      if (!carriesData(ev)) return;
      ev.preventDefault(); // required, or the browser refuses the drop
      ev.dataTransfer.dropEffect = "copy";
      root.classList.toggle("ss-dropping-unknown", ev.shiftKey);
    });
    root.addEventListener("dragleave", () => {
      if (--depth <= 0) off();
    });
    root.addEventListener("drop", async (ev) => {
      if (!carriesData(ev)) return;
      ev.preventDefault();
      const asUnknown = ev.shiftKey;
      off();
      try {
        const actor = await actorFromDrop(readDragData(ev));
        if (actor) await Stage.add(actor, { hidden: asUnknown });
      } catch (err) {
        console.warn(`${ID} | could not add the dropped actor`, err);
      }
    });
  }
}

function iconButton(action, icon, title, style = "fa-solid") {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.action = action;
  b.title = title;
  b.innerHTML = `<i class="${style} ${icon}"></i>`;
  return b;
}
