# CRPG Parallel Deployment

## Goal

Ship a new CRPG version without changing the current FPS runtime behavior or deployment channel.

## Isolation Model

- FPS track (existing): web runtime in `index.html`, `js/`, and `css/`.
- CRPG track (new): Godot runtime scene in `godot/scenes/crpg/CrpgMain.tscn` and `godot/scripts/crpg/`.
- Shared narrative contract: `shared/game-data/story.v1.json`.
- Godot mirror of shared contract: `godot/data/shared/story.v1.json`.

## Guardrails

- `npm run check:fps:baseline`
  - Hash checks for FPS runtime files listed in `shared/fps-baseline.hashes.json`.
- `npm run check:boundaries`
  - Prevents direct coupling between FPS runtime and Godot runtime paths.
- `npm run shared:validate-story`
  - Validates shared story contract shape and mirror sync.

## Build/Run Commands

- FPS verification lane:
  - `npm run fps:check`
- CRPG verification lane:
  - `npm run crpg:check`
- CRPG runtime launch:
  - `npm run crpg:run`

## Data Contracts

- Story schema: `shared/game-data/story.schema.json`
- Save schema: `shared/game-data/savegame.schema.json`
- Release manifest schema: `shared/game-data/crpg_release_manifest.schema.json`

## Packaging

- Build artifacts should be staged in `dist/crpg/`.
- Generate release manifest:
  - `npm run crpg:package -- <version> <platform> [artifact_dir]`
- Output:
  - `dist/crpg/crpg_release_manifest_v1_<platform>.json`

## Current Vertical Slice Scope

The prototype CRPG scene currently supports:

- Isometric click-to-move navigation.
- Three-zone progression labels (Crash Site, Village, VC Camp).
- Quest-state flow for:
  - `aftershock`
  - `hearts_of_the_village`
  - `rescue`
- Companion state update for Rodriguez.
- Save/load slot flow (`F5`/`F9`).

## Non-Goals In This Iteration

- No FPS runtime code moves.
- No changes to existing FPS web entrypoint.
- No automatic desktop export pipeline yet; this iteration adds packaging manifest generation after export artifacts are produced.
