// vegetation.js — High-quality jungle foliage builder for the Squad FPS.
//
// Provides VegetationBuilder, which builds individual trees (palm, banyan,
// bamboo, fern), hanging vines, and a master InstancedMesh ground cover
// (grass + ferns). All heavy materials/geometries are cached as static
// fields so trees of the same type share GPU resources.
//
// Integrates with world.js via callbacks for LOD swap-pair registration
// and collider creation.

import * as THREE from 'three';
import {
  makeBarkMaterial,
  makeLeafCutout,
  makeFoliageBillboard,
} from './textures.js';

// ─── Shared shader uniform singletons ───────────────────────────────
// Mutated externally by the game loop (uTime advances each frame, uSunDir
// is seeded once after graphics init). All patched foliage materials read
// from these same uniform objects, so a single write per frame is enough
// to drive every wind/SSS shader.
export const VegetationTime = { uTime: { value: 0 } };
export const VegetationSun  = {
  uSunDir: { value: new THREE.Vector3(-0.45, 0.7, -0.54).normalize() },
};

// ─── Palette helpers ─────────────────────────────────────────────────
const TRUNK_BASE = 0x4a3018;
const TRUNK_DARK = 0x3a2410;
const FROND_GREENS = [0x284b20, 0x315626, 0x2d4f22, 0x3a5e2d, 0x243f1d];
const CANOPY_GREENS = [0x223f1b, 0x2a4a20, 0x33542a, 0x263f1d, 0x3b5b2d];
const BAMBOO_STALK = 0x6a8a30;
const BAMBOO_LEAF = 0x49682a;
const GRASS_GREENS = [0x4d6130, 0x5a6c35, 0x666f43, 0x445a2b];

