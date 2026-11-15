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
    id, name, img: img ?? art(name, hue), hasPlayerOwner: pc, flags,
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    async setFlag(scope, key, value) { flags[`${scope}.${key}`] = structuredClone(value); return this; }
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

window.__notes = [];
const note = (level) => (m) => { window.__notes.push(`${level}: ${m}`); console.log("[notify]", level, m); };
window.ui = { notifications: { info: note("info"), warn: note("warn"), error: note("error") } };

// Stand-in for Foundry's FilePicker: uploads are POSTed to dev/serve.py, which writes them under dev/.
// Like the real thing it refuses to upload into a folder that doesn't exist yet. Tests can set
// window.__failUploads = true to simulate a server that rejects uploads.
const madeDirs = new Set();
window.__uploadLog = [];
const FilePicker = {
  async createDirectory(source, target) { madeDirs.add(target); window.__uploadLog.push(`mkdir ${target}`); },
  async upload(source, dir, file) {
    window.__uploadLog.push(`upload ${dir}/${file.name}`);
    if (window.__failUploads) throw new Error("server rejected the upload");
    if (!madeDirs.has(dir)) throw new Error(`no such directory: ${dir}`);
    const res = await fetch(`/dev/__upload?path=${encodeURIComponent(`${dir}/${file.name}`)}`, { method: "POST", body: file });
    if (!res.ok) throw new Error("upload http " + res.status);
    return { status: "success", path: `${dir}/${file.name}` };
  }
};

window.game = {
  user: { isGM: true },
  world: { id: "test" },
  i18n: {
    localize: lookup,
    format: (k, d) => lookup(k).replace(/\{(\w+)\}/g, (m, n) => d?.[n] ?? m)
  },
  actors: { contents: actors, get: (id) => actors.find((a) => a.id === id) },
  modules: { get: () => ({}) },
  keybindings: { register() {} },
  settings: {
    register(m, k, data) { defs.set(key(m, k), data); store.set(key(m, k), structuredClone(data.default)); },
    get: (m, k) => store.get(key(m, k)),
    async set(m, k, v) { store.set(key(m, k), structuredClone(v)); defs.get(key(m, k))?.onChange?.(v); return v; }
  }
};

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  #el = null;
  get rendered() { return !!this.#el; }
  async render() {
    if (this.#el) return this;
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
    return this;
  }
  async close() { this.#el?.remove(); this.#el = null; }
}

window.foundry = {
  utils: {
    deepClone: (o) => structuredClone(o),
    randomID: () => Math.random().toString(36).slice(2, 18).padEnd(16, "x"),
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  },
  data: { fields: { NumberField: class { constructor(o) { Object.assign(this, o); } } } },
  applications: {
    apps: { FilePicker: { implementation: FilePicker } },
    api: {
      ApplicationV2,
      // Real Foundry shows a dialog; the harness just answers with a preset name.
      DialogV2: { prompt: async () => `Tournament finals ${new Date().getSeconds()}` }
    }
  }
};
