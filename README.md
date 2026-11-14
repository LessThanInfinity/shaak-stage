# Shaak Stage

Show a character's art on the side of the screen while they speak, visual-novel style. The GM chooses who is on stage and who is speaking; everyone sees it. Built to be light: no canvas layer, no PIXI, no libWrapper or socketlib, just a few DOM images.

Targets Foundry VTT v13. Early release (v0.1.0): developed against a stubbed Foundry API, so expect rough edges; v14 has not been tested.

## Install

In Foundry: **Add-on Modules → Install Module → Manifest URL**:

```
https://github.com/LessThanInfinity/shaak-stage/releases/latest/download/module.json
```

## Use

1. Click the mask icon in the **Token** controls (left toolbar) to open the Stage panel (GM only).
2. Search for an actor and click it to put them on stage. The spy icon adds them as **unknown** (a black silhouette and "???" for players).
3. Click a staged character to make them speak; click again to dismiss. A slim strip of avatars also stays on screen for quick swaps (click = speak, right-click = hide/reveal).
4. Save whole stages as **presets**.

Uses each actor's portrait image. Cut-outs with transparent backgrounds work best: portraits are sized by their visible area so every character stands the same height.

Optional flags on an actor: `shaak-stage.art` (a different stage image path) and `shaak-stage.scale` (size multiplier, e.g. `1.3`).

Hotkeys exist for stage slots 1–9, dismiss and toggle panel, all unbound by default (Configure Controls).

Settings include the style (Persona, Ruby Phoenix, Ink & Seal, Classic), portrait side and size, and how many lineup characters to show. See [ROADMAP.md](ROADMAP.md) for plans and known limits.

## Developing

`dev/preview.html` runs the real scripts against a stub of Foundry's API: `python dev/serve.py`, then open http://localhost:8124/dev/preview.html. Put test art in `dev/samples/` (git-ignored).
