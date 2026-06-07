// ═══════════════════════════════════════════════════════════════════════════
//  ROADS — Dirt trail network for the expanded 800-unit world
// ═══════════════════════════════════════════════════════════════════════════
//
//  Builds a connected network of dirt trails between every major POI using
//  THREE.CatmullRomCurve3 curves sampled into ribbon strips. All road meshes
//  share a single MeshStandardMaterial (with polygonOffset set to avoid
//  z-fighting against the terrain). Marker posts and small wooden plank
//  bridges across the river are placed along selected long-haul routes.
//
//  Existing POIs (XZ):
//    crashSite     (-18,  85)   village        (   0,  20)
//    vcCamp        (-52, -42)   clinic         (  58,  18)
//    riverCrossing ( 83,  -6)   hamlet         (  95,  18)
//    arvnOutpost   ( 96, -72)
//
//  New POIs added in the 800-unit expansion (XZ):
//    French Plantation       ( 220,  180)
//    Bombed Firebase         (-180, -180)
//    Fishing Village         ( 320, -100)
//    AAA Emplacement         (-280,  100)
//    Wooden Bridge           ( 180, -150)
//    Spirit Shrine Crossroads(   0,  250)
//    Mountain Spotter        (-300, -300)
//    Riverbank Graveyard     ( 300,    0)
//
//  Replaces world.js _buildPaths(); integration is one line in world.js:
//      new RoadNetwork(this.scene).buildAll();
//
//  Triangle budget: < 30,000 across all roads/markers/bridges. Actual count
//  is dominated by 14 road strips × 119 quads × 2 tris ≈ 3,332 + markers +
//  bridges ≈ ~5k tris total.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// ─── Road definitions ──────────────────────────────────────────────────────
// Each entry: list of [x, z] anchor pairs (y is computed at 0). The CatmullRom
// curve is fit through these points to produce an organic, curving trail.
const ROADS = [
  // Main spine running north-south through the heart of the map
  { name: 'main_north',     anchors: [[-18, 95], [0, 60], [0, 20], [0, -10], [0, -50], [0, -150], [0, 250]], width: 2.4 },
  // Sneaky path from village to VC camp
  { name: 'village_vc',     anchors: [[0, 20], [-15, 0], [-30, -15], [-52, -42]], width: 1.8 },
  // Well-traveled village → clinic route
  { name: 'village_clinic', anchors: [[0, 20], [25, 22], [42, 20], [58, 18]], width: 2.2 },
  // Clinic → river crossing
  { name: 'clinic_river',   anchors: [[58, 18], [70, 8], [78, 0], [83, -6]], width: 2.0 },
  // River crossing → hamlet
  { name: 'river_hamlet',   anchors: [[83, -6], [88, 4], [92, 12], [95, 18]], width: 2.0 },
  // River crossing → ARVN outpost (main supply road)
  { name: 'river_arvn',     anchors: [[83, -6], [88, -25], [92, -45], [96, -72]], width: 2.4 },
  // Long road east toward fishing village
  { name: 'east_fishing',   anchors: [[95, 18], [150, 0], [220, -50], [320, -100]], width: 1.8 },
  // South spur to spirit shrine crossroads
  { name: 'south_shrine',   anchors: [[0, 60], [50, 120], [80, 180], [60, 220], [0, 250]], width: 1.6 },
  // West spur out to AAA emplacement
  { name: 'west_aaa',       anchors: [[-52, -42], [-120, 0], [-200, 60], [-280, 100]], width: 1.4 },
  // Long northwest haul to mountain spotter
  { name: 'nw_spotter',     anchors: [[-52, -42], [-120, -120], [-200, -200], [-280, -260], [-300, -300]], width: 1.4 },
  // Northeast to French plantation
  { name: 'ne_plantation',  anchors: [[95, 18], [150, 60], [200, 130], [220, 180]], width: 1.6 },
  // Spur from spotter pass to bombed firebase
  { name: 'firebase_spur',  anchors: [[-200, -200], [-180, -180]], width: 1.0 },
  // Riverbank trail east to graveyard
  { name: 'riverbank',      anchors: [[83, -6], [180, 0], [300, 0]], width: 1.6 },
  // Approach to wooden bridge POI from north (road stops at the bridge ends)
  { name: 'bridge_approach',anchors: [[150, -100], [180, -150], [220, -180]], width: 1.4 },
];

// Roads receiving periodic trail markers
const LONG_ROADS = new Set(['east_fishing', 'west_aaa', 'nw_spotter', 'south_shrine']);

// Hard-coded river plank bridge locations: midpoint, length, heading (radians)
// Note: the wooden_bridge POI at (180,-150) provides its own crossing.
const RIVER_BRIDGES = [
  { x: 160, z: -10, length: 12, heading: 0.2 },
];

