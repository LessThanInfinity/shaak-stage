# Shaak Stage – roadmap & ideas

## Done (v0.1)
- Stage panel (search actors, stage them, click to speak)
- Visible-area sizing so every character is the same on-screen height
- Secure "unknown" mode: players receive a pre-rendered black silhouette, never the real image path, name or actor id
- Reveal animation (silhouette cross-fades into the real art)
- Presets (save / load / delete a whole stage)
- Built-in edge cleanup (one cleaned file per actor, designated folder, manual re-clean, safe fallbacks)
- Quick-swap strip (click = speak, right-click = hide/reveal)
- Lineup mode (speaker large; the rest of the stage dimmed and smaller beside them)
- Style presets: Persona, Ruby Phoenix, Ink & Seal, Classic
- Optional hotkeys (slot 1–9, dismiss, toggle panel) – all unbound by default so nothing clashes

## Phase 2 (planned)
- **Faster staging**: drag an actor from the sidebar onto the panel; right-click an actor or token → "Add to stage" (and "Add as unknown").

## Future ideas (not planned yet)
- **Expression variants**: a few alternate images per actor (angry, hurt, smug…) cycled with a key or a small picker. Deliberately left out for now.
- **Stage art override UI**: a small field on the actor sheet for "stage image" and "scale" so you don't have to set the flags `shaak-stage.art` / `shaak-stage.scale` by hand. Only useful if an actor's portrait isn't what you want on stage.
- **Auto-load a preset when a scene activates.**
- **Clean up orphaned cleaned files** when an actor is deleted (the client can't delete files; would need a list-and-report helper).
- **Outline trim setting**: optionally shave 1px off every outline at render time for art that hasn't been cleaned (small GPU cost; also trims thin strands).
- **Hotkey defaults** once you know which keys are free at your table.
- **More styles / custom accent colour.**
- **Player-driven speaking** (a player clicks their own character; request goes to the GM). Skipped: Discord overlays cover this at the moment.

## Known limits
- Silhouettes of opaque (non-transparent) images come out as a black rectangle; use cut-outs for anything you may stage as unknown.
- Presets and the slot→actor map live in the GM's browser storage (client settings), so they don't follow you to a different browser. If a staged slot can't find its actor, remove it and add the actor again.
- Art changes are picked up when an actor is (re)staged, not live.
