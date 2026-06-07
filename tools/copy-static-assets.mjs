#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const assetsSrc = join(root, 'assets', 'optimized');
const assetsDest = join(dist, 'assets', 'optimized');

if (!existsSync(dist)) {
  console.error('[copy-static-assets] dist/ does not exist. Run Vite build first.');
  process.exit(1);
}

if (!existsSync(assetsSrc)) {
  console.log('[copy-static-assets] No assets/optimized directory found.');
  process.exit(0);
}

mkdirSync(join(dist, 'assets'), { recursive: true });
rmSync(assetsDest, { recursive: true, force: true });
cpSync(assetsSrc, assetsDest, {
  recursive: true,
  dereference: true,
  filter: (src) => !src.includes('/.DS_Store'),
});

console.log('[copy-static-assets] Copied assets/optimized/ to dist/assets/optimized/.');
