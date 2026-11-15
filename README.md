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
3. Click a staged character to make them speak. Clicking the current speaker again does nothing, so a stray double-click can't hide them; use the dismiss button (speech-bubble icon) to clear the speaker. A slim strip of avatars also stays on screen for quick swaps (click = speak, right-click = hide/reveal, bottom icon = dismiss).
4. Save whole stages as **presets**.

Uses each actor's portrait image. Cut-outs with transparent backgrounds work best: portraits are sized by their visible area so every character stands the same height.

### A thin light line around a character?

Some background-removal tools leave a 1-2px fringe of the original background colour along the outline, which shows as a faint light line on dark maps. It's in the image, so the module cleans it for you:

- **Automatic:** the first time an actor is staged, the module makes one cleaned copy of their image and uses it from then on. Your original image is never changed or replaced.
- **One file per actor:** saved as `<actor id>.png` in a single folder, by default `worlds/<your world>/shaak-stage-clean` (created for you). Re-cleaning overwrites that file, so nothing piles up. Change the folder with the **Cleaned images folder** setting.
- **Reuse:** if a cleaned copy already exists for the actor's current image it is used as is. If you change the actor's image, it's cleaned again.
- **Manual re-clean:** hover a staged character's tile and press the wand button. From a macro: `game.modules.get("shaak-stage").api.Stage.cleanActor(actor)`.
- **If anything goes wrong** (upload blocked, image unreadable, hosting that doesn't allow uploads) you get a warning and the actor's normal image is used. Cleaning can never stop a character from being staged.
- Turn automatic cleaning off with **Clean images automatically**; existing cleaned copies are still used, and the wand button still works.

Limits: art hosted on another website can't be cleaned (the browser blocks it), and deleting an actor leaves its cleaned file behind in that folder.

There's also an offline batch tool, `tools/clean_edges.py`, if you'd rather clean a whole folder yourself (needs `pip install pillow numpy`). The module doesn't pick its output up automatically:

```
python tools/clean_edges.py "path/to/image.png" "path/to/folder" --out "path/to/clean"
```

Optional flags on an actor: `shaak-stage.art` (a different stage image path) and `shaak-stage.scale` (size multiplier, e.g. `1.3`).

Hotkeys exist for stage slots 1–9, dismiss and toggle panel, all unbound by default (Configure Controls).

Settings include the style (Persona, Ruby Phoenix, Ink & Seal, Classic), portrait side and size, and how many lineup characters to show. See [ROADMAP.md](ROADMAP.md) for plans and known limits.

## Developing

`dev/preview.html` runs the real scripts against a stub of Foundry's API: `python dev/serve.py`, then open http://localhost:8124/dev/preview.html. Put test art in `dev/samples/` (git-ignored).
