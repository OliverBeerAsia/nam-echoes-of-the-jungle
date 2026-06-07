// decals.js — Pooled world-decal manager + procedural camera shake
// =============================================================================
//
// Integration with game.js (wiring agent will perform these edits):
//
//   import { DecalManager, CameraShake } from './decals.js';
//
//   // In Game constructor (after this.scene is built):
//   this.decals = new DecalManager(this.scene);
//   this.shake  = new CameraShake();
//
//   // In _onShoot, AFTER the enemy hit early-return: do a separate raycast
//   // against a curated list of world meshes (terrain, buildings, foliage),
//   // filtering out sprites. Then:
//   //   const hit = raycaster.intersectObjects(curatedList, true)[0];
//   //   if (hit && hit.face) {
//   //     const nameTag = (hit.object.name || '').toLowerCase();
//   //     const worldNormal = hit.face.normal.clone()
//   //       .transformDirection(hit.object.matrixWorld).normalize();
//   //     if (nameTag.includes('foliage') || nameTag.includes('grass')) {
//   //       this.decals.addDirtPuff(hit.object, hit.point, worldNormal);
//   //     } else {
//   //       this.decals.addBulletHole(hit.object, hit.point, worldNormal);
//   //     }
//   //   }
//   //   this.shake.shake(0.012, 0.05);
//
//   // In _showBulletHitEffect on enemy hit: blood splat
//   //   this.decals.addBlood(enemyMesh, hitPoint, worldNormal);
//
//   // In Grenade._explode:
//   //   this.decals.addScorch(groundMesh, this.pos, new THREE.Vector3(0, 1, 0), 1.5);
//   //   this.shake.shake(0.08, 0.5);
//
//   // On player damage:
//   //   this.shake.shake(0.06, 0.3);
//
//   // In _loop AFTER physics.step, BEFORE render():
//   //   this.decals.update(dt);
//   //   this.shake.update(dt);
//   //   this.shake.apply(this.camera);
// =============================================================================

import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// ─── Internal pool ──────────────────────────────────────────────────────────
class Pool {
  constructor(max) {
    this.max = max;
    this.items = [];
  }

  push(mesh, ttl = Infinity) {
    this.items.push({ mesh, age: 0, ttl, baseOpacity: mesh.material?.opacity ?? 1 });
    if (this.items.length > this.max) {
      const old = this.items.shift();
      this._dispose(old.mesh);
    }
  }

