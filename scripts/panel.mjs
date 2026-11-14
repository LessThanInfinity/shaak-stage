import { ID, Stage, getState, gmView } from "./state.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const t = (k) => game.i18n.localize(`SHAAKSTAGE.${k}`);
const MAX_RESULTS = 40;

/**
 * GM control panel. Plain DOM (no Handlebars, no full re-render on state changes):
 * the skeleton is built once; only the stage grid, preset list and result list are repainted.
 */
export class StagePanel extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "shaak-stage-panel",
    classes: ["shaak-stage-panel"],
    window: { title: "SHAAKSTAGE.Title", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 360, height: 620 },
    actions: {
      speak: StagePanel.#speak,
      toggleHidden: StagePanel.#toggleHidden,
      remove: StagePanel.#remove,
      stageActor: StagePanel.#stageActor,
      stageHidden: StagePanel.#stageHidden,
      dismiss: StagePanel.#dismiss,
      clearStage: StagePanel.#clearStage,
      toggleLineup: StagePanel.#toggleLineup,
      savePreset: StagePanel.#savePreset,
      loadPreset: StagePanel.#loadPreset,
      deletePreset: StagePanel.#deletePreset
    }
  };

  #grid;
  #results;
  #presets;
  #input;
  #lineupBtn;

  static #id = (target) => target.closest("[data-id]")?.dataset.id;
  static #speak(event, target) {
    Stage.speak(StagePanel.#id(target));
  }
  static #toggleHidden(event, target) {
    Stage.toggleHidden(StagePanel.#id(target));
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
  static #toggleLineup() {
    Stage.setLineup(!getState().lineup);
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
    root.innerHTML = `
      <section class="ss-stage">
        <header>
          <h3>${t("OnStage")}</h3>
          <div class="ss-toolbar">
            <button type="button" data-action="toggleLineup" title="${t("Lineup")}"><i class="fa-solid fa-people-line"></i></button>
            <button type="button" data-action="dismiss" title="${t("Dismiss")}"><i class="fa-solid fa-comment-slash"></i></button>
            <button type="button" data-action="clearStage" title="${t("ClearStage")}"><i class="fa-solid fa-broom"></i></button>
          </div>
        </header>
        <div class="ss-grid"></div>
      </section>
      <details class="ss-presets">
        <summary>${t("Presets")}</summary>
        <ul class="ss-preset-list"></ul>
        <button type="button" class="ss-save" data-action="savePreset"><i class="fa-solid fa-floppy-disk"></i> ${t("SavePreset")}</button>
      </details>
      <section class="ss-search">
        <input type="search" placeholder="${t("SearchPlaceholder")}" autocomplete="off">
        <ul class="ss-results"></ul>
      </section>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this.#grid = result.querySelector(".ss-grid");
    this.#results = result.querySelector(".ss-results");
    this.#presets = result.querySelector(".ss-preset-list");
    this.#input = result.querySelector("input");
    this.#lineupBtn = result.querySelector("[data-action=toggleLineup]");
    this.#input.addEventListener("input", foundry.utils.debounce(() => this.#paintResults(), 120));
    this.paint();
  }

  /** Called by main.mjs whenever the shared state changes. */
  paint() {
    if (!this.rendered) return;
    this.#paintStage();
    this.#paintPresets();
    this.#paintResults();
  }

  #paintStage() {
    const { stage, speaker, lineup } = getState();
    this.#lineupBtn.classList.toggle("active", lineup);
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
          iconButton("toggleHidden", e.hidden ? "fa-eye-slash" : "fa-eye", e.hidden ? t("Reveal") : t("Hide")),
          iconButton("remove", "fa-xmark", t("Remove"))
        );
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

  #paintResults() {
    const q = this.#input.value.trim().toLowerCase();
    const gmMap = new Set(getState().stage.map((e) => gmView(e).actor?.id));
    let list = game.actors.contents.filter((a) => !gmMap.has(a.id));
    list = q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list.filter((a) => a.hasPlayerOwner);
    list.sort((a, b) => a.name.localeCompare(b.name));

    const rows = list.slice(0, MAX_RESULTS).map((a) => {
      const li = document.createElement("li");
      li.dataset.id = a.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-row-main";
      btn.dataset.action = "stageActor";
      btn.title = t("Add");
      btn.textContent = a.name;
      li.append(btn, iconButton("stageHidden", "fa-user-secret", t("AddHidden")));
      return li;
    });

    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "ss-hint";
      li.textContent = t("NoResults");
      rows.push(li);
    } else if (!q) {
      const li = document.createElement("li");
      li.className = "ss-hint";
      li.textContent = t("SearchHint");
      rows.unshift(li);
    }
    this.#results.replaceChildren(...rows);
  }
}

function iconButton(action, icon, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.action = action;
  b.title = title;
  b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  return b;
}