// ═══════════════════════════════════════════════════════════════════════════
export class RoadNetwork {
  /**
   * @param {THREE.Scene} scene
   * @param {Object}   [opts]
   * @param {Function} [opts.makeMaterial] - optional () => Material returning
   *        a shared dirt-trail material (overrides the default).
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = opts;
    this._roadMat = null;
    this._woodMat = null;
    this._signMat = null;
    this.roadMeshes = [];
    this.markerMeshes = [];
    this.bridgeMeshes = [];
  }

  // ─── Material accessors (lazy, all roads share one instance) ────────────
  _getRoadMaterial() {
    if (this._roadMat) return this._roadMat;
    let mat;
    if (typeof this.opts.makeMaterial === 'function') {
      mat = this.opts.makeMaterial();
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x6a5530,
        roughness: 0.95,
        metalness: 0,
      });
    }
    // Avoid z-fighting with terrain without resorting to transparency
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    this._roadMat = mat;
    return mat;
  }

  _getWoodMaterial() {
    if (this._woodMat) return this._woodMat;
    this._woodMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a18,
      roughness: 0.85,
      metalness: 0,
    });
    return this._woodMat;
  }

  _getSignMaterial() {
    if (this._signMat) return this._signMat;
    this._signMat = new THREE.MeshStandardMaterial({
      color: 0xe8e2d2,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    return this._signMat;
  }

  // ─── Public API ─────────────────────────────────────────────────────────
  buildAll() {
    for (const road of ROADS) {
      this.buildRoad(road.name, road.anchors, { width: road.width });
    }
    this._buildRiverBridges();
    return this;
  }

  /**
   * Build a single road segment. Returns the created mesh.
   * @param {string} name
   * @param {Array<[number, number]>} anchors  XZ pairs.
   * @param {Object} [opts]
   * @param {number} [opts.width]    base trail width (m), default 2.0
   * @param {number} [opts.segments] curve subdivisions, default 120
   * @param {number} [opts.yOffset]  height above terrain, default 0.04
   */
  buildRoad(name, anchors, opts = {}) {
    const width = opts.width ?? 2.0;
    const segments = opts.segments ?? 120;
    const yOffset = opts.yOffset ?? 0.04;
    if (!anchors || anchors.length < 2) return null;

    const points = anchors.map(([x, z]) => new THREE.Vector3(x, 0, z));
    // CatmullRom needs at least 2 points; with 2 it degenerates to a line.
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    const geo = buildRoadStrip(curve, segments, width, yOffset);
    geo.name = `road_${name}_geo`;

    const mesh = new THREE.Mesh(geo, this._getRoadMaterial());
    mesh.name = `road_${name}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.roadMeshes.push(mesh);

    // Trail markers along long roads
    if (LONG_ROADS.has(name)) {
      this._placeMarkersAlong(curve, 80);
    }
    return mesh;
  }

  // ─── Trail markers ──────────────────────────────────────────────────────
  _placeMarkersAlong(curve, spacing) {
    const totalLen = curve.getLength();
    if (totalLen <= spacing) return;
    const count = Math.floor(totalLen / spacing);
    for (let i = 1; i <= count; i++) {
      const t = (i * spacing) / totalLen;
      if (t >= 1) break;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).setY(0).normalize();
      this._buildMarker(p, tan);
    }
  }

  _buildMarker(pos, tangent) {
    const wood = this._getWoodMaterial();
    const sign = this._getSignMaterial();

    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    // Post: 1.2m tall, 0.08m radius cylinder
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
    const post = new THREE.Mesh(postGeo, wood);
    post.position.y = 0.6;
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    // Sign: small white plane facing the trail tangent
    const signGeo = new THREE.PlaneGeometry(0.4, 0.3);
    const signMesh = new THREE.Mesh(signGeo, sign);
    signMesh.position.y = 1.05;
    // Plane default normal is +Z; rotate so its normal aligns with tangent.
    const yaw = Math.atan2(tangent.x, tangent.z);
    signMesh.rotation.y = yaw;
    signMesh.castShadow = false;
    signMesh.receiveShadow = true;
    group.add(signMesh);

    this.scene.add(group);
    this.markerMeshes.push(group);
  }

  // ─── River plank bridges ────────────────────────────────────────────────
  _buildRiverBridges() {
    const wood = this._getWoodMaterial();
    for (const b of RIVER_BRIDGES) {
      const group = new THREE.Group();
      group.position.set(b.x, 0, b.z);
      group.rotation.y = b.heading;

      // Deck: ~2m wide, length × 0.1 thick, slight height above water
      const deckGeo = new THREE.BoxGeometry(2.0, 0.12, b.length);
      const deck = new THREE.Mesh(deckGeo, wood);
      deck.position.y = 0.35;
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);

      // 4 trestle support posts
      const halfLen = b.length / 2;
      const trestleSpacing = b.length / 3;
      for (let i = 0; i < 4; i++) {
        const z = -halfLen + i * trestleSpacing;
        for (const xOff of [-0.85, 0.85]) {
          const legGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.7, 5);
          const leg = new THREE.Mesh(legGeo, wood);
          leg.position.set(xOff, 0.0, z);
          leg.castShadow = true;
          leg.receiveShadow = true;
          group.add(leg);
        }
      }

      // Hand rails (two thin beams along each side)
      for (const xOff of [-1.0, 1.0]) {
        const railGeo = new THREE.BoxGeometry(0.06, 0.06, b.length);
        const rail = new THREE.Mesh(railGeo, wood);
        rail.position.set(xOff, 0.85, 0);
        rail.castShadow = true;
        group.add(rail);
      }

      this.scene.add(group);
      this.bridgeMeshes.push(group);
    }
  }
}

// ─── Geometry helper ────────────────────────────────────────────────────────
// Build a ribbon strip from a curve. Width varies organically along t for a
// hand-cut trail feel. UVs run [0..1] across the strip and tile along its length.
function buildRoadStrip(curve, segments, baseWidth, yOffset) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tmpSide = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).setY(0);
    if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
    tan.normalize();
    tmpSide.crossVectors(up, tan).normalize();
    const w = baseWidth * (0.85 + 0.3 * Math.sin(t * 8));
    const lx = p.x + tmpSide.x * (w * 0.5);
    const lz = p.z + tmpSide.z * (w * 0.5);
    const rx = p.x - tmpSide.x * (w * 0.5);
    const rz = p.z - tmpSide.z * (w * 0.5);
    positions.push(lx, yOffset, lz, rx, yOffset, rz);
    uvs.push(0, t * 8, 1, t * 8);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    // Two triangles per quad, wound for upward-facing normals
    indices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
