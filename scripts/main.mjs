import { ID, Stage, getState } from "./state.mjs";
import * as Overlay from "./overlay.mjs";
import * as Strip from "./strip.mjs";
import { refreshSidebar } from "./sidebar.mjs";
import { StagePanel } from "./panel.mjs";

let panel;
const getPanel = () => (panel ??= new StagePanel());

function onStateChange() {
  const s = getState();
  Overlay.paint(s);
  Strip.paint(s);
  panel?.paint();
}

Hooks.once("init", () => {
  /* ---- shared state (GM writes; everyone receives it via the normal settings sync) ---- */
  game.settings.register(ID, "state", {
    scope: "world",
    config: false,
    type: Object,
    default: { stage: [], speaker: null, lineup: true },
    onChange: onStateChange
  });

  // GM-only private data (slot -> actor map, presets). Client scope = never sent to players.
  game.settings.register(ID, "gm", {
    scope: "client",
    config: false,
    type: Object,
    default: { map: {}, presets: [] },
    onChange: () => {
      panel?.paint();
      Strip.paint(getState());
    }
  });

  /* ---- look & feel (GM sets it, everyone sees it) ---- */
  game.settings.register(ID, "style", {
    name: "SHAAKSTAGE.Settings.Style.Name",
    hint: "SHAAKSTAGE.Settings.Style.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      persona: "SHAAKSTAGE.Settings.Style.Persona",
      phoenix: "SHAAKSTAGE.Settings.Style.Phoenix",
      ink: "SHAAKSTAGE.Settings.Style.Ink",
      classic: "SHAAKSTAGE.Settings.Style.Classic"
    },
    default: "persona",
    onChange: () => Overlay.applySettings()
  });

  game.settings.register(ID, "preferClean", {
    name: "SHAAKSTAGE.Settings.PreferClean.Name",
    hint: "SHAAKSTAGE.Settings.PreferClean.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  /* ---- per-client options ---- */
  game.settings.register(ID, "enabled", {
    name: "SHAAKSTAGE.Settings.Enabled.Name",
    hint: "SHAAKSTAGE.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: onStateChange
  });
  game.settings.register(ID, "side", {
    name: "SHAAKSTAGE.Settings.Side.Name",
    hint: "SHAAKSTAGE.Settings.Side.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      right: "SHAAKSTAGE.Settings.Side.Right",
      left: "SHAAKSTAGE.Settings.Side.Left"
    },
    default: "right",
    onChange: () => {
      Overlay.applySettings();
      Strip.paint(getState());
    }
  });
  game.settings.register(ID, "size", {
    name: "SHAAKSTAGE.Settings.Size.Name",
    hint: "SHAAKSTAGE.Settings.Size.Hint",
    scope: "client",
    config: true,
    type: new foundry.data.fields.NumberField({ min: 30, max: 100, step: 5, integer: true, initial: 70 }),
    default: 70,
    onChange: () => Overlay.applySettings()
  });
  game.settings.register(ID, "lineupMax", {
    name: "SHAAKSTAGE.Settings.LineupMax.Name",
    hint: "SHAAKSTAGE.Settings.LineupMax.Hint",
    scope: "client",
    config: true,
    type: new foundry.data.fields.NumberField({ min: 0, max: 5, step: 1, integer: true, initial: 3 }),
    default: 3,
    onChange: onStateChange
  });
  game.settings.register(ID, "thumbs", {
    name: "SHAAKSTAGE.Settings.Thumbs.Name",
    hint: "SHAAKSTAGE.Settings.Thumbs.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      panel?.paint();
      Strip.paint(getState());
    }
  });
  game.settings.register(ID, "strip", {
    name: "SHAAKSTAGE.Settings.Strip.Name",
    hint: "SHAAKSTAGE.Settings.Strip.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => Strip.paint(getState())
  });

  /* ---- hotkeys: all UNBOUND by default so nothing clashes; bind what you want in Configure Controls ---- */
  game.keybindings.register(ID, "toggle", {
    name: "SHAAKSTAGE.Keys.Toggle",
    editable: [],
    restricted: true,
    onDown: () => {
      getPanel().toggle();
      return true;
    }
  });
  game.keybindings.register(ID, "dismiss", {
    name: "SHAAKSTAGE.Keys.Dismiss",
    editable: [],
    restricted: true,
    onDown: () => {
      Stage.dismiss();
      return true;
    }
  });
  for (let n = 1; n <= 9; n++) {
    game.keybindings.register(ID, `slot${n}`, {
      name: `SHAAKSTAGE.Keys.Slot${n}`,
      editable: [],
      restricted: true,
      onDown: () => {
        Stage.speakIndex(n - 1);
        return true;
      }
    });
  }
});

Hooks.once("ready", () => {
  Overlay.mount();
  Strip.mount();
  Overlay.paint(getState());
  // Handy for macros: game.modules.get("shaak-stage").api.Stage.speakIndex(0)
  game.modules.get(ID).api = { Stage, openPanel: () => getPanel().render({ force: true }) };
});

// Sidebar collapse/expand: re-measure once it has finished animating (cheap; no per-frame work).
Hooks.on("collapseSidebar", () => {
  setTimeout(refreshSidebar, 50);
  setTimeout(refreshSidebar, 400);
});

// GM button in the Token controls (left toolbar).
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const tokens = controls.tokens ?? controls.token;
  if (!tokens?.tools) return;
  tokens.tools[ID] = {
    name: ID,
    order: Object.keys(tokens.tools).length,
    title: "SHAAKSTAGE.ControlTitle",
    icon: "fa-solid fa-masks-theater",
    button: true,
    visible: true,
    onChange: () => getPanel().toggle()
  };
});
