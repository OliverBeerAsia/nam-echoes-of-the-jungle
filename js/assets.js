// ════════════════════════════════════════════
//  AssetManager — glTF/texture pipeline hooks
// ════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.failed = new Set();
    this.jsonCache = new Map();
    this.failedJSON = new Set();

    this.gltfLoader = new GLTFLoader();
    this.dracoLoader = new DRACOLoader();
    this.ktx2Loader = new KTX2Loader();

    this.dracoLoader.setDecoderPath('vendor/three/draco/gltf/');
    this.ktx2Loader.setTranscoderPath('vendor/three/basis/');
    this.ktx2Loader.detectSupport(this.renderer);

    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadGLTF(id, url, options = {}) {
    if (this.cache.has(id)) return this.cache.get(id).clone();
    const gltf = await this.gltfLoader.loadAsync(url);
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) throw new Error('GLTF missing scene root: ' + url);
    root.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = options.castShadow !== false;
        obj.receiveShadow = options.receiveShadow !== false;
      }
    });
    this.cache.set(id, root);
    return root.clone();
  }

  async loadGLTFOptional(id, url, options = {}) {
    if (this.failed.has(id)) return null;
    try {
      return await this.loadGLTF(id, url, options);
    } catch (err) {
      this.failed.add(id);
      console.warn('[AssetManager] Optional asset missing:', id, url);
      return null;
    }
  }

  async loadJSON(id, url, options = {}) {
    if (this.jsonCache.has(id)) return this.jsonCache.get(id);
    if (options.optional && this.failedJSON.has(id)) return null;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      const data = await res.json();
      this.jsonCache.set(id, data);
      return data;
    } catch (err) {
      if (options.optional) {
        this.failedJSON.add(id);
        console.warn('[AssetManager] Optional JSON missing:', id, url);
        return null;
      }
      throw err;
    }
  }

  async loadZoneManifest(zone, url = null) {
    const resolved = url || `assets/optimized/${zone}/manifest.json`;
    return this.loadJSON(`manifest:${zone}`, resolved, { optional: true });
  }

  resolveZoneEntriesFromManifest(manifest, preset = 'medium') {
    if (!manifest || !Array.isArray(manifest.anchors)) return [];
    const zone = manifest.zone || 'zone';
    const basePath = manifest.basePath || `assets/optimized/${zone}/`;
    return manifest.anchors
      .map(anchor => this.resolveZoneAnchor(zone, anchor, preset, basePath))
      .filter(Boolean);
  }

  resolveZoneAnchor(zone, anchor, preset = 'medium', basePath = '') {
    if (!anchor || typeof anchor !== 'object') return null;
    const transform = anchor.transform || {};
    const variant = this._pickPresetVariant(anchor.variants, preset);
    const chosenURL = anchor.url || variant?.url || variant?.uri || variant?.file;
    if (!chosenURL) return null;

    const x = transform.x ?? anchor.x ?? 0;
    const y = transform.y ?? anchor.y ?? 0;
    const z = transform.z ?? anchor.z ?? 0;
    const scale = variant?.scale ?? transform.scale ?? anchor.scale ?? 1;
    const rotationY = variant?.rotationY ?? transform.rotationY ?? anchor.rotationY ?? 0;
    const variantKey = variant?.key || 'default';

    return {
      id: `${zone}-${anchor.id || 'asset'}-${variantKey}`,
      anchorId: anchor.id || null,
      zone: anchor.zone || zone,
      url: this._resolveAssetUrl(chosenURL, anchor.basePath || basePath),
      x,
      y,
      z,
      s: scale,
      r: rotationY,
    };
  }

  _pickPresetVariant(variants, preset) {
    if (!variants || typeof variants !== 'object') return null;
    const normalized = this._normalizePreset(preset);
    const fallbackOrder = {
      low: ['low', 'medium', 'high'],
      medium: ['medium', 'low', 'high'],
      high: ['high', 'medium', 'low'],
    };

    for (const key of fallbackOrder[normalized]) {
      if (variants[key]) return { key, ...variants[key] };
    }
    return null;
  }

  _normalizePreset(preset) {
    if (preset === 'high' || preset === 'medium' || preset === 'low') return preset;
    return 'medium';
  }

  _resolveAssetUrl(url, basePath = '') {
    if (!url) return url;
    if (/^(https?:)?\/\//.test(url)) return url;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('/')) return url;
    if (url.startsWith('assets/')) return url;
    if (!basePath) return url;
    const normalized = basePath.endsWith('/') ? basePath : basePath + '/';
    return normalized + url.replace(/^\.?\//, '');
  }

  async loadTextureSet(maps = {}) {
    const loader = new THREE.TextureLoader();
    const out = {};
    const entries = Object.entries(maps);
    await Promise.all(entries.map(async ([key, url]) => {
      if (!url) return;
      out[key] = await loader.loadAsync(url);
      out[key].colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    }));
    return out;
  }

  async preloadCriticalAssets(list = []) {
    await Promise.all(list.map(entry => this.loadGLTF(entry.id, entry.url, entry.options || {})));
  }

  disposeUnusedAssets() {
    // Placeholder for future reference counting.
  }
}
