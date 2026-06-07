// buildings.js — sophisticated structures, props, and helicopter wreck.
// Builds Vietnamese stilt huts, military bunkers, watchtowers, sandbag walls,
// the ARVN outpost, river crossing, mission clinic, and a believable
// UH-1 Huey wreck. All meshes castShadow + receiveShadow.

import * as THREE from 'three';
import {
  makeThatchMaterial,
  makeWoodPlankMaterial,
  makeStoneMaterial,
  makeMetalMaterial,
  makeFabricMaterial,
  makeSandbagMaterial,
  makeCorrugatedMetalMaterial,
  makeBarkMaterial,
} from './textures.js';

// ─── small helpers ──────────────────────────────────────────────────
function shadowify(obj) {
  obj.traverse?.(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  if (obj.isMesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
  return obj;
}

function makeBasicEmissive(color, intensity = 1) {
  return new THREE.MeshBasicMaterial({ color });
}

// Build a "vertical plank wall" group — a panel of N planks for visible seams.
function makePlankPanel(width, height, planks, mat, depth = 0.08) {
  const g = new THREE.Group();
  const pw = width / planks;
  for (let i = 0; i < planks; i++) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(pw * 0.96, height, depth),
      mat
    );
    p.position.set(-width / 2 + pw / 2 + i * pw, 0, 0);
    g.add(p);
  }
  return g;
}

// Build a thatched 4-sided pyramid roof using 4 triangular planes
function makeThatchedRoof(width, depth, height, mat, ridgeMat) {
  const g = new THREE.Group();
  // Use a 4-sided cone for the bulk thatch
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0, Math.max(width, depth) * 0.78, height, 4, 1),
    mat
  );
  base.rotation.y = Math.PI / 4;
  base.position.y = height / 2;
  g.add(base);

  // Eaves overhang — flat ring made of 4 planks
  const eaveDepth = 0.08;
  const eaveOver = 0.45;
  const eaveMat = ridgeMat;
  const ew = width + eaveOver * 2;
  const ed = depth + eaveOver * 2;
  const eFront = new THREE.Mesh(new THREE.BoxGeometry(ew, eaveDepth, 0.32), eaveMat);
  eFront.position.set(0, -0.04, ed / 2 - 0.16);
  g.add(eFront);
  const eBack = eFront.clone(); eBack.position.z = -ed / 2 + 0.16; g.add(eBack);
  const eLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, eaveDepth, ed), eaveMat);
  eLeft.position.set(-ew / 2 + 0.16, -0.04, 0);
  g.add(eLeft);
  const eRight = eLeft.clone(); eRight.position.x = ew / 2 - 0.16; g.add(eRight);

  // Ridge beam (the dark cross at the apex)
  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.95, 0.12, 0.12),
    ridgeMat
  );
  ridge.position.y = height - 0.05;
  g.add(ridge);
  const ridgeCross = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, depth * 0.95),
    ridgeMat
  );
  ridgeCross.position.y = height - 0.05;
  g.add(ridgeCross);

  return g;
}

// Build a single sandbag mesh (slightly squashed sphere via box w/ taper)
function makeSandbag(mat) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.32), mat);
  return g;
}

// ────────────────────────────────────────────────────────────────────
export class BuildingsBuilder {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.addCollider = opts.addCollider || (() => {});
    this.addInteractable = opts.addInteractable || (() => {});
    this.rand = opts.rand || ((min, max) => min + Math.random() * (max - min));
    this.flickerLight = opts.flickerLight || (() => {});

