#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.resolve(repoRoot, 'shared/fps-baseline.hashes.json');

function hashFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

if (!fs.existsSync(baselinePath)) {
  throw new Error('Missing shared/fps-baseline.hashes.json. Run `node tools/update-fps-baseline.mjs`.');
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const files = baseline.files || {};
const failures = {
  runtime: [],
  packaging: [],
  other: [],
};

function classifyBaselinePath(relPath) {
  if (relPath === 'index.html' || relPath.startsWith('js/') || relPath.startsWith('css/')) {
    return 'runtime';
  }
  if (['package.json', 'vite.config.js', 'start.sh'].includes(relPath)) {
    return 'packaging';
  }
  return 'other';
}

function pushFailure(relPath, message) {
  failures[classifyBaselinePath(relPath)].push(message);
}

for (const [relPath, expectedHash] of Object.entries(files)) {
  const absPath = path.resolve(repoRoot, relPath);
  if (!fs.existsSync(absPath)) {
    pushFailure(relPath, `Missing baseline file: ${relPath}`);
    continue;
  }
  const actualHash = hashFile(absPath);
  if (actualHash !== expectedHash) {
    pushFailure(
      relPath,
      `Hash mismatch: ${relPath} (expected ${expectedHash.slice(0, 12)}, got ${actualHash.slice(0, 12)})`
    );
  }
}

const failureCount = Object.values(failures).reduce((count, group) => count + group.length, 0);

if (failureCount > 0) {
  console.error('FPS baseline check failed:');

  for (const [label, entries] of Object.entries(failures)) {
    if (entries.length === 0) continue;
    const title = label === 'runtime'
      ? 'Runtime FPS files'
      : label === 'packaging'
        ? 'Packaging/build files'
        : 'Other baseline files';
    console.error(`${title}:`);
    for (const failure of entries) {
      console.error(`- ${failure}`);
    }
  }

  console.error('Runtime mismatches require explicit FPS maintenance approval before updating the baseline.');
  console.error('If all listed changes are intentional and accepted, update baseline with `node tools/update-fps-baseline.mjs`.');
  process.exit(1);
}

console.log(`FPS baseline check passed for ${Object.keys(files).length} files.`);
