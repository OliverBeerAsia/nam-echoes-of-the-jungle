#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, normalize, relative } from 'node:path';

const ROOT = process.cwd();
const acceptedAssetExts = new Set([
  '.bin',
  '.exr',
  '.glb',
  '.gltf',
  '.hdr',
  '.jpeg',
  '.jpg',
  '.json',
  '.ktx2',
  '.png',
  '.webp',
]);

const options = parseArgs(process.argv.slice(2));
const absoluteTargetRoot = join(ROOT, options.targetRoot);

let hasErrors = false;
let manifestCount = 0;

if (!existsSync(absoluteTargetRoot)) {
  console.log('[validate-asset-manifest] No ' + options.targetRoot + ' directory found.');
} else {
  const manifests = findManifestFiles(absoluteTargetRoot);
  manifestCount = manifests.length;

  if (manifests.length === 0) {
    console.log('[validate-asset-manifest] No manifest.json files found under ' + options.targetRoot + '.');
  }

  for (const manifestPath of manifests) {
    const report = validateManifest(manifestPath);
    const relPath = relative(ROOT, manifestPath);

    if (report.errors.length === 0 && report.warnings.length === 0) {
      console.log('[validate-asset-manifest] OK ' + relPath);
      continue;
    }

    for (const warning of report.warnings) {
      console.log('[validate-asset-manifest] WARN ' + relPath + ': ' + warning);
    }

    for (const error of report.errors) {
      hasErrors = true;
      console.log('[validate-asset-manifest] ERROR ' + relPath + ': ' + error);
    }
  }
}

if (options.checkDist) {
  const distReport = validateDistAssetCopy();
  hasErrors = printReport('validate-asset-manifest', distReport) || hasErrors;
}

const runtimeReport = validateRuntimeAssetReferences();
hasErrors = printReport('validate-asset-manifest', runtimeReport) || hasErrors;

if (runtimeReport.checked > 0) {
  console.log(
    '[validate-asset-manifest] Checked ' +
      runtimeReport.checked +
      ' literal runtime asset URL' +
      (runtimeReport.checked === 1 ? '' : 's') +
      '.'
  );
}

if (manifestCount > 0 && !hasErrors) {
  console.log('[validate-asset-manifest] Asset validation passed.');
}

process.exit(hasErrors ? 1 : 0);

function parseArgs(args) {
  const parsed = {
    checkDist: false,
    distRoot: 'dist',
    strictRuntimeUrls: false,
    targetRoot: 'assets/optimized',
  };

  for (const arg of args) {
    if (arg === '--check-dist') {
      parsed.checkDist = true;
      continue;
    }
    if (arg === '--strict-runtime-urls') {
      parsed.strictRuntimeUrls = true;
      continue;
    }
    if (arg.startsWith('--dist-root=')) {
      parsed.distRoot = arg.slice('--dist-root='.length) || parsed.distRoot;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/validate-asset-manifest.mjs [assetRoot] [--check-dist] [--dist-root=dist] [--strict-runtime-urls]');
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      throw new Error('Unknown option: ' + arg);
    }
    parsed.targetRoot = arg;
  }

  return parsed;
}

function printReport(prefix, report) {
  let foundErrors = false;

  for (const warning of report.warnings) {
    console.log('[' + prefix + '] WARN ' + warning);
  }

  for (const error of report.errors) {
    foundErrors = true;
    console.log('[' + prefix + '] ERROR ' + error);
  }

  return foundErrors;
}

function walkFiles(rootDir, predicate = () => true) {
  const out = [];
  if (!existsSync(rootDir)) return out;
  const stack = [rootDir];

  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (predicate(full)) {
        out.push(full);
      }
    }
  }

  return out.sort();
}

function findManifestFiles(rootDir) {
  return walkFiles(rootDir, (filePath) => basename(filePath) === 'manifest.json');
}

