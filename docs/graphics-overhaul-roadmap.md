# Graphics Overhaul Roadmap

## Goal

Upgrade visual fidelity from procedural low-poly rendering to immersive PBR quality while preserving RPG-first gameplay readability and mission pacing.

## Current Implementation Track

- Active track: Godot 4 desktop rebuild prototype for higher visual ceiling.
- Legacy Three.js build remains in repo for gameplay reference and migration parity checks.
- Zone/data contracts are now mirrored in `godot/data/*` to support staged art replacement.

## Milestone 1: Renderer Backbone

- Add quality presets (`low`, `medium`, `high`, `auto`).
- Integrate post-processing (SSAO, bloom, AA).
- Switch to ACES tone mapping and physically based lighting workflow.
- Introduce runtime graphics selector in UI.

Exit criteria:
- Preset system works in-game.
- No gameplay regression.
- Renderer pipeline is ready for high-fidelity assets.

## Milestone 2: Biome and Terrain Fidelity

- Replace flat-color terrain with texture sets.
- Add biome masks and decal detail.
- Increase foliage realism via instancing and LOD tuning.

Exit criteria:
- Jungle reads as layered/organic rather than procedural primitives.
- Frame time stable under preset budgets.

## Milestone 3: Structures and Props

- Replace major buildings/props with modular PBR asset kits.
- Preserve collision and interaction volumes.
- Add weathering and grime variation.

Exit criteria:
- All critical quest locations visually rebuilt.

## Milestone 4: Character/Weapon Visuals

- Replace procedural NPC meshes with rigged character models.
- Add first-person hands and upgraded weapon viewmodels.
- Improve animation polish and material detail.

Exit criteria:
- Characters no longer appear primitive.
- First-person presentation significantly improves immersion.

## Milestone 5: Final Art and Performance Pass

- Historical authenticity review by zone.
- Lighting/color-grade final pass.
- Performance and memory optimization.

Exit criteria:
- Visual and performance KPIs met for target hardware.
