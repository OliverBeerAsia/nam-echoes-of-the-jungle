# Godot Rebuild Implementation (Retro-Modern Visual Pass)

## Scope Implemented

This repo now includes a Godot 4 rebuild scaffold under `godot/` with the core interfaces and data contracts from the visual overhaul plan.

Implemented foundation:

- Godot project bootstrap (`godot/project.godot`).
- Main 3D scene with directional lighting, fog-ready environment, and debug first-person rig.
- Runtime quality preset system (`DataStore` + `GraphicsSettings`).
- Zone streaming manager that loads/unloads zone scenes by distance.
- Zone data contract wiring via JSON (`zones_index` + per-zone `zone_definition.json`).
- Zone scenes for all critical quest areas:
- crash_site
- village
- vc_camp
- clinic
- river_crossing
- hamlet
- arvn_outpost
- Generic proxy builder for rapid fallback/debug (`zone_scene.gd`) when needed.
- Calibration benchmark scene for material/lighting reference checks.
- Initial catalogs for environment assets, character profiles, and lighting profiles.

Implemented realism pass v6 (current):

- Crash site now uses a dedicated rebuild scene script (`crash_site_zone.gd`) instead of generic proxy-only rendering.
- Village, VC camp, clinic, river crossing, hamlet, and ARVN outpost also use dedicated rebuild scene scripts.
- Modular village kit builder (`village_modular_kit.gd`) with near/far LOD per major anchor.
- Modular VC camp kit builder (`vc_camp_modular_kit.gd`) with command bunker, radio post, watchtower, prison cage, and fortifications.
- Modular clinic kit builder (`clinic_modular_kit.gd`) with damaged mission shell, cache, ambulance wreck, and triage tent.
- Modular river crossing kit builder (`river_crossing_modular_kit.gd`) with water plane, dock platform, ferry posts, boat, rope winch, and lantern lighting.
- Modular hamlet kit builder (`hamlet_modular_kit.gd`) with stilt huts, market canopy, domestic clutter, and firelight.
- Modular ARVN outpost kit builder (`arvn_outpost_modular_kit.gd`) with gate, command post, watch tower, barriers, comms corner, and spotlight mast.
- Modular crash site kit builder (`crash_site_modular_kit.gd`) with burned helicopter shell, tail/rotor debris, smoke stacks, scorch decals, and objective map case.
- Procedural PBR material library (`material_library.gd`) for wall/roof/wood/cloth/stone variation.
- Terrain splatmap shader (`terrain_splatmap.gd`) with blended grass/mud/path layers, configurable palettes, and zone-specific placement.
- Authored foliage field (`foliage_cluster_field.gd`) using multi-mesh layers + wind shader + distance LOD.
- Terrain profile registry (`godot/data/world/terrain_profiles.json`) and foliage profile registry (`godot/data/world/foliage_profiles.json`) wired through `DataStore`.
- Zone atmosphere controller (`zone_atmosphere_controller.gd`) plus atmosphere profiles (`godot/data/world/atmosphere_profiles.json`) for mist, practical lights, ambience markers, and quest readability markers.
- Cross-zone lighting continuity in `main.gd`: active zone now drives lighting profile selection (`light_rig_id`) with quality-aware volumetric fog behavior.
- Global clutter density balancing across all modular kits using graphics preset density scaling.
- Expanded rigged NPC pass (`rigged_npc.gd`) for key cast coverage (Elder Nguyen, Thanh, Rodriguez, Sister Lan, Cpl. Whitaker, Ferryman Huy, Duc, Binh, Mai, Spc. Hale, Lt. Pham, Sgt. Kiet, Father Bao, Wounded Civilian) with explicit animation states:
- `idle_talk`
- `alert`
- `injured`
- `guard_idle`
- `briefing_talk`
- `seated_rest`
- `crouch_injured`

## Data Contracts Added

- `godot/data/zones/zones_index.json`
- `godot/data/zones/<zone>/zone_definition.json`
- `godot/data/assets/catalog/environment_assets.json`
- `godot/data/graphics/presets.json`
- `godot/data/npc/character_profiles.json`
- `godot/data/lighting/zone_lighting_profiles.json`
- `godot/data/world/terrain_profiles.json`
- `godot/data/world/foliage_profiles.json`
- `godot/data/world/atmosphere_profiles.json`
- `godot/data/benchmark/acceptance_targets.json`

## Controls in Prototype

- Move: `WASD`
- Sprint: `Shift`
- Mouse look: `Mouse`
- Release cursor: `Esc`
- Re-capture cursor: click
- Quality hotkeys: `F1` low, `F2` medium, `F3` high

## What This Enables Next

- Swap placeholder proxy anchors with authored modular kits without changing zone logic.
- Add real terrain materials/foliage systems while preserving the same zone contracts.
- Hook quest/NPC systems into the Godot scene graph incrementally.
- Gate each zone on screenshot + performance benchmarks before merge.
- Follow the full rollout and acceptance sequence in `docs/comprehensive-world-design-overhaul-plan.md`.

## Acceptance Automation

- Automated acceptance benchmark scene:
- `godot/scenes/benchmark/ZoneAcceptanceBench.tscn`
- Runner script:
- `godot/scripts/benchmark/zone_acceptance_bench.gd`
- Artifacts:
- `godot/reports/acceptance/latest.json`
- `godot/reports/acceptance/acceptance_<timestamp>.json`
- `godot/reports/acceptance/screenshots/*.png`

Run acceptance sweep:

```bash
godot --path godot res://scenes/benchmark/ZoneAcceptanceBench.tscn
node tools/validate-acceptance-report.mjs
```

Notes:

- In `--headless` mode, screenshot capture is disabled by design and report entries mark captures as `false`.
- FPS values from headless dummy rendering are useful for regression wiring checks but not final visual performance sign-off.
