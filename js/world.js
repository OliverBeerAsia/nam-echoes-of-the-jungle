// ════════════════════════════════════════════
//  World — Three.js scene orchestrator
//  Vietnamese jungle, village, VC camp, ARVN outpost
//
//  Thin orchestrator: terrain + water + paths + atmosphere are built here,
//  and vegetation / structures / sky / lighting / fog are delegated to
//  the dedicated modules (vegetation.js, buildings.js, graphics.js).
//
//  Public API (must remain stable for game.js / player.js / enemies.js / npcs.js):
//    constructor(scene, quality, assetManager)
//    build()                        — builds the whole scene
//    colliders                      — array of {x,z,radius,height,minY,maxY}
//    interactables                  — array of {x,z,radius,label,npcId,id}
//    waterMeshes                    — array (kept for water animation)
//    foliageLodPairs                — array (vegetation.js registers via callback)
//    checkCollision(pos, radius)
//    getNearbyInteractable(pos, range)
//    update(dt, cameraPos)
//    setQuality(quality)
// ════════════════════════════════════════════
import * as THREE from 'three';
import { LEVEL, CONFIG } from './config.js';
import { VegetationBuilder } from './vegetation.js';
import { BuildingsBuilder } from './buildings.js';
import { OpenWorldBuilder } from './openworld.js';
import { RoadNetwork } from './roads.js';
import {
  makeGroundAlbedo,
  makeNoiseNormal,
} from './textures.js';

export class World {
  constructor(scene, quality = {}, assetManager = null) {
    this.scene = scene;
    this.assetManager = assetManager;
    this.colliders = [];       // AABB cylinders for collision
    this.interactables = [];   // { x, z, radius, label, npcId, id }
    this.itemMeshes = [];      // Pickable items (kept for compat)
    this.waterMeshes = [];
    this.foliageLodPairs = [];
    this.particles = [];       // Atmosphere particle systems for update()
    this._foliageLodTick = 0;
    this.quality = {
      preset: quality.preset || 'medium',
      foliageMultiplier: quality.foliageMultiplier || 1.0,
    };
    this._rng = 12345;
  }

  _terrainHeightAt(x, z) {
    let h = 0;

    const ridgeCenterZ = -315;
    const ridgeBandZ = Math.exp(-((z - ridgeCenterZ) * (z - ridgeCenterZ)) / (2 * 55 * 55));
    const ridgeFalloffX = Math.exp(-(x * x) / (2 * 220 * 220));
    h += 60 * ridgeBandZ * ridgeFalloffX;

    h += this._gaussianBump(x, z, -180, -50, 12, 120);
    h += this._gaussianBump(x, z, 0, 20, -1, 35);
    h += this._gaussianBump(x, z, 240, 50, -1, 70);
    h += this._gaussianBump(x, z, 96, -72, 6, 35);
    h += this._gaussianBump(x, z, -280, -200, 8, 150);

    const river = [
      { x: 60,  z: 8    },
      { x: 300, z: -30  },
      { x: 380, z: -200 },
    ];
    let minRiverDist = Infinity;
    for (let s = 0; s < river.length - 1; s++) {
      const d = this._distToSegment(x, z, river[s].x, river[s].z, river[s + 1].x, river[s + 1].z);
      if (d < minRiverDist) minRiverDist = d;
    }
    h += -3 * Math.exp(-(minRiverDist * minRiverDist) / (2 * 30 * 30));

    const base =
      Math.sin(x * 0.045 + z * 0.038) * 0.9 +
      Math.cos(x * 0.072 - z * 0.061) * 0.55 +
      Math.sin(x * 0.013 + z * 0.017) * 0.35 +
      Math.cos(x * 0.21  + z * 0.18 ) * 0.2;
    h += base;

    const flatZones = [
      { x: -18, z: 85,  r: 24 },
      { x:   0, z: 20,  r: 40 },
      { x: -52, z: -42, r: 36 },
      { x:  58, z: 18,  r: 24 },
      { x:  83, z: -6,  r: 28 },
      { x:  95, z: 18,  r: 26 },
      { x:  96, z: -72, r: 34 },
    ];
    for (const zone of flatZones) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const inner = zone.r * 0.58;
      const outer = zone.r;
      if (d < outer) {
        const t = d <= inner ? 0 : (d - inner) / (outer - inner);
        const smooth = t * t * (3 - 2 * t);
        h *= smooth;
      }
    }

