// ════════════════════════════════════════════════════════════════════════════
//  physics.js — Rapier3D wrapper for the Vietnam War FPS
// ════════════════════════════════════════════════════════════════════════════
//
// Provides a clean rigid-body physics layer on top of the existing hand-rolled
// AABB collision in world.js. Coexists with the legacy `world.colliders`
// array; the integration step will gradually replace those calls.
//
// ─── Loading strategy ──────────────────────────────────────────────────────
// Rapier3D-compat can be supplied explicitly through `window.NAM_RAPIER_URL`.
// When it is not configured, the wrapper enters fallback mode where every
// method becomes a safe no-op so the game keeps running on legacy AABB.
//
// ─── How to wire it into game.js ───────────────────────────────────────────
//   import { PhysicsWorld, importLegacyColliders } from './physics.js';
//
//   // In Game constructor / async init:
//   this.physics = new PhysicsWorld();
//   await this.physics.init({ gravity: -22 });
//
//   // After world.build() (so world.colliders is populated):
//   importLegacyColliders(this.physics, this.world.colliders);
//   this.physics.addGroundPlane(CONFIG.WORLD_SIZE);
//
//   // In the main loop, before rendering:
//   this.physics.step(dt);
//
//   // On game end / restart:
//   this.physics.dispose();
//
// ─── What needs to change in player.js ─────────────────────────────────────
// Replace the cylinder-AABB pushout block (~line 222-229):
//     const col = world.checkCollision(newPos, CONFIG.PLAYER_RADIUS);
//     if (col.hit) { newPos.x += col.nx * col.overlap;
//                    newPos.z += col.nz * col.overlap; }
// with a capsule sweep that respects walls in 3D:
//     const sweep = physics.capsuleSweep(this.pos, newPos,
//                                         CONFIG.PLAYER_RADIUS, 0.85);
//     if (sweep.hit) {
//       // Slide along surface
//       newPos.x = this.pos.x + (newPos.x - this.pos.x) * sweep.toi;
//       newPos.z = this.pos.z + (newPos.z - this.pos.z) * sweep.toi;
//       // Optional: project remaining velocity onto the wall plane.
//     }
// The ground check at `newPos.y <= 0` can be replaced with
//     physics.raycastDown(this.pos, 2.0)
// once terrain heightfields are added.
//
// ─── What changes in game.js Grenade ───────────────────────────────────────
// Replace manual gravity integration in Grenade.update with a Rapier body:
//
//     // In Grenade constructor:
//     this.body = physics.spawnProjectile({
//       pos:        this.pos,
//       velocity:   this.vel,
//       radius:     0.1,
//       mass:       0.4,
//       restitution: 0.45,
//       friction:    0.5,
//       mesh:        this.mesh,    // optional — auto-syncs each step
//     });
//
//     // In Grenade.update(dt):
//     // No manual integration needed — physics.step() advances and syncs mesh.
//     this.pos.copy(this.mesh.position);
//     this.timer -= dt;
//     if (this.timer <= 0) {
//       this._explode();
//       physics.removeBody(this.body);
//       return true;
//     }
//
//     // In Grenade._explode(), apply impulses to nearby props:
//     const blast = physics.bodiesNearPoint(this.pos, radius);
//     for (const b of blast) {
//       const p = b.translation();
//       const dir = new THREE.Vector3(p.x - this.pos.x,
//                                      p.y - this.pos.y + 0.5,
//                                      p.z - this.pos.z).normalize();
//       physics.applyImpulseAtPoint(b, dir.multiplyScalar(20),
//                                   { x: p.x, y: p.y, z: p.z });
//     }
//
// ─── What changes in world.js ──────────────────────────────────────────────
// After world.build() finishes populating this.colliders:
//   importLegacyColliders(physics, this.colliders);
// Optionally spawn dynamic crates/barrels via physics.addDynamicBox(mesh, …)
// so explosions can knock them around.
//
// ════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// Internal scratch — reused across step() / sweep() to avoid GC pressure.
const _scratchVec = new THREE.Vector3();
const _scratchVec2 = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();

/**
 * PhysicsWorld — Rapier3D wrapper providing rigid-body physics for the FPS.
 * Coexists with the legacy world.colliders array; eventually replaces it.
 */
