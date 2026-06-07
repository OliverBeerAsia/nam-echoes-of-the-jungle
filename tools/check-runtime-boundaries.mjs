#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function walk(dirPath, exts) {
  const out = [];
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath, exts));
      continue;
    }
    if (exts.includes(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
  return out;
}

function checkNoPattern(files, patterns, label) {
  const violations = [];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        violations.push({
          file: path.relative(repoRoot, filePath),
          reason: pattern.reason,
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`${label} boundary violations:`);
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.reason}`);
    }
    process.exit(1);
  }
}

const fpsFiles = [
  path.resolve(repoRoot, 'index.html'),
  ...walk(path.resolve(repoRoot, 'js'), ['.js']),
  ...walk(path.resolve(repoRoot, 'css'), ['.css']),
];

const godotFiles = [
  ...walk(path.resolve(repoRoot, 'godot'), ['.gd', '.tscn', '.json', '.cfg']),
];

checkNoPattern(
  fpsFiles,
  [
    {
      regex: /res:\/\//,
      reason: 'FPS web runtime must not reference Godot resource paths.',
    },
    {
      regex: /godot\//,
      reason: 'FPS web runtime must not directly couple to Godot project files.',
    },
  ],
  'FPS runtime'
);

checkNoPattern(
  godotFiles,
  [
    {
      regex: /import\s+.*['"]\.\.\/\.\.\/js\//,
      reason: 'Godot runtime must not import web JavaScript runtime files.',
    },
    {
      regex: /\bindex\.html\b/,
      reason: 'Godot runtime should not reference the FPS web entrypoint.',
    },
  ],
  'CRPG/Godot runtime'
);

console.log('Runtime boundary check passed (FPS web and Godot tracks remain isolated).');