function tinted(baseHex, jitter = 0.10) {
  const c = new THREE.Color(baseHex);
  const f = 1 - jitter + Math.random() * jitter * 2;
  c.multiplyScalar(f);
  // Mild hue jitter via small green channel wobble
  c.g = THREE.MathUtils.clamp(c.g * (1 + (Math.random() - 0.5) * 0.08), 0, 1);
  return c;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Cached resources ─────────────────────────────────────────────────
// Lazy-initialized in _ensureCache(); shared across all instances.
const CACHE = {
  ready: false,

  // Materials
  barkMatPalm: null,
  barkMatBanyan: null,
  barkMatVine: null,
  bambooStalkMat: null,
  bambooLeafMat: null,
  frondMat: null,
  bananaLeafMat: null,
  fernMat: null,
  canopyMat: null,
  grassInstMat: null,
  fernInstMat: null,

  // Geometries
  frondGeo: null,
  fernCardGeo: null,
  bambooLeafGeo: null,
  canopyCardGeo: null,
  canopyStarGeo: null,
  canopyFlatGeo: null,
  bambooSegGeo: null,
  bambooJointGeo: null,
  coconutGeo: null,
  grassCrossGeo: null,
  fernFanGeo: null,

  // Low-LOD proxy materials/geometries
  palmLowMat: null,
  banyanLowMat: null,
  bambooLowMat: null,
  palmLowGeo: null,
  banyanLowGeo: null,
  bambooLowGeo: null,
};

// ─── Foliage shader patches ──────────────────────────────────────────
//
// Two effects, both injected via material.onBeforeCompile:
//   1) Wind sway — vertex displacement based on world position, time,
//      and a per-material height/uv mask.
//   2) Fake subsurface scattering — fragment-shader back-light glow when
//      the sun is roughly behind the leaf relative to the camera.
//
// Both effects share the singleton VegetationTime / VegetationSun uniform
// objects so the game loop only needs to mutate one value per frame.
//
// customProgramCacheKey is set per-material so Three.js can re-use the
// compiled GL program between materials with matching options instead of
// link-storming on every clone.

/**
 * Patch a MeshStandardMaterial with one or both foliage shader effects.
 * Safe to call once per material at construction time.
 *
 * @param {THREE.Material} material
 * @param {{ wind?: boolean, sss?: boolean, windStrength?: number,
 *           heightMask?: 'uv'|'uvSquared'|'positionY' }} opts
 */
function applyFoliageShader(material, opts = {}) {
  const wind = opts.wind !== false;
  const sss  = opts.sss  === true;
  const windStrength = opts.windStrength ?? 0.15;
  // Mask flavors:
  //  'uv'        – clamp(uv.y, 0, 1)         — top of card sways most
  //  'uvSquared' – uv.y * uv.y               — even more bias to tip
  //  'positionY' – position.y / 0.5          — for instanced grass/fern
  //                where geometry uses world-space y from a 0.5m base
  const heightMask = opts.heightMask || 'uv';

  // Cache key includes every variant so program-relinks only happen across
  // materials that actually need a different shader text.
  const cacheKey = `foliage-${wind ? 'w' : ''}${sss ? 's' : ''}-${heightMask}-${windStrength.toFixed(3)}-v1`;

  material.onBeforeCompile = (shader) => {
    if (wind) {
      shader.uniforms.uTime         = VegetationTime.uTime;
      shader.uniforms.uWindStrength = { value: windStrength };
    }
    if (sss) {
      shader.uniforms.uSunDir = VegetationSun.uSunDir;
    }

    // ── Vertex shader ───────────────────────────────────────────
    let vs = shader.vertexShader;

    if (wind || sss) {
      // Add uniforms / varyings header.
      const vHeader = [];
      if (wind) {
        vHeader.push('uniform float uTime;');
        vHeader.push('uniform float uWindStrength;');
      }
      if (sss) {
        vHeader.push('varying vec3 vWorldPosition;');
      }
      vs = vHeader.join('\n') + '\n' + vs;
    }

    if (wind) {
      // Pick the height-mask expression.
      let maskExpr;
      switch (heightMask) {
        case 'uvSquared': maskExpr = 'clamp(uv.y * uv.y, 0.0, 1.0)'; break;
        case 'positionY': maskExpr = 'clamp(position.y / 0.5, 0.0, 1.0)'; break;
        case 'uv':
        default:          maskExpr = 'clamp(uv.y, 0.0, 1.0)';
      }

      vs = vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float windMask = ${maskExpr};
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float lowFreq  = sin(uTime * 1.6 + wp.x * 0.18 + wp.z * 0.21);
  float midFreq  = sin(uTime * 3.2 + wp.x * 0.45 + wp.z * 0.38);
  float highFreq = sin(uTime * 7.0 + wp.x * 1.5);
  float sway    = (lowFreq * 0.7 + midFreq * 0.3) * uWindStrength * windMask;
  float flutter = highFreq * 0.04 * windMask * windMask;
  transformed.x += sway + flutter;
  transformed.z += sway * 0.5;
}
`
      );
    }

    if (sss) {
      // Sample worldPosition right after the standard chunk computes it.
      vs = vs.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vWorldPosition = worldPosition.xyz;`
      );
    }

    shader.vertexShader = vs;

    // ── Fragment shader ─────────────────────────────────────────
    if (sss) {
      let fs = shader.fragmentShader;
      fs = `
uniform vec3 uSunDir;
varying vec3 vWorldPosition;
${fs}`;
      // Inject before the output stage so subsequent tonemapping / fog
      // still apply to the back-lit term.
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDir);
  float backLight = pow(max(0.0, dot(-V, L)), 4.0);
  vec3  ssColor    = vec3(0.42, 0.56, 0.26);
  float ssIntensity = 0.28;
  diffuseColor.rgb += ssColor * backLight * ssIntensity * (1.0 - dot(normal, L) * 0.5);
}
`
      );
      shader.fragmentShader = fs;
    }
  };

  material.customProgramCacheKey = () => cacheKey;
  material.needsUpdate = true;
  return material;
}

function ensureCache() {
  if (CACHE.ready) return CACHE;

  // ─── Materials ────────────────────────────────
  CACHE.barkMatPalm   = makeBarkMaterial({ color: 0x4a3018, scale: 1.0 });
  CACHE.barkMatBanyan = makeBarkMaterial({ color: 0x3d2810, scale: 1.4 });
  CACHE.barkMatVine   = makeBarkMaterial({ color: 0x352010, scale: 0.6 });

  CACHE.bambooStalkMat = new THREE.MeshStandardMaterial({
    color: BAMBOO_STALK,
    roughness: 0.7,
    metalness: 0.0,
  });

  // Frond (palm) leaf cutout
  const frondTex = makeLeafCutout({ color: 0x2e5023, shape: 'frond', size: 256 });
  frondTex.colorSpace = THREE.SRGBColorSpace;
  CACHE.frondMat = new THREE.MeshStandardMaterial({
    map: frondTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.4,
    roughness: 0.85,
    metalness: 0.0,
  });

  // Banana leaf (used for bamboo leaf tufts as oval card)
  const bambooLeafTex = makeLeafCutout({ color: BAMBOO_LEAF, shape: 'oval', size: 128 });
  bambooLeafTex.colorSpace = THREE.SRGBColorSpace;
  CACHE.bambooLeafMat = new THREE.MeshStandardMaterial({
    map: bambooLeafTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.4,
    roughness: 0.8,
  });

  // Fern card material
  const fernTex = makeLeafCutout({ color: 0x2b4d22, shape: 'fern', size: 192 });
  fernTex.colorSpace = THREE.SRGBColorSpace;
  CACHE.fernMat = new THREE.MeshStandardMaterial({
    map: fernTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.4,
    roughness: 0.85,
  });

  // Banyan canopy billboard material
  const canopyTex = makeFoliageBillboard({ color: 0x2a4c22, layers: 7, size: 256 });
  canopyTex.colorSpace = THREE.SRGBColorSpace;
  CACHE.canopyMat = new THREE.MeshStandardMaterial({
    map: canopyTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.4,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Instanced grass tuft material (small thin frond cutout)
  const grassTex = makeLeafCutout({ color: 0x586a35, shape: 'frond', size: 96 });
  grassTex.colorSpace = THREE.SRGBColorSpace;
  CACHE.grassInstMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.45,
    roughness: 0.9,
    vertexColors: false,
  });

  // Instanced fern material (reuse fern texture)
  CACHE.fernInstMat = new THREE.MeshStandardMaterial({
    map: fernTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.4,
    roughness: 0.85,
    vertexColors: false,
  });

  // ─── Geometries ───────────────────────────────
  // Palm frond plane: pivot at one end so we can rotate from the base.
  CACHE.frondGeo = makeFrondGeometry(0.9, 3.6);
  // Fern card geometry
  CACHE.fernCardGeo = makeFrondGeometry(0.55, 0.95, /*droop=*/0.05);
  // Bamboo leaf card
  CACHE.bambooLeafGeo = makeFrondGeometry(0.4, 1.1, 0.0);
  // Banyan canopy cards (billboard XY centered)
  CACHE.canopyCardGeo = new THREE.PlaneGeometry(6.0, 4.0);
  CACHE.canopyFlatGeo = new THREE.PlaneGeometry(7.0, 7.0);
  // 3-card star (planes rotated 0°/60°/120° around Y) — halves silhouette
  // holes vs a single billboard. Backwards-compatible: callers that use
  // canopyCardGeo continue to work unchanged.
  CACHE.canopyStarGeo = (() => {
    const cards = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.PlaneGeometry(6.0, 4.0);
      c.rotateY((i / 3) * Math.PI); // 0°, 60°, 120° (180° span — back face served by DoubleSide)
      cards.push(c);
    }
    return mergeBufferGeometries(cards);
  })();
  // Bamboo stalk segment & joint
  CACHE.bambooSegGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.5, 8, 1);
  CACHE.bambooJointGeo = new THREE.TorusGeometry(0.085, 0.02, 4, 8);
  // Coconut sphere
  CACHE.coconutGeo = new THREE.SphereGeometry(0.18, 6, 5);
  CACHE.coconutMat = new THREE.MeshStandardMaterial({
    color: 0x4a2a10, roughness: 0.85, metalness: 0,
  });

  // Grass cross-pair geometry (two crossed planes)
  CACHE.grassCrossGeo = makeCrossPair(0.5, 0.45);
  // Fern fan: 3 cards arranged in a fan, pivot at base
  CACHE.fernFanGeo = makeFernFan(0.55, 0.7);

  // ─── Low-LOD proxies ──────────────────────────
  CACHE.palmLowMat = new THREE.MeshStandardMaterial({
    color: 0x2b4821, roughness: 0.95, metalness: 0,
  });
  CACHE.banyanLowMat = new THREE.MeshStandardMaterial({
    color: 0x263f1e, roughness: 0.95, metalness: 0,
  });
  CACHE.bambooLowMat = new THREE.MeshStandardMaterial({
    color: 0x405b2d, roughness: 0.9, metalness: 0,
  });
  CACHE.palmLowGeo = new THREE.ConeGeometry(1.6, 4.5, 6);
  CACHE.banyanLowGeo = new THREE.ConeGeometry(2.8, 6.5, 7);
  CACHE.bambooLowGeo = new THREE.CylinderGeometry(0.32, 0.45, 6.5, 6);

  // ─── Foliage shader patches (wind sway + fake SSS) ───────────
  // Cards (uv-based mask): canopy, frond, fern, bambooLeaf
  applyFoliageShader(CACHE.canopyMat,     { wind: true, sss: true,  windStrength: 0.22, heightMask: 'uv'        });
  applyFoliageShader(CACHE.frondMat,      { wind: true, sss: true,  windStrength: 0.30, heightMask: 'uv'        });
  applyFoliageShader(CACHE.fernMat,       { wind: true, sss: true,  windStrength: 0.10, heightMask: 'uvSquared' });
  applyFoliageShader(CACHE.bambooLeafMat, { wind: true, sss: true,  windStrength: 0.14, heightMask: 'uv'        });
  // Instanced cover: grass uses position.y mask, no SSS (too thin); fern uses position.y + SSS.
  applyFoliageShader(CACHE.grassInstMat,  { wind: true, sss: false, windStrength: 0.06, heightMask: 'positionY' });
  applyFoliageShader(CACHE.fernInstMat,   { wind: true, sss: true,  windStrength: 0.05, heightMask: 'positionY' });

  CACHE.ready = true;
  return CACHE;
}

// ─── Geometry builders ───────────────────────────────────────────────

/**
 * Build a "frond" plane geometry: rectangle whose pivot is at one of the
 * short edges (the base of the leaf), with optional tip-droop applied to
 * vertices for organic curve. UVs map the texture so its base sits at the
 * pivot and tip at the far end.
 */
function makeFrondGeometry(width, length, droop = 0.18) {
  const segs = 6;
  const geo = new THREE.PlaneGeometry(width, length, 1, segs);
  // Default plane is centered; shift so y in [0..length] (base at origin).
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + length / 2;
    pos.setY(i, y);
    // Apply quadratic droop along Z axis (tip falls down/back)
    const t = y / length;
    const dz = -droop * length * t * t;
    pos.setZ(i, pos.getZ(i) + dz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // Make UV V=0 at base (y=0)
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    // Three's PlaneGeometry already has v in [0..1], but base may be top.
    // We flip so the leaf-cutout's stem sits at base.
    const v = uv.getY(i);
    uv.setY(i, v); // texture orientation matches; swap if inverted in art
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Two crossed leaf cards (X formation) merged into one BufferGeometry.
 * Used as the per-instance geometry for grass tufts.
 */
function makeCrossPair(width, height) {
  const a = new THREE.PlaneGeometry(width, height);
  // Translate so base sits at y=0 (pivot at bottom)
  a.translate(0, height / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return mergeBufferGeometries([a, b]);
}

/**
 * 3-card fan fern (cards rotated around Y).
 */
function makeFernFan(width, height) {
  const cards = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.PlaneGeometry(width, height);
    c.translate(0, height / 2, 0);
    // Slight forward tilt
    c.rotateX(-0.15);
    c.rotateY((i / 3) * Math.PI);
    cards.push(c);
  }
  return mergeBufferGeometries(cards);
}

/**
 * Minimal local merge helper (avoids dependency on examples/jsm).
 * All inputs must share attribute layout (PlaneGeometry does).
 */
function mergeBufferGeometries(geos) {
  // Compute totals
  let posCount = 0;
  let idxCount = 0;
  for (const g of geos) {
    posCount += g.attributes.position.count;
    if (g.index) idxCount += g.index.count;
    else idxCount += g.attributes.position.count;
  }
  const positions = new Float32Array(posCount * 3);
  const normals = new Float32Array(posCount * 3);
  const uvs = new Float32Array(posCount * 2);
  const indices = new Uint32Array(idxCount);

  let posOff = 0;
  let idxOff = 0;
  for (const g of geos) {
    const gp = g.attributes.position.array;
    const gn = g.attributes.normal ? g.attributes.normal.array : null;
    const gu = g.attributes.uv ? g.attributes.uv.array : null;
    positions.set(gp, posOff * 3);
    if (gn) normals.set(gn, posOff * 3);
    if (gu) uvs.set(gu, posOff * 2);

    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) {
        indices[idxOff + i] = gi[i] + posOff;
      }
      idxOff += gi.length;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) {
        indices[idxOff + i] = i + posOff;
      }
      idxOff += g.attributes.position.count;
    }
    posOff += g.attributes.position.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
  out.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * Build a curved trunk geometry: tapered cylinder bent along Y so it
 * leans gently. Returns a fresh BufferGeometry (NOT cached — each tree
 * has unique curvature, but they share material).
 */
function makeCurvedTrunk(rBase, rTop, height, sides, segments, bend) {
  const geo = new THREE.CylinderGeometry(rTop, rBase, height, sides, segments);
  const pos = geo.attributes.position;
  // Bend along X axis: shift x by quadratic of normalized y.
  // y is in [-height/2 .. +height/2]
  const dirX = bend.x;
  const dirZ = bend.z;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + height / 2) / height; // 0 at base, 1 at top
    const k = t * t; // quadratic curve
    pos.setX(i, pos.getX(i) + dirX * k);
    pos.setZ(i, pos.getZ(i) + dirZ * k);
    // Slight non-uniform jitter for organic look
    const angle = Math.atan2(pos.getZ(i), pos.getX(i));
    const r0 = Math.hypot(pos.getX(i), pos.getZ(i));
    const wobble = 1 + 0.04 * Math.sin(angle * 3 + t * 5);
    pos.setX(i, Math.cos(angle) * r0 * wobble);
    pos.setZ(i, Math.sin(angle) * r0 * wobble);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── VegetationBuilder ───────────────────────────────────────────────

export class VegetationBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} opts
   * @param {(highMeshes, lowMesh, x, z, swapDist) => void} opts.registerLOD
   * @param {(x, z, radius, height) => void} opts.addCollider
   * @param {(min?, max?) => number} opts.rand
   * @param {{ preset: 'low'|'medium'|'high', foliageMultiplier: number }} opts.quality
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.registerLOD = opts.registerLOD || (() => {});
    this.addCollider = opts.addCollider || (() => {});
    this.rand = opts.rand || ((min = 0, max = 1) => min + Math.random() * (max - min));
    this.quality = opts.quality || { preset: 'medium', foliageMultiplier: 1.0 };
    this.groundHeight = opts.groundHeight || (() => 0);
    this.cache = ensureCache();
  }

  _groundY(x, z) {
    const y = this.groundHeight(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  // ─── Palm tree ─────────────────────────────────────────────────
  buildPalm(x, z) {
    const c = this.cache;
    const height = this.rand(8, 12);
    const groundY = this._groundY(x, z);
    // Random gentle bend direction
    const bendAng = this.rand(0, Math.PI * 2);
    const bendMag = this.rand(0.15, 0.5);
    const bend = {
      x: Math.cos(bendAng) * bendMag,
      z: Math.sin(bendAng) * bendMag,
    };

    const highMeshes = [];

    // Trunk: curved, tapered
    const trunkGeo = makeCurvedTrunk(0.25, 0.18, height, 12, 6, bend);
    const trunk = new THREE.Mesh(trunkGeo, c.barkMatPalm);
    trunk.position.set(x, groundY + height / 2, z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    this.scene.add(trunk);
    highMeshes.push(trunk);

    // Crown center: where the fronds attach (top of bent trunk)
    const crownX = x + bend.x; // since bend offsets top by full bend (k=1)
    const crownY = groundY + height;
    const crownZ = z + bend.z;

    // Fronds: 6-9 radial, drooping tips
    const frondCount = 6 + Math.floor(this.rand(0, 4));
    for (let i = 0; i < frondCount; i++) {
      const azimuth = (i / frondCount) * Math.PI * 2 + this.rand(-0.25, 0.25);
      const tilt = -0.4 - this.rand(0, 0.3); // droop away from vertical
      const lenScale = 0.85 + this.rand(0, 0.35);

      // Build a per-frond holder so we can rotate base, droop tip via geometry.
      const frond = new THREE.Mesh(c.frondGeo, c.frondMat);
      frond.castShadow = true;
      frond.receiveShadow = false;
      // Slight color tint
      // (per-mesh color tint via material override would break batching; keep shared.)
      frond.scale.set(lenScale, lenScale, lenScale);

      // Pivot frond at its base (y=0). We rotate so that the leaf points
      // outward radially: first rotate around X (to lift+droop), then Y (azimuth).
      // Since the frond geometry's "length" runs along Y starting at 0,
      // the base sits at the origin of the mesh.
      frond.rotation.set(0, 0, 0);
      // Re-orient: tilt around X (lift up, then droop), then rotate around Y.
      // We want the leaf to lie roughly horizontal-with-droop.
      frond.rotation.x = Math.PI / 2 + tilt; // first lay leaf horizontal (-90° to make Y axis point outward), then tilt
      frond.rotation.z = this.rand(-0.15, 0.15); // slight roll
      // Now rotate the whole base about Y for azimuth.
      // Three rotates in XYZ order by default; combine via Object3D parenting.
      const pivot = new THREE.Object3D();
      pivot.position.set(crownX, crownY - 0.15, crownZ);
      pivot.rotation.y = azimuth;
      pivot.add(frond);
      this.scene.add(pivot);
      highMeshes.push(pivot);
    }

    // Coconut bunch (30%)
    if (this.rand() < 0.30) {
      const bunch = 3 + Math.floor(this.rand(0, 3));
      for (let i = 0; i < bunch; i++) {
        const a = this.rand(0, Math.PI * 2);
        const r = this.rand(0.15, 0.3);
        const nut = new THREE.Mesh(c.coconutGeo, c.coconutMat);
        nut.position.set(
          crownX + Math.cos(a) * r,
          crownY - 0.4 + this.rand(-0.1, 0.1),
          crownZ + Math.sin(a) * r,
        );
        nut.castShadow = true;
        this.scene.add(nut);
        highMeshes.push(nut);
      }
    }

    // Low-LOD proxy
    const lowProxy = new THREE.Mesh(c.palmLowGeo, c.palmLowMat);
    lowProxy.position.set(crownX, groundY + Math.max(2.2, height * 0.55), crownZ);
    lowProxy.scale.setScalar(0.8 + (height / 12) * 0.4);
    lowProxy.receiveShadow = true;
    this.registerLOD(highMeshes, lowProxy, x, z, 58);

    // Collider
    this.addCollider(x, z, 0.28, height);
  }

  // ─── Banyan / hardwood ─────────────────────────────────────────
  buildBanyan(x, z) {
    const c = this.cache;
    const height = this.rand(10, 16);
    const groundY = this._groundY(x, z);
    const bendAng = this.rand(0, Math.PI * 2);
    const bendMag = this.rand(0.0, 0.25);
    const bend = {
      x: Math.cos(bendAng) * bendMag,
      z: Math.sin(bendAng) * bendMag,
    };

    const highMeshes = [];

    // Main trunk
    const trunkGeo = makeCurvedTrunk(0.4, 0.25, height, 10, 6, bend);
    const trunk = new THREE.Mesh(trunkGeo, c.barkMatBanyan);
    trunk.position.set(x, groundY + height / 2, z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    this.scene.add(trunk);
    highMeshes.push(trunk);

    const topX = x + bend.x;
    const topY = groundY + height;
    const topZ = z + bend.z;

    // Secondary branches (2-4)
    const branchCount = 2 + Math.floor(this.rand(0, 3));
    for (let i = 0; i < branchCount; i++) {
      const ang = (i / branchCount) * Math.PI * 2 + this.rand(-0.4, 0.4);
      const len = this.rand(2.0, 3.5);
      const bGeo = new THREE.CylinderGeometry(0.07, 0.18, len, 7, 2);
      const branch = new THREE.Mesh(bGeo, c.barkMatBanyan);
      // Position branch base at upper trunk, then tilt outward.
      const baseY = topY - this.rand(1.0, 3.0);
      const pivot = new THREE.Object3D();
      pivot.position.set(topX, baseY, topZ);
      pivot.rotation.y = ang;
      pivot.rotation.z = -1.0 - this.rand(0, 0.4); // tilt outward (~60-80°)
      // Cylinder default vertical, so move up by len/2 within pivot frame.
      branch.position.set(0, len / 2, 0);
      branch.castShadow = true;
      pivot.add(branch);
      this.scene.add(pivot);
      highMeshes.push(pivot);
    }

    // Canopy: cross-card billboards at varying heights
    // 3-5 vertical "star" clusters (3 planes per cluster, rotated 0/60/120°
    // around Y) for fewer silhouette holes, plus 2-3 horizontal cards.
    const vCardCount = 3 + Math.floor(this.rand(0, 3));
    for (let i = 0; i < vCardCount; i++) {
      const card = new THREE.Mesh(c.canopyStarGeo, c.canopyMat);
      const az = this.rand(0, Math.PI * 2);
      const ry = topY + this.rand(-0.5, 1.5);
      const rOff = this.rand(0, 1.2);
      card.position.set(
        topX + Math.cos(az) * rOff,
        ry,
        topZ + Math.sin(az) * rOff,
      );
      // Per-cluster random Y rotation so adjacent stars don't align.
      card.rotation.y = az;
      card.scale.set(this.rand(0.85, 1.25), this.rand(0.85, 1.15), this.rand(0.85, 1.25));
      card.castShadow = false;
      card.receiveShadow = false;
      this.scene.add(card);
      highMeshes.push(card);
    }
    const hCardCount = 2 + Math.floor(this.rand(0, 2));
    for (let i = 0; i < hCardCount; i++) {
      const card = new THREE.Mesh(c.canopyFlatGeo, c.canopyMat);
      card.position.set(
        topX + this.rand(-0.6, 0.6),
        topY + 1.0 + i * 0.6 + this.rand(-0.2, 0.2),
        topZ + this.rand(-0.6, 0.6),
      );
      card.rotation.x = -Math.PI / 2;
      card.rotation.z = this.rand(0, Math.PI * 2);
      card.scale.set(this.rand(0.9, 1.2), this.rand(0.9, 1.2), 1);
      card.castShadow = false;
      this.scene.add(card);
      highMeshes.push(card);
    }

    // Hanging vines (50%)
    if (this.rand() < 0.5) {
      const vineMeshes = this.buildHangingVines(topX, topY - 0.5, topZ);
      for (const v of vineMeshes) highMeshes.push(v);
    }

    // Low-LOD proxy
    const lowProxy = new THREE.Mesh(c.banyanLowGeo, c.banyanLowMat);
    lowProxy.position.set(topX, groundY + Math.max(3.0, height * 0.55), topZ);
    lowProxy.scale.setScalar(0.9 + (height / 16) * 0.3);
    lowProxy.receiveShadow = true;
    this.registerLOD(highMeshes, lowProxy, x, z, 66);

    this.addCollider(x, z, 0.45, height);
  }

  // ─── Bamboo cluster ────────────────────────────────────────────
  buildBamboo(x, z) {
    const c = this.cache;
    const stalkCount = 4 + Math.floor(this.rand(0, 4)); // 4-7
    const groundY = this._groundY(x, z);
    const highMeshes = [];

    for (let i = 0; i < stalkCount; i++) {
      // Tight cluster radius
      const ang = this.rand(0, Math.PI * 2);
      const rad = this.rand(0, 0.6);
      const ox = Math.cos(ang) * rad;
      const oz = Math.sin(ang) * rad;
      const h = this.rand(6, 10);
      const r = this.rand(0.05, 0.10);
      const segCount = Math.floor(h / 1.5);
      const segH = h / segCount;
      const lean = this.rand(-0.04, 0.04);

      for (let s = 0; s < segCount; s++) {
        // Use shared seg geometry (1.5m tall, base radius 0.08); scale to fit.
        const stalk = new THREE.Mesh(c.bambooSegGeo, c.bambooStalkMat);
        const sx = r / 0.08;
        stalk.scale.set(sx, segH / 1.5, sx);
        stalk.position.set(
          x + ox + lean * s * segH * 0.3,
          groundY + s * segH + segH / 2,
          z + oz + lean * s * segH * 0.3,
        );
        stalk.castShadow = true;
        this.scene.add(stalk);
        highMeshes.push(stalk);

        // Joint ring at top of segment
        const ring = new THREE.Mesh(c.bambooJointGeo, c.bambooStalkMat);
        ring.scale.setScalar(sx * 1.2);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(
          x + ox + lean * s * segH * 0.3,
          groundY + (s + 1) * segH,
          z + oz + lean * s * segH * 0.3,
        );
        this.scene.add(ring);
        highMeshes.push(ring);
      }

      // Leaf tufts at top (4-6 thin oval cards)
      const leafCount = 4 + Math.floor(this.rand(0, 3));
      for (let l = 0; l < leafCount; l++) {
        const lAng = this.rand(0, Math.PI * 2);
        const tilt = -0.3 - this.rand(0, 0.4);
        const leaf = new THREE.Mesh(c.bambooLeafGeo, c.bambooLeafMat);
        const pivot = new THREE.Object3D();
        pivot.position.set(
          x + ox + lean * h * 0.3,
          groundY + h - 0.2,
          z + oz + lean * h * 0.3,
        );
        pivot.rotation.y = lAng;
        leaf.rotation.x = Math.PI / 2 + tilt;
        leaf.rotation.z = this.rand(-0.2, 0.2);
        leaf.scale.setScalar(0.7 + this.rand(0, 0.5));
        pivot.add(leaf);
        this.scene.add(pivot);
        highMeshes.push(pivot);
      }
    }

    // Low-LOD proxy: cylinder representing the cluster
    const lowProxy = new THREE.Mesh(c.bambooLowGeo, c.bambooLowMat);
    lowProxy.position.set(x, groundY + 3.3, z);
    lowProxy.receiveShadow = true;
    this.registerLOD(highMeshes, lowProxy, x, z, 52);

    this.addCollider(x, z, 0.6, 9);
  }

  // ─── Fern / undergrowth ────────────────────────────────────────
  buildFern(x, z) {
    const c = this.cache;
    const frondCount = 3 + Math.floor(this.rand(0, 4)); // 3-6
    const baseHeight = this.rand(0.4, 1.0);
    const groundY = this._groundY(x, z);
    const meshes = [];

    for (let i = 0; i < frondCount; i++) {
      const ang = (i / frondCount) * Math.PI * 2 + this.rand(-0.3, 0.3);
      const tilt = -0.6 - this.rand(0, 0.5);
      const card = new THREE.Mesh(c.fernCardGeo, c.fernMat);
      const pivot = new THREE.Object3D();
      pivot.position.set(x, groundY + 0.02, z);
      pivot.rotation.y = ang;
      // Make fronds spread outward and droop
      card.rotation.x = Math.PI / 2 + tilt;
      card.rotation.z = this.rand(-0.1, 0.1);
      card.scale.setScalar(baseHeight * (0.85 + this.rand(0, 0.35)));
      pivot.add(card);
      this.scene.add(pivot);
      meshes.push(pivot);
    }

    // Optional dark ground vine plane
    if (this.rand() < 0.4) {
      const vineMat = new THREE.MeshStandardMaterial({
        color: tinted(0x1a3a10, 0.15),
        side: THREE.DoubleSide,
        roughness: 0.95,
        transparent: false,
      });
      const vineGeo = new THREE.PlaneGeometry(this.rand(0.6, 1.4), this.rand(0.4, 0.9));
      const vine = new THREE.Mesh(vineGeo, vineMat);
      vine.rotation.x = -Math.PI / 2;
      const vx = x + this.rand(-0.3, 0.3);
      const vz = z + this.rand(-0.3, 0.3);
      vine.position.set(vx, this._groundY(vx, vz) + 0.02, vz);
      vine.receiveShadow = true;
      this.scene.add(vine);
      meshes.push(vine);
    }

    // Cheap collider so player can't stand inside
    this.addCollider(x, z, 0.35, baseHeight);
    return meshes;
  }

  // ─── Hanging vines ─────────────────────────────────────────────
  buildHangingVines(x, y, z) {
    const c = this.cache;
    const n = 2 + Math.floor(this.rand(0, 3)); // 2-4
    const meshes = [];

    for (let i = 0; i < n; i++) {
      const length = this.rand(2.0, 4.0);
      const azimuth = this.rand(0, Math.PI * 2);
      const offset = this.rand(0.4, 1.2);
      const baseX = x + Math.cos(azimuth) * offset;
      const baseZ = z + Math.sin(azimuth) * offset;

      // CatmullRom curve hanging downward with slight curl
      const pts = [];
      const segs = 6;
      const curlAng = this.rand(0, Math.PI * 2);
      const curlAmt = this.rand(0.05, 0.25);
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        // Quadratic gravity: drops faster as it goes
        const dy = -length * t;
        const dx = Math.cos(curlAng) * curlAmt * Math.sin(t * Math.PI);
        const dz = Math.sin(curlAng) * curlAmt * Math.sin(t * Math.PI);
        pts.push(new THREE.Vector3(baseX + dx, y + dy, baseZ + dz));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 8, 0.035, 5, false);
      const vine = new THREE.Mesh(tubeGeo, c.barkMatVine);
      vine.castShadow = true;
      this.scene.add(vine);
      meshes.push(vine);
    }
    return meshes;
  }

  // ─── Instanced ground cover ────────────────────────────────────
  buildInstancedGroundCover({ areaRadius = 110, grassCount = 5000, fernCount = 800, avoidZones = [] } = {}) {
    const c = this.cache;
    const mult = this.quality.foliageMultiplier ?? 1;
    const gN = Math.max(0, Math.floor(grassCount * mult));
    const fN = Math.max(0, Math.floor(fernCount * mult));

    const grassMesh = this._instancedGroundLayer(
      c.grassCrossGeo,
      c.grassInstMat.clone(), // clone so vertexColors flag can be set
      gN,
      areaRadius,
      avoidZones,
      {
        scaleMin: 0.7, scaleMax: 1.4,
        yOffset: 0,
        colors: GRASS_GREENS,
      },
    );
    grassMesh.name = 'grassInstanced';
    grassMesh.castShadow = false;
    grassMesh.receiveShadow = false;

    const fernMesh = this._instancedGroundLayer(
      c.fernFanGeo,
      c.fernInstMat.clone(),
      fN,
      areaRadius,
      avoidZones,
      {
        scaleMin: 0.8, scaleMax: 1.6,
        yOffset: 0,
        colors: [0x2a5e1c, 0x346f1e, 0x2f6a1d, 0x255c14],
      },
    );
    fernMesh.name = 'fernInstanced';
    fernMesh.castShadow = false;
    fernMesh.receiveShadow = false;

    // Add to scene (caller used to discard the return value).
    this.scene.add(grassMesh);
    this.scene.add(fernMesh);

    return { grassMesh, fernMesh };
  }

  _instancedGroundLayer(geo, mat, count, areaRadius, avoidZones, opts) {
    // Enable per-instance vertex colors on material
    mat.vertexColors = true;

    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    // Per-instance color
    const colors = new Float32Array(Math.max(1, count) * 3);
    const colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor = colorAttr;

    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _p = new THREE.Vector3();
    const _s = new THREE.Vector3(1, 1, 1);
    const _euler = new THREE.Euler();
    const _color = new THREE.Color();

    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 4;

    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const x = (Math.random() * 2 - 1) * areaRadius;
      const z = (Math.random() * 2 - 1) * areaRadius;
      let blocked = false;
      for (const zone of avoidZones) {
        const dx = x - zone.x;
        const dz = z - zone.z;
        if (dx * dx + dz * dz < zone.r * zone.r) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const scale = opts.scaleMin + Math.random() * (opts.scaleMax - opts.scaleMin);
      _p.set(x, this._groundY(x, z) + opts.yOffset + 0.02, z);
      _euler.set(0, Math.random() * Math.PI * 2, 0);
      _q.setFromEuler(_euler);
      _s.set(scale, scale, scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(placed, _m);

      _color.set(pick(opts.colors));
      // Per-instance brightness jitter (±18% multiplicative)
      const bj = 0.82 + Math.random() * 0.36;
      _color.multiplyScalar(bj);
      // Mild green-channel hue wobble for extra per-blade variation
      _color.g = THREE.MathUtils.clamp(_color.g * (1 + (Math.random() - 0.5) * 0.18), 0, 1);
      colors[placed * 3 + 0] = _color.r;
      colors[placed * 3 + 1] = _color.g;
      colors[placed * 3 + 2] = _color.b;

      placed++;
    }

    // If we placed fewer than allocated, hide trailing slots by zero-scaling.
    if (placed < count) {
      _q.identity();
      _s.set(0, 0, 0);
      _p.set(0, -1000, 0);
      _m.compose(_p, _q, _s);
      for (let i = placed; i < count; i++) {
        mesh.setMatrixAt(i, _m);
        colors[i * 3 + 0] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Provide a generous bounding sphere centered on the field origin so
    // frustum culling never falsely hides the whole InstancedMesh.
    const bs = new THREE.Sphere(
      new THREE.Vector3(0, 1, 0),
      areaRadius * 1.6 + 5,
    );
    mesh.geometry.boundingSphere = bs;
    // Belt-and-braces: also disable culling for safety.
    mesh.frustumCulled = false;

    return mesh;
  }
}

export default VegetationBuilder;