    return h;
  }

  getHeightAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    return this._terrainHeightAt(x, z);
  }

  // Seeded random for reproducibility
  _rand(min = 0, max = 1) {
    this._rng = (this._rng * 9301 + 49297) % 233280;
    return min + (this._rng / 233280) * (max - min);
  }

  // ─── Build pipeline ───────────────────────
  build() {
    this._buildTerrain();
    this._buildDistantHorizon();
    this._buildWater();
    this._buildPaths();
    this._buildJungle();
    this._buildAllStructures();
    this._buildAtmosphere();
    this._buildZoneAssetLayer();
  }

  async buildProgressively({ onProgress = null, yieldFrame = null } = {}) {
    const step = async (label, progress, fn) => {
      onProgress?.(label, progress);
      if (yieldFrame) await yieldFrame();
      fn();
      if (yieldFrame) await yieldFrame();
    };

    await step('Cutting terrain mesh...', 0.28, () => this._buildTerrain());
    await step('Painting distant jungle line...', 0.36, () => this._buildDistantHorizon());
    await step('Laying water and footpaths...', 0.46, () => {
      this._buildWater();
      this._buildPaths();
    });
    await step('Planting low-poly jungle...', 0.58, () => this._buildJungle());
    await step('Building crash site and village...', 0.70, () => this._buildOpeningStructures());
    await step('Adding dust and smoke...', 0.78, () => {
      this._buildAtmosphere();
      this._buildZoneAssetLayer();
    });
  }

  // Gaussian bump helper for authored heightmap regions
  _gaussianBump(x, z, cx, cz, amp, sigma) {
    const dx = x - cx;
    const dz = z - cz;
    return amp * Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
  }

  // Perpendicular distance from point (x,z) to line segment (x1,z1)→(x2,z2)
  _distToSegment(x, z, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) {
      const ex = x - x1, ez = z - z1;
      return Math.sqrt(ex * ex + ez * ez);
    }
    let t = ((x - x1) * dx + (z - z1) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx;
    const pz = z1 + t * dz;
    const ex = x - px, ez = z - pz;
    return Math.sqrt(ex * ex + ez * ez);
  }

  // ─── Terrain (high-quality PBR + grass/mud blend + normals) ───
  // Authored regional heightmap: north ridge, west jungle highlands, central
  // village bowl, east rice paddy lowlands, river canyon, south firebase
  // plateau, and far southwestern hills — plus low-amplitude trig-noise base.
  _buildTerrain() {
    const size = CONFIG.WORLD_SIZE;
    const segs = this.quality.preset === 'low' ? 72 : 96;
    const geo = new THREE.PlaneGeometry(size * 1.5, size * 1.5, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.getHeightAt(x, z));
    }
    geo.computeVertexNormals();

    const grassAlbedo = makeGroundAlbedo({
      base: 0x566147, accent: 0x66705a, speck: 0x37402f,
      size: 192,
      key: 'world-grass-albedo',
    });

    grassAlbedo.repeat.set(52, 52);
    const mat = new THREE.MeshLambertMaterial({
      map: grassAlbedo,
      side: THREE.DoubleSide,
    });

    const terrain = new THREE.Mesh(geo, mat);
    terrain.castShadow = false;
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Dirt path / grass patches sprinkled on top
    this._addGroundDetail();
  }

  // Inject grass/mud blend (color + normal) into the standard MeshStandard shader
  _applyTerrainBlendShader(material, mudMap, mudNormalMap) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.mudMap = { value: mudMap };
      shader.uniforms.mudNormalMap = { value: mudNormalMap };
      shader.uniforms.grassScale = { value: 22.0 };
      shader.uniforms.mudScale = { value: 17.0 };
      shader.uniforms.mudStrength = { value: 0.65 };

      shader.vertexShader = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${shader.vertexShader}
`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vWorldPos = worldPosition.xyz;
vWorldNormal = normalize(mat3(modelMatrix) * normal);`
      );

      shader.fragmentShader = `
uniform sampler2D mudMap;
uniform sampler2D mudNormalMap;
uniform float grassScale;
uniform float mudScale;
uniform float mudStrength;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${shader.fragmentShader}
`
        .replace(
          '#include <map_fragment>',
          `
#ifdef USE_MAP
  vec4 grassSample = texture2D(map, vMapUv * grassScale);
  vec4 mudSample = texture2D(mudMap, vMapUv * mudScale);
  float slope = clamp(1.0 - vWorldNormal.y, 0.0, 1.0);
  float lowland = 1.0 - smoothstep(0.2, 3.0, vWorldPos.y + 0.4);
  float noise = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453123);
  float mudFactor = clamp((lowland * 0.7 + slope * 0.6 + (noise - 0.5) * 0.2) * mudStrength, 0.0, 1.0);
  vec4 terrainColor = mix(grassSample, mudSample, mudFactor);
  diffuseColor *= terrainColor;
#endif
`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 grassN = texture2D(normalMap, vNormalMapUv * grassScale).xyz * 2.0 - 1.0;
  grassN.xy *= normalScale;
  vec3 mudN = texture2D(mudNormalMap, vNormalMapUv * mudScale).xyz * 2.0 - 1.0;
  // re-derive same mudFactor in this stage so blend matches the color blend
  float _slope = clamp(1.0 - vWorldNormal.y, 0.0, 1.0);
  float _lowland = 1.0 - smoothstep(0.2, 3.0, vWorldPos.y + 0.4);
  float _noise = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453123);
  float _mudFactor = clamp((_lowland * 0.7 + _slope * 0.6 + (_noise - 0.5) * 0.2) * mudStrength, 0.0, 1.0);
  vec3 mapN = normalize(mix(grassN, mudN, _mudFactor));
  normal = normalize(tbn * mapN);
