import { ID, Stage, getState, gmView } from "./state.mjs";
import { onSidebar } from "./sidebar.mjs";

/**
 * GM quick-swap strip: a slim column of the staged characters, always on screen, so changing
 * speaker is one click instead of opening the panel.
 *   top icon    = open / close the Stage panel
 *   click       = speak (clicking the current speaker again does nothing)
 *   right-click = hide identity / reveal
 *   bottom icon = dismiss the speaker
 * Sits on the opposite side of the screen from the portrait. GM only. Stays visible when the stage
 * is empty (just the open icon) so the panel is always one click away.
 */

let el;
let offset = 0;

function applyOffset() {
  if (!el) return;
  el.style.transform = el.dataset.side === "right" && offset ? `translateX(${-offset}px)` : "";
}

const togglePanel = () => game.modules.get(ID)?.api?.togglePanel?.();

export function mount() {
  if (!game.user.isGM) return;
  el = document.createElement("div");
  el.id = "shaak-strip";
  el.hidden = true;
  document.body.append(el);
  onSidebar((o) => {
    offset = o;
    applyOffset();
  });
  el.addEventListener("click", (ev) => {
    if (ev.target.closest(".ss-chip-open")) return togglePanel();
    if (ev.target.closest(".ss-chip-dismiss")) return Stage.dismiss();
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

function specialButton(cls, icon, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `ss-chip ${cls}`;
  b.title = title;
  b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  return b;
}

export function paint(state) {
  if (!el) return;
  const { stage, speaker } = state;
  el.hidden = !game.settings.get(ID, "strip");
  if (el.hidden) return;

  el.dataset.side = game.settings.get(ID, "side") === "right" ? "left" : "right";
  applyOffset();
  const thumbs = game.settings.get(ID, "thumbs");

  const open = specialButton("ss-chip-open", "fa-masks-theater", game.i18n.localize("SHAAKSTAGE.OpenPanel"));

  const chips = stage.map((e, i) => {
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
  });

  const items = [open, ...chips];
  if (stage.length) {
    const dismiss = specialButton("ss-chip-dismiss", "fa-comment-slash", game.i18n.localize("SHAAKSTAGE.Dismiss"));
    dismiss.disabled = !speaker;
    items.push(dismiss);
  }
  el.replaceChildren(...items);
}
