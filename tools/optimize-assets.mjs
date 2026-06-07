#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const sourceDir = join(ROOT, 'assets', 'source');
const outDir = join(ROOT, 'assets', 'optimized');

if (!existsSync(sourceDir)) {
  console.log('[optimize-assets] No assets/source directory found. Nothing to optimize yet.');
  process.exit(0);
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const accepted = new Set(['.gltf', '.glb', '.png', '.jpg', '.jpeg', '.tga', '.exr', '.hdr']);
const queue = [sourceDir];
const files = [];

while (queue.length) {
  const dir = queue.pop();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) queue.push(full);
    else if (accepted.has(extname(name).toLowerCase())) files.push(full);
  }
}

console.log('[optimize-assets] Found ' + files.length + ' source assets.');
if (files.length === 0) {
  console.log('[optimize-assets] Nothing to do.');
  process.exit(0);
}

console.log('[optimize-assets] This scaffold validates discovery only.');
console.log('[optimize-assets] Next step: wire gltf-transform + basisu conversion commands per asset class.');