#endif
`
        );
    };

    material.customProgramCacheKey = () => 'terrain-blend-v2';
    material.needsUpdate = true;
  }

  _addGroundDetail() {
    // Rice paddy / jungle floor patches — small color variation under foliage.
    const patchMat = new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.96 });
    const dirtMat  = new THREE.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.95 });

    for (let i = 0; i < 28; i++) {
      const x = this._rand(-80, 80);
      const z = this._rand(-80, 80);
      const w = this._rand(3, 10);
      const d = this._rand(3, 10);
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      const mat = this._rand() > 0.5 ? patchMat : dirtMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, this.getHeightAt(x, z) + 0.035, z);
      mesh.rotation.y = this._rand(0, Math.PI);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // ─── Distant horizon — silhouette mountains, hills, pagodas, tree imposters ──
  _buildDistantHorizon() {
    // Far-distance silhouette mountain ring at world edge
    const ringR = 540;
    const mountainCount = 16;
    const mountainGeo = new THREE.ConeGeometry(60, 90, 6);
    const mountainMat = new THREE.MeshBasicMaterial({
      color: 0x4a5d6a,  // desaturated grey-blue, hazy distance
      fog: true,
    });
    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2;
      const jitter = (Math.sin(i * 7.13) + 1) * 0.5;
      const r = ringR + jitter * 60;
      const m = new THREE.Mesh(mountainGeo, mountainMat);
      m.position.set(Math.cos(angle) * r, 25 + jitter * 30, Math.sin(angle) * r);
      m.scale.set(0.7 + jitter * 0.6, 0.8 + jitter * 0.5, 0.7 + jitter * 0.6);
      m.rotation.y = jitter * 6.28;
      this.scene.add(m);
    }

    // Closer-band darker hill silhouettes (between far-ring and near terrain)
    const innerRingR = 360;
    const innerCount = 12;
    const hillGeo = new THREE.ConeGeometry(35, 50, 5);
    const hillMat = new THREE.MeshBasicMaterial({ color: 0x3d5042, fog: true });
    for (let i = 0; i < innerCount; i++) {
      // Skip the side near the village (south-ish) so the player has clear sightlines toward gameplay zones
      const angle = (i / innerCount) * Math.PI * 2;
      if (angle > Math.PI * 0.4 && angle < Math.PI * 1.2) continue; // gap toward village
      const jitter = (Math.cos(i * 4.3) + 1) * 0.5;
      const r = innerRingR + jitter * 40;
      const m = new THREE.Mesh(hillGeo, hillMat);
      m.position.set(Math.cos(angle) * r, 8 + jitter * 12, Math.sin(angle) * r);
      m.scale.set(0.9 + jitter * 0.6, 0.7 + jitter * 0.4, 0.9 + jitter * 0.6);
      this.scene.add(m);
    }

    // 2-3 distant pagoda spires for memorable landmarks
    const pagodaPositions = [
      { x: -340, z: -260 }, // northwest
      { x:  280, z:  220 }, // southeast
      { x: -200, z:  340 }, // south
    ];
    pagodaPositions.forEach(p => {
      const g = new THREE.Group();
      // Base tier
      const baseMat = new THREE.MeshBasicMaterial({ color: 0x5a4d3a, fog: true });
      const tierMat = new THREE.MeshBasicMaterial({ color: 0x8a3025, fog: true }); // red-brown roof
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 8, 8), baseMat);
      base.position.y = 4;
      g.add(base);
      // 3 stacked tiers
      for (let t = 0; t < 3; t++) {
        const w = 4 - t * 0.8;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w + 0.7, 1.2, 8), tierMat);
        roof.position.y = 8 + t * 3 + 0.6;
        g.add(roof);
        const tier = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.85, w, 2.4, 8), baseMat);
        tier.position.y = 9.5 + t * 3;
        g.add(tier);
      }
      // Spire on top
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 4, 6),
        new THREE.MeshBasicMaterial({ color: 0xa08858, fog: true }));
      spire.position.y = 19;
      g.add(spire);
      g.position.set(p.x, 0, p.z);
      this.scene.add(g);
    });

    // Far-band tree imposters: a sparse instanced ring of low-poly cone trees
    // around radius 200-300, gives midground depth between near-trees and the
    // far mountain silhouettes.
    const imposterGeo = new THREE.ConeGeometry(2.5, 7, 5);
    const imposterMat = new THREE.MeshBasicMaterial({ color: 0x2a4a1c, fog: true });
    const imposterCount = 180;
    const imposters = new THREE.InstancedMesh(imposterGeo, imposterMat, imposterCount);
    const _m = new THREE.Matrix4();
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3();
    for (let i = 0; i < imposterCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 220 + Math.random() * 120;
      _p.set(Math.cos(angle) * r, 3 + Math.random() * 3, Math.sin(angle) * r);
      _q.identity();
      _s.set(0.7 + Math.random() * 0.7, 0.8 + Math.random() * 0.6, 0.7 + Math.random() * 0.7);
      _m.compose(_p, _q, _s);
      imposters.setMatrixAt(i, _m);
    }
    imposters.instanceMatrix.needsUpdate = true;
    imposters.frustumCulled = false;
    this.scene.add(imposters);
  }

  // ─── Water / rice paddies ─────────────────
  _buildWater() {
    // Subtle rippling normal from textures.js
    let waterNormal = null;
    try {
      waterNormal = makeNoiseNormal({ scale: 8, strength: 0.6, key: 'world-water-normal' });
      waterNormal.repeat.set(4, 4);
    } catch (e) {
      waterNormal = null;
    }

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3a6a64,
      transparent: true,
      opacity: 0.78,
      roughness: 0.15,
      metalness: 0.4,
    });
    if (waterNormal) {
      waterMat.normalMap = waterNormal;
      waterMat.normalScale = new THREE.Vector2(0.4, 0.4);
    }

    const paddies = [
      { x: 30, z: 30, w: 18, d: 10 },
      { x: 22, z: 42, w: 12, d: 8  },
      { x:-30, z: 55, w: 20, d: 12 },
    ];
    paddies.forEach(p => {
      const geo = new THREE.PlaneGeometry(p.w, p.d);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.position.set(p.x, 0.06, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.waterMeshes.push(mesh);

      // Paddy berm walls
      const bermMat = new THREE.MeshStandardMaterial({ color: 0x4a5c3a, roughness: 0.9 });
      [[p.x, p.z + p.d / 2], [p.x, p.z - p.d / 2]].forEach(([bx, bz]) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.4, 0.25, 0.35), bermMat);
        b.position.set(bx, 0.1, bz);
        b.castShadow = true;
        b.receiveShadow = true;
        this.scene.add(b);
      });
    });

    // River corridor at the river crossing zone (was a pure-white void).
    const riverMat = waterMat.clone();
    riverMat.color.setHex(0x2c4a5a);
    riverMat.opacity = 0.85;
    const riverGeo = new THREE.PlaneGeometry(80, 14);
    riverGeo.rotateX(-Math.PI / 2);
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.position.set(83, 0.04, -6);
    river.receiveShadow = true;
    this.scene.add(river);
    this.waterMeshes.push(river);
    // Muddy banks on each side of the river so the dock doesn't float.
    const bankMat = new THREE.MeshStandardMaterial({ color: 0x5c4a30, roughness: 0.95 });
    [-1, 1].forEach(side => {
      const bank = new THREE.Mesh(new THREE.PlaneGeometry(80, 4), bankMat);
      bank.rotateX(-Math.PI / 2);
      bank.position.set(83, 0.05, -6 + side * 9);
      bank.receiveShadow = true;
      this.scene.add(bank);
    });

    // ── Larger river: full-length eastern map flow ──
    // Polyline (60,8) → (300,-30) → (380,-200). Build as oriented segments
    // each rotated to align with its tangent. Width 16m. Uses riverMat.
    const riverPath = [
      { x: 60,  z: 8    },
      { x: 300, z: -30  },
      { x: 380, z: -200 },
    ];
    const riverWidth = 16;
    for (let s = 0; s < riverPath.length - 1; s++) {
      const a = riverPath[s];
      const b = riverPath[s + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      // Subdivide each segment into 2 to keep geometry roughly planar even
      // though we keep it flat at y=0.04. Using a single segment is fine.
      const segGeo = new THREE.PlaneGeometry(len, riverWidth);
      segGeo.rotateX(-Math.PI / 2);
      const segMesh = new THREE.Mesh(segGeo, riverMat);
      segMesh.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
      // PlaneGeometry width is along local X (after rotateX). Tangent angle:
      const angle = Math.atan2(dz, dx);
      segMesh.rotation.y = -angle;
      segMesh.receiveShadow = true;
      this.scene.add(segMesh);
      this.waterMeshes.push(segMesh);
    }

    // ── Western jungle highland ponds / swamps ──
    const swampMat = waterMat.clone();
    swampMat.color.setHex(0x2a3a30);
    swampMat.opacity = 0.82;
    const ponds = [
      { x: -180, z: -100, w: 14, d: 10 },
      { x: -220, z: -50,  w: 10, d:  8 },
      { x: -150, z: -150, w:  9, d:  7 },
    ];
    ponds.forEach(p => {
      const geo = new THREE.PlaneGeometry(p.w, p.d);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, swampMat);
      m.position.set(p.x, 0.05, p.z);
      m.receiveShadow = true;
      this.scene.add(m);
      this.waterMeshes.push(m);
    });
  }

  // ─── Paths (kept verbatim) ────────────────
  _buildPaths() {
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x6a5530, roughness: 0.95 });
    const paths = [
      // Village to VC camp
      { x: 0,    z:-10, w: 3, d: 40 },
      { x:-20,   z:-30, w: 3, d: 30, rot: 0.3 },
      // Village to clinic
      { x: 30,   z: 20, w: 3, d: 40, rot: -0.08 },
      // Clinic to river
      { x: 70,   z: 8,  w: 3, d: 36, rot: -0.55 },
      // River to outpost
      { x: 90,   z:-38, w: 3, d: 64, rot: -0.08 },
    ];
    paths.forEach(p => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), pathMat);
      mesh.rotateX(-Math.PI / 2);
      if (p.rot) mesh.rotateZ(p.rot);
      mesh.position.set(p.x, 0.02, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }

  // ─── Jungle (delegates to VegetationBuilder) ──
  _buildJungle() {
    const veg = new VegetationBuilder(this.scene, {
      registerLOD: (high, low, x, z, d) => this._registerFoliageLOD(high, low, x, z, d),
      addCollider: (x, z, r, h) => this._addCollider(x, z, r, h),
      rand: (a, b) => this._rand(a, b),
      quality: this.quality,
      groundHeight: (x, z) => this.getHeightAt(x, z),
    });

    const avoidZones = [
      { x:  0, z: 20,  r: 22 }, // village
      { x:-52, z:-42,  r: 26 }, // VC camp
      { x:-18, z: 85,  r: 18 }, // crash site
      { x: 58, z: 18,  r: 14 }, // clinic
      { x: 83, z: -6,  r: 18 }, // river crossing
      { x: 95, z: 18,  r: 16 }, // hamlet
      { x: 96, z:-72,  r: 20 }, // ARVN outpost
    ];

    const treeCount = this.quality.preset === 'low'
      ? 24
      : Math.max(42, Math.floor(140 * this.quality.foliageMultiplier));
    for (let i = 0; i < treeCount; i++) {
      const pos = this._placeAvoiding(avoidZones, -110, 110);
      if (!pos) continue;

      // ── Density bias by zone ──
      let densityWeight = 1.0;
      // VC approach jungle (south-west quadrant) — denser
      if (pos.x < -20 && pos.z < 0) densityWeight *= 1.8;
      // Cleared corridor (clinic/river/hamlet) — sparser
      if (pos.x > 60 && pos.x < 100 && pos.z > -20 && pos.z < 30) densityWeight *= 0.4;
      // ARVN outpost halo — sparser
      const dxA = pos.x - 96, dzA = pos.z - (-72);
      if (Math.sqrt(dxA * dxA + dzA * dzA) < 25) densityWeight *= 0.3;
      // Probabilistic skip if weight reduces density
      if (densityWeight < 1.0 && this._rand() > densityWeight) continue;
      // For weights > 1, we keep this candidate AND occasionally place a 2nd tree
      const placeSecond = (densityWeight > 1.0) && (this._rand() < (densityWeight - 1.0));

      const t = this._rand();
      if      (t < 0.45) veg.buildPalm(pos.x, pos.z);
      else if (t < 0.75) veg.buildBamboo(pos.x, pos.z);
      else               veg.buildBanyan(pos.x, pos.z);

      if (placeSecond) {
        const jx = pos.x + this._rand(-3, 3);
        const jz = pos.z + this._rand(-3, 3);
        const t2 = this._rand();
        if      (t2 < 0.5) veg.buildPalm(jx, jz);
        else               veg.buildBamboo(jx, jz);
      }
    }

    // ── Hand-placed canopy shade near village center (4-6 banyan/palm) ──
    const canopyCount = this.quality.preset === 'low' ? 1 : 3;
    for (let i = 0; i < canopyCount; i++) {
      const cx = 0 + this._rand(-6, 6);
      const cz = 20 + this._rand(-6, 6);
      // Skip too close to fire pit (2,24) and well (6,28) and elder hut (-4,16)
      const tooClose =
        ((cx - 2) ** 2 + (cz - 24) ** 2 < 4) ||
        ((cx - 6) ** 2 + (cz - 28) ** 2 < 4) ||
        ((cx + 4) ** 2 + (cz - 16) ** 2 < 9);
      if (tooClose) continue;
      if (i % 2 === 0) veg.buildBanyan(cx, cz);
      else             veg.buildPalm(cx, cz);
    }

    // Instanced grass + ferns — the big visual win
    veg.buildInstancedGroundCover({
      areaRadius: 96,
      grassCount: this.quality.preset === 'low' ? 450 : 900,
      fernCount:  this.quality.preset === 'low' ? 80 : 180,
      avoidZones,
    });

    // Stash veg builder so structures (shrine ruin) can use buildHangingVines.
    this._veg = veg;
  }

  // Placement helper — retries up to 8 times to find a spot outside avoid zones
  _placeAvoiding(avoid, min, max) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = this._rand(min, max);
      const z = this._rand(min, max);
      const clear = avoid.every(z2 => {
        const dx = x - z2.x, dz = z - z2.z;
        return Math.sqrt(dx * dx + dz * dz) > z2.r;
      });
      if (clear) return { x, z };
    }
    return null;
  }

  // ─── Structures (delegates to BuildingsBuilder) ──
  _createBuildingsBuilder() {
    return new BuildingsBuilder(this.scene, {
      addCollider: (x, z, r, h) => this._addCollider(x, z, r, h),
      addInteractable: (item) => this.interactables.push(item),
      rand: (a, b) => this._rand(a, b),
      flickerLight: (l) => this._flickerLight(l),
    });
  }

  _captureBuilderAnimations(builder) {
    if (builder.blinkers && builder.blinkers.length) {
      this._blinkers = (this._blinkers || []).concat(builder.blinkers);
      builder.blinkers = [];
    }
  }

  _buildOpeningStructures(builder = this._createBuildingsBuilder()) {
    if (this._openingStructuresBuilt) return builder;
    this._openingStructuresBuilt = true;
    this._builtVillageIndexes = this._builtVillageIndexes || new Set();
    const lowFirstPass = this.quality.preset === 'low';

    // ── Village ────────────────────────────
    LEVEL.village.buildings.forEach((b, index) => {
      const keepForFirstView = !lowFirstPass || b.npcId || b.type === 'market' || index === 1;
      if (!keepForFirstView) return;
      builder.buildVietHut(b);
      this._builtVillageIndexes.add(index);
    });
    builder.buildWell(6, 28);

    // ── Helicopter wreck ───────────────────
    const { x: cx, z: cz } = LEVEL.crashSite;
    const wreck = builder.buildHelicopterWreck(cx, cz);
    if (wreck && wreck.smokeMeshes) {
      wreck.smokeMeshes.forEach(s => {
        const idx = (s.userData && s.userData.smokeIndex) || 0;
        this._animateSmoke(s, idx);
      });
    }

    if (!lowFirstPass) {
      this._buildOpeningDressing(builder);
    }

    this._captureBuilderAnimations(builder);
    return builder;
  }

  _buildOpeningDressing(builder = this._createBuildingsBuilder()) {
    if (this._openingDressingBuilt) return;
    this._openingDressingBuilt = true;
    this._builtVillageIndexes = this._builtVillageIndexes || new Set();

    LEVEL.village.buildings.forEach((b, index) => {
      if (this._builtVillageIndexes.has(index)) return;
      builder.buildVietHut(b);
      this._builtVillageIndexes.add(index);
    });

    builder.buildBarrels(8, 26, 2);
    builder.buildCrates(-6, 34, 1);
    builder.buildFirePit(2, 24);
    builder.buildVillageLife(0, 20);

    const { x: cx, z: cz } = LEVEL.crashSite;
    builder.buildWreckDebrisTrail(cx, cz, 45);
  }

  _buildMissionStructures(builder, {
    includeCampDressing = true,
    includeOutskirts = false,
    includeRoads = false,
    applyBattleDamage = true,
  } = {}) {
    if (this._missionStructuresBuilt) return;
    this._missionStructuresBuilt = true;

    // ── VC camp ────────────────────────────
    builder.buildFence(-35, -25, -70, -25);
    builder.buildFence(-70, -25, -70, -60);
    builder.buildFence(-70, -60, -35, -60);
    builder.buildFence(-35, -60, -35, -25);
    builder.buildWatchtower(-68, -26);
    LEVEL.vcCamp.buildings.forEach(b => builder.buildVCBuilding(b));
    builder.buildRadioTower(-44, -44);
    builder.buildSandbags(-50, -32, 6, 0);
    builder.buildSandbags(-38, -38, 0, 5);
    if (includeCampDressing) {
      builder.buildVCCampDressing(LEVEL.vcCamp.center.x, LEVEL.vcCamp.center.z);
    }

    // Camp dirt floor (simple)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x4a3820, roughness: 0.95 })
    );
    floor.rotateX(-Math.PI / 2);
    floor.position.set(-52, 0.015, -42);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ── Clinic ─────────────────────────────
    builder.buildClinic(
      LEVEL.clinic.center.x, LEVEL.clinic.center.z,
      LEVEL.clinic.cache.x,  LEVEL.clinic.cache.z
    );
    builder.makeClinicAbandoned(LEVEL.clinic.center.x, LEVEL.clinic.center.z);

    // ── River crossing ─────────────────────
    builder.buildRiverCrossing(
      LEVEL.riverCrossing.center.x, LEVEL.riverCrossing.center.z,
      LEVEL.riverCrossing.post.x,   LEVEL.riverCrossing.post.z,
      LEVEL.riverCrossing.convoy.x, LEVEL.riverCrossing.convoy.z
    );
    builder.addRiverCrossingDressing(LEVEL.riverCrossing.center.x, LEVEL.riverCrossing.center.z);

    // ── Hamlet ─────────────────────────────
    builder.buildHamlet(LEVEL.hamlet.center.x, LEVEL.hamlet.center.z);

    // ── ARVN outpost ───────────────────────
    builder.buildARVNOutpost(LEVEL.arvnOutpost);

    // ── Tunnel entrances (Cu Chi) ─────────
    builder.buildTunnelEntrance(0, 44);
    builder.buildTunnelEntrance(-46, -28);

    // ── Buddhist shrine ruin ──────────────
    builder.buildShrineRuin(72, 4, this._veg || null);

    if (includeOutskirts) {
      // ── Open-world outskirt POIs (8 atmospheric set-pieces) ──
      const ow = new OpenWorldBuilder(this.scene, {
        buildings:       builder,
        vegetation:      this._veg,
        addCollider:     (x, z, r, h) => this._addCollider(x, z, r, h),
        addInteractable: (item)        => this.interactables.push(item),
        rand:            (a, b)        => this._rand(a, b),
      });
      ow.buildAll();
    }

    if (includeRoads) {
      // ── Road network connecting all POIs ──
      new RoadNetwork(this.scene).buildAll();
    }

    if (applyBattleDamage) {
      // ── Battle damage cosmetic pass (last, after all buildings) ─
      builder.applyBattleDamage();
    }

    this._captureBuilderAnimations(builder);
  }

  _buildAllStructures() {
    const builder = this._createBuildingsBuilder();
    this._buildOpeningStructures(builder);
    this._buildMissionStructures(builder, {
      includeCampDressing: true,
      includeOutskirts: true,
      includeRoads: true,
      applyBattleDamage: true,
    });
  }

  async streamRemainingZones({ yieldFrame = null } = {}) {
    if (this._deferredZonesBuilt) return;
    this._deferredZonesBuilt = true;

    const builder = this._createBuildingsBuilder();
    const streamStep = async (fn) => {
      if (yieldFrame) await yieldFrame();
      fn();
      if (yieldFrame) await yieldFrame();
    };

    await streamStep(() => this._buildOpeningDressing(builder));
    await streamStep(() => this._buildMissionStructures(builder, {
      includeCampDressing: this.quality.preset !== 'low',
      includeOutskirts: false,
      includeRoads: false,
      applyBattleDamage: this.quality.preset !== 'low',
    }));
  }

  // ─── Atmosphere (dust motes, haze, light shaft) ──
  _getHazeTexture() {
    if (World._hazeTexture) return World._hazeTexture;
    if (typeof document === 'undefined') return null;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    gradient.addColorStop(0.0, 'rgba(255,255,255,0.50)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    World._hazeTexture = texture;
    return texture;
  }

  _buildAtmosphere() {
    // 1) Floating dust motes (Three.js Points)
    const dustCount = 60;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustOffsets   = new Float32Array(dustCount); // for individual phase
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3 + 0] = (this._rand() - 0.5) * 50;
      dustPositions[i * 3 + 1] = 1.5 + this._rand() * 6;
      dustPositions[i * 3 + 2] = (this._rand() - 0.5) * 50;
      dustOffsets[i] = this._rand(0, Math.PI * 2);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

    const dustMat = new THREE.PointsMaterial({
      color: 0xb9aa84,
      size: 0.07,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.position.set(0, 0, 0);
    this.scene.add(dust);
    this.particles.push({ kind: 'dust', mesh: dust, offsets: dustOffsets, basePositions: dustPositions.slice() });

    // 2) Haze sprite near village fire pit
    const hazeMap = this._getHazeTexture();
    const hazeMat = new THREE.SpriteMaterial({
      map: hazeMap,
      color: 0xd1a86a,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const villageHaze = new THREE.Sprite(hazeMat.clone());
    villageHaze.scale.set(6, 4, 1);
    villageHaze.position.set(2, 2.4, 24);
    this.scene.add(villageHaze);
    this.particles.push({ kind: 'haze', mesh: villageHaze, baseY: 2.4, phase: 0 });

    // 3) Haze near helicopter wreck
    const wreckHaze = new THREE.Sprite(hazeMat.clone());
    wreckHaze.material.color.setHex(0x8c8a7c);
    wreckHaze.material.opacity = 0.16;
    wreckHaze.scale.set(8, 5.5, 1);
    const cw = LEVEL.crashSite;
    wreckHaze.position.set(cw.x, 4.5, cw.z + 1);
    this.scene.add(wreckHaze);
    this.particles.push({ kind: 'haze', mesh: wreckHaze, baseY: 4.5, phase: 1.7 });

    // 4) Volumetric-feeling light shaft near canopy break above the village
    const shaftGeo = new THREE.ConeGeometry(8, 22, 8, 1, true);
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xd0c090,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    // Cone apex at top — flip so wide end is at the canopy and narrow opens down
    shaft.rotation.z = 0.18;
    shaft.position.set(-3, 12, 26);
    this.scene.add(shaft);
    this.particles.push({ kind: 'shaft', mesh: shaft, basePhase: 0 });
  }

  _updateAtmosphere(dt, t) {
    for (const p of this.particles) {
      if (p.kind === 'dust') {
        const pos = p.mesh.geometry.attributes.position;
        const arr = pos.array;
        const base = p.basePositions;
        for (let i = 0; i < p.offsets.length; i++) {
          const phase = p.offsets[i];
          arr[i * 3 + 0] = base[i * 3 + 0] + Math.sin(t * 0.4 + phase) * 0.4;
          arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.6 + phase * 1.7) * 0.3;
          arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.35 + phase * 1.3) * 0.4;
        }
        pos.needsUpdate = true;
      } else if (p.kind === 'haze') {
        p.mesh.position.y = p.baseY + Math.sin(t * 0.5 + p.phase) * 0.25;
        p.mesh.material.opacity = 0.16 + Math.sin(t * 0.3 + p.phase) * 0.05;
      } else if (p.kind === 'shaft') {
        p.mesh.material.opacity = 0.03 + Math.sin(t * 0.25) * 0.01;
      }
    }
  }

  // Animated dark smoke spheres above the wreck (kept — used as callback)
  // Register a smoke mesh for frame-driven sway. Replaces the old per-mesh RAF
  // loop, which never terminated and survived game restarts.
  _animateSmoke(mesh, i) {
    if (!this._smokes) this._smokes = [];
    this._smokes.push({ mesh, baseY: mesh.position.y, t: i * 0.5 });
  }

  // Register a fire/lamp light for frame-driven flicker. Replaces the old
  // setTimeout recursion. Each entry: { light, base, next: timeUntilStep }.
  _flickerLight(light) {
    if (!this._flickers) this._flickers = [];
    this._flickers.push({ light, base: light.intensity, next: 0 });
  }

  // ─── Optional asset layer (GLB streaming — unchanged) ──
  _buildZoneAssetLayer() {
    this._buildManifestZoneAssets('village', []);
  }

  async _buildManifestZoneAssets(zone, fallbackEntries = []) {
    if (!this.assetManager?.loadZoneManifest || !this.assetManager?.resolveZoneEntriesFromManifest) {
      fallbackEntries.forEach(entry => this._spawnZoneAsset(entry));
      return;
    }

    const manifest = await this.assetManager.loadZoneManifest(zone);
    const manifestEntries = this.assetManager.resolveZoneEntriesFromManifest(
      manifest,
      this.quality.preset || 'medium'
    );

    if (manifestEntries.length === 0) {
      fallbackEntries.forEach(entry => this._spawnZoneAsset(entry));
      return;
    }

    manifestEntries.forEach(entry => this._spawnZoneAsset(entry));

    const manifestAnchorIds = new Set(
      manifestEntries.map(entry => entry.anchorId).filter(Boolean)
    );
    const unmatchedFallback = fallbackEntries.filter(entry => {
      const normalized = entry.id.startsWith(zone + '-') ? entry.id.slice(zone.length + 1) : entry.id;
      return !manifestAnchorIds.has(normalized);
    });
    unmatchedFallback.forEach(entry => this._spawnZoneAsset(entry));
  }

  async _spawnZoneAsset(entry) {
    const fallback = this._buildZoneFallback(entry);
    if (fallback) this.scene.add(fallback);

    if (!this.assetManager) return;
    const loaded = await this.assetManager.loadGLTFOptional(entry.id, entry.url, {
      castShadow: true,
      receiveShadow: true,
    });
    if (!loaded) return;

    loaded.position.set(entry.x, entry.y || 0, entry.z);
    loaded.rotation.y = entry.r || 0;
    loaded.scale.setScalar(entry.s || 1);
    this.scene.add(loaded);
    if (fallback) this.scene.remove(fallback);
  }

  _buildZoneFallback(entry) {
    // Placeholder proxies so each zone can receive asset-driven replacement incrementally.
    const g = new THREE.Group();
    g.position.set(entry.x, entry.y || 0, entry.z);
    g.rotation.y = entry.r || 0;
    const baseColor = {
      village: 0x7a6848,
      camp: 0x5d5a45,
      clinic: 0x727779,
      river: 0x5a4a34,
      hamlet: 0x77593f,
      outpost: 0x5f644d,
    }[entry.zone] || 0x666666;

    const mat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.88, metalness: 0.04 });
    const boxA = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.0), mat);
    boxA.position.y = 0.9;
    g.add(boxA);
    const boxB = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), mat);
    boxB.position.set(0.9, 0.5, -0.8);
    g.add(boxB);

    g.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return g;
  }

  // ─── Foliage LOD registration (called by vegetation.js callback) ──
  _registerFoliageLOD(highMeshes, lowMesh, x, z, swapDist) {
    if (!lowMesh || !highMeshes?.length) return;
    lowMesh.visible = false;
    this.scene.add(lowMesh);
    this.foliageLodPairs.push({ highMeshes, lowMesh, x, z, swapDist });
  }

  _updateFoliageLOD(cameraPos) {
    if (!cameraPos || this.foliageLodPairs.length === 0) return;
    this._foliageLodTick++;
    if (this._foliageLodTick % 3 !== 0) return;

    for (const entry of this.foliageLodPairs) {
      const dx = cameraPos.x - entry.x;
      const dz = cameraPos.z - entry.z;
      const near = (dx * dx + dz * dz) < (entry.swapDist * entry.swapDist);
      entry.lowMesh.visible = !near;
      for (const hm of entry.highMeshes) hm.visible = near;
    }
  }

  // ─── Collision system ─────────────────────
  _addCollider(x, z, radius, height) {
    const minY = this.getHeightAt(x, z);
    this.colliders.push({ x, z, radius, height, minY, maxY: minY + height });
  }

  checkCollision(pos, radius = CONFIG.PLAYER_RADIUS) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius + c.radius && pos.y < c.maxY && pos.y > c.minY - 0.5) {
        const safeDist = dist || 0.0001;
        const nx = dx / safeDist;
        const nz = dz / safeDist;
        const overlap = radius + c.radius - dist;
        return { hit: true, nx, nz, overlap };
      }
    }
    return { hit: false };
  }

  getNearbyInteractable(pos, range = CONFIG.INTERACT_RANGE) {
    let best = null, bestDist = range;
    for (const item of this.interactables) {
      const dx = pos.x - item.x, dz = pos.z - item.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; best = item; }
    }
    return best;
  }

  // Per-frame: water shimmer + LOD swap + atmosphere drift + smoke + flicker
  update(dt, cameraPos = null) {
    const t = Date.now() * 0.001;
    this.waterMeshes.forEach((m, i) => {
      m.material.opacity = 0.65 + Math.sin(t + i) * 0.1;
    });
    this._updateFoliageLOD(cameraPos);
    this._updateAtmosphere?.(dt, t);

    if (this._smokes) {
      for (const s of this._smokes) {
        s.t += dt * 0.6;
        s.mesh.position.y = s.baseY + Math.sin(s.t * 0.5) * 0.3;
        if (s.mesh.material) {
          s.mesh.material.opacity = 0.2 + Math.sin(s.t) * 0.1;
        }
      }
    }
    if (this._flickers) {
      for (const f of this._flickers) {
        f.next -= dt;
        if (f.next <= 0) {
          f.light.intensity = f.base + (Math.random() - 0.5) * 0.8;
          f.next = 0.08 + Math.random() * 0.12;
        }
      }
    }
    if (this._blinkers) {
      for (const b of this._blinkers) {
        const data = b.userData.blink;
        if (!data) continue;
        const period = 0.92;       // ~one full cycle per second
        const onWindow = 0.22;
        const phase = (t + data.phase) % period;
        const on = phase < onWindow;
        b.intensity = on ? data.baseI : 0;
        if (data.lightSphere?.material) {
          data.lightSphere.material.color.setHex(on ? data.onColor : data.offColor);
        }
      }
    }
  }

  setQuality(quality = {}) {
    this.quality = {
      ...this.quality,
      ...quality,
    };
  }
}