export class PhysicsWorld {
  constructor() {
    this.RAPIER = null;
    this.world = null;
    this.fallback = false;
    this.bodyMeshPairs = []; // { body, mesh, lastSyncTime }
    this.staticColliders = []; // for tracking
    this._eventQueue = null;
    this._initialized = false;
  }

  // Async init — must await before using. Loads Rapier WASM, creates world.
  async init({ gravity = -22 } = {}) {
    const rapierUrl = globalThis.NAM_RAPIER_URL;
    if (!rapierUrl) {
      this.fallback = true;
      console.log('[Physics] Rapier URL not configured; using legacy AABB collision');
      return false;
    }

    try {
      this.RAPIER = await import(/* @vite-ignore */ rapierUrl);
      await this.RAPIER.init();
      this.world = new this.RAPIER.World({ x: 0, y: gravity, z: 0 });
      this._eventQueue = new this.RAPIER.EventQueue(true);
      this._initialized = true;
      console.log('[Physics] Rapier3D initialized');
      return true;
    } catch (err) {
      console.warn(
        '[Physics] Rapier failed to load — falling back to legacy AABB:',
        err
      );
      this.fallback = true;
      return false;
    }
  }

  // ─── Static colliders ────────────────────────────────────────────────────

  /**
   * Add a flat ground plane at y=0. `size` is the full edge length (centered).
   * Returns the collider, or null in fallback.
   */
  addGroundPlane(size = 500) {
    if (this.fallback || !this.world) return null;
    const half = size / 2;
    // Thin slab below y=0 so the top face sits at exactly y=0.
    const bodyDesc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(
      0,
      -0.5,
      0
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = this.RAPIER.ColliderDesc.cuboid(half, 0.5, half)
      .setFriction(0.7)
      .setRestitution(0.0);
    const collider = this.world.createCollider(colDesc, body);
    this.staticColliders.push(collider);
    return collider;
  }

  /**
   * Add a static box collider (buildings, walls, debris).
   * Returns the collider handle for later removal.
   */
  addStaticBox(x, y, z, halfWidth, halfHeight, halfDepth, rotY = 0) {
    if (this.fallback || !this.world) return null;
    const q = _scratchQuat.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotY
    );
    const bodyDesc = this.RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x, y, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = this.RAPIER.ColliderDesc.cuboid(
      halfWidth,
      halfHeight,
      halfDepth
    )
      .setFriction(0.6)
      .setRestitution(0.05);
    const collider = this.world.createCollider(colDesc, body);
    this.staticColliders.push(collider);
    return collider;
  }

  /**
   * Add a static cylinder collider (tree trunks, posts).
   * Used by world.js trees. Cylinder axis is Y.
   */
  addStaticCylinder(x, y, z, radius, halfHeight) {
    if (this.fallback || !this.world) return null;
    const bodyDesc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(
      x,
      y,
      z
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = this.RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setFriction(0.7)
      .setRestitution(0.05);
    const collider = this.world.createCollider(colDesc, body);
    this.staticColliders.push(collider);
    return collider;
  }

  // ─── Dynamic bodies ──────────────────────────────────────────────────────

  /**
   * Add a dynamic rigid body (crate, barrel, debris) attached to a mesh.
   * Each step() syncs mesh.position/quaternion from the body.
   */
  addDynamicBox(
    mesh,
    { halfExtents, mass = 5, friction = 0.6, restitution = 0.15 } = {}
  ) {
    if (this.fallback || !this.world || !mesh) return null;

    // Default to mesh's bounding-box-derived half extents if not provided.
    if (!halfExtents) {
      mesh.geometry?.computeBoundingBox?.();
      const bb = mesh.geometry?.boundingBox;
      halfExtents = bb
        ? {
            x: (bb.max.x - bb.min.x) * 0.5,
            y: (bb.max.y - bb.min.y) * 0.5,
            z: (bb.max.z - bb.min.z) * 0.5,
          }
        : { x: 0.5, y: 0.5, z: 0.5 };
    }

    const p = mesh.position;
    const q = mesh.quaternion;
    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.05)
      .setAngularDamping(0.15);
    const body = this.world.createRigidBody(bodyDesc);

    // Density = mass / volume (approximate)
    const vol =
      8 * halfExtents.x * halfExtents.y * halfExtents.z || 1;
    const density = mass / vol;

    const colDesc = this.RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    )
      .setDensity(density)
      .setFriction(friction)
      .setRestitution(restitution);
    this.world.createCollider(colDesc, body);