function validateManifest(manifestPath) {
  const errors = [];
  const warnings = [];

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { errors: ['Invalid JSON: ' + err.message], warnings };
  }

  const zone = typeof manifest.zone === 'string' && manifest.zone.trim().length > 0
    ? manifest.zone.trim()
    : null;
  if (!zone) errors.push('`zone` is required.');

  const defaultBasePath = normalize(relative(ROOT, dirname(manifestPath))).replace(/\\/g, '/') + '/';
  const basePath = normalizeManifestBasePath(manifest.basePath || defaultBasePath);

  if (!Array.isArray(manifest.anchors) || manifest.anchors.length === 0) {
    errors.push('`anchors` must be a non-empty array.');
    return { errors, warnings };
  }

  const ids = new Set();
  manifest.anchors.forEach((anchor, index) => {
    const label = 'anchors[' + index + ']';
    if (!anchor || typeof anchor !== 'object') {
      errors.push(label + ' must be an object.');
      return;
    }

    if (typeof anchor.id !== 'string' || anchor.id.trim().length === 0) {
      errors.push(label + '.id is required.');
    } else if (ids.has(anchor.id)) {
      errors.push(label + '.id must be unique. Duplicate: ' + anchor.id);
    } else {
      ids.add(anchor.id);
    }

    if (anchor.transform && typeof anchor.transform !== 'object') {
      errors.push(label + '.transform must be an object when provided.');
    }

    if (anchor.transform) {
      for (const k of ['x', 'y', 'z', 'rotationY', 'scale']) {
        if (anchor.transform[k] !== undefined && typeof anchor.transform[k] !== 'number') {
          errors.push(label + '.transform.' + k + ' must be numeric.');
        }
      }
    }

    const hasDirectURL = typeof anchor.url === 'string' && anchor.url.trim().length > 0;
    const hasVariants = anchor.variants && typeof anchor.variants === 'object';

    if (!hasDirectURL && !hasVariants) {
      errors.push(label + ' must provide `url` or `variants`.');
      return;
    }

    if (hasDirectURL) {
      validateAssetPath(anchor.url, basePath, label + '.url', errors, warnings);
    }

    if (hasVariants) {
      const presetKeys = Object.keys(anchor.variants);
      if (presetKeys.length === 0) {
        errors.push(label + '.variants must define at least one preset entry.');
      }

      for (const preset of presetKeys) {
        if (!['low', 'medium', 'high'].includes(preset)) {
          warnings.push(label + '.variants contains non-standard preset `' + preset + '`.');
        }

        const variant = anchor.variants[preset];
        if (!variant || typeof variant !== 'object') {
          errors.push(label + '.variants.' + preset + ' must be an object.');
          continue;
        }

        const variantURL = variant.url || variant.uri || variant.file;
        if (typeof variantURL !== 'string' || variantURL.trim().length === 0) {
          errors.push(label + '.variants.' + preset + ' is missing url/uri/file.');
        } else {
          validateAssetPath(variantURL, anchor.basePath || basePath, label + '.variants.' + preset, errors, warnings);
        }

        if (variant.scale !== undefined && typeof variant.scale !== 'number') {
          errors.push(label + '.variants.' + preset + '.scale must be numeric when provided.');
        }

        if (variant.rotationY !== undefined && typeof variant.rotationY !== 'number') {
          errors.push(label + '.variants.' + preset + '.rotationY must be numeric when provided.');
        }
      }
    }
  });

  return { errors, warnings };
}

function validateDistAssetCopy() {
  const errors = [];
  const warnings = [];
  const distRoot = join(ROOT, options.distRoot);

  if (!existsSync(distRoot)) {
    return { errors: ['Dist directory not found for --check-dist: ' + options.distRoot], warnings };
  }
  if (!existsSync(absoluteTargetRoot)) {
    return { errors, warnings };
  }

  const sourceFiles = walkFiles(absoluteTargetRoot);
  for (const sourcePath of sourceFiles) {
    const relPath = relative(ROOT, sourcePath).replace(/\\/g, '/');
    const distPath = join(distRoot, relPath);
    if (!existsSync(distPath)) {
      errors.push('dist is missing copied asset: ' + relPath);
      continue;
    }

    const sourceSize = statSync(sourcePath).size;
    const distSize = statSync(distPath).size;
    if (sourceSize !== distSize) {
      errors.push('dist asset size mismatch: ' + relPath);
    }
  }

  if (sourceFiles.length > 0 && errors.length === 0) {
    console.log('[validate-asset-manifest] Dist asset copy OK (' + sourceFiles.length + ' files).');
  }

  return { errors, warnings };
}

