// Minimal Foundry stand-in so the module's real scripts can run in a plain browser tab.
// Dev-only: not loaded by module.json.

const hooks = new Map();
window.Hooks = {
  once(name, fn) { (hooks.get(name) ?? hooks.set(name, []).get(name)).push(fn); },
  on(name, fn) { (hooks.get(name) ?? hooks.set(name, []).get(name)).push(fn); },
  call(name, ...args) { (hooks.get(name) ?? []).forEach((fn) => fn(...args)); }
};

const lang = await (await fetch("../lang/en.json")).json();
const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], lang) ?? key;

const store = new Map();
const defs = new Map();
const key = (m, k) => `${m}.${k}`;

// Fake art: simple bust silhouettes on coloured backgrounds.
function art(name, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${hue},60%,28%)"/></linearGradient></defs>
    <path d="M40 900 C40 640 160 560 300 560 C440 560 560 640 560 900Z" fill="url(#g)" stroke="#111" stroke-width="10"/>
    <ellipse cx="300" cy="330" rx="150" ry="190" fill="hsl(${hue},45%,80%)" stroke="#111" stroke-width="10"/>
    <path d="M140 300 C150 120 450 120 460 300 C400 220 200 220 140 300Z" fill="hsl(${(hue + 40) % 360},50%,30%)" stroke="#111" stroke-width="10"/>
    <text x="300" y="840" text-anchor="middle" font-size="64" font-family="sans-serif" fill="#fff" stroke="#000" stroke-width="3">${name}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
const mk = (id, name, hue, pc, img) => {
  const flags = {};
  return {
    documentName: "Actor",
    id, name, img: img ?? art(name, hue), hasPlayerOwner: pc, flags,
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    // Like Foundry, changing a flag fires the updateActor hook with the changed data.
    async setFlag(scope, key, value) {
      flags[`${scope}.${key}`] = structuredClone(value);
      Hooks.call("updateActor", this, { flags: { [scope]: { [key]: value } } });
      return this;
    },
    async unsetFlag(scope, key) {
      delete flags[`${scope}.${key}`];
      Hooks.call("updateActor", this, { flags: { [scope]: { [`-=${key}`]: null } } });
      return this;
    }
  };
};
// Real cutouts live in dev/samples (git-ignored); the rest fall back to generated art.
const actors = [
  mk("a1", "Armiger Katya", 0, true, "samples/katya.png"),
  mk("a2", "Lictor Vrane", 0, true, "samples/vrane.png"),
  mk("a3", "Maralictor Thorn", 0, true, "samples/thorn.png"),
  mk("a4", "Sinifier Moross", 0, false, "samples/moross.png"),
  mk("a5", "Silvius", 0, false, "samples/silvius.png"),
  mk("a6", "Squall", 0, false, "samples/squall.png"),
  mk("a7", "General Kaso Hida", 0, true, "samples/kaso.png")
];

// Things a user could drop on the panel besides a normal world actor (see the drop tests).
const compendiumActor = { documentName: "Actor", id: "c1", name: "Goblin (compendium)", pack: "pf2e.bestiary", img: "samples/squall.png" };
const syntheticActor = { documentName: "Actor", id: "a2", name: "Lictor Vrane (token copy)", img: "samples/vrane.png" }; // unlinked token's actor
const uuidTable = {
  "Compendium.pf2e.bestiary.Actor.c1": () => compendiumActor,
  "Scene.s1.Token.t1": () => ({ documentName: "Token", actor: syntheticActor }),
  "JournalEntry.j1": () => ({ documentName: "JournalEntry", id: "j1", name: "Some journal" })
};
window.fromUuid = async (uuid) => {
  if (uuid.startsWith("Actor.")) return game.actors.get(uuid.slice(6)) ?? null;
  return uuidTable[uuid]?.() ?? null;
};

window.__notes = [];
const note = (level) => (m) => { window.__notes.push(`${level}: ${m}`); console.log("[notify]", level, m); };
window.ui = { notifications: { info: note("info"), warn: note("warn"), error: note("error") } };

