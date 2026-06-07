#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.resolve(repoRoot, 'shared/fps-baseline.hashes.json');

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
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const includeFiles = [
  'index.html',
  'css/style.css',
  'vite.config.js',
  'start.sh',
  'package.json',
];

for (const filePath of walk(path.resolve(repoRoot, 'js'))) {
  includeFiles.push(path.relative(repoRoot, filePath));
}

includeFiles.sort();

const files = {};
for (const relPath of includeFiles) {
  const absPath = path.resolve(repoRoot, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Cannot include missing baseline file: ${relPath}`);
  }
  files[relPath] = hashFile(absPath);
}

const baseline = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  description: 'FPS runtime baseline hashes. CRPG changes must not modify these files without explicit FPS maintenance work.',
  files,
};

fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, baselinePath)} with ${Object.keys(files).length} file hashes.`);