  update(dt) {
    for (const item of this.items) {
      item.age += dt;
      if (item.ttl !== Infinity) {
        const fadeStart = Math.max(0, item.ttl - 1.0);
        if (item.age > fadeStart && item.mesh.material) {
          const remaining = Math.max(0, item.ttl - item.age);
          item.mesh.material.opacity = item.baseOpacity * remaining;
        }
      }
    }
    // Cull expired
    this.items = this.items.filter((item) => {
      if (item.ttl !== Infinity && item.age > item.ttl) {
        this._dispose(item.mesh);
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const item of this.items) this._dispose(item.mesh);
    this.items = [];
  }

  _dispose(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.parent) mesh.parent.remove(mesh);
  }
}

// ─── Procedural canvas textures ─────────────────────────────────────────────
function _makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function _toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function _bulletHoleTexture() {
  const size = 64;
  const c = _makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // Soft outer rim highlight (slightly lighter ring around hole)
  const rim = ctx.createRadialGradient(cx, cy, 6, cx, cy, 18);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(0.5, 'rgba(140,120,100,0.28)');
  rim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();

  // Dark central disk
  const core = ctx.createRadialGradient(cx, cy, 1, cx, cy, 9);
  core.addColorStop(0, 'rgba(8,6,5,1)');
  core.addColorStop(0.7, 'rgba(18,14,12,0.95)');
  core.addColorStop(1, 'rgba(20,16,14,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();

  // Ragged radial cracks
  const spokes = 9 + Math.floor(Math.random() * 5);
  ctx.strokeStyle = 'rgba(15,10,8,0.85)';
  ctx.lineCap = 'round';
  for (let i = 0; i < spokes; i++) {
    const ang = (i / spokes) * Math.PI * 2 + Math.random() * 0.4;
    const len = 6 + Math.random() * 9;
    ctx.lineWidth = 0.6 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 3, cy + Math.sin(ang) * 3);
    // Slight kink mid-crack for ragged look
    const mx = cx + Math.cos(ang + 0.15) * (len * 0.55);
    const my = cy + Math.sin(ang + 0.15) * (len * 0.55);
    const ex = cx + Math.cos(ang) * len;
    const ey = cy + Math.sin(ang) * len;
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }

  // A few stray fragment specks
  ctx.fillStyle = 'rgba(10,8,6,0.7)';
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 11 + Math.random() * 6;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.6 + Math.random() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  return _toTexture(c);
}

function _scorchTexture() {
  const size = 128;
  const c = _makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // Feathered dark blob
  const blob = ctx.createRadialGradient(cx, cy, 4, cx, cy, 56);
  blob.addColorStop(0, 'rgba(15,10,5,0.95)');
  blob.addColorStop(0.4, 'rgba(25,18,10,0.85)');
  blob.addColorStop(0.75, 'rgba(35,25,15,0.45)');
  blob.addColorStop(1, 'rgba(40,30,20,0)');
  ctx.fillStyle = blob;
  ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.fill();

  // Faint orange embers near the center
  for (let i = 0; i < 12; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * 18;
    const ex = cx + Math.cos(ang) * r;
    const ey = cy + Math.sin(ang) * r;
    const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, 4);
    grad.addColorStop(0, 'rgba(255,140,40,0.45)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Charred speckles scattered across blob
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  for (let i = 0; i < 80; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * 50;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.4 + Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  return _toTexture(c);
}

function _bloodTexture() {
  const size = 64;
  const c = _makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // Main splat
  const main = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
  main.addColorStop(0, 'rgba(120,8,8,0.98)');
  main.addColorStop(0.5, 'rgba(95,5,5,0.9)');
  main.addColorStop(1, 'rgba(70,2,2,0)');
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();

  // Irregular tendrils/lobes
  ctx.fillStyle = 'rgba(110,5,5,0.85)';
  for (let i = 0; i < 7; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 14 + Math.random() * 10;
    const lobeR = 3 + Math.random() * 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, lobeR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer perimeter droplets
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 22 + Math.random() * 9;
    const dr = 0.6 + Math.random() * 1.8;
    ctx.fillStyle = `rgba(${100 + Math.random() * 30 | 0},${4 + Math.random() * 8 | 0},${4 + Math.random() * 6 | 0},${0.55 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, dr, 0, Math.PI * 2);
    ctx.fill();
  }

  return _toTexture(c);
}

function _dirtPuffTexture() {
  const size = 64;
  const c = _makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // Soft tan/brown splat
  const blob = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
  blob.addColorStop(0, 'rgba(150,120,80,0.55)');
  blob.addColorStop(0.5, 'rgba(120,95,60,0.35)');
  blob.addColorStop(1, 'rgba(100,80,55,0)');
  ctx.fillStyle = blob;
  ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();

  // A few darker dirt clods
  ctx.fillStyle = 'rgba(70,55,35,0.45)';
  for (let i = 0; i < 10; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * 18;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.7 + Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  return _toTexture(c);
}

// ─── DecalManager ───────────────────────────────────────────────────────────
export class DecalManager {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.maxDecals = opts.maxDecals ?? 96;

    // Single shared pool, FIFO eviction across all decal types
    this.pool = new Pool(this.maxDecals);

    // Lazily-built textures (so a unit test on Node won't fail at import)
    this._tex = {};

    // Pre-built materials per type — cloned per-decal so opacity fades work
    this._matTemplates = null;

    // Reusable scratch objects to avoid allocations
    this._helper = new THREE.Object3D();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpUp = new THREE.Vector3(0, 0, 1);
  }

  _ensureAssets() {
    if (this._matTemplates) return;
    this._tex.bullet = _bulletHoleTexture();
    this._tex.scorch = _scorchTexture();
    this._tex.blood = _bloodTexture();
    this._tex.dirt = _dirtPuffTexture();

    const baseMat = (map, opacity = 1) => new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
    });

    this._matTemplates = {
      bullet: baseMat(this._tex.bullet, 1.0),
      scorch: baseMat(this._tex.scorch, 0.9),
      blood:  baseMat(this._tex.blood, 1.0),
      dirt:   baseMat(this._tex.dirt, 0.7),
    };
  }

  // ─── Internal: create + register a decal mesh ─────────────────────────────
  _spawn(surfaceMesh, point, normal, sizeVec, matKey, ttl) {
    if (!surfaceMesh || !point || !normal) return null;
    this._ensureAssets();
    const materialTemplate = this._matTemplates[matKey];
    if (!materialTemplate) return null;

    // Build orientation: a quaternion that maps +Z onto the surface normal,
    // then convert to Euler — DecalGeometry takes Euler.
    const n = normal.clone().normalize();
    this._tmpQuat.setFromUnitVectors(this._tmpUp, n);
    this._helper.position.copy(point);
    this._helper.quaternion.copy(this._tmpQuat);
    // Random roll around the surface normal so repeat decals don't tile visibly
    this._helper.rotateZ(Math.random() * Math.PI * 2);
    this._helper.updateMatrix();

    let geo;
    try {
      geo = new DecalGeometry(surfaceMesh, point, this._helper.rotation, sizeVec);
    } catch (e) {
      // Some surface meshes (e.g. instanced/skinned) may not be supported.
      return null;
    }
    if (!geo || geo.attributes.position.count === 0) {
      if (geo) geo.dispose();
      return null;
    }

    const mat = materialTemplate.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.pool.push(mesh, ttl);
    return mesh;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  addBulletHole(surfaceMesh, point, normal) {
    const s = 0.18 + Math.random() * 0.08;
    return this._spawn(surfaceMesh, point, normal, new THREE.Vector3(s, s, 0.5), 'bullet', 30);
  }

  addScorch(surfaceMesh, point, normal, radius = 1.5) {
    const s = Math.max(0.3, radius);
    return this._spawn(surfaceMesh, point, normal, new THREE.Vector3(s, s, Math.max(1.0, s)), 'scorch', 90);
  }

  addBlood(surfaceMesh, point, normal) {
    const s = 0.32 + Math.random() * 0.18;
    return this._spawn(surfaceMesh, point, normal, new THREE.Vector3(s, s, 0.6), 'blood', 25);
  }

  addDirtPuff(surfaceMesh, point, normal) {
    const s = 0.4 + Math.random() * 0.15;
    return this._spawn(surfaceMesh, point, normal, new THREE.Vector3(s, s, 0.5), 'dirt', 1.2);
  }

  update(dt) {
    this.pool.update(dt);
  }

  dispose() {
    this.pool.clear();
    if (this._matTemplates) {
      for (const k in this._matTemplates) this._matTemplates[k].dispose();
      this._matTemplates = null;
    }
    for (const k in this._tex) {
      if (this._tex[k]) this._tex[k].dispose();
    }
    this._tex = {};
  }
}

// ─── CameraShake ────────────────────────────────────────────────────────────
export class CameraShake {
  constructor() {
    this.amp = 0;
    this.freq = 30;       // shake oscillation frequency (Hz)
    this.decay = 6;       // exponential decay rate per second
    this._t = 0;          // running time accumulator
    this._duration = 0;   // remaining triggered duration
    this._offset = new THREE.Vector3();
    this._eul = new THREE.Euler();

    // Per-axis pseudo-random phase offsets so axes don't move in lockstep
    this._phase = {
      x: Math.random() * 1000,
      y: Math.random() * 1000,
      z: Math.random() * 1000,
      rx: Math.random() * 1000,
      ry: Math.random() * 1000,
    };
  }

  // Trigger a shake. Stronger triggers stack (take the larger amplitude),
  // and duration is extended to whichever is longer.
  shake(magnitude = 0.05, duration = 0.25) {
    this.amp = Math.max(this.amp, magnitude);
    this._duration = Math.max(this._duration, duration);
  }

  update(dt) {
    this._t += dt;
    if (this._duration > 0) {
      this._duration -= dt;
      // Exponential decay
      this.amp *= Math.exp(-this.decay * dt);
      if (this._duration <= 0 || this.amp < 1e-5) {
        this.amp = 0;
        this._duration = 0;
        this._offset.set(0, 0, 0);
        this._eul.set(0, 0, 0);
        return;
      }
    } else {
      this.amp = 0;
      this._offset.set(0, 0, 0);
      this._eul.set(0, 0, 0);
      return;
    }

    const t = this._t * this.freq;
    // Cheap deterministic noise via layered sines
    const n = (seed) => Math.sin(t * 1.0 + seed) * 0.6
                     + Math.sin(t * 1.73 + seed * 1.7) * 0.3
                     + Math.sin(t * 2.41 + seed * 0.3) * 0.1;

    this._offset.set(
      n(this._phase.x) * this.amp,
      n(this._phase.y) * this.amp,
      n(this._phase.z) * this.amp * 0.4,
    );
    // Small angular kick — rotation feels much shakier than translation,
    // so scale it down vs. positional offset.
    const rotScale = this.amp * 0.35;
    this._eul.set(
      n(this._phase.rx) * rotScale,
      n(this._phase.ry) * rotScale,
      0,
      'XYZ',
    );
  }

  // Apply additively after the player's normal camera update.
  apply(camera) {
    if (this.amp <= 0) return;
    camera.position.add(this._offset);
    camera.rotation.x += this._eul.x;
    camera.rotation.y += this._eul.y;
  }
}
