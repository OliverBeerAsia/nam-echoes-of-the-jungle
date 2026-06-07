# Release Notes

## v0.1.0-staging

Date: 2026-06-07

This release publishes the browser prototype of `NAM: Echoes of the Jungle` to GitHub Pages as a staging build.

### Highlights

- Terrain grounding now uses world height sampling for player, camera, NPCs, enemies, items, and collision import.
- The prior white-void/ungrounded-world presentation is resolved in the browser build.
- Lighting, exposure, foliage color, HUD density, and weapon presentation were tuned for a more readable field view.
- Opening quest flow now starts with `Aftershock` only, then gates village trust, rescue, medic, crossing, Hale, convoy, and checkpoint progression by story state.
- Extraction language now matches the ending logic: two squadmates are required, all three are the best outcome.
- Late NPCs and interactables are gated so field kit, ferry, convoy, camp, cage, and ARVN gate actions cannot advance out of sequence.
- The browser build no longer depends on Google Fonts or CDN-hosted Three decoder paths. Rapier physics is opt-in; the default production build uses the legacy AABB collision fallback.
- GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`.
- Vite is configured with the project Pages base path so deployed CSS and JS resolve under `/nam-echoes-of-the-jungle/`.

### Validation

Passed locally:

- `npm run check:js`
- `npm run build`
- `npm run validate:assets:strict`
- `npm run shared:validate-story`
- `npm run check:boundaries`
- `npm audit --audit-level=high`
- Browser smoke against Vite production preview with 0 runtime console errors.

Fresh browser smoke confirmed terrain grounding at:

- crash start
- village approach
- ARVN approach

### Known Release Blockers

This is not a production-ready visual/performance release yet.

- `npm run validate:acceptance` currently fails against the fresh Godot acceptance report.
- Medium preset Godot acceptance FPS is below target in `crash_site` and `clinic`.
- Headless Godot acceptance still records screenshot captures as `captured:false`.
- `npm run check:fps:baseline` fails because intentional runtime/package changes require an explicit FPS baseline maintenance update.
- Automated browser FPS sampling in headless Chromium is too low to use as production signoff.
- `npm audit` reports moderate Vite/esbuild development-server advisories. The high-severity audit gate passes; fixing the moderate advisories currently requires a breaking Vite upgrade.

### Recommended Next Pass

- Profile `crash_site` and `clinic` in Godot on target hardware.
- Fix or replace the headless screenshot capture path in `godot/scripts/benchmark/zone_acceptance_bench.gd`.
- Update the FPS baseline only after target-machine performance has been measured and accepted.
- Continue the environment-art pass: reduce blown-out horizons, improve jungle asset variety, add contact detail, mud/path blending, and material realism.
