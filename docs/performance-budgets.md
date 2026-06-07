# Performance Budgets

## Target Hardware

- Mid-range desktop/laptop PCs with modern browser support.
- Resolution target: 1080p.

## Runtime FPS Targets

- `High`: 45-60 FPS.
- `Medium`: ~60 FPS.
- `Low`: >=60 FPS.

## Graphics Budget Controls

- Pixel ratio capped per preset.
- Shadow map size and quality scaled per preset.
- Foliage density scaled per preset.
- SSAO/bloom/AA toggled by preset.

## Asset Budget Targets (Initial)

- Hero environment assets:
- 40k-120k triangles each (LOD0), with LODs required.
- Repeated props:
- <=15k triangles (LOD0), with aggressive LOD fallback.
- Texture memory:
- Keep active resident set under practical browser limits for target GPUs.

## Profiling Checklist

- Measure frame time in each major mission zone.
- Track draw calls before/after each art integration batch.
- Validate memory over 15-minute traversal sessions.
- Regressions beyond 10% frame time require rollback or optimization before merge.

## Production Packaging Checks

- `npm run build` must produce a self-contained `dist/` copy of `assets/optimized/` so runtime URLs like `assets/optimized/<zone>/manifest.json` resolve in production.
- `npm run validate:assets:dist` validates zone manifests, confirms the source asset tree was copied to `dist/`, and reports literal runtime `assets/...` URLs that could 404.
- Optional placeholder-backed art URLs may be warnings during incremental asset rollout; `npm run validate:assets:strict` turns those unresolved runtime URLs into release-blocking failures.

## Release Acceptance Gate

- `npm run validate:acceptance` checks the latest Godot acceptance report against zone FPS and scene-stat budgets while allowing headless screenshot warnings.
- `npm run validate:acceptance:strict` requires captured screenshots for every required zone/preset and should be used before release acceptance.
- `npm run release:check` combines JS syntax, production build, strict asset URL validation, strict acceptance validation, FPS baseline, and runtime boundary checks.
