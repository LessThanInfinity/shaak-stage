# Shaak Stage

Show a character's art on the side of the screen while they speak, visual-novel style. The GM chooses who is on stage and who is speaking; everyone sees it. Built to be light: no canvas layer, no PIXI, no libWrapper or socketlib, just a few DOM images.

Targets Foundry VTT v13. Early release (v0.1.0): developed against a stubbed Foundry API, so expect rough edges; v14 has not been tested.

## Install

In Foundry: **Add-on Modules → Install Module → Manifest URL**:

```
https://github.com/LessThanInfinity/shaak-stage/releases/latest/download/module.json
```

## Use

1. Open the Stage panel (GM only) with the mask icon at the top of the on-screen strip of circles, or the mask icon in the **Token** controls (left toolbar).
2. Put actors on stage by **dragging them from the Actors sidebar onto the Stage panel** (a dragged token works too), or click an actor in the panel's list. **Hold Shift while dropping** (or use the spy icon) to add them as **unknown** (a black silhouette and "???" for players). Only world actors can be staged, so import compendium actors first.
3. **Favorites:** press the star on an actor (in the list, or on a staged tile) to keep them handy. With an empty search box the list shows your favorites; typing searches every actor. Favorites are saved on the actor.
4. Click a staged character to make them speak. Clicking the current speaker again does nothing, so a stray double-click can't hide them; use the dismiss button (speech-bubble icon) to clear the speaker. The strip of circles stays on screen for quick swaps (top icon = open the panel, click a circle = speak, right-click = hide/reveal, bottom icon = dismiss).
5. **Display** section of the panel: style, side and size, plus **Show names** (off = image only, no name plate) and the lineup. Style, names and lineup change what everyone sees; side and size only change your own screen.
6. Save whole stages as **presets**.

Stage tiles in the panel have a maximum size, so widening the window fits more of them on one line.

Uses each actor's portrait image. Cut-outs with transparent backgrounds work best: portraits are sized by their visible area so every character stands the same height.

Optional flags on an actor: `shaak-stage.art` (a different stage image path) and `shaak-stage.scale` (size multiplier, e.g. `1.3`).

Hotkeys exist for stage slots 1–9, dismiss and toggle panel, all unbound by default (Configure Controls).

Settings include the style (Persona, Ruby Phoenix, Ink & Seal, Classic), portrait side and size, and how many lineup characters to show. See [ROADMAP.md](ROADMAP.md) for plans and known limits.

## Developing

`dev/preview.html` runs the real scripts against a stub of Foundry's API: `python dev/serve.py`, then open http://localhost:8124/dev/preview.html. Put test art in `dev/samples/` (git-ignored).