window.game = {
  user: { isGM: true },
  world: { id: "test" },
  i18n: {
    localize: lookup,
    format: (k, d) => lookup(k).replace(/\{(\w+)\}/g, (m, n) => d?.[n] ?? m)
  },
  actors: { contents: actors, get: (id) => actors.find((a) => a.id === id) },
  // One persistent object per module id, like Foundry (the module stores its `api` on it).
  modules: { _m: {}, get(id) { return (this._m[id] ??= {}); } },
  keybindings: { register() {} },
  settings: {
    register(m, k, data) { defs.set(key(m, k), data); store.set(key(m, k), structuredClone(data.default)); },
    get: (m, k) => store.get(key(m, k)),
    async set(m, k, v) { store.set(key(m, k), structuredClone(v)); defs.get(key(m, k))?.onChange?.(v); return v; }
  }
};

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  // Follows Foundry v13's real render sequence (client/applications/api/application.mjs):
  //   state RENDERING -> _renderHTML -> _replaceHTML -> state RENDERED -> _onRender.
  // `rendered` is therefore FALSE while _replaceHTML runs. An earlier version of this stub flipped it
  // to true too soon, which hid a bug where the panel skipped its first paint.
  #el = null;
  #state = "NONE";
  get rendered() { return this.#state === "RENDERED"; }
  async render() {
    if (this.#el) return this;
    this.#state = "RENDERING";
    const o = this.constructor.DEFAULT_OPTIONS;
    const el = document.createElement("div");
    el.className = "window-app application " + (o.classes ?? []).join(" ");
    Object.assign(el.style, { position: "fixed", left: "20px", top: "20px", width: o.position.width + "px",
      height: o.position.height + "px", zIndex: 100, background: "#2b2a2a", color: "#ddd", border: "1px solid #000",
      display: "flex", flexDirection: "column", font: "14px sans-serif", borderRadius: "6px" });
    el.innerHTML = `<header class="window-header" style="padding:6px 10px;background:#111;display:flex;justify-content:space-between">
      <span>${lookup(o.window.title.replace(/^SHAAKSTAGE\./, "SHAAKSTAGE."))}</span><a data-close style="cursor:pointer">✕</a></header>
      <section class="window-content" style="flex:1;min-height:0;display:flex;flex-direction:column"></section>`;
    document.body.append(el);
    this.#el = el;
    el.querySelector("[data-close]").onclick = () => this.close();
    el.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-action]");
      const fn = t && o.actions?.[t.dataset.action];
      if (fn) fn.call(this, ev, t);
    });
    const html = await this._renderHTML({}, {});
    this._replaceHTML(html, el.querySelector(".window-content"), {});
    this.#state = "RENDERED";
    await this._onRender({}, {});
    return this;
  }
  _onRender() {}
  _onClose() {}
  async close() {
    this.#state = "CLOSING";
    this.#el?.remove();
    this.#el = null;
    this.#state = "CLOSED";
    this._onClose({});
  }
}

window.foundry = {
  utils: {
    deepClone: (o) => structuredClone(o),
    randomID: () => Math.random().toString(36).slice(2, 18).padEnd(16, "x"),
    hasProperty: (obj, path) => path.split(".").reduce((o, k) => (o != null && k in Object(o) ? o[k] : undefined), obj) !== undefined,
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  },
  data: { fields: { NumberField: class { constructor(o) { Object.assign(this, o); } } } },
  applications: {
    ux: {
      TextEditor: {
        implementation: {
          // Same job as Foundry's: read the JSON a dragged document carries.
          getDragEventData(ev) {
            try { return JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return {}; }
          }
        }
      }
    },
    api: {
      ApplicationV2,
      // Real Foundry shows a dialog; the harness just answers with a preset name.
      DialogV2: { prompt: async () => `Tournament finals ${new Date().getSeconds()}` }
    }
  }
};