    // Shared material cache (built lazily)
    this._mats = null;
  }

  getMaterials() {
    if (this._mats) return this._mats;
    this._mats = {
      // Wood/plank variants
      plank:        makeWoodPlankMaterial({ color: 0x6a4a20 }),
      plankDark:    makeWoodPlankMaterial({ color: 0x4a3015 }),
      plankLight:   makeWoodPlankMaterial({ color: 0x8a6a3a }),
      plankRedwood: makeWoodPlankMaterial({ color: 0x55351a }),
      // Thatch
      thatch:       makeThatchMaterial({ color: 0x8a6a3a }),
      thatchDark:   makeThatchMaterial({ color: 0x6a4a25 }),
      // Stone
      stone:        makeStoneMaterial({ color: 0x707070 }),
      stoneDark:    makeStoneMaterial({ color: 0x4a4a4a }),
      // Metal
      metal:        makeMetalMaterial({ color: 0x4a4a4a, weathered: true }),
      metalDark:    makeMetalMaterial({ color: 0x2a2a2a, weathered: true }),
      metalRust:    makeMetalMaterial({ color: 0x5a3a20, weathered: true }),
      corrugated:   makeCorrugatedMetalMaterial({ color: 0x3a3520 }),
      corrugatedG:  makeCorrugatedMetalMaterial({ color: 0x4a4e3a }),
      // Fabric / sandbag / bark
      fabric:       makeFabricMaterial({ color: 0x5f6a56 }),
      fabricCanvas: makeFabricMaterial({ color: 0x6a6240 }),
      sandbag:      makeSandbagMaterial({ color: 0x8a7a40 }),
      bark:         makeBarkMaterial({ color: 0x4a3018 }),
      bamboo:       makeBarkMaterial({ color: 0x9a8050 }),
      // Cheap colors
      black:        new THREE.MeshStandardMaterial({ color: 0x0a0805, roughness: 0.95 }),
      darkInterior: new THREE.MeshStandardMaterial({ color: 0x080503, roughness: 1.0 }),
      glass:        new THREE.MeshStandardMaterial({ color: 0x1a2838, transparent: true, opacity: 0.55, roughness: 0.3, metalness: 0.4 }),
      glassBroken:  new THREE.MeshStandardMaterial({ color: 0x223040, transparent: true, opacity: 0.4, roughness: 0.6 }),
      red:          new THREE.MeshBasicMaterial({ color: 0xc02a1a }),
      yellowFlag:   new THREE.MeshBasicMaterial({ color: 0xf2c01a, side: THREE.DoubleSide }),
      redStripe:    new THREE.MeshBasicMaterial({ color: 0xd03030, side: THREE.DoubleSide }),
      ember:        new THREE.MeshBasicMaterial({ color: 0xff6022 }),
      redLight:     new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      rope:         new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 1.0 }),
      net:          new THREE.MeshStandardMaterial({ color: 0x6a6040, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      cloth:        new THREE.MeshStandardMaterial({ color: 0xa0c0c8, side: THREE.DoubleSide }),
      smoke:        new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.45 }),
      water:        new THREE.MeshStandardMaterial({ color: 0x223330, transparent: true, opacity: 0.6 }),
    };
    return this._mats;
  }

  // ─── Vietnamese stilt hut ────────────────────────────────────────
  buildVietHut(b, matsArg) {
    const mats = this.getMaterials();
    const g = new THREE.Group();

    const stiltH = 0.55;            // raised platform clearance
    const wallH = b.h;
    const planks = Math.max(4, Math.round(b.w * 1.2));
    const planksZ = Math.max(4, Math.round(b.d * 1.2));

    // Floor planks (visible deck under the walls)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.3, 0.12, b.d + 0.3),
      mats.plankDark
    );
    floor.position.y = stiltH;
    g.add(floor);

    // Wall panels (4 sides) — vertical planks
    const wallY = stiltH + wallH / 2;
    const front = makePlankPanel(b.w, wallH, planks, mats.plankLight, 0.09);
    front.position.set(0, wallY, b.d / 2);
    g.add(front);
    const back = makePlankPanel(b.w, wallH, planks, mats.plankLight, 0.09);
    back.position.set(0, wallY, -b.d / 2);
    back.rotation.y = Math.PI;
    g.add(back);
    const left = makePlankPanel(b.d, wallH, planksZ, mats.plankLight, 0.09);
    left.position.set(-b.w / 2, wallY, 0);
    left.rotation.y = -Math.PI / 2;
    g.add(left);
    const right = makePlankPanel(b.d, wallH, planksZ, mats.plankLight, 0.09);
    right.position.set(b.w / 2, wallY, 0);
    right.rotation.y = Math.PI / 2;
    g.add(right);

    // Interior dark box (so doorway looks recessed into shadow)
    const interior = new THREE.Mesh(
      new THREE.BoxGeometry(b.w - 0.3, wallH - 0.2, b.d - 0.3),
      mats.darkInterior
    );
    interior.material.side = THREE.BackSide;
    interior.position.y = wallY;
    g.add(interior);

    // Doorway — dark frame + recessed dark plane
    const doorW = 0.95, doorH = 1.85;
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 0.16, doorH + 0.12, 0.06),
      mats.plankDark
    );
    doorFrame.position.set(0, stiltH + doorH / 2, b.d / 2 + 0.055);
    g.add(doorFrame);
    const doorHole = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.04),
      mats.darkInterior
    );
    doorHole.position.set(0, stiltH + doorH / 2, b.d / 2 + 0.085);
    g.add(doorHole);
    // Small recess box behind the door so even from angles the interior reads as dark
    const doorRecess = new THREE.Mesh(
      new THREE.BoxGeometry(doorW - 0.05, doorH - 0.05, 0.4),
      mats.darkInterior
    );
    doorRecess.position.set(0, stiltH + doorH / 2, b.d / 2 - 0.15);
    g.add(doorRecess);

    // Window slits on side walls — 2 per side
    const winY = stiltH + wallH * 0.65;
    [[-b.w / 2 - 0.005, b.d * 0.25, -Math.PI / 2],
     [-b.w / 2 - 0.005, -b.d * 0.25, -Math.PI / 2],
     [ b.w / 2 + 0.005, b.d * 0.25,  Math.PI / 2],
     [ b.w / 2 + 0.005, -b.d * 0.25,  Math.PI / 2]].forEach(([wx, wz, wr]) => {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.3, 0.05),
        mats.darkInterior
      );
      slit.position.set(wx, winY, wz);
      slit.rotation.y = wr;
      g.add(slit);
    });

    // Steps / ladder up to the door
    const stepMat = mats.plankDark;
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.08, 0.32),
        stepMat
      );
      step.position.set(0, 0.08 + i * (stiltH / 3), b.d / 2 + 0.45 + i * 0.22);
      g.add(step);
    }
    // Step side rails
    for (const sx of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, stiltH + 0.2, 0.08),
        mats.plankDark
      );
      rail.position.set(sx, (stiltH + 0.2) / 2, b.d / 2 + 0.55);
      g.add(rail);
    }

    // Stilts: 4 bamboo poles
    const stiltGeom = new THREE.CylinderGeometry(0.09, 0.11, stiltH, 7);
    [[-b.w / 2 + 0.25, -b.d / 2 + 0.25],
     [ b.w / 2 - 0.25, -b.d / 2 + 0.25],
     [-b.w / 2 + 0.25,  b.d / 2 - 0.25],
     [ b.w / 2 - 0.25,  b.d / 2 - 0.25]].forEach(([sx, sz]) => {
      const pole = new THREE.Mesh(stiltGeom, mats.bamboo);
      pole.position.set(sx, stiltH / 2, sz);
      g.add(pole);
    });

    // Diagonal cross-bracing planks under the floor
    const braceGeom = new THREE.BoxGeometry(Math.hypot(b.w - 0.5, stiltH), 0.05, 0.08);
    const angle = Math.atan2(stiltH, b.w - 0.5);
    for (const sz of [-b.d / 2 + 0.25, b.d / 2 - 0.25]) {
      const br1 = new THREE.Mesh(braceGeom, mats.plankDark);
      br1.position.set(0, stiltH / 2, sz);
      br1.rotation.z = angle;
      g.add(br1);
      const br2 = new THREE.Mesh(braceGeom, mats.plankDark);
      br2.position.set(0, stiltH / 2, sz);
      br2.rotation.z = -angle;
      g.add(br2);
    }

    // Awning eave plank around perimeter (just under the roof)
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.55, 0.1, b.d + 0.55),
      mats.plankDark
    );
    awning.position.y = stiltH + wallH - 0.04;
    g.add(awning);

    // Thatched 4-sided pyramid roof (slight overhang)
    const roofH = Math.max(1.6, b.h * 0.7);
    const roof = makeThatchedRoof(b.w + 0.4, b.d + 0.4, roofH, mats.thatch, mats.plankDark);
    roof.position.y = stiltH + wallH;
    g.add(roof);

    // Optional: hanging laundry / rice mat / fishing net (30%)
    if (Math.random() < 0.30) {
      const choice = Math.floor(Math.random() * 3);
      if (choice === 0) {
        // Laundry line between two stilts
        const line = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, b.w + 0.5, 4),
          mats.rope
        );
        line.rotation.z = Math.PI / 2;
        line.position.set(0, stiltH + 0.45, b.d / 2 + 0.4);
        g.add(line);
        for (let i = 0; i < 3; i++) {
          const cloth = new THREE.Mesh(
            new THREE.PlaneGeometry(0.5, 0.55),
            mats.cloth
          );
          cloth.position.set(-0.7 + i * 0.7, stiltH + 0.18, b.d / 2 + 0.4);
          g.add(cloth);
        }
      } else if (choice === 1) {
        // Rice mat leaning against the wall
        const mat = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 1.4),
          mats.thatchDark
        );
        mat.position.set(b.w / 2 - 0.6, stiltH + 0.7, b.d / 2 + 0.06);
        mat.rotation.x = -0.05;
        g.add(mat);
      } else {
        // Fishing net hung between two stilts
        const net = new THREE.Mesh(
          new THREE.PlaneGeometry(b.w * 0.75, 0.5),
          mats.net
        );
        net.position.set(0, stiltH * 0.55, b.d / 2 + 0.1);
        g.add(net);
      }
    }

    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot || 0;
    shadowify(g);
    this.scene.add(g);

    // Collider for body
    this.addCollider(b.x, b.z, Math.max(b.w, b.d) / 2 + 0.1, b.h + stiltH);

    // Interactable / NPC marker
    if (b.npcId || b.interactive) {
      this.addInteractable({
        x: b.x, z: b.z,
        radius: Math.max(b.w, b.d) / 2 + 1.5,
        label: b.label || 'Interact',
        npcId: b.npcId || null,
        id: b.id || null,
      });
    }

    return g;
  }

  // ─── Well ────────────────────────────────────────────────────────
  buildWell(x, z) {
    const mats = this.getMaterials();
    const g = new THREE.Group();

    // Dirt patch around base (slightly larger plane, dark)
    const dirt = new THREE.Mesh(
      new THREE.CircleGeometry(2.0, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1.0 })
    );
    dirt.rotateX(-Math.PI / 2);
    dirt.position.y = 0.015;
    g.add(dirt);

    // Round stone base — hexagonal
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 0.95, 8),
      mats.stone
    );
    base.position.y = 0.475;
    g.add(base);

    // Inner dark "water" disk recessed into the base
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.78, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0x0a1a20, roughness: 0.4, metalness: 0.6 })
    );
    water.position.y = 0.92;
    g.add(water);

    // Two posts + crossbeam frame
    [[-0.85, 0], [0.85, 0]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 2.4, 6),
        mats.plankDark
      );
      post.position.set(px, 1.65, pz);
      g.add(post);
    });
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.14, 0.14),
      mats.plankDark
    );
    beam.position.y = 2.7;
    g.add(beam);

    // Hanging rope (tube along a curve) with bucket
    const ropeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.65, 0),
      new THREE.Vector3(0.05, 1.9, 0.05),
      new THREE.Vector3(0.05, 1.2, 0.05),
    ]);
    const rope = new THREE.Mesh(
      new THREE.TubeGeometry(ropeCurve, 8, 0.018, 5, false),
      mats.rope
    );
    g.add(rope);

    // Bucket
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.16, 0.28, 8),
      mats.plank
    );
    bucket.position.set(0.05, 1.05, 0.05);
    g.add(bucket);
    const bucketRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.018, 4, 12),
      mats.metal
    );
    bucketRim.rotation.x = Math.PI / 2;
    bucketRim.position.set(0.05, 1.19, 0.05);
    g.add(bucketRim);

    // Small thatched roof shelter over the well
    const shelter = makeThatchedRoof(2.4, 1.2, 0.7, mats.thatch, mats.plankDark);
    shelter.position.y = 2.85;
    g.add(shelter);

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);

    this.addInteractable({ x, z, radius: 1.6, label: 'Drink Water', id: 'well' });
    this.addCollider(x, z, 1.15, 0.95);
    return g;
  }

  // ─── Barrels ─────────────────────────────────────────────────────
  buildBarrels(x, z, count) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    const variants = [mats.metalRust, mats.metalDark, mats.metal];
    for (let i = 0; i < count; i++) {
      const b = new THREE.Group();
      const mat = variants[i % variants.length];
      // Body
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.86, 14),
        mat
      );
      body.position.y = 0.43;
      b.add(body);
      // Top + bottom rims (toroidal)
      const rimGeom = new THREE.TorusGeometry(0.32, 0.022, 4, 14);
      const rimTop = new THREE.Mesh(rimGeom, mats.metalDark);
      rimTop.rotation.x = Math.PI / 2;
      rimTop.position.y = 0.84;
      b.add(rimTop);
      const rimMid = rimTop.clone(); rimMid.position.y = 0.43; b.add(rimMid);
      const rimBot = rimTop.clone(); rimBot.position.y = 0.04; b.add(rimBot);
      // Bunghole
      const bung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6),
        mats.metalDark
      );
      bung.position.set(0.18, 0.86, 0.0);
      b.add(bung);

      // Position with slight tilt + jitter
      b.position.set(
        i * 0.72 + this.rand(-0.08, 0.08),
        0,
        this.rand(-0.1, 0.1)
      );
      b.rotation.z = this.rand(-0.06, 0.06);
      b.rotation.y = this.rand(0, Math.PI * 2);
      g.add(b);
      this.addCollider(x + b.position.x, z + b.position.z, 0.36, 0.86);
    }
    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── Crates ──────────────────────────────────────────────────────
  buildCrates(x, z, stackCount) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    for (let i = 0; i < stackCount; i++) {
      const crate = this._makeCrate(0.85);
      const col = i % 2;
      const row = Math.floor(i / 2);
      crate.position.set(col * 0.92 + this.rand(-0.04, 0.04),
                         0.43 + row * 0.92,
                         this.rand(-0.05, 0.05));
      crate.rotation.y = this.rand(-0.15, 0.15);
      g.add(crate);
      this.addCollider(x + crate.position.x, z + crate.position.z, 0.5, 0.85);
    }
    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  _makeCrate(size) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    // Make crate from 4 plank panels for visible board seams
    const planks = 4;
    const front = makePlankPanel(size, size, planks, mats.plank, 0.04);
    front.position.z = size / 2;
    g.add(front);
    const back = makePlankPanel(size, size, planks, mats.plank, 0.04);
    back.position.z = -size / 2;
    g.add(back);
    const left = makePlankPanel(size, size, planks, mats.plank, 0.04);
    left.rotation.y = Math.PI / 2;
    left.position.x = -size / 2;
    g.add(left);
    const right = makePlankPanel(size, size, planks, mats.plank, 0.04);
    right.rotation.y = Math.PI / 2;
    right.position.x = size / 2;
    g.add(right);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(size, 0.04, size),
      mats.plank
    );
    top.position.y = size / 2;
    g.add(top);
    const bot = top.clone();
    bot.position.y = -size / 2;
    g.add(bot);
    // Diagonal nail strip on the front
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(size * 1.35, 0.03, 0.04),
      mats.plankDark
    );
    strip.rotation.z = Math.PI / 4;
    strip.position.z = size / 2 + 0.025;
    g.add(strip);
    return g;
  }

  // ─── Fire pit ────────────────────────────────────────────────────
  buildFirePit(x, z) {
    const mats = this.getMaterials();
    const g = new THREE.Group();

    // Charred ground patch
    const charred = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x180d05, roughness: 1.0 })
    );
    charred.rotateX(-Math.PI / 2);
    charred.position.y = 0.011;
    g.add(charred);

    // 8 darkened stones in a ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 0.55 + this.rand(-0.04, 0.06);
      const stone = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 + this.rand(0, 0.06), 5, 4),
        mats.stoneDark
      );
      stone.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      stone.scale.y = 0.7;
      stone.rotation.y = this.rand(0, Math.PI);
      g.add(stone);
    }

    // Charred logs (3 small dark cylinders crossed)
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5),
        mats.black
      );
      log.position.set(0, 0.08, 0);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 3) * Math.PI;
      g.add(log);
    }

    // Glowing embers — small bright sphere with emissive
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0xff8030,
      emissive: 0xff5010,
      emissiveIntensity: 1.2,
      roughness: 0.7,
    });
    const ember1 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), emberMat);
    ember1.position.set(0.05, 0.13, -0.05);
    g.add(ember1);
    const ember2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), emberMat);
    ember2.position.set(-0.1, 0.1, 0.08);
    g.add(ember2);

    // Smoke wisps — semi-transparent dark cones
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.18 + i * 0.08, 0.7, 5, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x2a2a26, transparent: true, opacity: 0.35 - i * 0.06, side: THREE.DoubleSide,
        })
      );
      cone.position.set(this.rand(-0.1, 0.1), 0.6 + i * 0.45, this.rand(-0.1, 0.1));
      g.add(cone);
    }

    // Flickering point light
    const light = new THREE.PointLight(0xff6622, 2.5, 8);
    light.position.set(0, 0.8, 0);
    g.add(light);
    this.flickerLight(light);

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── VC Building (bunker / hut / cage / storage / radio) ─────────
  buildVCBuilding(b) {
    const mats = this.getMaterials();
    // Radio shed gets the radio tower instead
    if (b.type === 'radio') {
      const tower = this.buildRadioTower(b.x, b.z);
      // Optional small base shed under the tower
      const shed = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.d),
        mats.plankDark
      );
      body.position.y = b.h / 2;
      shed.add(body);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.4, 0.18, b.d + 0.4),
        mats.corrugated
      );
      roof.position.y = b.h + 0.09;
      shed.add(roof);
      shed.position.set(b.x + 1.5, 0, b.z + 1.5);
      shadowify(shed);
      this.scene.add(shed);
      this.addCollider(b.x + 1.5, b.z + 1.5, Math.max(b.w, b.d) / 2 + 0.2, b.h);
      if (b.interactive || b.npcId) {
        this.addInteractable({
          x: b.x, z: b.z,
          radius: 3.0,
          label: b.label || 'Interact',
          npcId: b.npcId || null,
          id: b.id || null,
        });
      }
      return tower;
    }

    const g = new THREE.Group();

    if (b.type === 'cage') {
      // Bamboo cage — open frame with vertical bars
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, 0.12, b.d),
        mats.plankDark
      );
      floor.position.y = 0.26;
      g.add(floor);

      // Corner posts
      const cornerH = b.h;
      const postGeom = new THREE.CylinderGeometry(0.07, 0.08, cornerH, 6);
      [[-b.w / 2 + 0.1, -b.d / 2 + 0.1],
       [ b.w / 2 - 0.1, -b.d / 2 + 0.1],
       [-b.w / 2 + 0.1,  b.d / 2 - 0.1],
       [ b.w / 2 - 0.1,  b.d / 2 - 0.1]].forEach(([px, pz]) => {
        const p = new THREE.Mesh(postGeom, mats.bamboo);
        p.position.set(px, cornerH / 2 + 0.32, pz);
        g.add(p);
      });
      // Top rim
      const rimX = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, 0.08, 0.08),
        mats.plankDark
      );
      rimX.position.y = cornerH + 0.32;
      g.add(rimX);
      const rimX2 = rimX.clone(); rimX2.position.z = -b.d / 2; g.add(rimX2);
      const rimX3 = rimX.clone(); rimX3.position.z = b.d / 2; g.add(rimX3);
      const rimZ = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, b.d),
        mats.plankDark
      );
      rimZ.position.set(-b.w / 2, cornerH + 0.32, 0); g.add(rimZ);
      const rimZ2 = rimZ.clone(); rimZ2.position.x = b.w / 2; g.add(rimZ2);

      // Vertical bars on all 4 sides
      const barGeom = new THREE.CylinderGeometry(0.04, 0.04, cornerH, 5);
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const front = new THREE.Mesh(barGeom, mats.bamboo);
        front.position.set(-b.w / 2 + t * b.w, cornerH / 2 + 0.32, b.d / 2);
        g.add(front);
        const back = new THREE.Mesh(barGeom, mats.bamboo);
        back.position.set(-b.w / 2 + t * b.w, cornerH / 2 + 0.32, -b.d / 2);
        g.add(back);
      }
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const left = new THREE.Mesh(barGeom, mats.bamboo);
        left.position.set(-b.w / 2, cornerH / 2 + 0.32, -b.d / 2 + t * b.d);
        g.add(left);
        const right = new THREE.Mesh(barGeom, mats.bamboo);
        right.position.set(b.w / 2, cornerH / 2 + 0.32, -b.d / 2 + t * b.d);
        g.add(right);
      }
      // Thatched roof on top
      const roof = makeThatchedRoof(b.w + 0.3, b.d + 0.3, 0.9, mats.thatchDark, mats.plankDark);
      roof.position.y = cornerH + 0.32;
      g.add(roof);
    } else if (b.type === 'bunker') {
      // Bunker: low stone/sandbag walls + corrugated metal roof + sandbags on top
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.d),
        mats.plankDark
      );
      body.position.y = b.h / 2;
      g.add(body);
      // Corrugated roof
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.6, 0.18, b.d + 0.6),
        mats.corrugated
      );
      roof.position.y = b.h + 0.09;
      g.add(roof);
      // Sandbag emplacement around the front
      for (let row = 0; row < 2; row++) {
        const cols = Math.max(2, Math.floor(b.w / 0.55));
        for (let c = 0; c < cols; c++) {
          const sb = makeSandbag(mats.sandbag);
          sb.position.set(-b.w / 2 + c * 0.55 + 0.27 + ((row & 1) * 0.27),
                          b.h + 0.13 + row * 0.22,
                          b.d / 2 + 0.14);
          sb.rotation.y = this.rand(-0.05, 0.05);
          g.add(sb);
        }
      }
      // Door slit (dark)
      const doorSlit = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.6, 0.08),
        mats.darkInterior
      );
      doorSlit.position.set(0, b.h * 0.45, b.d / 2 + 0.05);
      g.add(doorSlit);
      // Embrasure (firing slit) on side
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.25, 1.4),
        mats.darkInterior
      );
      slit.position.set(b.w / 2 + 0.04, b.h * 0.7, 0);
      g.add(slit);
    } else if (b.type === 'storage') {
      // Storage shed — plank walls + corrugated roof
      const wallH = b.h;
      const front = makePlankPanel(b.w, wallH, 6, mats.plank, 0.08);
      front.position.set(0, wallH / 2, b.d / 2);
      g.add(front);
      const back = makePlankPanel(b.w, wallH, 6, mats.plank, 0.08);
      back.position.set(0, wallH / 2, -b.d / 2);
      g.add(back);
      const left = makePlankPanel(b.d, wallH, 5, mats.plank, 0.08);
      left.rotation.y = Math.PI / 2;
      left.position.set(-b.w / 2, wallH / 2, 0);
      g.add(left);
      const right = makePlankPanel(b.d, wallH, 5, mats.plank, 0.08);
      right.rotation.y = Math.PI / 2;
      right.position.set(b.w / 2, wallH / 2, 0);
      g.add(right);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.5, 0.16, b.d + 0.5),
        mats.corrugated
      );
      roof.position.y = wallH + 0.08;
      roof.rotation.z = 0.06;
      g.add(roof);
      // Doorway
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.7, 0.06),
        mats.darkInterior
      );
      door.position.set(0, 0.85, b.d / 2 + 0.05);
      g.add(door);
    } else {
      // Default 'hut' — like village hut but smaller / simpler
      this.buildVietHut({ ...b }, mats);
      return null;
    }

    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot || 0;
    shadowify(g);
    this.scene.add(g);

    this.addCollider(b.x, b.z, Math.max(b.w, b.d) / 2 + 0.2, b.h);

    if (b.npcId || b.interactive) {
      this.addInteractable({
        x: b.x, z: b.z,
        radius: Math.max(b.w, b.d) / 2 + 1.5,
        label: b.label || 'Interact',
        npcId: b.npcId || null,
        id: b.id || null,
      });
    }
    return g;
  }

  // ─── Watchtower ─────────────────────────────────────────────────
  buildWatchtower(x, z) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    const legH = 6;
    const platY = 6.0;
    const offs = 1.0; // half-spacing for legs

    // 4 legs
    const legGeom = new THREE.CylinderGeometry(0.13, 0.16, legH, 6);
    const legPositions = [[-offs, -offs], [offs, -offs], [-offs, offs], [offs, offs]];
    legPositions.forEach(([ox, oz]) => {
      const leg = new THREE.Mesh(legGeom, mats.bark);
      leg.position.set(ox, legH / 2, oz);
      g.add(leg);
    });

    // Diagonal cross-bracing planks (X) on each side
    const sideLen = offs * 2;
    const diagLen = Math.hypot(sideLen, legH * 0.55);
    const diagAngle = Math.atan2(legH * 0.55, sideLen);
    const sides = [
      { axis: 'z', pos: -offs, rot: 0 },
      { axis: 'z', pos:  offs, rot: 0 },
      { axis: 'x', pos: -offs, rot: Math.PI / 2 },
      { axis: 'x', pos:  offs, rot: Math.PI / 2 },
    ];
    sides.forEach(s => {
      for (let i = 0; i < 2; i++) {
        const cy = (i + 0.5) * (legH / 2.2);
        const br1 = new THREE.Mesh(
          new THREE.BoxGeometry(diagLen * 0.95, 0.06, 0.08),
          mats.plankDark
        );
        const br2 = br1.clone();
        if (s.axis === 'z') {
          br1.position.set(0, cy, s.pos);
          br1.rotation.z = diagAngle;
          br2.position.set(0, cy, s.pos);
          br2.rotation.z = -diagAngle;
        } else {
          br1.position.set(s.pos, cy, 0);
          br1.rotation.y = Math.PI / 2;
          br1.rotation.x = -diagAngle;
          br2.position.set(s.pos, cy, 0);
          br2.rotation.y = Math.PI / 2;
          br2.rotation.x = diagAngle;
        }
        g.add(br1);
        g.add(br2);
      }
    });

    // Platform deck — 5 visible planks
    const deckSize = sideLen + 0.6;
    const deck = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(deckSize, 0.1, deckSize / 5 - 0.04),
        mats.plank
      );
      p.position.set(0, 0, -deckSize / 2 + (deckSize / 5) * (i + 0.5));
      deck.add(p);
    }
    deck.position.y = platY;
    g.add(deck);

    // Wooden railing all around the platform
    const railH = 1.1;
    const railMat = mats.plankDark;
    const railSide = (forward) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(deckSize, 0.08, 0.07),
        railMat
      );
      rail.position.set(0, platY + railH, forward * (deckSize / 2));
      g.add(rail);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, railH, 4),
        railMat
      );
      for (const sx of [-deckSize / 2 + 0.1, deckSize / 2 - 0.1, 0]) {
        const p = post.clone();
        p.position.set(sx, platY + railH / 2 + 0.05, forward * (deckSize / 2));
        g.add(p);
      }
    };
    railSide(1); railSide(-1);
    const railSideX = (side) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.08, deckSize),
        railMat
      );
      rail.position.set(side * (deckSize / 2), platY + railH, 0);
      g.add(rail);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, railH, 4),
        railMat
      );
      for (const sz of [-deckSize / 2 + 0.1, deckSize / 2 - 0.1]) {
        const p = post.clone();
        p.position.set(side * (deckSize / 2), platY + railH / 2 + 0.05, sz);
        g.add(p);
      }
    };
    railSideX(1); railSideX(-1);

    // Sandbag emplacement at the front
    for (let row = 0; row < 2; row++) {
      const cols = 4;
      for (let c = 0; c < cols; c++) {
        const sb = makeSandbag(mats.sandbag);
        sb.position.set(-0.85 + c * 0.55 + ((row & 1) * 0.27),
                        platY + 0.13 + row * 0.22,
                        -deckSize / 2 + 0.18);
        sb.rotation.y = this.rand(-0.05, 0.05);
        g.add(sb);
      }
    }

    // Thatched pyramid roof on top
    const roof = makeThatchedRoof(deckSize + 0.4, deckSize + 0.4, 1.6, mats.thatch, mats.plankDark);
    roof.position.y = platY + railH + 0.55;
    g.add(roof);
    // Support posts under the roof at corners
    const roofPostH = railH + 0.55;
    for (const [px, pz] of [[-deckSize / 2 + 0.15, -deckSize / 2 + 0.15],
                            [ deckSize / 2 - 0.15, -deckSize / 2 + 0.15],
                            [-deckSize / 2 + 0.15,  deckSize / 2 - 0.15],
                            [ deckSize / 2 - 0.15,  deckSize / 2 - 0.15]]) {
      const rp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, roofPostH, 5),
        mats.bamboo
      );
      rp.position.set(px, platY + roofPostH / 2, pz);
      g.add(rp);
    }

    // Vertical ladder up one leg (back-right, oriented outward)
    const ladder = new THREE.Group();
    const ladH = platY;
    const railL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, ladH, 4),
      mats.bamboo
    );
    railL.position.set(-0.18, ladH / 2, 0);
    ladder.add(railL);
    const railR = railL.clone(); railR.position.x = 0.18; ladder.add(railR);
    const rungs = Math.floor(ladH / 0.35);
    for (let i = 1; i < rungs; i++) {
      const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.42, 4),
        mats.bamboo
      );
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, i * 0.35, 0);
      ladder.add(rung);
    }
    ladder.position.set(offs + 0.05, 0, offs + 0.25);
    g.add(ladder);

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);

    this.addCollider(x, z, 1.4, 7);
    return g;
  }

  // ─── Radio tower ────────────────────────────────────────────────
  buildRadioTower(x, z) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    const totalH = 11;
    const baseW = 0.8;
    const topW = 0.25;

    // 4 vertical lattice bars (slightly tapered) using line interpolation
    const segs = 6;
    const segH = totalH / segs;
    const vertGeom = (h) => new THREE.CylinderGeometry(0.04, 0.04, h, 4);

    const cornerXZ = (h) => {
      const t = h / totalH;
      const w = baseW * (1 - t) + topW * t;
      return w / 2;
    };

    // Approximate: build 4 straight legs slightly tilted inward
    const legGroup = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const points = [];
      for (let i = 0; i <= segs; i++) {
        const h = i * segH;
        const w = cornerXZ(h);
        points.push(new THREE.Vector3(sx * w, h, sz * w));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, segs * 2, 0.045, 5, false),
        mats.metal
      );
      legGroup.add(tube);
    }
    g.add(legGroup);

    // Horizontal cross-arms + X cross-braces between segments
    for (let i = 0; i < segs; i++) {
      const y0 = i * segH;
      const y1 = (i + 1) * segH;
      const w0 = cornerXZ(y0);
      const w1 = cornerXZ(y1);
      // 4 horizontal bars at top of segment
      const horiz = (axis) => {
        const len = w1 * 2;
        const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, len, 4),
          mats.metal
        );
        bar.rotation.z = (axis === 'x') ? Math.PI / 2 : 0;
        bar.rotation.x = (axis === 'z') ? Math.PI / 2 : 0;
        return bar;
      };
      const front = horiz('x'); front.position.set(0, y1, -w1); g.add(front);
      const back = horiz('x'); back.position.set(0, y1, w1); g.add(back);
      const lt = horiz('z'); lt.position.set(-w1, y1, 0); g.add(lt);
      const rt = horiz('z'); rt.position.set(w1, y1, 0); g.add(rt);
      // X cross-braces on each face
      const diagLen = Math.hypot(w0 + w1, segH);
      const diagAng = Math.atan2(segH, w0 + w1);
      const faces = [
        { side: 'front', n: new THREE.Vector3(0, 0, -1) },
        { side: 'back',  n: new THREE.Vector3(0, 0,  1) },
        { side: 'left',  n: new THREE.Vector3(-1, 0, 0) },
        { side: 'right', n: new THREE.Vector3( 1, 0, 0) },
      ];
      faces.forEach(f => {
        const br1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, diagLen, 3),
          mats.metal
        );
        const br2 = br1.clone();
        if (f.side === 'front' || f.side === 'back') {
          br1.position.set(0, y0 + segH / 2, f.n.z * w0);
          br1.rotation.z = diagAng;
          br2.position.set(0, y0 + segH / 2, f.n.z * w0);
          br2.rotation.z = -diagAng;
        } else {
          br1.position.set(f.n.x * w0, y0 + segH / 2, 0);
          br1.rotation.x = diagAng;
          br1.rotation.y = Math.PI / 2;
          br2.position.set(f.n.x * w0, y0 + segH / 2, 0);
          br2.rotation.x = -diagAng;
          br2.rotation.y = Math.PI / 2;
        }
        g.add(br1);
        g.add(br2);
      });
    }

    // Antennas / cross-arms at the top
    const armY = totalH - 0.2;
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 3.0, 4),
      mats.metal
    );
    arm.rotation.z = Math.PI / 2;
    arm.position.y = armY;
    g.add(arm);
    const arm2 = arm.clone();
    arm2.rotation.set(0, 0, 0);
    arm2.rotation.x = Math.PI / 2;
    arm2.position.y = armY - 1.2;
    g.add(arm2);
    // Small whip antennas
    for (const sx of [-1.4, 0, 1.4]) {
      const whip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4),
        mats.metalDark
      );
      whip.position.set(sx, armY + 0.5, 0);
      g.add(whip);
    }

    // Top spire mast
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, 1.6, 5),
      mats.metalDark
    );
    spire.position.y = totalH + 0.6;
    g.add(spire);

    // Guy wires (4 from top to ground anchors)
    const anchorR = 6;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ax = Math.cos(a) * anchorR;
      const az = Math.sin(a) * anchorR;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, totalH + 0.2, 0),
        new THREE.Vector3(ax * 0.5, totalH * 0.55, az * 0.5),
        new THREE.Vector3(ax, 0, az),
      ]);
      const wire = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 12, 0.012, 4, false),
        mats.metalDark
      );
      g.add(wire);
      // Anchor stake
      const stake = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.5, 5),
        mats.metalDark
      );
      stake.position.set(ax, 0.25, az);
      g.add(stake);
    }

    // Red blinking warning light at the top
    const lightSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2020 })
    );
    lightSphere.position.y = totalH + 1.5;
    g.add(lightSphere);
    const blinker = new THREE.PointLight(0xff2020, 1.4, 14);
    blinker.position.y = totalH + 1.5;
    g.add(blinker);
    // Tag for frame-driven blink (handled in world.update via _updateBlinkers).
    // Replaces the old setTimeout recursion that never terminated.
    blinker.userData.blink = {
      baseI: blinker.intensity,
      onColor: 0xff2020,
      offColor: 0x301010,
      lightSphere,
      phase: Math.random() * 1.0,
    };
    if (!this.blinkers) this.blinkers = [];
    this.blinkers.push(blinker);

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);

    this.addInteractable({ x, z, radius: 2.8, label: 'Destroy Radio Tower', id: 'radio_tower' });
    this.addCollider(x, z, 0.9, totalH);
    return blinker;
  }

  // ─── Fence ──────────────────────────────────────────────────────
  buildFence(x1, z1, x2, z2) {
    const mats = this.getMaterials();
    const g = new THREE.Group();

    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const posts = Math.max(2, Math.floor(len / 2.5));

    const postGeom = new THREE.CylinderGeometry(0.07, 0.09, 1.85, 5);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const px = x1 + dx * t, pz = z1 + dz * t;
      const post = new THREE.Mesh(postGeom, mats.bark);
      post.position.set(px, 0.92, pz);
      g.add(post);
    }

    // 3 strands of barbed wire — each a slightly curved tube with slight sag
    const strandHeights = [0.45, 0.95, 1.45];
    strandHeights.forEach(sy => {
      const segs = posts * 2;
      const points = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        // Sag between posts
        const segT = (t * posts) % 1;
        const sag = Math.sin(segT * Math.PI) * 0.04;
        points.push(new THREE.Vector3(x1 + dx * t, sy - sag, z1 + dz * t));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, segs, 0.018, 4, false),
        mats.metalDark
      );
      g.add(tube);
      // Small twisted barbs every meter
      const barbCount = Math.floor(len / 1.0);
      for (let i = 0; i < barbCount; i++) {
        const t = (i + 0.5) / barbCount;
        const px = x1 + dx * t, pz = z1 + dz * t;
        const barb = new THREE.Mesh(
          new THREE.ConeGeometry(0.018, 0.12, 4),
          mats.metalDark
        );
        barb.position.set(px, sy, pz);
        barb.rotation.z = Math.PI / 2;
        barb.rotation.y = angle;
        g.add(barb);
      }
    });

    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── Sandbag wall (linear, brick pattern) ─────────────────────────
  buildSandbags(x, z, length, depth) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    const sbW = 0.5, sbH = 0.22, sbD = 0.32;
    const rows = 2;

    if (length > 0) {
      const cols = Math.max(2, length);
      for (let r = 0; r < rows; r++) {
        const offset = (r & 1) ? sbW / 2 : 0;
        for (let c = 0; c < cols; c++) {
          const sb = makeSandbag(mats.sandbag);
          sb.position.set(
            -((cols - 1) * sbW) / 2 + c * sbW + offset,
            sbH / 2 + r * sbH,
            this.rand(-0.02, 0.02)
          );
          sb.rotation.y = this.rand(-0.06, 0.06);
          g.add(sb);
        }
      }
    } else if (depth > 0) {
      const cols = Math.max(2, depth);
      for (let r = 0; r < rows; r++) {
        const offset = (r & 1) ? sbD / 2 : 0;
        for (let c = 0; c < cols; c++) {
          const sb = makeSandbag(mats.sandbag);
          sb.rotation.y = Math.PI / 2 + this.rand(-0.06, 0.06);
          sb.position.set(
            this.rand(-0.02, 0.02),
            sbH / 2 + r * sbH,
            -((cols - 1) * sbD) / 2 + c * sbD + offset
          );
          g.add(sb);
        }
      }
    }

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── Mission clinic ─────────────────────────────────────────────
  buildClinic(centerX, centerZ, cacheX, cacheZ) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    const W = 12, H = 3.6, D = 8;

    // Body — plank walls
    const front = makePlankPanel(W, H, 12, mats.plankLight, 0.1);
    front.position.set(0, H / 2, D / 2);
    g.add(front);
    const back = makePlankPanel(W, H, 12, mats.plankLight, 0.1);
    back.position.set(0, H / 2, -D / 2);
    back.rotation.y = Math.PI;
    g.add(back);
    const left = makePlankPanel(D, H, 8, mats.plankLight, 0.1);
    left.position.set(-W / 2, H / 2, 0);
    left.rotation.y = -Math.PI / 2;
    g.add(left);
    const right = makePlankPanel(D, H, 8, mats.plankLight, 0.1);
    right.position.set(W / 2, H / 2, 0);
    right.rotation.y = Math.PI / 2;
    g.add(right);

    // Interior dark box
    const interior = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.3, H - 0.2, D - 0.3),
      mats.darkInterior
    );
    interior.material.side = THREE.BackSide;
    interior.position.y = H / 2;
    g.add(interior);

    // Sloped corrugated metal roof — single tilted panel
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.8, 0.2, D + 0.8),
      mats.corrugated
    );
    roof.position.y = H + 0.35;
    roof.rotation.z = 0.16;
    g.add(roof);
    // Roof eave trim (ridge beam)
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.18, D + 0.8),
      mats.plankDark
    );
    ridge.position.set(0, H + 0.55, 0);
    g.add(ridge);

    // Front porch / awning with support posts
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(W - 1.0, 0.12, 2.4),
      mats.plankDark
    );
    awning.position.set(0, H * 0.78, D / 2 + 1.2);
    awning.rotation.x = -0.05;
    g.add(awning);
    for (const sx of [-W / 2 + 1.0, W / 2 - 1.0, 0]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.13, H * 0.78, 6),
        mats.plankDark
      );
      post.position.set(sx, H * 0.39, D / 2 + 2.3);
      g.add(post);
    }

    // Windows with dark blue panes
    [-3.5, 3.5].forEach(wx => {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.1, 0.08),
        mats.plankDark
      );
      frame.position.set(wx, H * 0.62, D / 2 + 0.06);
      g.add(frame);
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.9, 0.04),
        mats.glass
      );
      pane.position.set(wx, H * 0.62, D / 2 + 0.105);
      g.add(pane);
      // Cross mullions
      const mh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.06), mats.plankDark);
      mh.position.set(wx, H * 0.62, D / 2 + 0.12); g.add(mh);
      const mv = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.06), mats.plankDark);
      mv.position.set(wx, H * 0.62, D / 2 + 0.12); g.add(mv);
    });
    // Side windows
    [-2.5, 2.5].forEach(wz => {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.9, 1.2),
        mats.glass
      );
      pane.position.set(W / 2 + 0.05, H * 0.62, wz);
      g.add(pane);
    });

    // Door cutout (dark recessed)
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.2, 0.1),
      mats.plankDark
    );
    doorFrame.position.set(0, 1.1, D / 2 + 0.06);
    g.add(doorFrame);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.0, 0.05),
      mats.darkInterior
    );
    door.position.set(0, 1.0, D / 2 + 0.13);
    g.add(door);

    // Red cross sign — white plate + red cross
    const signPlate = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xeeeae0 })
    );
    signPlate.position.set(0, H + 0.95, D / 2 + 0.2);
    g.add(signPlate);
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 1.05, 0.07),
      mats.red
    );
    crossV.position.set(0, H + 0.95, D / 2 + 0.24);
    g.add(crossV);
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.32, 0.07),
      mats.red
    );
    crossH.position.set(0, H + 0.95, D / 2 + 0.24);
    g.add(crossH);

    // Side red cross marker
    const sideMarker = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.0, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xeeeae0 })
    );
    sideMarker.position.set(W / 2 + 0.05, H * 0.5, 0);
    g.add(sideMarker);
    const sideCrossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.7, 0.22),
      mats.red
    );
    sideCrossV.position.set(W / 2 + 0.1, H * 0.5, 0);
    g.add(sideCrossV);
    const sideCrossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.22, 0.7),
      mats.red
    );
    sideCrossH.position.set(W / 2 + 0.1, H * 0.5, 0);
    g.add(sideCrossH);

    g.position.set(centerX, 0, centerZ);
    shadowify(g);
    this.scene.add(g);

    // Cache box outside (separate group at cache coords)
    const cache = new THREE.Group();
    const cacheBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.9, 1.3),
      mats.plank
    );
    cacheBox.position.y = 0.45;
    cache.add(cacheBox);
    // Weathered metal lid
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.36, 0.07, 1.36),
      mats.metalRust
    );
    lid.position.y = 0.93;
    cache.add(lid);
    // Lock + handles
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.02, 4, 8),
      mats.metalDark
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.97, 0);
    cache.add(handle);
    cache.position.set(cacheX, 0, cacheZ);
    shadowify(cache);
    this.scene.add(cache);

    this.addCollider(centerX, centerZ, 6.4, H + 0.5);
    this.addCollider(cacheX, cacheZ, 0.85, 1.0);
    this.addInteractable({
      x: cacheX, z: cacheZ, radius: 2.0,
      label: 'Open Clinic Supply Cache', id: 'clinic_cache',
    });
    return g;
  }

  // ─── River crossing ─────────────────────────────────────────────
  buildRiverCrossing(centerX, centerZ, postX, postZ, convoyX, convoyZ) {
    const mats = this.getMaterials();
    const g = new THREE.Group();

    // Wooden dock — visible plank seams
    const dockW = 5, dockD = 2;
    const planks = 6;
    const dock = new THREE.Group();
    for (let i = 0; i < planks; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(dockW, 0.1, dockD / planks - 0.02),
        mats.plank
      );
      p.position.set(0, 0.2, -dockD / 2 + (dockD / planks) * (i + 0.5));
      dock.add(p);
    }
    // Dock supports (4 vertical posts)
    [[-dockW / 2 + 0.3, -dockD / 2 + 0.2],
     [ dockW / 2 - 0.3, -dockD / 2 + 0.2],
     [-dockW / 2 + 0.3,  dockD / 2 - 0.2],
     [ dockW / 2 - 0.3,  dockD / 2 - 0.2]].forEach(([sx, sz]) => {
      const sup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.13, 0.6, 5),
        mats.plankDark
      );
      sup.position.set(sx, -0.1, sz);
      dock.add(sup);
    });
    dock.position.set(2, 0, -4.3);
    g.add(dock);

    // Beached longboat — ExtrudeGeometry hull (pointed ends)
    const boatShape = new THREE.Shape();
    boatShape.moveTo(-1.6, 0);
    boatShape.bezierCurveTo(-1.3, 0.55, 1.3, 0.55, 1.6, 0);
    boatShape.bezierCurveTo(1.3, -0.55, -1.3, -0.55, -1.6, 0);
    const boatHull = new THREE.Mesh(
      new THREE.ExtrudeGeometry(boatShape, { depth: 0.5, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.05, bevelThickness: 0.05 }),
      mats.plankDark
    );
    boatHull.rotation.x = -Math.PI / 2;
    boatHull.position.set(6, 0.45, 0);
    g.add(boatHull);
    // Boat interior (hollow look)
    const boatHollow = new THREE.Mesh(
      new THREE.ExtrudeGeometry(boatShape, { depth: 0.35, bevelEnabled: false }),
      mats.darkInterior
    );
    boatHollow.scale.set(0.85, 0.85, 1);
    boatHollow.rotation.x = -Math.PI / 2;
    boatHollow.position.set(6, 0.65, 0);
    g.add(boatHollow);
    // Cross-bench
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.06, 1.0),
      mats.plank
    );
    bench.position.set(6, 0.7, 0);
    g.add(bench);

    // Wooden mooring posts with rope coiled around
    [[3, -2], [9, -1]].forEach(([mx, mz]) => {
      const mp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.16, 1.4, 6),
        mats.plankDark
      );
      mp.position.set(mx, 0.7, mz);
      g.add(mp);
      // Rope coil (small torus)
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.03, 4, 10),
        mats.rope
      );
      coil.rotation.x = Math.PI / 2;
      coil.position.set(mx, 1.0, mz);
      g.add(coil);
    });

    // Ferry winch / pulley post
    const winchPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6),
      mats.plankDark
    );
    winchPost.position.set(postX - centerX, 1.1, postZ - centerZ);
    g.add(winchPost);
    // Winch drum at the top
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.45, 8),
      mats.metalRust
    );
    drum.rotation.z = Math.PI / 2;
    drum.position.set(postX - centerX, 2.1, postZ - centerZ);
    g.add(drum);
    // Crank handle
    const crank = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.4, 0.05),
      mats.metalDark
    );
    crank.position.set(postX - centerX + 0.3, 2.1, postZ - centerZ);
    g.add(crank);
    // Rope from winch
    const wireC = new THREE.CatmullRomCurve3([
      new THREE.Vector3(postX - centerX, 2.1, postZ - centerZ),
      new THREE.Vector3(postX - centerX + 4, 1.6, postZ - centerZ + 1),
      new THREE.Vector3(postX - centerX + 8, 0.7, postZ - centerZ + 4),
    ]);
    const ropeWinch = new THREE.Mesh(
      new THREE.TubeGeometry(wireC, 12, 0.022, 4, false),
      mats.rope
    );
    g.add(ropeWinch);

    g.position.set(centerX, 0, centerZ);
    shadowify(g);
    this.scene.add(g);

    // Convoy cart (separate)
    const cart = new THREE.Group();
    const cartBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.8, 1.6),
      mats.plank
    );
    cartBody.position.y = 0.7;
    cart.add(cartBody);
    // Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
    for (const [wx, wz] of [[-0.9, -0.85], [0.9, -0.85], [-0.9, 0.85], [0.9, 0.85]]) {
      const wh = new THREE.Mesh(wheelGeom, mats.plankDark);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(wx, 0.42, wz);
      cart.add(wh);
    }
    // Tarp cover
    const tarp = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.7, 1.5),
      mats.fabricCanvas
    );
    tarp.position.y = 1.4;
    cart.add(tarp);
    // Yoke / shaft poles
    const yoke = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.06, 0.06),
      mats.plankDark
    );
    yoke.position.set(2.0, 0.7, 0);
    cart.add(yoke);
    cart.position.set(convoyX, 0, convoyZ);
    cart.rotation.y = 0.4;
    shadowify(cart);
    this.scene.add(cart);

    this.addCollider(convoyX, convoyZ, 1.5, 1.6);
    this.addCollider(postX, postZ, 0.4, 2.2);
    this.addInteractable({ x: postX, z: postZ, radius: 2.2, label: 'Force Ferry Post', id: 'ferry_post' });
    this.addInteractable({ x: convoyX, z: convoyZ, radius: 2.6, label: 'Cover Civilian Convoy', id: 'civilian_convoy' });
    return g;
  }

  // ─── Hamlet (3 small structures) ────────────────────────────────
  buildHamlet(centerX, centerZ) {
    const mats = this.getMaterials();
    const g = new THREE.Group();

    for (let i = 0; i < 3; i++) {
      const hx = (i - 1) * 4.5;
      const hz = (i % 2 === 0 ? -2.2 : 2.2);
      this.buildVietHut({
        x: centerX + hx,
        z: centerZ + hz,
        w: 3.4 + this.rand(-0.2, 0.4),
        d: 3.0 + this.rand(-0.2, 0.4),
        h: 2.6 + this.rand(0, 0.4),
        rot: this.rand(-0.4, 0.4),
        type: 'hamlet',
      });
    }

    // Drying racks — 2 racks (horizontal poles with flat planes for fish/cloth)
    for (let r = 0; r < 2; r++) {
      const rg = new THREE.Group();
      // Two posts
      for (const sx of [-1.2, 1.2]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, 1.4, 5),
          mats.bamboo
        );
        post.position.set(sx, 0.7, 0);
        rg.add(post);
      }
      // Horizontal bar
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4),
        mats.bamboo
      );
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 1.3, 0);
      rg.add(bar);
      // Hung items (fish strips / cloth)
      const itemMat = (r === 0)
        ? new THREE.MeshStandardMaterial({ color: 0xa07050, side: THREE.DoubleSide })
        : mats.cloth;
      for (let i = 0; i < 5; i++) {
        const item = new THREE.Mesh(
          new THREE.PlaneGeometry(0.18, 0.55),
          itemMat
        );
        item.position.set(-1.0 + i * 0.5, 1.0, 0);
        rg.add(item);
      }
      rg.position.set(centerX + (r === 0 ? -3 : 3.5), 0, centerZ + 5);
      rg.rotation.y = this.rand(-0.3, 0.3);
      shadowify(rg);
      this.scene.add(rg);
    }

    // Small fishing net hung between two posts
    const netGroup = new THREE.Group();
    for (const sx of [-1.5, 1.5]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 1.7, 5),
        mats.bamboo
      );
      post.position.set(sx, 0.85, 0);
      netGroup.add(post);
    }
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.3),
      mats.net
    );
    net.position.set(0, 1.0, 0);
    netGroup.add(net);
    netGroup.position.set(centerX + 1, 0, centerZ - 5);
    netGroup.rotation.y = -0.4;
    shadowify(netGroup);
    this.scene.add(netGroup);

    g.position.set(centerX, 0, centerZ);
    this.scene.add(g);
    return g;
  }

  // ─── ARVN outpost ───────────────────────────────────────────────
  buildARVNOutpost(level) {
    const mats = this.getMaterials();
    const { center, gate, buildings } = level;
    const g = new THREE.Group();

    // Compacted dirt ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 28),
      new THREE.MeshStandardMaterial({ color: 0x4a3820, roughness: 1.0 })
    );
    ground.rotateX(-Math.PI / 2);
    ground.position.set(center.x, 0.012, center.z);
    this.scene.add(ground);

    // Sandbag perimeter walls at corners and along the gate
    const corners = [
      { x: center.x - 14, z: center.z - 10, lx: 4, lz: 4 }, // back-left
      { x: center.x + 14, z: center.z - 10, lx: 4, lz: 4 }, // back-right
      { x: center.x - 14, z: center.z + 10, lx: 4, lz: 4 }, // front-left
      { x: center.x + 14, z: center.z + 10, lx: 4, lz: 4 }, // front-right
    ];
    corners.forEach(c => {
      this.buildSandbags(c.x + (c.x < center.x ? 1.5 : -1.5), c.z, c.lx, 0);
      this.buildSandbags(c.x, c.z + (c.z < center.z ? 1.5 : -1.5), 0, c.lz);
    });
    // Wire fence between corners (3 sides)
    this.buildFence(center.x - 14, center.z - 10, center.x + 14, center.z - 10);
    this.buildFence(center.x - 14, center.z - 10, center.x - 14, center.z + 10);
    this.buildFence(center.x + 14, center.z - 10, center.x + 14, center.z + 10);

    // Gate posts + horizontal beam + ARVN flag
    const gatePostL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 3.4, 6),
      mats.plankDark
    );
    gatePostL.position.set(gate.x - 2.5, 1.7, gate.z);
    this.scene.add(gatePostL);
    const gatePostR = gatePostL.clone();
    gatePostR.position.x = gate.x + 2.5;
    this.scene.add(gatePostR);
    const gateBeam = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.4, 0.4),
      mats.plankDark
    );
    gateBeam.position.set(gate.x, 3.2, gate.z);
    this.scene.add(gateBeam);
    // Cross brace
    for (const sx of [-1, 1]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.12, 0.12),
        mats.plankDark
      );
      brace.position.set(gate.x + sx * 1.6, 2.7, gate.z);
      brace.rotation.z = sx * 0.5;
      this.scene.add(brace);
    }
    // ARVN flag — yellow with three red horizontal stripes
    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4),
      mats.metalDark
    );
    flagPole.position.set(gate.x, 4.2, gate.z);
    this.scene.add(flagPole);
    const flagBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.9),
      mats.yellowFlag
    );
    flagBg.position.set(gate.x + 0.7, 4.5, gate.z);
    this.scene.add(flagBg);
    // 3 red stripes
    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.08),
        mats.redStripe
      );
      stripe.position.set(gate.x + 0.7, 4.5 + (i - 1) * 0.13, gate.z + 0.005);
      this.scene.add(stripe);
    }

    // Sandbag emplacement at the gate (left & right)
    this.buildSandbags(gate.x - 4.0, gate.z + 1.5, 3, 0);
    this.buildSandbags(gate.x + 4.0, gate.z + 1.5, 3, 0);

    // Mounted machine gun proxy on left emplacement
    const mgBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 0.4, 6),
      mats.metalDark
    );
    mgBase.position.set(gate.x - 4.0, 0.7, gate.z + 1.5);
    this.scene.add(mgBase);
    const mgBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6),
      mats.metalDark
    );
    mgBarrel.rotation.x = Math.PI / 2;
    mgBarrel.position.set(gate.x - 4.0, 0.95, gate.z + 2.1);
    this.scene.add(mgBarrel);
    const mgShield = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.05),
      mats.metalRust
    );
    mgShield.position.set(gate.x - 4.0, 1.05, gate.z + 1.4);
    this.scene.add(mgShield);

    // Gate lamp
    const gateLamp = new THREE.PointLight(0x66ff99, 1.8, 9);
    gateLamp.position.set(gate.x, 3.6, gate.z + 0.5);
    this.scene.add(gateLamp);

    // Buildings — translate types into rich variants
    buildings.forEach(b => {
      if (b.type === 'tower') {
        this.buildWatchtower(b.x, b.z);
      } else if (b.type === 'tent') {
        this._buildARVNTent(b);
      } else if (b.type === 'bunker' || b.type === 'command') {
        this._buildCommandBuilding(b);
      } else {
        // Default — command building
        this._buildCommandBuilding(b);
      }
    });

    // Add a second tent for personality
    this._buildARVNTent({
      x: center.x - 4, z: center.z - 4,
      w: 4.5, d: 3.5, h: 2.4,
    });

    this.addInteractable({
      x: gate.x, z: gate.z, radius: 6,
      label: 'Request Gate Entry', id: 'arvn_gate',
    });
    return g;
  }

  _buildARVNTent(b) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    // Tent body (semi-cylindrical canvas)
    const tent = new THREE.Mesh(
      new THREE.CylinderGeometry(b.d / 2, b.d / 2, b.w, 12, 1, false, 0, Math.PI),
      mats.fabric
    );
    tent.rotation.z = Math.PI / 2;
    tent.position.y = b.d / 2;
    tent.material.side = THREE.DoubleSide;
    g.add(tent);
    // End caps
    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(b.d / 2, 12, 0, Math.PI),
      mats.fabric
    );
    cap.rotation.y = Math.PI / 2;
    cap.position.set(b.w / 2, b.d / 2, 0);
    cap.material.side = THREE.DoubleSide;
    g.add(cap);
    const cap2 = cap.clone();
    cap2.rotation.y = -Math.PI / 2;
    cap2.position.x = -b.w / 2;
    g.add(cap2);
    // Door flap (dark interior)
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, b.d - 0.2),
      mats.darkInterior
    );
    door.position.set(-b.w / 2 - 0.01, (b.d - 0.2) / 2 + 0.05, 0);
    door.rotation.y = -Math.PI / 2;
    door.material.side = THREE.DoubleSide;
    g.add(door);
    // Tent ropes
    for (const [sx, sz] of [[-b.w/2 - 0.5, -b.d/2 - 0.6], [b.w/2 + 0.5, -b.d/2 - 0.6],
                            [-b.w/2 - 0.5, b.d/2 + 0.6], [b.w/2 + 0.5, b.d/2 + 0.6]]) {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(0.6, b.d), 4),
        mats.rope
      );
      rope.position.set(sx / 2, b.d / 2, sz / 2);
      rope.lookAt(new THREE.Vector3(sx, 0, sz));
      rope.rotateX(Math.PI / 2);
      g.add(rope);
      const stake = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.2, 4),
        mats.metalDark
      );
      stake.position.set(sx, 0.05, sz);
      g.add(stake);
    }
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot || 0;
    shadowify(g);
    this.scene.add(g);
    this.addCollider(b.x, b.z, Math.max(b.w, b.d) / 2 + 0.1, b.d);
  }

  _buildCommandBuilding(b) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    // Plank walls
    const front = makePlankPanel(b.w, b.h, 8, mats.plank, 0.1);
    front.position.set(0, b.h / 2, b.d / 2);
    g.add(front);
    const back = makePlankPanel(b.w, b.h, 8, mats.plank, 0.1);
    back.position.set(0, b.h / 2, -b.d / 2);
    g.add(back);
    const left = makePlankPanel(b.d, b.h, 6, mats.plank, 0.1);
    left.rotation.y = Math.PI / 2;
    left.position.set(-b.w / 2, b.h / 2, 0);
    g.add(left);
    const right = makePlankPanel(b.d, b.h, 6, mats.plank, 0.1);
    right.rotation.y = Math.PI / 2;
    right.position.set(b.w / 2, b.h / 2, 0);
    g.add(right);
    // Interior dark
    const interior = new THREE.Mesh(
      new THREE.BoxGeometry(b.w - 0.3, b.h - 0.2, b.d - 0.3),
      mats.darkInterior
    );
    interior.material.side = THREE.BackSide;
    interior.position.y = b.h / 2;
    g.add(interior);
    // Corrugated metal sloped roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.6, 0.16, b.d + 0.6),
      mats.corrugatedG
    );
    roof.position.y = b.h + 0.32;
    roof.rotation.z = 0.14;
    g.add(roof);
    // Door
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, b.h * 0.7, 0.06),
      mats.darkInterior
    );
    door.position.set(0, b.h * 0.35, b.d / 2 + 0.06);
    g.add(door);
    // Windows
    [-b.w * 0.3, b.w * 0.3].forEach(wx => {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.7, 0.05),
        mats.glass
      );
      pane.position.set(wx, b.h * 0.6, b.d / 2 + 0.06);
      g.add(pane);
    });
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot || 0;
    shadowify(g);
    this.scene.add(g);
    this.addCollider(b.x, b.z, Math.max(b.w, b.d) / 2 + 0.2, b.h);
  }

  // ─── UH-1 Huey helicopter wreck ─────────────────────────────────
  buildHelicopterWreck(x, z) {
    const mats = this.getMaterials();
    const g = new THREE.Group();
    const charredMat = new THREE.MeshStandardMaterial({
      color: 0x252220, roughness: 0.95, metalness: 0.2,
    });
    const cockpitMat = mats.glassBroken;

    // ── Charred ground patch (large dark circle) ──
    const charred = new THREE.Mesh(
      new THREE.CircleGeometry(7, 24),
      new THREE.MeshStandardMaterial({ color: 0x180c06, roughness: 1.0 })
    );
    charred.rotateX(-Math.PI / 2);
    charred.position.y = 0.014;
    g.add(charred);
    // Inner darker scorch
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(3.5, 18),
      new THREE.MeshStandardMaterial({ color: 0x0a0604, roughness: 1.0 })
    );
    scorch.rotateX(-Math.PI / 2);
    scorch.position.y = 0.018;
    g.add(scorch);

    // Burned grass patches around the wreck (small dark planes)
    for (let i = 0; i < 8; i++) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(this.rand(0.4, 0.9), 6),
        new THREE.MeshStandardMaterial({ color: 0x231a10, roughness: 1.0 })
      );
      patch.rotateX(-Math.PI / 2);
      const a = (i / 8) * Math.PI * 2 + this.rand(-0.3, 0.3);
      const r = this.rand(4.5, 7.5);
      patch.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
      patch.rotation.z = this.rand(0, Math.PI);
      g.add(patch);
    }

    // ── Fuselage (main body) — tilted on its side ──
    // Built as a compound of cylinders/boxes
    const fuselage = new THREE.Group();
    const bodyGeom = new THREE.CylinderGeometry(1.05, 1.15, 4.8, 12);
    const body = new THREE.Mesh(bodyGeom, charredMat);
    body.rotation.z = Math.PI / 2;
    fuselage.add(body);
    // Belly skin — slightly squashed bottom
    const belly = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.7, 1.8),
      charredMat
    );
    belly.position.y = -0.6;
    fuselage.add(belly);
    // Engine hump on top (between cabin and tail)
    const hump = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.7, 1.4),
      charredMat
    );
    hump.position.set(-0.4, 0.85, 0);
    fuselage.add(hump);
    // Exhaust pipe (stub)
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.5, 8),
      mats.metalDark
    );
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(-0.9, 0.95, 0.4);
    fuselage.add(exhaust);

    // Cargo door open — show interior darkness
    const cargoOpening = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 0.06),
      mats.darkInterior
    );
    cargoOpening.position.set(0.6, 0, 1.13);
    fuselage.add(cargoOpening);
    // Bent door panel hanging
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 0.06),
      charredMat
    );
    door.position.set(0.6, -0.2, 1.6);
    door.rotation.y = -0.6;
    door.rotation.z = 0.3;
    fuselage.add(door);

    // Cockpit dome — shattered glass front
    const cockpitDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      cockpitMat
    );
    cockpitDome.rotation.z = Math.PI / 2;
    cockpitDome.position.set(2.4, 0.0, 0);
    fuselage.add(cockpitDome);
    // Cockpit frame around the dome
    const cockpitFrame = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.06, 4, 14, Math.PI),
      charredMat
    );
    cockpitFrame.rotation.y = Math.PI / 2;
    cockpitFrame.position.set(2.4, 0, 0);
    fuselage.add(cockpitFrame);
    // Side windows (smashed)
    for (const sz of [-0.95, 0.95]) {
      const sideWin = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.55, 0.04),
        cockpitMat
      );
      sideWin.position.set(2.2, 0.1, sz);
      sideWin.rotation.y = sz > 0 ? 0 : Math.PI;
      fuselage.add(sideWin);
    }
    // A few jagged glass shards around the cockpit
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.3, 3),
        cockpitMat
      );
      shard.position.set(3.0 + this.rand(0, 0.6), this.rand(-0.6, 0.6), this.rand(-0.9, 0.9));
      shard.rotation.set(this.rand(0, Math.PI), this.rand(0, Math.PI), this.rand(0, Math.PI));
      fuselage.add(shard);
    }

    // Skids — bent landing gear
    for (const sz of [-1.2, 1.2]) {
      const skid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 4.0, 7),
        mats.metalDark
      );
      skid.rotation.z = Math.PI / 2;
      skid.position.set(0.2, -1.4, sz);
      // Bend by curving slightly via rotation
      skid.rotation.x = sz > 0 ? -0.15 : 0.15;
      fuselage.add(skid);
      // Skid struts (cross supports)
      for (const sx of [-1.5, 1.5]) {
        const strut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5),
          mats.metalDark
        );
        strut.position.set(sx, -1.0, sz);
        strut.rotation.z = sz > 0 ? 0.2 : -0.2;
        fuselage.add(strut);
      }
    }

    // Tilt the entire fuselage as if crashed on its side
    fuselage.rotation.x = -0.45;
    fuselage.rotation.z = 0.35;
    fuselage.position.set(0, 1.1, 0);
    g.add(fuselage);

    // ── Tail boom — long thinner cylinder, broken at the joint ──
    const tailBoom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.5, 4.2, 10),
      charredMat
    );
    tailBoom.rotation.z = Math.PI / 2;
    tailBoom.rotation.y = 0.2;
    tailBoom.rotation.x = 0.4;
    tailBoom.position.set(-4.6, 1.4, -0.5);
    g.add(tailBoom);
    // Broken jagged edge at the joint
    const tailBreak = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.7, 6),
      charredMat
    );
    tailBreak.rotation.z = -Math.PI / 2;
    tailBreak.position.set(-2.6, 1.5, -0.2);
    g.add(tailBreak);
    // Tail fin (vertical stabilizer)
    const tailFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1.1, 0.7),
      charredMat
    );
    tailFin.position.set(-6.4, 2.0, -0.7);
    tailFin.rotation.x = 0.4;
    g.add(tailFin);
    // Horizontal stabilizer
    const tailHoriz = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.15, 1.6),
      charredMat
    );
    tailHoriz.position.set(-6.2, 1.7, -0.6);
    g.add(tailHoriz);

    // Tail rotor — 2-blade
    const tailRotorHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.18, 6),
      mats.metalDark
    );
    tailRotorHub.rotation.x = Math.PI / 2;
    tailRotorHub.position.set(-6.5, 2.0, -0.4);
    g.add(tailRotorHub);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.85, 0.12),
        mats.metalDark
      );
      blade.position.set(-6.5, 2.0, -0.4);
      blade.rotation.x = i * Math.PI / 2 + 0.3;
      g.add(blade);
    }

    // ── Main rotor — 2 long blades, one bent down / broken off ──
    // Hub on top of fuselage
    const hubX = 0.0;
    const rotorMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8),
      mats.metalDark
    );
    rotorMast.position.set(hubX, 2.6, 0.3);
    rotorMast.rotation.z = 0.35;
    g.add(rotorMast);
    const rotorHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10),
      mats.metalDark
    );
    rotorHub.position.set(hubX + 0.1, 2.95, 0.35);
    g.add(rotorHub);

    // Blade 1 — extending out, bent down at the tip
    const blade1Group = new THREE.Group();
    const blade1Inner = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.06, 0.32),
      mats.metalDark
    );
    blade1Inner.position.set(1.75, 0, 0);
    blade1Group.add(blade1Inner);
    const blade1Tip = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.06, 0.32),
      charredMat
    );
    blade1Tip.position.set(4.5, -0.4, 0);
    blade1Tip.rotation.z = -0.45;
    blade1Group.add(blade1Tip);
    blade1Group.position.set(hubX + 0.1, 2.95, 0.35);
    blade1Group.rotation.y = 0.3;
    g.add(blade1Group);

    // Blade 2 — broken off, half-buried in the ground a few meters away
    const broken = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.06, 0.32),
      mats.metalDark
    );
    broken.position.set(-3.5, 0.18, 4.2);
    broken.rotation.set(0.1, -0.7, 0.06);
    g.add(broken);

    // ── Debris field — scattered metal panels & burned chunks ──
    for (let i = 0; i < 14; i++) {
      const isPanel = i % 3 === 0;
      const piece = new THREE.Mesh(
        isPanel
          ? new THREE.BoxGeometry(this.rand(0.6, 1.6), 0.08, this.rand(0.4, 1.0))
          : new THREE.BoxGeometry(this.rand(0.2, 0.6), this.rand(0.15, 0.45), this.rand(0.2, 0.6)),
        i % 4 === 0 ? mats.metalRust : (i % 5 === 0 ? mats.metal : charredMat)
      );
      const a = this.rand(0, Math.PI * 2);
      const r = this.rand(2.5, 7);
      piece.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      piece.rotation.set(this.rand(0, 0.4), this.rand(0, Math.PI * 2), this.rand(-0.3, 0.3));
      g.add(piece);
    }

    // Glass shards on the ground (small flat triangles)
    for (let i = 0; i < 8; i++) {
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.15, 3),
        cockpitMat
      );
      const a = this.rand(0, Math.PI * 2);
      const r = this.rand(2, 5);
      shard.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
      shard.rotation.set(Math.PI / 2 + this.rand(-0.3, 0.3), 0, this.rand(0, Math.PI));
      g.add(shard);
    }

    // ── Smoke — 3-4 stacked semi-transparent dark spheres ──
    const smokeMeshes = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(1.1 + i * 0.55, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0x1a1a1a, transparent: true, opacity: 0.45 - i * 0.06,
        })
      );
      s.position.set(this.rand(-0.4, 0.4), 3.5 + i * 1.6, this.rand(-0.4, 0.4));
      s.userData.animateSmoke = true;
      s.userData.smokeIndex = i;
      s.userData.smokeBaseY = s.position.y;
      g.add(s);
      smokeMeshes.push(s);
    }

    // ── Fire glow — flickering point light ──
    const fireLight = new THREE.PointLight(0xff4400, 3.0, 14);
    fireLight.position.set(0, 1.6, 0);
    g.add(fireLight);
    this.flickerLight(fireLight);
    // Visible ember/flame core
    const flameCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.85 })
    );
    flameCore.position.set(0, 1.0, 0.2);
    g.add(flameCore);

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);

    this.addCollider(x, z, 3.5, 3.5);
    this.addCollider(x - 5, z - 0.5, 1.0, 2.0); // tail boom
    return { fireLight, smokeMeshes };
  }

  // ─── Shared lazy "set-dressing" material cache ─────────────────
  // Keep ALL per-method materials shared so we don't allocate new ones
  // each time these dressing helpers are called.
  _getDressingMats() {
    if (this._dressMats) return this._dressMats;
    this._dressMats = {
      charred:    new THREE.MeshStandardMaterial({ color: 0x252220, roughness: 0.95, metalness: 0.2 }),
      scar:       new THREE.MeshStandardMaterial({
                     color: 0x6a4a2a, roughness: 1.0, vertexColors: true, side: THREE.DoubleSide,
                  }),
      deadTrunk:  new THREE.MeshStandardMaterial({ color: 0x2a1d10, roughness: 1.0 }),
      earthCloth: new THREE.MeshStandardMaterial({ color: 0x856a45, side: THREE.DoubleSide, roughness: 1.0 }),
      earthCloth2:new THREE.MeshStandardMaterial({ color: 0x6a5230, side: THREE.DoubleSide, roughness: 1.0 }),
      buffalo:    new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 }),
      horn:       new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.7 }),
      mat:        new THREE.MeshStandardMaterial({ color: 0xa68a55, side: THREE.DoubleSide, roughness: 1.0 }),
      potBlack:   new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.85, metalness: 0.3 }),
      chickenBody:new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.9 }),
      beak:       new THREE.MeshStandardMaterial({ color: 0xe89020, roughness: 0.7 }),
      bandage:    new THREE.MeshBasicMaterial({ color: 0xece4d0, side: THREE.DoubleSide }),
      blood:      new THREE.MeshBasicMaterial({ color: 0x4a0808, side: THREE.DoubleSide }),
      shard:      new THREE.MeshStandardMaterial({ color: 0x223040, transparent: true, opacity: 0.55, roughness: 0.4, metalness: 0.4 }),
      wickerTan:  new THREE.MeshStandardMaterial({ color: 0xb0905a, roughness: 1.0 }),
      rice:       new THREE.MeshStandardMaterial({ color: 0xeae0c0, roughness: 0.95 }),
      sandalBrwn: new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 1.0 }),
      bulletHole: new THREE.MeshBasicMaterial({ color: 0x080808, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      tunnelDark: new THREE.MeshStandardMaterial({ color: 0x050402, roughness: 1.0 }),
      tunnelRim:  new THREE.MeshStandardMaterial({ color: 0x4a3820, roughness: 1.0 }),
      shrineGrey: new THREE.MeshStandardMaterial({ color: 0x6a6864, roughness: 0.9 }),
      shrineMoss: new THREE.MeshStandardMaterial({ color: 0x4a5840, roughness: 1.0 }),
      incenseBowl:new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.85 }),
      incenseStk: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.95 }),
      helmGreen:  new THREE.MeshStandardMaterial({ color: 0x3a4628, roughness: 0.85 }),
      ammoCrate:  new THREE.MeshStandardMaterial({ color: 0x4a5530, roughness: 0.92 }),
      tarpDark:   new THREE.MeshStandardMaterial({ color: 0x3a3826, side: THREE.DoubleSide, roughness: 0.95 }),
    };
    return this._dressMats;
  }

  // ─── 1. Helicopter wreck debris trail ──────────────────────────
  buildWreckDebrisTrail(x, z, headingDeg = 60) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    const heading = (headingDeg * Math.PI) / 180;
    const dirX = Math.cos(heading);
    const dirZ = Math.sin(heading);
    const trailLen = 30;
    const trailWide = 4;

    // ── Skid scar plane with vertex colors (darker at wreck end) ──
    const scarGeo = new THREE.PlaneGeometry(trailLen, trailWide, 12, 1);
    scarGeo.rotateX(-Math.PI / 2);
    // Vertex colors — fade from very dark (wreck end, x = -L/2) to lighter (far end)
    const colors = [];
    const pos = scarGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const localX = pos.getX(i);
      const t = (localX + trailLen / 2) / trailLen; // 0 at wreck end, 1 at far end
      const dark = 0.25 + t * 0.45;
      colors.push(dark, dark * 0.9, dark * 0.7);
    }
    scarGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const scar = new THREE.Mesh(scarGeo, dmats.scar);
    // Move scar so its "wreck end" is at trail origin (0,0), trail extends outward
    scar.position.set(dirX * (trailLen / 2), 0.04, dirZ * (trailLen / 2));
    scar.rotation.y = -heading;
    scar.receiveShadow = true;
    g.add(scar);

    // ── 13 small charred meshes along the trail ──
    const charredMat = dmats.charred;
    for (let i = 0; i < 13; i++) {
      const t = (i + 0.5) / 13;
      const along = t * trailLen;
      const lateral = this.rand(-trailWide * 0.45, trailWide * 0.45);
      const px = dirX * along + (-dirZ) * lateral;
      const pz = dirZ * along + ( dirX) * lateral;

      let piece;
      if (i === 4) {
        // Detached rotor blade fragment
        piece = new THREE.Mesh(
          new THREE.BoxGeometry(this.rand(1.4, 2.0), 0.05, 0.28),
          mats.metalDark
        );
        piece.rotation.y = this.rand(0, Math.PI);
        piece.rotation.z = this.rand(-0.15, 0.15);
        piece.position.set(px, 0.08, pz);
      } else if (i === 9) {
        // Bent panel (slightly bigger flat box)
        piece = new THREE.Mesh(
          new THREE.BoxGeometry(this.rand(0.8, 1.3), 0.07, this.rand(0.6, 1.0)),
          mats.metalRust
        );
        piece.rotation.y = this.rand(0, Math.PI);
        piece.rotation.x = this.rand(-0.3, 0.3);
        piece.position.set(px, 0.1, pz);
      } else {
        piece = new THREE.Mesh(
          new THREE.BoxGeometry(this.rand(0.18, 0.55), this.rand(0.12, 0.4), this.rand(0.18, 0.55)),
          charredMat
        );
        piece.rotation.set(this.rand(0, 0.4), this.rand(0, Math.PI * 2), this.rand(-0.3, 0.3));
        piece.position.set(px, 0.06, pz);
      }
      g.add(piece);
    }

    // ── 4 broken/bent saplings along the trail edges ──
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.7) / 4;
      const along = t * trailLen;
      const side = (i % 2 === 0) ? 1 : -1;
      const lateral = side * (trailWide * 0.5 + this.rand(0.0, 0.5));
      const px = dirX * along + (-dirZ) * lateral;
      const pz = dirZ * along + ( dirX) * lateral;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 1.7, 5),
        dmats.deadTrunk
      );
      // Tilted ~70° (so it lies almost flat)
      trunk.position.set(px, 0.4, pz);
      trunk.rotation.z = (Math.PI / 180) * 70 * (this.rand() < 0.5 ? 1 : -1);
      trunk.rotation.y = this.rand(0, Math.PI * 2);
      g.add(trunk);
    }

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── 2. Village daily life ─────────────────────────────────────
  buildVillageLife(centerX, centerZ) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    // ── 3 laundry lines with cloth squares ──
    const linePairs = [
      [{ x: centerX - 4, z: centerZ - 4 }, { x: centerX + 9,  z: centerZ + 2 }],
      [{ x: centerX + 15, z: centerZ - 8 }, { x: centerX + 9, z: centerZ + 2 }],
      [{ x: centerX - 14, z: centerZ + 6 }, { x: centerX - 4, z: centerZ - 4 }],
    ];
    const clothMats = [dmats.earthCloth, dmats.earthCloth2, mats.cloth];
    for (const pair of linePairs) {
      const [a, b] = pair;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const yLine = 2.4;
      // Line itself
      const line = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, len, 4),
        mats.rope
      );
      line.rotation.z = Math.PI / 2;
      line.rotation.y = -angle;
      line.position.set((a.x + b.x) / 2, yLine, (a.z + b.z) / 2);
      g.add(line);
      // 6 cloth squares hanging
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6;
        const cx = a.x + dx * t;
        const cz = a.z + dz * t;
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(0.4, 0.7),
          clothMats[i % clothMats.length]
        );
        cloth.position.set(cx, yLine - 0.4, cz);
        cloth.rotation.y = -angle + this.rand(-0.15, 0.15);
        g.add(cloth);
      }
    }

    // ── Water buffalo ──
    const buffalo = new THREE.Group();
    const bx = centerX + 8, bz = centerZ + 20;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.8), dmats.buffalo);
    body.position.y = 0.95;
    buffalo.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), dmats.buffalo);
    head.position.set(1.05, 0.95, 0);
    head.rotation.z = -0.2;
    buffalo.add(head);
    // 4 legs
    const legGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 6);
    for (const [lx, lz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
      const leg = new THREE.Mesh(legGeom, dmats.buffalo);
      leg.position.set(lx, 0.35, lz);
      buffalo.add(leg);
    }
    // Small horns
    for (const sz of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.32, 5),
        dmats.horn
      );
      horn.position.set(1.2, 1.25, sz * 0.18);
      horn.rotation.z = -1.0;
      horn.rotation.x = sz * 0.4;
      buffalo.add(horn);
    }
    // Tail
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.5, 4), dmats.buffalo);
    tail.position.set(-0.95, 0.85, 0);
    tail.rotation.z = Math.PI / 2.5;
    buffalo.add(tail);
    buffalo.position.set(bx, 0, bz);
    buffalo.rotation.y = 0.6;
    shadowify(buffalo);
    this.scene.add(buffalo);
    // Buffalo collider — should block the player
    this.addCollider(bx, bz, 1.0, 1.4);

    // ── 2 woven mats near the fire pit + cooking pot over embers ──
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 2.0),
        dmats.mat
      );
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(centerX + 2 + i * 1.7, 0.025, centerZ + 4 + i * 0.4);
      mat.rotation.z = this.rand(0, Math.PI);
      g.add(mat);
    }
    // Cooking pot over embers (fire pit at ~ centerX+2, centerZ+4-ish; per spec embers)
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.25, 0.42, 10),
      dmats.potBlack
    );
    pot.position.set(centerX + 2, 0.6, centerZ + 4);
    g.add(pot);
    // Pot rim
    const potRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.025, 4, 12),
      dmats.potBlack
    );
    potRim.rotation.x = Math.PI / 2;
    potRim.position.set(centerX + 2, 0.81, centerZ + 4);
    g.add(potRim);

    // ── 5 chickens ──
    for (let i = 0; i < 5; i++) {
      const cx = centerX + this.rand(-2, 2);
      const cz = centerZ + 10 + this.rand(-2, 2);
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 5),
        dmats.chickenBody
      );
      body.position.set(cx, 0.18, cz);
      body.scale.set(1.0, 0.85, 1.2);
      g.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 5, 4),
        dmats.chickenBody
      );
      head.position.set(cx + 0.18, 0.32, cz);
      g.add(head);
      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.1, 4),
        dmats.beak
      );
      beak.position.set(cx + 0.28, 0.32, cz);
      beak.rotation.z = -Math.PI / 2;
      g.add(beak);
    }

    // ── Hanging fishing net between two posts ──
    const netGroup = new THREE.Group();
    for (const sx of [-1.6, 1.6]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 1.9, 5),
        mats.bamboo
      );
      post.position.set(sx, 0.95, 0);
      netGroup.add(post);
    }
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.4),
      mats.net
    );
    net.position.set(0, 1.1, 0);
    netGroup.add(net);
    netGroup.position.set(centerX - 8, 0, centerZ + 14);
    netGroup.rotation.y = 0.6;
    shadowify(netGroup);
    this.scene.add(netGroup);

    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── 3. Clinic abandonment pass ─────────────────────────────────
  makeClinicAbandoned(centerX, centerZ) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();
    const D = 8;
    const porchZ = D / 2 + 1.6; // approximate porch front

    // ── 2 overturned chairs ──
    for (let i = 0; i < 2; i++) {
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, 0.5),
        mats.plankDark
      );
      seat.position.y = 0.04;
      chair.add(seat);
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.6, 0.06),
        mats.plankDark
      );
      back.position.set(0, 0.34, -0.2);
      chair.add(back);
      // 4 legs (short stubby)
      const legGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4);
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        const leg = new THREE.Mesh(legGeom, mats.plankDark);
        leg.position.set(lx, -0.16, lz);
        chair.add(leg);
      }
      // Tip it over
      chair.rotation.x = Math.PI / 2 - 0.1;
      chair.rotation.y = this.rand(0, Math.PI * 2);
      chair.position.set(
        this.rand(-2.5, 2.5),
        0.45,
        porchZ + this.rand(-0.6, 0.6)
      );
      g.add(chair);
    }

    // ── Tipped IV stand ──
    const iv = new THREE.Group();
    const ivPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.6, 5),
      mats.metalDark
    );
    ivPole.position.y = 0.8;
    iv.add(ivPole);
    // Base wheels
    const ivBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.04, 8),
      mats.metalDark
    );
    iv.add(ivBase);
    // Drip bag at top
    const ivBag = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.3, 0.05),
      dmats.bandage
    );
    ivBag.position.y = 1.5;
    iv.add(ivBag);
    iv.rotation.z = -Math.PI / 2 + 0.15;
    iv.position.set(2.0, 0.1, porchZ - 0.4);
    g.add(iv);

    // ── 5 bandage strips ──
    for (let i = 0; i < 6; i++) {
      const w = this.rand(0.18, 0.28);
      const l = this.rand(0.6, 1.4);
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(w, l),
        dmats.bandage
      );
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = this.rand(0, Math.PI);
      // 3 on porch, 3 trailing NW
      if (i < 3) {
        strip.position.set(this.rand(-2.5, 2.5), 0.05, porchZ + this.rand(-0.5, 0.4));
      } else {
        const t = (i - 3) / 3;
        strip.position.set(-2.0 - t * 2.0, 0.05, porchZ + 0.5 + t * 1.6);
      }
      g.add(strip);
    }

    // ── 2 blood blotches ──
    const blotch1 = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 12),
      dmats.blood
    );
    blotch1.rotation.x = -Math.PI / 2;
    blotch1.position.set(0, 0.04, D / 2 + 0.2); // at door
    g.add(blotch1);
    const blotch2 = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 12),
      dmats.blood
    );
    blotch2.rotation.x = -Math.PI / 2;
    blotch2.position.set(-1.2, 0.04, D / 2 + 3.0); // 3m out
    g.add(blotch2);

    // ── Jagged broken-window shard at one window position ──
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.55, 3),
      dmats.shard
    );
    shard.position.set(-3.5, 3.6 * 0.62 - 0.2, D / 2 + 0.18);
    shard.rotation.z = 0.3;
    shard.rotation.y = this.rand(0, Math.PI);
    g.add(shard);
    // A second smaller shard fallen on porch
    const shardFloor = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.32, 3),
      dmats.shard
    );
    shardFloor.position.set(-3.0, 0.05, D / 2 + 1.0);
    shardFloor.rotation.x = Math.PI / 2;
    shardFloor.rotation.z = this.rand(0, Math.PI);
    g.add(shardFloor);

    g.position.set(centerX, 0, centerZ);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── 4. River crossing personal effects ─────────────────────────
  addRiverCrossingDressing(centerX, centerZ) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    // ── 3 wicker baskets ──
    for (let i = 0; i < 3; i++) {
      const basket = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.28, 0.45, 10, 1, true),
        dmats.wickerTan
      );
      body.material.side = THREE.DoubleSide;
      body.position.y = 0.225;
      basket.add(body);
      // Bottom
      const bot = new THREE.Mesh(
        new THREE.CircleGeometry(0.28, 10),
        dmats.wickerTan
      );
      bot.rotation.x = -Math.PI / 2;
      basket.add(bot);

      if (i === 1) {
        // Tipped on its side
        basket.rotation.z = Math.PI / 2;
        basket.position.set(2.5, 0.32, -2.0);
        // Spilled rice grains
        for (let r = 0; r < 14; r++) {
          const grain = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 4, 3),
            dmats.rice
          );
          grain.position.set(
            2.5 + this.rand(-0.4, 0.7),
            0.04,
            -2.0 + this.rand(-0.5, 0.5)
          );
          g.add(grain);
        }
      } else {
        basket.position.set(this.rand(0.5, 4.5), 0, this.rand(-3.5, -2.5));
        basket.rotation.y = this.rand(0, Math.PI * 2);
      }
      g.add(basket);
    }

    // ── Coiled rope on the dock (3 stacked rings) ──
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.22 - i * 0.03, 0.035, 5, 14),
        mats.rope
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(1.3, 0.27 + i * 0.06, -4.0);
      g.add(ring);
    }

    // ── Single sandal at the water edge ──
    const sandal = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.12),
      dmats.sandalBrwn
    );
    sandal.position.set(-2.0, 0.03, 1.5);
    sandal.rotation.y = 0.4;
    g.add(sandal);

    // ── 2 bamboo poles leaned against dock posts ──
    for (let i = 0; i < 2; i++) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5),
        mats.bamboo
      );
      const dx = (i === 0) ? -1.5 : 1.5;
      pole.position.set(dx, 1.4, -3.2);
      pole.rotation.z = (i === 0 ? -0.4 : 0.4);
      pole.rotation.x = -0.3;
      g.add(pole);
    }

    // ── Half-sunk sampan (long box, partially below y=0) ──
    const sampan = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.5, 0.85),
      mats.plankDark
    );
    sampan.position.set(-4.5, -0.18, 2.5);
    sampan.rotation.y = 0.3;
    sampan.rotation.z = -0.12;
    g.add(sampan);
    // Bow / stern caps to give it some shape
    const bow = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.7, 4),
      mats.plankDark
    );
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.y = 0.3;
    bow.position.set(-4.5 - Math.cos(0.3) * 1.9, -0.05, 2.5 - Math.sin(0.3) * 1.9);
    g.add(bow);

    g.position.set(centerX, 0, centerZ);
    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // ─── 5. Battle damage pass on buildings ────────────────────────
  applyBattleDamage() {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    // Walk LEVEL via the existing scene structures we know about — easiest:
    // re-iterate the configured huts. For safety/independence we operate on a
    // hardcoded list of zones-of-interest matching where huts exist.
    const hutSites = [
      // Village huts (subset of LEVEL.village.buildings) — a 25% selection
      { x:-4,  z:16, w:6,  d:5,  h:3.2 },
      { x: 9,  z:22, w:4,  d:3.5,h:3.0 },
      { x:15,  z:12, w:4,  d:4,  h:3.0 },
      { x:-14, z:26, w:4,  d:3.5,h:3.0 },
      { x:-7,  z:36, w:7,  d:5,  h:3.5 },
      { x: 10, z:36, w:4,  d:3.5,h:3.0 },
      { x: 0,  z:46, w:4,  d:4,  h:3.0 },
      // Hamlet
      { x: 95 - 4.5, z: 18 - 2.2, w: 3.5, d: 3.0, h: 2.7 },
      { x: 95 + 0,   z: 18 + 2.2, w: 3.5, d: 3.0, h: 2.7 },
      { x: 95 + 4.5, z: 18 - 2.2, w: 3.5, d: 3.0, h: 2.7 },
      // VC huts
      { x:-64, z:-38, w:4, d:4, h:2.8 },
      { x:-50, z:-54, w:4, d:4, h:2.8 },
    ];

    for (const site of hutSites) {
      // 25% chance to add bullet holes to any chosen hut
      if (Math.random() > 0.25) continue;
      const count = 3 + Math.floor(this.rand(0, 3)); // 3-5 holes
      this._addBulletHolesAt(g, site, count, dmats.bulletHole);
    }

    // Charred plank fragments scattered near a few huts
    const damagedHuts = hutSites.filter(() => Math.random() < 0.30);
    for (const site of damagedHuts) {
      const fragCount = 3 + Math.floor(this.rand(0, 3));
      for (let i = 0; i < fragCount; i++) {
        const a = this.rand(0, Math.PI * 2);
        const r = Math.max(site.w, site.d) / 2 + this.rand(0.5, 1.8);
        const piece = new THREE.Mesh(
          new THREE.BoxGeometry(this.rand(0.3, 0.8), 0.06, this.rand(0.08, 0.18)),
          dmats.charred
        );
        piece.position.set(site.x + Math.cos(a) * r, 0.04, site.z + Math.sin(a) * r);
        piece.rotation.y = this.rand(0, Math.PI * 2);
        piece.rotation.z = this.rand(-0.25, 0.25);
        g.add(piece);
      }
    }

    // ── Spilled sandbag patches near fence corners (VC camp + ARVN) ──
    const fenceCorners = [
      { x: -35, z: -25 }, { x: -70, z: -25 }, { x: -70, z: -60 }, { x: -35, z: -60 },
      { x: 96 - 14, z: -72 - 10 }, { x: 96 + 14, z: -72 - 10 },
    ];
    for (const c of fenceCorners) {
      // 50% chance to spill a few sandbags near this corner
      if (Math.random() > 0.5) continue;
      const spillCount = 3 + Math.floor(this.rand(0, 3));
      for (let i = 0; i < spillCount; i++) {
        const sb = makeSandbag(mats.sandbag);
        sb.position.set(
          c.x + this.rand(-1.4, 1.4),
          0.11 + this.rand(0, 0.05),
          c.z + this.rand(-1.4, 1.4)
        );
        sb.rotation.set(this.rand(-0.5, 0.5), this.rand(0, Math.PI * 2), this.rand(-0.5, 0.5));
        g.add(sb);
      }
    }

    shadowify(g);
    this.scene.add(g);
    return g;
  }

  // Helper — sticks bullet-hole quads on the front + side walls of a hut footprint.
  _addBulletHolesAt(parent, site, count, holeMat) {
    const stiltH = 0.55;
    const wallY = stiltH + site.h * 0.5;
    for (let i = 0; i < count; i++) {
      const wall = Math.floor(this.rand(0, 4)); // 0=front,1=back,2=left,3=right
      const yJit = wallY + this.rand(-site.h * 0.35, site.h * 0.35);
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.05 + this.rand(0, 0.025), 8),
        holeMat
      );
      let x = site.x, z = site.z, ry = 0;
      if (wall === 0) { z = site.z + site.d / 2 + 0.02; x = site.x + this.rand(-site.w * 0.4, site.w * 0.4); ry = 0; }
      else if (wall === 1) { z = site.z - site.d / 2 - 0.02; x = site.x + this.rand(-site.w * 0.4, site.w * 0.4); ry = Math.PI; }
      else if (wall === 2) { x = site.x - site.w / 2 - 0.02; z = site.z + this.rand(-site.d * 0.4, site.d * 0.4); ry = -Math.PI / 2; }
      else                 { x = site.x + site.w / 2 + 0.02; z = site.z + this.rand(-site.d * 0.4, site.d * 0.4); ry = Math.PI / 2; }
      hole.position.set(x, yJit, z);
      hole.rotation.y = ry;
      parent.add(hole);
    }
  }

  // ─── 6. Cu Chi tunnel entrance ─────────────────────────────────
  buildTunnelEntrance(x, z) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    // Dark hole disk
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 18),
      dmats.tunnelDark
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.03;
    g.add(hole);

    // Raised dirt rim
    const rimGeo = new THREE.RingGeometry(1.0, 1.4, 22);
    rimGeo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, dmats.tunnelRim);
    rim.position.y = 0.06;
    g.add(rim);
    // Low rim "lip" — a torus thicker on one side gives a believable mound
    const rimTorus = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.12, 5, 18),
      dmats.tunnelRim
    );
    rimTorus.rotation.x = Math.PI / 2;
    rimTorus.position.y = 0.08;
    g.add(rimTorus);

    // Tilted woven palm-frond lid partially covering
    const lid = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      mats.thatchDark
    );
    lid.rotation.x = -Math.PI / 2 + 0.4;
    lid.rotation.y = this.rand(0, Math.PI);
    lid.position.set(-0.6, 0.35, -0.3);
    lid.material.side = THREE.DoubleSide;
    g.add(lid);
    // Bind sticks crossed on the lid (visual)
    for (let i = 0; i < 2; i++) {
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.8, 4),
        mats.bamboo
      );
      stick.rotation.z = Math.PI / 2;
      stick.rotation.y = i * Math.PI / 2;
      stick.position.set(-0.6, 0.45, -0.3);
      g.add(stick);
    }

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);

    this.addInteractable({ x, z, radius: 1.5, label: 'Tunnel Entrance', id: 'tunnel' });
    return g;
  }

  // ─── 7. Buddhist shrine ruin ───────────────────────────────────
  buildShrineRuin(x, z, vegetation = null) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    // Raised stone platform
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.4, 4),
      mats.stoneDark
    );
    platform.position.y = 0.2;
    g.add(platform);

    // 2 broken corner pieces tilted beside it
    for (let i = 0; i < 2; i++) {
      const broken = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.4, 0.9),
        mats.stoneDark
      );
      const sx = (i === 0) ? -2.4 : 2.5;
      const sz = (i === 0) ? 1.8 : -2.1;
      broken.position.set(sx, 0.18, sz);
      broken.rotation.set(this.rand(-0.25, 0.25), this.rand(0, Math.PI), this.rand(-0.3, 0.3));
      g.add(broken);
    }

    // Headless seated Buddha — tapered cylinder
    const buddha = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 1.2, 8),
      dmats.shrineGrey
    );
    buddha.position.set(0, 1.0, 0);
    g.add(buddha);

    // Fallen head 1m away on platform
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 8),
      dmats.shrineGrey
    );
    head.position.set(1.2, 0.55, 0.4);
    head.rotation.set(0.4, 0.8, 0.2);
    g.add(head);

    // 2 crumbling pillar stubs at front corners
    for (const sx of [-1.7, 1.7]) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 1.4, 10),
        dmats.shrineGrey
      );
      pillar.position.set(sx, 1.1, 1.7);
      pillar.rotation.z = this.rand(-0.05, 0.05);
      g.add(pillar);
      // A small mossy cap shard near base
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.18, 0.4),
        dmats.shrineMoss
      );
      cap.position.set(sx + this.rand(-0.3, 0.3), 0.5, 1.7 + this.rand(-0.2, 0.2));
      cap.rotation.y = this.rand(0, Math.PI);
      g.add(cap);
    }

    // Unlit incense bowl
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.2, 0.15, 10),
      dmats.incenseBowl
    );
    bowl.position.set(0, 0.48, 1.4);
    g.add(bowl);
    // 5 thin black incense sticks angled inside
    for (let i = 0; i < 5; i++) {
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4),
        dmats.incenseStk
      );
      const a = (i / 5) * Math.PI * 2;
      stick.position.set(0 + Math.cos(a) * 0.05, 0.48 + 0.22, 1.4 + Math.sin(a) * 0.05);
      stick.rotation.x = Math.cos(a) * 0.2;
      stick.rotation.z = Math.sin(a) * 0.2;
      g.add(stick);
    }

    g.position.set(x, 0, z);
    shadowify(g);
    this.scene.add(g);

    // Optional hanging vines from vegetation builder
    if (vegetation && typeof vegetation.buildHangingVines === 'function') {
      try {
        vegetation.buildHangingVines(x - 1.6, 2.4, z - 1.6);
      } catch (e) { /* silently skip — vegetation might be unavailable */ }
    }

    this.addCollider(x, z, 2.4, 1.6);
    return g;
  }

  // ─── 8. VC camp combat staging ─────────────────────────────────
  buildVCCampDressing(centerX, centerZ) {
    const mats = this.getMaterials();
    const dmats = this._getDressingMats();
    const g = new THREE.Group();

    // 3 stacked-crate firing positions (re-use existing buildCrates)
    this.buildCrates(centerX + 4,  centerZ + 12, 2);
    this.buildCrates(centerX - 4,  centerZ - 4,  2);
    this.buildCrates(centerX + 10, centerZ - 10, 2);

    // 2 tarp lean-tos: 4 bamboo posts + tilted plane
    const buildLeanTo = (lx, lz) => {
      const lt = new THREE.Group();
      const corners = [[-1.0, -0.7], [1.0, -0.7], [-1.0, 0.7], [1.0, 0.7]];
      // Posts vary in height for tilt
      const heights = [1.8, 1.8, 1.2, 1.2];
      for (let i = 0; i < 4; i++) {
        const [px, pz] = corners[i];
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, heights[i], 5),
          mats.bamboo
        );
        post.position.set(px, heights[i] / 2, pz);
        lt.add(post);
        // Posts get colliders per spec
        this.addCollider(centerX + lx + px, centerZ + lz + pz, 0.1, heights[i]);
      }
      // Tilted tarp plane on top
      const tarp = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.7),
        dmats.tarpDark
      );
      tarp.rotation.x = -Math.PI / 2 + 0.3;
      tarp.position.set(0, 1.5, 0);
      lt.add(tarp);
      lt.position.set(centerX + lx, 0, centerZ + lz);
      shadowify(lt);
      this.scene.add(lt);
    };
    buildLeanTo(8, -2);
    buildLeanTo(-2, -14);

    // 4-6 captured-helmet stakes along the south fence
    const stakeCount = 5;
    for (let i = 0; i < stakeCount; i++) {
      const sx = -58 + (i / (stakeCount - 1)) * 16; // -58..-42
      const sz = -58;
      const stake = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 1.2, 5),
        mats.bamboo
      );
      stake.position.set(sx, 0.6, sz);
      g.add(stake);
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        dmats.helmGreen
      );
      helmet.position.set(sx, 1.22, sz);
      g.add(helmet);
    }

    // Ammo crate stack next to radio tower at (-46, -44)
    const ammoG = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.5, 0.55),
        dmats.ammoCrate
      );
      crate.position.set((i % 2) * 0.05, 0.25 + i * 0.5, (i % 2) * 0.05);
      crate.rotation.y = this.rand(-0.05, 0.05);
      ammoG.add(crate);
      // Stencil rope band (just a darker thin box)
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.04, 0.56),
        mats.plankDark
      );
      band.position.set((i % 2) * 0.05, 0.4 + i * 0.5, (i % 2) * 0.05);
      ammoG.add(band);
    }
    ammoG.position.set(-46, 0, -44);
    shadowify(ammoG);
    this.scene.add(ammoG);
    // Ammo crate stack collider (per spec: should block player)
    this.addCollider(-46, -44, 0.7, 1.6);

    shadowify(g);
    this.scene.add(g);
    return g;
  }
}
