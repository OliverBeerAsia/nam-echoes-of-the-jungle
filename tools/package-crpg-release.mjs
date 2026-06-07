#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const version = args[0] || process.env.CRPG_VERSION || '0.1.0-dev';
const platform = args[1] || process.env.CRPG_PLATFORM || process.platform;
const artifactsDir = path.resolve(repoRoot, args[2] || 'dist/crpg');
const generatedManifestPattern = /^crpg_release_manifest_v1_.+\.json$/;

if (!fs.existsSync(artifactsDir)) {
  throw new Error(`Artifacts directory not found: ${path.relative(repoRoot, artifactsDir)}`);
}

function walk(dirPath) {
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath));
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const artifactFiles = walk(artifactsDir).filter(
  (filePath) => !generatedManifestPattern.test(path.basename(filePath))
);
if (artifactFiles.length === 0) {
  throw new Error(`No artifacts found in ${path.relative(repoRoot, artifactsDir)}`);
}

const artifacts = artifactFiles
  .map((filePath) => {
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    if (relPath === '..' || relPath.startsWith('../') || path.isAbsolute(relPath)) {
      throw new Error(`Artifact path escapes repository root: ${filePath}`);
    }

    return {
      path: relPath,
      bytes: fs.statSync(filePath).size,
      sha256: hashFile(filePath),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const duplicatePaths = new Set();
for (const artifact of artifacts) {
  if (duplicatePaths.has(artifact.path)) {
    throw new Error(`Duplicate artifact path in release manifest: ${artifact.path}`);
  }
  duplicatePaths.add(artifact.path);
}

const contentHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(artifacts))
  .digest('hex');

const manifest = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  version,
  platform,
  commit: process.env.CRPG_COMMIT || 'unknown',
  content_hash: contentHash,
  artifacts,
};

const outPath = path.resolve(artifactsDir, `crpg_release_manifest_v1_${platform}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Wrote ${path.relative(repoRoot, outPath)} with ${artifacts.length} artifacts.`);
