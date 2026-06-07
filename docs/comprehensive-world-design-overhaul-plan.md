# Comprehensive Environment And Design Overhaul Plan

## Objective

Deliver a full world-quality pass across every mission environment so the game reads as grounded, modern, and immersive while preserving RPG-first pacing and readability.

## Current Baseline

- Godot rebuild foundation is live with zone streaming and data contracts.
- Village, VC camp, and clinic have dedicated rebuild scripts and modular kit passes.
- River crossing, hamlet, and ARVN outpost still rely on generic zone proxies.
- Rigged NPC prototype exists with core state poses (`idle_talk`, `alert`, `injured`).

## Quality Targets

- Visual style: retro-modern realism (clear silhouettes, physically plausible materials, restrained cinematic mood).
- Hardware target: mid-range laptop at 1080p.
- Performance target: 60 FPS target, 45 FPS minimum in heaviest combat/foliage view.
- Consistency target: every critical mission zone must meet the same environment detail floor.

## Global Design Standards

- Terrain: each zone must use a dedicated terrain palette, splatmap logic, and path readability channels.
- Foliage: canopy, mid-layer, and ground clutter with LOD transitions and wind motion.
- Structures: no plain primitive blocks in playable space; all major structures must be modularized with weathering detail.
- Set dressing: each zone must include narrative clutter that supports mission context.
- Lighting: zone-specific practical lights plus coherent dusk baseline profile.
- NPC staging: key narrative NPCs always present with spatially intentional placement and pose state.
- Readability: objective landmarks must stay legible at medium draw distance.

## Zone-By-Zone Build Plan

| Zone | Environment Build | Design Intent | Required NPC Staging |
|---|---|---|---|
| Crash Site | Burned helicopter shell kit, debris field, smoke volume, scorched ground decals | Establish danger and isolation in first 30 seconds | None mandatory, optional wounded civilian variant |
| Village | Already implemented; add prop density pass and interior hints | Trust hub with civilian life and tension balance | Elder Nguyen, Thanh, Binh |
| VC Camp | Already implemented; add perimeter trench and patrol route markers | Claustrophobic captivity and surveillance pressure | Rodriguez (injured), guard silhouettes |
| Clinic | Already implemented; add interior triage clutter and medical decal pass | Fragile sanctuary under collapse | Sister Lan, Cpl. Whitaker |
| River Crossing | Build ferry, dock, rope winch, current VFX, bank erosion kit | Tactical bottleneck with negotiation pressure | Ferryman Huy, convoy civilians |
| River Hamlet | Build stilt huts, market lane fragments, riverbank domestic clutter | Moral contrast and human stakes | Mai, Hale (hidden reveal state) |
| ARVN Outpost | Build gate complex, guard towers, checkpoint barriers, comms corner | Controlled military endpoint and protocol friction | Lt. Pham, Sgt. Kiet |
| Jungle Corridors | Add transition landmarks, path wear, ambush cover composition | Navigation tension with consistent macro readability | Ambient non-hostile civilians rare encounters |

## Environment Task Breakdown By Zone

- Terrain pass:
- assign zone palette
- tune displacement amplitude
- tune path masks
- verify playable slope limits
- Structural kit pass:
- define hero structures
- define repeated props
- add near/far LOD proxies
- attach collision envelopes
- Foliage pass:
- tune exclusion radius around POIs
- tune density by quality preset
- verify readability at combat sightlines
- Atmosphere pass:
- add practical lights
- add smoke/dust/water particles where relevant
- tune fog density locally
- Gameplay readability pass:
- confirm interactable visibility
- confirm objective route affordance
- confirm no visual clutter blocks quest flow

## NPC And Character Design Plan

- Expand profiles for all named NPCs in current questline.
- Add additional animation states:
- `guard_idle`
- `walk_patrol`
- `crouch_injured`
- `seated_rest`
- `briefing_talk`
- Add silhouette differentiation by faction and role:
- ARVN uniform palette family
- village civilian palette family
- US squad palette family
- Add dialogue-distance facial readability improvements:
- eye marker refinement
- lip and jaw idle motion
- per-profile expression bias

## Lighting And Atmosphere Plan

- Keep one global dusk baseline profile for continuity.
- Add zone overrides for color temperature and fog density.
- Use practical lights only where physically justified.
- Add volumetric accents in camp, clinic, and crash site.
- Keep bloom low and selective to avoid stylized overglow.

## Audio-Visual Coupling Plan

- Create ambience profiles per zone and bind in zone definitions.
- Add transition stingers between hostile and safe zones.
- Add local emitters for water flow, fire crackle, insects, radio static.
- Match particle/VFX intensity to nearby audio source intensity.

## Technical Implementation Plan

## Phase A: Shared Systems

- Add zone atmosphere controller (lights + particles + ambience hooks).
- Add reusable clutter spawner and decal placement helper.
- Add terrain preset registry to avoid hardcoding color values per script.

## Phase B: Remaining Zones

- Build `river_crossing_zone.gd` + `river_crossing_modular_kit.gd`.
- Build `hamlet_zone.gd` + `hamlet_modular_kit.gd`.
- Build `arvn_outpost_zone.gd` + `arvn_outpost_modular_kit.gd`.
- Build `crash_site_zone.gd` + `crash_site_modular_kit.gd`.

## Phase C: Polish And Consistency

- Add clutter density balancing pass across all zones.
- Tune LOD thresholds and range fade values by preset.
- Finalize lighting profile set and cross-zone continuity.
- Finalize NPC profile coverage for all named characters.

## Performance And Memory Gates

- Maximum draw-call target by quality:
- `Low`: <= 1400
- `Medium`: <= 2200
- `High`: <= 3000
- Maximum visible dynamic lights in combat scenes: 12.
- Maximum volumetric-heavy emitters per zone loaded: 4.
- Every zone merge requires:
- 3 benchmark camera sweeps
- no frame-time regression >10% on medium preset

## Validation Checklist Per Zone

- Zone scene loads and unloads via streaming manager.
- No missing asset IDs in `environment_assets.json`.
- No missing NPC profile IDs in `character_profiles.json`.
- No collision traps or blocked critical quest route.
- Visual parity screenshots captured at dawn/dusk profile points.
- Performance capture logged and within target budget.

## Definition Of Done

- All mission-critical zones use dedicated rebuild scripts and modular kits.
- No generic placeholder blocks remain in playable routes.
- Named NPC roster is visually and behaviorally represented in correct zones.
- Visual tone is consistent across hub, hostile, and finale environments.
- Performance and memory budgets pass on medium preset hardware target.

## Execution Order

1. River crossing full pass.
2. Hamlet full pass.
3. ARVN outpost full pass.
4. Crash site full pass.
5. Global clutter, lighting, and NPC finalization.
6. End-to-end benchmark and acceptance review.

## Progress Snapshot

- Completed:
- Phase B step 1: river crossing dedicated zone + modular kit.
- Phase B step 2: hamlet dedicated zone + modular kit.
- Phase B step 3: ARVN outpost dedicated zone + modular kit.
- Phase B step 4: crash site dedicated zone + modular kit.
- Phase C baseline: global clutter density balancing, cross-zone lighting continuity, and expanded NPC staging.
- Phase A shared systems: terrain profile registry, foliage profile registry, and zone atmosphere controller with per-zone data contracts.
- Final acceptance tooling: fixed-camera parity + sweep benchmark runner (`ZoneAcceptanceBench`) with JSON report output.
- In progress:
- Final visual sign-off run with non-headless screenshot captures on target hardware.
