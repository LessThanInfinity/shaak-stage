import { ID, Stage, getState, gmView } from "./state.mjs";

/**
 * GM quick-swap strip: a slim column of the staged characters, always on screen, so changing
 * speaker is one click instead of opening the panel.
 *   click       = speak / dismiss
 *   right-click = hide identity / reveal
 * Sits on the opposite side of the screen from the portrait. GM only.
 */

let el;

export function mount() {
  if (!game.user.isGM) return;
  el = document.createElement("div");
  el.id = "shaak-strip";
  el.hidden = true;
  document.body.append(el);
  el.addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-id]");
    if (chip) Stage.speak(chip.dataset.id);
  });
  el.addEventListener("contextmenu", (ev) => {
    const chip = ev.target.closest("[data-id]");
    if (!chip) return;
    ev.preventDefault();
    Stage.toggleHidden(chip.dataset.id);
  });
  paint(getState());
}

export function paint(state) {
  if (!el) return;
  const { stage, speaker } = state;
  el.hidden = !game.settings.get(ID, "strip") || !stage.length;
  if (el.hidden) return;

  el.dataset.side = game.settings.get(ID, "side") === "right" ? "left" : "right";
  const thumbs = game.settings.get(ID, "thumbs");
  el.replaceChildren(
    ...stage.map((e, i) => {
      const view = gmView(e);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ss-chip";
      chip.classList.toggle("active", e.id === speaker);
      chip.classList.toggle("is-unknown", !!e.hidden);
      chip.dataset.id = e.id;
      chip.title = `${i + 1}. ${view.name}`;
      if (thumbs && view.img) {
        const im = document.createElement("img");
        im.src = view.img;
        im.alt = "";
        im.loading = "lazy";
        im.decoding = "async";
        im.draggable = false;
        chip.append(im);
      } else {
        const ini = document.createElement("span");
        ini.className = "ss-chip-initial";
        ini.textContent = view.name.slice(0, 1).toUpperCase();
        chip.append(ini);
      }
      const num = document.createElement("span");
      num.className = "ss-chip-num";
      num.textContent = String(i + 1);
      chip.append(num);
      return chip;
    })
  );
}
