# Asset Pipeline

## Directory Layout

- `assets/source/`: raw imported art assets.
- `assets/optimized/`: processed runtime-ready assets.
- `tools/optimize-assets.mjs`: asset discovery and optimization entry point.
- `tools/validate-asset-manifest.mjs`: validates zone manifest shape and file references.

## Runtime Formats

- Models: `.glb` (preferred), `.gltf`.
- Textures: `.ktx2` (preferred), fallback `.png/.jpg`.
- Environment maps: `.hdr`/`.exr` for PMREM preprocessing.

## Conventions

- File names should be lowercase, kebab-case.
- Include zone prefix in names:
- `village-*`
- `camp-*`
- `clinic-*`
- `river-*`
- `outpost-*`

## Zone Manifest Format

- Each zone can define `assets/optimized/<zone>/manifest.json`.
- `zone`: zone key (`village`, `camp`, etc.).
- `basePath`: optional root for relative asset URLs.
- `anchors[]`: array of placement entries.
- `anchors[].id`: stable anchor id.
- `anchors[].transform`: world placement (`x`, `y`, `z`, `rotationY`, `scale`).
- `anchors[].variants`: optional quality map (`low`, `medium`, `high`) with per-preset `url` and optional overrides (`scale`, `rotationY`).
- `anchors[].url`: optional direct URL if no variant map is needed.

Current runtime integration is implemented for the village zone first, with per-zone fallback entries still active elsewhere.

## Model Requirements

- PBR material channels should include:
- base color
- normal
- roughness
- metalness (only where physically relevant)
- ambient occlusion (where authored)
- LODs required for dense foliage and repeated props.

## Optimization Workflow (Planned)

1. Place source files into `assets/source/`.
2. Run `npm run optimize:assets`.
3. Convert textures to KTX2 and models to optimized glTF with mesh compression.
4. Validate material maps and naming before commit.

## CI Checks (Target)

- Reject oversized uncompressed textures.
- Reject glTF assets without valid material assignments.
- Report draw-call-heavy assets for review.

## Validation Command

Run manifest and reference checks locally:

```bash
npm run validate:assets
```