    this.bodyMeshPairs.push({ body, mesh, lastSyncTime: 0 });
    return body;
  }

  /**
   * Spawn a grenade-like dynamic ball with initial velocity.
   * If `mesh` is given, it's auto-synced each step.
   */
  spawnProjectile({
    pos,
    velocity,
    radius = 0.1,
    mass = 0.4,
    restitution = 0.45,
    friction = 0.5,
    mesh = null,
  }) {
    if (this.fallback || !this.world) return null;

    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setLinearDamping(0.02)
      .setAngularDamping(0.05)
      .setCcdEnabled(true); // continuous collision — important for fast grenades
    const body = this.world.createRigidBody(bodyDesc);

    const vol = (4 / 3) * Math.PI * radius * radius * radius || 1;
    const density = mass / vol;

    const colDesc = this.RAPIER.ColliderDesc.ball(radius)
      .setDensity(density)
      .setFriction(friction)
      .setRestitution(restitution);
    this.world.createCollider(colDesc, body);

    if (mesh) {
      this.bodyMeshPairs.push({ body, mesh, lastSyncTime: 0 });
    }
    return body;
  }

  // ─── Forces & queries ────────────────────────────────────────────────────

  /**
   * Apply impulse to a body (used by explosions to push nearby props).
   * `impulseVec3` and `worldPoint` are {x,y,z} or THREE.Vector3.
   */
  applyImpulseAtPoint(body, impulseVec3, worldPoint) {
    if (this.fallback || !this.world || !body) return;
    const imp = {
      x: impulseVec3.x,
      y: impulseVec3.y,
      z: impulseVec3.z,
    };
    const pt = { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z };
    body.applyImpulseAtPoint(imp, pt, true);
  }

  /**
   * Find dynamic bodies within radius of a world point.
   * Returns an array of RigidBody instances.
   */
  bodiesNearPoint(point, radius) {
    if (this.fallback || !this.world) return [];
    const out = [];
    const r2 = radius * radius;
    for (const pair of this.bodyMeshPairs) {
      const b = pair.body;
      if (!b || b.isFixed?.()) continue;
      const t = b.translation();
      const dx = t.x - point.x;
      const dy = t.y - point.y;
      const dz = t.z - point.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        out.push(b);
      }
    }
    return out;
  }

  /**
   * Capsule sweep test for player movement.
   * Replaces the cylinder-vs-AABB pushout in world.js.
   * Returns:
   *   { hit: false }                                      — clear
   *   { hit: true, normal:{x,y,z}, toi: number, depth }   — blocked
   * `toi` is the fraction of the sweep along which contact occurs (0..1).
   */
  capsuleSweep(fromPos, toPos, radius = 0.4, halfHeight = 0.85) {
    if (this.fallback || !this.world) return { hit: false };

    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const dz = toPos.z - fromPos.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return { hit: false };

    const dir = { x: dx / len, y: dy / len, z: dz / len };
    // Cache one Capsule shape per (radius, halfHeight) pair — Capsule wraps
    // WASM memory and `new` every frame leaks until GC pressure kills the tab.
    const shapeKey = radius + 'x' + halfHeight;
    if (!this._capsuleShapes) this._capsuleShapes = new Map();
    let shape = this._capsuleShapes.get(shapeKey);
    if (!shape) {
      shape = new this.RAPIER.Capsule(halfHeight, radius);
      this._capsuleShapes.set(shapeKey, shape);
    }
    // Place capsule so its BOTTOM (bottom hemisphere tip) sits at fromPos.y.
    // A Rapier Capsule(halfHeight, radius) has full Y extent of 2*(halfHeight+radius);
    // its bottom relative to center is -(halfHeight + radius). To put the bottom at
    // fromPos.y, the center must be fromPos.y + halfHeight + radius.
    const shapePos = {
      x: fromPos.x,
      y: fromPos.y + halfHeight + radius,
      z: fromPos.z,
    };
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };

    const hit = this.world.castShape(
      shapePos,
      shapeRot,
      dir,
      shape,
      len,
      true, // stopAtPenetration
      undefined, // filterFlags
      undefined, // filterGroups
      undefined, // filterExcludeCollider
      undefined, // filterExcludeRigidBody
      undefined  // filterPredicate
    );

    if (!hit) return { hit: false };
    // Rapier may report toi as undefined / NaN / negative for already-overlapping
    // shapes; coerce to a finite [0,1] fraction. If the hit normal points mostly
    // upward (we're standing on a surface), treat as no-block — the player.js
    // gravity loop already handles ground.
    const rawToi = Number.isFinite(hit.toi) ? hit.toi : 0;
    const toi = Math.max(0, Math.min(1, rawToi / len));
    const n = hit.normal1
      ? { x: hit.normal1.x, y: hit.normal1.y, z: hit.normal1.z }
      : { x: 0, y: 1, z: 0 };
    if (n.y > 0.7) {
      // Floor-like contact — let player ground logic deal with it.
      return { hit: false };
    }
    return {
      hit: true,
      toi,
      distance: rawToi,
      normal: n,
      depth: Math.max(0, len - rawToi),
    };
  }

  /**
   * Convenience: ground-check ray cast straight down.
   * Returns { hit: false } or { hit: true, distance, normal:{x,y,z} }.
   */
  raycastDown(pos, maxDist = 2.0) {
    if (this.fallback || !this.world) return { hit: false };
    const ray = new this.RAPIER.Ray(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: 0, y: -1, z: 0 }
    );
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true);
    if (!hit) return { hit: false };
    const n = hit.normal;
    return {
      hit: true,
      distance: hit.timeOfImpact ?? hit.toi,
      normal: { x: n.x, y: n.y, z: n.z },
    };
  }

  // ─── Step & sync ─────────────────────────────────────────────────────────

  /**
   * Step the simulation, then sync all bodyMeshPairs to their meshes.
   * `dt` is clamped to 1/30 to prevent spiral-of-death on slow frames.
   */
  step(dt) {
    if (this.fallback || !this.world) return;
    this.world.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    this.world.step(this._eventQueue);
    for (const pair of this.bodyMeshPairs) {
      const body = pair.body;
      if (!body) continue;
      const t = body.translation();
      const r = body.rotation();
      pair.mesh.position.set(t.x, t.y, t.z);
      pair.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Remove a body and its mesh-tracking entry.
   * The mesh itself is NOT removed from the scene — caller's responsibility.
   */
  removeBody(body) {
    if (this.fallback || !this.world || !body) return;
    // Drop tracking pairs first so step() doesn't hit a dangling body.
    for (let i = this.bodyMeshPairs.length - 1; i >= 0; i--) {
      if (this.bodyMeshPairs[i].body === body) {
        this.bodyMeshPairs.splice(i, 1);
      }
    }
    try {
      this.world.removeRigidBody(body);
    } catch (e) {
      // Already removed — ignore.
    }
  }

  /** Cleanup on game end / restart. */
  dispose() {
    this.bodyMeshPairs.length = 0;
    this.staticColliders.length = 0;
    if (this.world) {
      try {
        this.world.free();
      } catch (e) {
        // ignore
      }
    }
    if (this._eventQueue) {
      try {
        this._eventQueue.free();
      } catch (e) {
        // ignore
      }
    }
    this.world = null;
    this._eventQueue = null;
    this._initialized = false;
  }
}

/**
 * Helper: convert legacy AABB-style cylinder colliders (world.colliders)
 * into Rapier static cylinder bodies. Used during the transition window
 * — world.js calls this once after build().
 *
 * @param {PhysicsWorld} physics
 * @param {Array<{x:number, z:number, radius:number, height:number}>} colliders
 * @returns {number} count imported (0 in fallback mode)
 */
export function importLegacyColliders(physics, colliders) {
  if (!physics || physics.fallback || !physics.world) return 0;
  if (!Array.isArray(colliders)) return 0;
  let imported = 0;
  for (const c of colliders) {
    if (!c || typeof c.x !== 'number') continue;
    const halfH = (c.height ?? 2) / 2;
    const baseY = Number.isFinite(c.minY) ? c.minY : 0;
    physics.addStaticCylinder(c.x, baseY + halfH, c.z, c.radius ?? 0.5, halfH);
    imported++;
  }
  console.log(
    `[Physics] importLegacyColliders: ${imported} static cylinders imported`
  );
  return imported;
}