function validateRuntimeAssetReferences() {
  const errors = [];
  const warnings = [];
  const refs = collectRuntimeAssetReferences();
  const seen = new Set();
  let checked = 0;

  for (const ref of refs) {
    const key = ref.url + '|' + ref.file + '|' + ref.line;
    if (seen.has(key)) continue;
    seen.add(key);

    const resolved = resolveAssetReference(ref.url);
    const sourceLabel = ref.file + ':' + ref.line;

    if (resolved.kind === 'dynamic') {
      warnings.push('dynamic runtime asset URL cannot be fully resolved statically: ' + ref.url + ' in ' + sourceLabel);
      continue;
    }
    if (resolved.kind === 'remote') {
      warnings.push('runtime asset URL is remote/data and not self-contained: ' + ref.url + ' in ' + sourceLabel);
      continue;
    }
    if (resolved.kind === 'invalid') {
      errors.push('invalid runtime asset URL ' + ref.url + ' in ' + sourceLabel + ': ' + resolved.reason);
      continue;
    }

    checked += 1;
    const sourcePath = join(ROOT, resolved.relFile);
    const sourceExists = existsSync(sourcePath);
    const missingMessage = 'runtime asset URL may 404: ' + resolved.relFile + ' referenced by ' + sourceLabel;

    if (!sourceExists) {
      if (options.strictRuntimeUrls) {
        errors.push(missingMessage);
      } else {
        warnings.push(missingMessage);
      }
      continue;
    }

    if (options.checkDist) {
      const distPath = join(ROOT, options.distRoot, resolved.relFile);
      if (!existsSync(distPath)) {
        errors.push('dist missing runtime asset URL target: ' + resolved.relFile + ' referenced by ' + sourceLabel);
      }
    }
  }

  return { errors, warnings, checked };
}

function collectRuntimeAssetReferences() {
  const files = [
    join(ROOT, 'index.html'),
    ...walkFiles(join(ROOT, 'js'), (filePath) => extname(filePath) === '.js'),
    ...walkFiles(join(ROOT, 'css'), (filePath) => extname(filePath) === '.css'),
  ].filter((filePath) => existsSync(filePath));

  const refs = [];
  const quotedAssetPattern = /(["'`])([^"'`]*assets\/[^"'`\s)]*)\1/g;
  const cssUrlPattern = /url\(([^)]+assets\/[^)]+)\)/g;

  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    const relFile = relative(ROOT, filePath).replace(/\\/g, '/');

    for (const match of text.matchAll(quotedAssetPattern)) {
      const url = match[2];
      if (isAssetLikeURL(url)) {
        refs.push({ file: relFile, line: lineForOffset(text, match.index ?? 0), url });
      }
    }

    for (const match of text.matchAll(cssUrlPattern)) {
      const url = match[1].trim().replace(/^["']|["']$/g, '');
      if (isAssetLikeURL(url)) {
        refs.push({ file: relFile, line: lineForOffset(text, match.index ?? 0), url });
      }
    }
  }

  return refs;
}

function isAssetLikeURL(url) {
  const pathOnly = url.split(/[?#]/)[0];
  return acceptedAssetExts.has(extname(pathOnly).toLowerCase());
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function normalizeManifestBasePath(basePath) {
  if (typeof basePath !== 'string' || basePath.length === 0) return '';
  return basePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/\/$/, '') + '/';
}

function validateAssetPath(rawURL, basePath, label, errors, warnings) {
  const resolved = resolveAssetReference(rawURL, basePath);
  if (resolved.kind === 'remote') {
    warnings.push(label + ' uses remote or data URI.');
    return;
  }
  if (resolved.kind === 'dynamic') {
    errors.push(label + ' must be a static asset path.');
    return;
  }
  if (resolved.kind === 'invalid') {
    errors.push(label + ' invalid path: ' + resolved.reason);
    return;
  }

  const absFile = join(ROOT, resolved.relFile);
  if (!existsSync(absFile)) {
    errors.push(label + ' file not found: ' + resolved.relFile);
    return;
  }

  if (options.checkDist) {
    const distFile = join(ROOT, options.distRoot, resolved.relFile);
    if (!existsSync(distFile)) {
      errors.push(label + ' dist file not found: ' + resolved.relFile);
    }
  }
}

function resolveAssetReference(rawURL, basePath = '') {
  if (typeof rawURL !== 'string' || rawURL.length === 0) {
    return { kind: 'invalid', reason: 'empty path' };
  }
  if (/^(https?:)?\/\//.test(rawURL) || rawURL.startsWith('data:')) {
    return { kind: 'remote' };
  }
  if (rawURL.includes('${')) {
    return { kind: 'dynamic' };
  }

  const normalizedBase = normalizeManifestBasePath(basePath);
  let relFile = rawURL.split(/[?#]/)[0].replace(/\\/g, '/');
  if (relFile.startsWith('assets/')) {
    // already workspace-relative
  } else if (relFile.startsWith('/')) {
    relFile = relFile.slice(1);
  } else {
    relFile = normalizedBase + relFile.replace(/^\.\//, '');
  }

  relFile = normalize(relFile).replace(/\\/g, '/');
  if (relFile === '..' || relFile.startsWith('../')) {
    return { kind: 'invalid', reason: 'path escapes repository root' };
  }

  return { kind: 'local', relFile };
}
