# NAM: Echoes of the Jungle

First-person RPG-focused war drama set at the tail end of the Vietnam War.

You crash-land in rural southern Vietnam, search for surviving squadmates in different situations, and move together toward the nearest ARVN base.

## Release Status

Current release: `v0.1.0-staging`

This is a playable browser-game prototype and internal/staging release. It is not yet a final production benchmark: the Godot acceptance gate currently reports medium-preset FPS failures in `crash_site` and `clinic`, and headless Godot screenshot captures are not being recorded as release evidence.

Expected GitHub Pages URL after deployment:

```text
https://OliverBeerAsia.github.io/nam-echoes-of-the-jungle/
```

## Project Focus

- Prioritize quests, dialogue, trust, and consequence over nonstop gunfights.
- Build tension through navigation, scarcity, and uncertain alliances.
- Reward restraint, field decisions, and civilian outcomes (Civilian Trust).

## Documentation Map

- `docs/project-overview.md` - overview, goals, and gameplay references.
- `docs/design-and-aesthetic-standards.md` - visual, tone, UI, and narrative standards.
- `docs/world-mission-quests-levels.md` - setting, mission arc, quest structure, and level flow.
- `docs/narrative-beats.md` - quest-by-quest beat sheet and branch intent.
- `docs/graphics-overhaul-roadmap.md` - graphics rebuild milestones.
- `docs/comprehensive-world-design-overhaul-plan.md` - full environment/design execution plan across all zones.
- `docs/asset-pipeline.md` - model/texture pipeline conventions.
- `docs/godot-rebuild-implementation.md` - Godot 4 rebuild scaffold and data contracts.
- `docs/crpg-parallel-deployment.md` - CRPG release isolation and deployment lanes.
- `docs/historical-reference-guidelines.md` - authenticity constraints.
- `docs/performance-budgets.md` - performance targets and limits.
- `RELEASE_NOTES.md` - staged release notes and validation status.

## Local Run

Development mode (recommended):

```bash
npm ci
npm run dev
```

Production build and local preview:

```bash
npm run build
npm run preview
```

Open the local preview URL printed by Vite.

Asset manifest validation:

```bash
npm run validate:assets
npm run validate:assets:strict
```

Legacy static mode:

```bash
./start.sh
```

Open `http://localhost:8080`.

FPS safety checks:

```bash
npm run fps:check
```

This runs build/validation plus baseline hash and runtime boundary checks to prevent unintended FPS runtime drift during CRPG development.

## Godot Rebuild Prototype

The realism rebuild foundation now lives in `godot/`.

Run with Godot 4:

```bash
godot --path godot
```

Main scene:

- `godot/scenes/Main.tscn`

## CRPG Vertical Slice Prototype (Godot)

A separate CRPG scene now exists for isometric click-to-move gameplay and quest-state/saveload prototyping:

```bash
npm run shared:export-story
npm run crpg:run
```

CRPG scene:

- `godot/scenes/crpg/CrpgMain.tscn`

Controls:

- Left click: move
- `WASD`: keyboard move fallback
- `E`: interact
- `F5`: save slot 1
- `F9`: load slot 1

Calibration benchmark:

- `godot/scenes/benchmark/CalibrationLab.tscn`

Acceptance sweep (zone camera parity + performance report):

```bash
godot --path godot res://scenes/benchmark/ZoneAcceptanceBench.tscn
npm run validate:acceptance
```

Strict release gate:

```bash
npm run release:check
```

This gate must pass before calling a release production-ready. The current staging release intentionally does not claim that status.

## Deployment

The repository includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

On push to `main`, GitHub Actions will:

1. install dependencies with `npm ci`
2. run `npm run check:js`
3. run `npm run build`
4. run `npm run validate:assets:strict`
5. publish `dist/` to GitHub Pages

The workflow avoids the Godot strict acceptance gate so staging previews can be published while production-readiness blockers remain visible in release notes.
