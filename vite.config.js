import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return 0;

  let copiedFiles = 0;
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copiedFiles += copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    copiedFiles += 1;
  }

  return copiedFiles;
}

function copyRuntimeAssetsPlugin() {
  let rootDir;
  let outDir;

  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    configResolved(config) {
      rootDir = config.root;
      outDir = path.resolve(rootDir, config.build.outDir);
    },
    closeBundle() {
      const sourceDir = path.resolve(rootDir, 'assets/optimized');
      const targetDir = path.resolve(outDir, 'assets/optimized');
      const copiedFiles = copyDirectory(sourceDir, targetDir);

      if (copiedFiles > 0) {
        this.info(`Copied ${copiedFiles} runtime asset files to assets/optimized.`);
      }
    },
  };
}

export default defineConfig({
  plugins: [copyRuntimeAssetsPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  assetsInclude: [
    '**/*.gltf',
    '**/*.glb',
    '**/*.ktx2',
    '**/*.hdr',
    '**/*.exr',
  ],
});
