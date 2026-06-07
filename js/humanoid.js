// ════════════════════════════════════════════
//  humanoid.js — Shared procedural character builder
//  Creates articulated humanoids from Three.js primitives
// ════════════════════════════════════════════
import * as THREE from 'three';

// opts: { skin, shirt, pants, shoe, belt, hair, hatType, hatColor, rifle }
export function buildHuman(opts) {
  const g = new THREE.Group();

  const m = (geo, col) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col }));
    mesh.castShadow = true;
    return mesh;
  };

  const { skin, shirt, pants } = opts;
  const shoe = opts.shoe ?? 0x1a1008;

  // ── LEGS ──────────────────────────────────
  for (const sx of [-0.12, 0.12]) {
    const thigh = m(new THREE.CylinderGeometry(0.100, 0.090, 0.38, 7), pants);
    thigh.position.set(sx, 0.50, 0);
    g.add(thigh);

    const shin = m(new THREE.CylinderGeometry(0.082, 0.070, 0.36, 7), pants);
    shin.position.set(sx, 0.17, 0.02);
    g.add(shin);

    const foot = m(new THREE.BoxGeometry(0.13, 0.088, 0.22), shoe);
    foot.position.set(sx, 0.044, 0.055);
    g.add(foot);
  }

  // ── HIPS ──────────────────────────────────
  const hips = m(new THREE.BoxGeometry(0.38, 0.16, 0.24), pants);
  hips.position.y = 0.72;
  g.add(hips);

  // ── BELT ──────────────────────────────────
  if (opts.belt) {
    const belt = m(new THREE.BoxGeometry(0.40, 0.08, 0.26), opts.belt);
    belt.position.y = 0.68;
    g.add(belt);
  }

  // ── TORSO ─────────────────────────────────
  const torso = m(new THREE.BoxGeometry(0.44, 0.44, 0.26), shirt);
  torso.position.y = 0.96;
  g.add(torso);

  const shoulders = m(new THREE.BoxGeometry(0.58, 0.12, 0.28), shirt);
  shoulders.position.y = 1.16;
  g.add(shoulders);

  // ── ARMS ──────────────────────────────────
  for (const side of [-1, 1]) {
    const tilt = side * 0.14;
    const upper = m(new THREE.CylinderGeometry(0.076, 0.068, 0.30, 6), shirt);
    upper.rotation.z = tilt;
    upper.position.set(side * 0.315, 1.02, 0);
    g.add(upper);

    const fore = m(new THREE.CylinderGeometry(0.063, 0.056, 0.26, 6), skin);
    fore.rotation.z = tilt;
    fore.position.set(side * 0.333, 0.80, 0);
    g.add(fore);

    const hand = m(new THREE.SphereGeometry(0.062, 7, 6), skin);
    hand.position.set(side * 0.342, 0.655, 0);
    g.add(hand);
  }

  // ── NECK ──────────────────────────────────
  const neck = m(new THREE.CylinderGeometry(0.084, 0.098, 0.12, 7), skin);
  neck.position.y = 1.26;
  g.add(neck);

  // ── HEAD ──────────────────────────────────
  const head = m(new THREE.SphereGeometry(0.195, 10, 8), skin);
  head.scale.set(1.0, 1.10, 0.93);
  head.position.y = 1.51;
  g.add(head);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x080606 });
  for (const ex of [-0.070, 0.070]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 5, 4), eyeMat);
    eye.position.set(ex, 1.525, 0.166);
    g.add(eye);
  }

  // Nose
  const nose = m(new THREE.SphereGeometry(0.021, 5, 4), skin);
  nose.position.set(0, 1.495, 0.183);
  g.add(nose);

  // ── HAIR ──────────────────────────────────
  if (opts.hair) {
    // Top hemisphere (thetaLength = PI/2 gives top half from pole to equator)
    const hairGeo = new THREE.SphereGeometry(0.203, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hair = new THREE.Mesh(hairGeo, new THREE.MeshStandardMaterial({ color: opts.hair }));
    hair.position.y = 1.55;
    g.add(hair);
  }

  // ── HEADWEAR ──────────────────────────────
  switch (opts.hatType) {

    case 'conical': {
      // Vietnamese nón lá (conical straw hat)
      const col = opts.hatColor ?? 0xd4b870;
      const brim = m(new THREE.CylinderGeometry(0.44, 0.46, 0.036, 14), col);
      brim.position.y = 1.67;
      g.add(brim);
      const cone = m(new THREE.ConeGeometry(0.42, 0.33, 14), col);
      cone.position.y = 1.85;
      g.add(cone);
      // Inner shading ring
      const inner = m(new THREE.CylinderGeometry(0.21, 0.42, 0.018, 14), 0x9a8040);
      inner.position.y = 1.66;
      g.add(inner);
      break;
    }

    case 'boonie': {
      // US boonie / bush hat
      const col = opts.hatColor ?? 0x4a5530;
      const crown = m(new THREE.CylinderGeometry(0.206, 0.218, 0.172, 8), col);
      crown.position.y = 1.68;
      g.add(crown);
      const brim = m(new THREE.CylinderGeometry(0.365, 0.380, 0.046, 12), col);
      brim.position.y = 1.596;
      g.add(brim);
      break;
    }

    case 'pith': {
      // NVA pith helmet (bảo hiểm)
      const col = opts.hatColor ?? 0x3a5020;
      const dome = m(new THREE.SphereGeometry(0.237, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.57), col);
      dome.position.y = 1.53;
      g.add(dome);
      const rim = m(new THREE.CylinderGeometry(0.274, 0.288, 0.036, 12), col);
      rim.position.y = 1.535;
      g.add(rim);
      // Red star badge
      const star = m(new THREE.BoxGeometry(0.055, 0.055, 0.018), 0xcc2020);
      star.position.set(0, 1.61, -0.218);
      g.add(star);
      break;
    }
  }

  // ── RIFLE ─────────────────────────────────
  if (opts.rifle) {
    const rf = new THREE.Group();
    const metal = 0x1c1c1c;
    const wood  = opts.rifle;

    // Barrel
    const barrel = m(new THREE.CylinderGeometry(0.022, 0.022, 0.70, 5), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.35;
    rf.add(barrel);

    // Receiver / body
    const recv = m(new THREE.BoxGeometry(0.062, 0.105, 0.44), wood);
    recv.position.z = -0.08;
    rf.add(recv);

    // Curved magazine (box approximation)
    const mag = m(new THREE.BoxGeometry(0.042, 0.15, 0.055), metal);
    mag.position.set(0, -0.13, -0.06);
    mag.rotation.x = -0.18; // slight forward curve
    rf.add(mag);

    // Stock
    const stock = m(new THREE.BoxGeometry(0.052, 0.082, 0.20), wood);
    stock.position.z = 0.23;
    rf.add(stock);

    rf.position.set(0.33, 0.90, -0.18);
    rf.rotation.y = 0.08;
    g.add(rf);
  }

  return g;
}
