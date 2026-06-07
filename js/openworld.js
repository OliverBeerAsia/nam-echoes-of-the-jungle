// openworld.js — OpenWorldBuilder
//
// Adds 8 atmospheric POI set-pieces in the previously-empty outskirts of the
// 800-unit Vietnam War open world. None of these POIs gate quests; they exist
// to make the expanded map feel discovered and lived-in. Each POI fits inside
// a ~30×30 footprint and is far from the authored zones in config.js
// (village 0,20  /  VC camp -52,-42  /  clinic 58,18  /  river crossing 83,-6
//  /  hamlet 95,18  /  ARVN outpost 96,-72  /  crash site -18,85).
//
// Integration — drop into world.js _buildAllStructures, after the existing
// builder calls but before applyBattleDamage():
//
//   import { OpenWorldBuilder } from './openworld.js';
//   ...
//   const ow = new OpenWorldBuilder(this.scene, {
//     buildings: builder,
//     vegetation: this._veg,
//     addCollider:    (x, z, r, h) => this._addCollider(x, z, r, h),
//     addInteractable:(item)        => this.interactables.push(item),
//     rand:           (a, b)        => this._rand(a, b),
//   });
//   ow.buildAll();
//
// All meshes castShadow + receiveShadow. Materials are cached per-instance.

import * as THREE from 'three';

// ─── helpers ────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────
export class OpenWorldBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} opts
   * @param {Object} opts.buildings   - BuildingsBuilder instance (use its methods)
   * @param {Object} opts.vegetation  - VegetationBuilder instance
   * @param {(x:number,z:number,r:number,h:number)=>void} opts.addCollider
   * @param {(item:Object)=>void} opts.addInteractable
   * @param {(min:number,max:number)=>number} opts.rand   - seeded RNG
   */
  constructor(scene, opts = {}) {
    this.scene           = scene;
    this.buildings       = opts.buildings || null;
    this.vegetation      = opts.vegetation || null;
    this.addCollider     = opts.addCollider     || (() => {});
    this.addInteractable = opts.addInteractable || (() => {});
    this.rand            = opts.rand            || ((min, max) => min + Math.random() * (max - min));

    // Reuse the BuildingsBuilder material cache so we don't double-allocate.
    this.bMats = this.buildings && typeof this.buildings.getMaterials === 'function'
      ? this.buildings.getMaterials()
      : null;

    // Small private cache for materials that don't already exist in BuildingsBuilder.
    this._mats = null;
  }

  // Lazy-init local material cache
  _materials() {
    if (this._mats) return this._mats;
    const b = this.bMats || {};
    this._mats = {
      // Charred / blackened earth
      char:        new THREE.MeshStandardMaterial({ color: 0x141008, roughness: 1.0 }),
      charDark:    new THREE.MeshStandardMaterial({ color: 0x080604, roughness: 1.0 }),
      // Dirt clearings / approach paths
      dirt:        new THREE.MeshStandardMaterial({ color: 0x6a4f2a, roughness: 0.95 }),
      dirtPale:    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.95 }),
      // Dead palm trunk
      deadBark:    new THREE.MeshStandardMaterial({ color: 0x352818, roughness: 1.0 }),
      // Stone ruin variants (fall back to BuildingsBuilder stone if available)
      ruinStone:   b.stone     || new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.95 }),
      ruinStoneD:  b.stoneDark || new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 }),
      // Concrete (bunker)
      concrete:    new THREE.MeshStandardMaterial({ color: 0x707068, roughness: 0.92 }),
      concreteDk:  new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.95 }),
      // Brass / bell
      brass:       new THREE.MeshStandardMaterial({ color: 0xb08530, roughness: 0.4, metalness: 0.7 }),
      // Incense — emissive
      incense:     new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0xff4030, emissiveIntensity: 0.5, roughness: 0.7 }),
      incenseTip:  new THREE.MeshBasicMaterial({ color: 0xff7040 }),
      // Prayer flags / fish-drying strips
      flagRed:     new THREE.MeshBasicMaterial({ color: 0xc02a1a, side: THREE.DoubleSide }),
      flagYellow:  new THREE.MeshBasicMaterial({ color: 0xf2c01a, side: THREE.DoubleSide }),
      flagBlue:    new THREE.MeshBasicMaterial({ color: 0x2a55c0, side: THREE.DoubleSide }),
      fish:        new THREE.MeshStandardMaterial({ color: 0xd0c8a8, roughness: 0.9, side: THREE.DoubleSide }),
      // Flowers
      flowerRed:   new THREE.MeshBasicMaterial({ color: 0xc02828 }),
      flowerYellow:new THREE.MeshBasicMaterial({ color: 0xe6b820 }),
      // Ember / glow
      ember:       new THREE.MeshBasicMaterial({ color: 0xff5020 }),
      // Tent canvas / olive drab
      olive:       new THREE.MeshStandardMaterial({ color: 0x4a5230, roughness: 0.9 }),
      // Net (re-use buildings.net if available)
      net:         b.net     || new THREE.MeshStandardMaterial({ color: 0x6a6040, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      // Generic rope
      rope:        b.rope    || new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 1.0 }),
      // Plank fall-backs
      plank:       b.plank      || new THREE.MeshStandardMaterial({ color: 0x6a4a20, roughness: 0.9 }),
      plankDark:   b.plankDark  || new THREE.MeshStandardMaterial({ color: 0x4a3015, roughness: 0.9 }),
      bamboo:      b.bamboo     || new THREE.MeshStandardMaterial({ color: 0x9a8050, roughness: 0.85 }),
      bark:        b.bark       || new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.95 }),
      metal:       b.metal      || new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, metalness: 0.5 }),
      metalDark:   b.metalDark  || new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.6 }),
      sandbag:     b.sandbag    || new THREE.MeshStandardMaterial({ color: 0x8a7a40, roughness: 0.95 }),
    };
    return this._mats;
  }

  // ─── public entry point ─────────────────────────────────────────
  buildAll() {
    this.buildPlantationRuin   (220,  180);
    this.buildBombedFirebase   (-180, -180);
    this.buildFishingVillage   (320, -100);
    this.buildAAAEmplacement   (-280,  100);
    this.buildAbandonedBridge  (180, -150);
    this.buildTrailCrossroads  (0,    250);
    this.buildSpotterPost      (-300, -300);
    this.buildRiverbankGraveyard(300,   0);
  }

  // ════════════════════════════════════════════════════════════════
  // 1. French Colonial Plantation Ruin — (220, 0, 180)
  // ════════════════════════════════════════════════════════════════
  buildPlantationRuin(cx, cz) {
    const m = this._materials();
    const g = new THREE.Group();

    // Three ruined stone-walled buildings around a central courtyard.
    // We build each as 4 broken low walls + a debris pile inside.
    const buildings = [
      { ox: -10, oz: -8, w: 7, d: 5, rot:  0.10 },
      { ox:   9, oz: -7, w: 6, d: 5, rot: -0.20 },
      { ox:   0, oz: -12, w: 8, d: 4, rot:  0.05 },
    ];
    for (const bd of buildings) {
      const b = new THREE.Group();
      const wallH = 1.6 + this.rand(-0.2, 0.4);
      const t = 0.35; // wall thickness

      // Four perimeter walls — but break two of them (lower height) for "ruined" look
      const heights = [
        wallH,
        wallH * (0.35 + this.rand(0, 0.3)),  // broken side
        wallH * (0.7 + this.rand(0, 0.2)),
        wallH * (0.25 + this.rand(0, 0.25)), // broken side
      ];

      // Front
      const front = new THREE.Mesh(new THREE.BoxGeometry(bd.w, heights[0], t), m.ruinStone);
      front.position.set(0, heights[0] / 2, bd.d / 2);
      b.add(front);
      // Back (broken)
      const back = new THREE.Mesh(new THREE.BoxGeometry(bd.w, heights[1], t), m.ruinStone);
      back.position.set(0, heights[1] / 2, -bd.d / 2);
      b.add(back);
      // Left
      const left = new THREE.Mesh(new THREE.BoxGeometry(t, heights[2], bd.d), m.ruinStone);
      left.position.set(-bd.w / 2, heights[2] / 2, 0);
      b.add(left);
      // Right (broken)
      const right = new THREE.Mesh(new THREE.BoxGeometry(t, heights[3], bd.d), m.ruinStone);
      right.position.set(bd.w / 2, heights[3] / 2, 0);
      b.add(right);

      // Collapsed plank floor — tilted dark planks inside
      for (let i = 0; i < 3; i++) {
        const pl = new THREE.Mesh(
          new THREE.BoxGeometry(bd.w * 0.7, 0.08, 0.5),
          m.plankDark
        );
        pl.position.set(this.rand(-0.6, 0.6), 0.05 + i * 0.04, this.rand(-bd.d * 0.3, bd.d * 0.3));
        pl.rotation.set(this.rand(-0.15, 0.15), this.rand(-0.4, 0.4), this.rand(-0.18, 0.18));
        b.add(pl);
      }

      // Stone rubble on floor
      for (let i = 0; i < 4; i++) {
        const r = new THREE.Mesh(
          new THREE.BoxGeometry(this.rand(0.3, 0.7), this.rand(0.2, 0.45), this.rand(0.3, 0.7)),
          m.ruinStoneD
        );
        r.position.set(this.rand(-bd.w * 0.35, bd.w * 0.35), 0.2, this.rand(-bd.d * 0.3, bd.d * 0.3));
        r.rotation.y = this.rand(0, Math.PI * 2);
        b.add(r);
      }

      b.position.set(bd.ox, 0, bd.oz);
      b.rotation.y = bd.rot;
      g.add(b);

      // Body collider — only the larger walls are real obstacles
      this.addCollider(cx + bd.ox, cz + bd.oz, Math.max(bd.w, bd.d) / 2, wallH);
    }

    // Central courtyard — circular dirt patch
    const court = new THREE.Mesh(
      new THREE.CircleGeometry(6, 24),
      m.dirtPale
    );
    court.rotateX(-Math.PI / 2);
    court.position.set(0, 0.04, 4);
    g.add(court);

    // Cracked fountain in center: stone base + dry basin on top
    const fountain = new THREE.Group();
    const fbBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 0.55, 16),
      m.ruinStone
    );
    fbBase.position.y = 0.275;
    fountain.add(fbBase);
    const fbBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.3, 16),
      m.ruinStoneD
    );
    fbBasin.position.y = 0.7;
    fountain.add(fbBasin);
    // Inner dry hollow (dark disk)
    const dry = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.04, 16),
      m.charDark
    );
    dry.position.y = 0.84;
    fountain.add(dry);
    // Crack — a thin dark slab across the basin lip
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.05, 0.06),
      m.charDark
    );
    crack.position.y = 0.86;
    crack.rotation.y = this.rand(0, Math.PI);
    fountain.add(crack);
    fountain.position.set(0, 0, 4);
    g.add(fountain);
    this.addCollider(cx, cz + 4, 1.6, 0.9);

    // 4 overgrown stone columns at courtyard corners
    const colPositions = [[-5, -1], [5, -1], [-5, 9], [5, 9]];
    for (const [px, pz] of colPositions) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 3.2 + this.rand(-0.6, 0.4), 12),
        m.ruinStone
      );
      col.position.set(px, 1.6, pz);
      col.rotation.z = this.rand(-0.04, 0.04);
      g.add(col);
      // Broken capstone
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.25, 1.0),
        m.ruinStoneD
      );
      cap.position.set(px + this.rand(-0.2, 0.2), 3.25 + this.rand(-0.1, 0.1), pz + this.rand(-0.2, 0.2));
      cap.rotation.y = this.rand(0, Math.PI);
      g.add(cap);
      this.addCollider(cx + px, cz + pz, 0.55, 3.2);
    }

    // 2-3 collapsed roof beams — long tilted boxes lying in the rubble
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(this.rand(4, 6), 0.22, 0.22),
        m.plankDark
      );
      beam.position.set(this.rand(-4, 4), 0.3 + this.rand(0, 0.3), this.rand(-9, -2));
      beam.rotation.set(this.rand(-0.3, 0.3), this.rand(0, Math.PI * 2), this.rand(-0.4, 0.4));
      g.add(beam);
    }

    g.position.set(cx, 0, cz);
    shadowify(g);
    this.scene.add(g);

    // Dead palm trees inside the property — outside the group so vegetation builder
    // creates its own scene-local meshes at world coords.
    if (this.vegetation && typeof this.vegetation.buildPalm === 'function') {
      // Dead palms as withered stumps via plain trunks (no fronds) — built inline
      for (const [px, pz] of [[-7, 3], [8, 5], [4, -3]]) {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, this.rand(4.5, 6.5), 8),
          m.deadBark
        );
        trunk.position.set(cx + px, 2.8, cz + pz);
        trunk.rotation.z = this.rand(-0.08, 0.08);
        shadowify(trunk);
        this.scene.add(trunk);
        this.addCollider(cx + px, cz + pz, 0.28, 5);
      }

      // Hanging vines over the ruined walls (a few drape points)
      try {
        if (typeof this.vegetation.buildHangingVines === 'function') {
          this.vegetation.buildHangingVines(cx - 10, 1.6, cz - 8);
          this.vegetation.buildHangingVines(cx + 9,  1.6, cz - 7);
          this.vegetation.buildHangingVines(cx,      1.6, cz - 12);
        }
      } catch (e) { /* veg unavailable; skip */ }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. Bombed Firebase Crater — (-180, 0, -180)
  // ════════════════════════════════════════════════════════════════
  buildBombedFirebase(cx, cz) {
    const m = this._materials();
    const g = new THREE.Group();

    // Main crater — 12m radius charred disc (slightly recessed look from dark color)
    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(12, 36),
      m.char
    );
    crater.rotateX(-Math.PI / 2);
    crater.position.y = 0.03;
    g.add(crater);
    // Inner darker spot
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(5, 24),
      m.charDark
    );
    inner.rotateX(-Math.PI / 2);
    inner.position.y = 0.04;
    g.add(inner);

    // 4-6 small craters scattered around
    const smallCount = 5;
    for (let i = 0; i < smallCount; i++) {
      const a = (i / smallCount) * Math.PI * 2 + this.rand(-0.4, 0.4);
      const r = 14 + this.rand(0, 5);
      const sr = this.rand(1.4, 2.6);
      const sc = new THREE.Mesh(
        new THREE.CircleGeometry(sr, 16),
        m.char
      );
      sc.rotateX(-Math.PI / 2);
      sc.position.set(Math.cos(a) * r, 0.035, Math.sin(a) * r);
      g.add(sc);
    }

    g.position.set(cx, 0, cz);
    shadowify(g);
    this.scene.add(g);

    // Around the rim: 6-8 destroyed sandbag walls — call buildSandbags for each,
    // then yank the most recent group out of the scene to tilt it broken.
    const sbCount = 7;
    for (let i = 0; i < sbCount; i++) {
      const a = (i / sbCount) * Math.PI * 2;
      const r = 11.5;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      // Use buildings.buildSandbags so style is consistent
      let sbGroup = null;
      if (this.buildings && typeof this.buildings.buildSandbags === 'function') {
        sbGroup = this.buildings.buildSandbags(px, pz, 3, 0);
      }
      // Tilt + rotate the sandbag wall to look broken
      if (sbGroup && sbGroup.isGroup) {
        sbGroup.rotation.y = a + Math.PI / 2 + this.rand(-0.3, 0.3);
        sbGroup.rotation.z = this.rand(-0.35, 0.35);
        sbGroup.position.y = this.rand(-0.05, 0.1);
      }
    }

    // 2 wrecked artillery pieces (long barrel cylinder on triangular 3-leg base, blackened)
    const artyPositions = [
      { ox: -6,  oz:  5, rot: 0.6 },
      { ox:  7,  oz: -4, rot: 2.2 },
    ];
    for (const a of artyPositions) {
      const arty = new THREE.Group();
      // Pedestal/triangle base — 3 angled legs from a small central hub
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 0.3, 8),
        m.charDark
      );
      hub.position.y = 0.3;
      arty.add(hub);
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.12, 1.4),
          m.metalDark
        );
        leg.position.set(Math.cos(ang) * 0.45, 0.18, Math.sin(ang) * 0.45);
        leg.rotation.y = ang;
        leg.rotation.x = -0.4;
        // shift so far end touches ground
        leg.position.x += Math.cos(ang) * 0.55;
        leg.position.z += Math.sin(ang) * 0.55;
        arty.add(leg);
      }
      // Long barrel — angled up
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.18, 3.0, 10),
        m.charDark
      );
      barrel.position.set(0, 0.9, 0.3);
      barrel.rotation.x = -Math.PI / 2 + 0.5; // pointing up at angle
      arty.add(barrel);
      // Breech block at base
      const breech = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.5),
        m.metalDark
      );
      breech.position.set(0, 0.7, -0.2);
      arty.add(breech);

      arty.position.set(cx + a.ox, 0, cz + a.oz);
      arty.rotation.y = a.rot;
      // Slight tilt — wrecked
      arty.rotation.z = this.rand(-0.15, 0.15);
      shadowify(arty);
      this.scene.add(arty);
      this.addCollider(cx + a.ox, cz + a.oz, 0.7, 1.0);
    }

    // Collapsed watchtower — call buildWatchtower then tilt the whole group
    if (this.buildings && typeof this.buildings.buildWatchtower === 'function') {
      const twX = cx - 11;
      const twZ = cz + 9;
      const tower = this.buildings.buildWatchtower(twX, twZ);
      if (tower && tower.isGroup) {
        tower.rotation.z = Math.PI / 6; // ~30°
        tower.position.y = -1.0;        // sunken / collapsed
      }
    }

    // Charred barrel husks
    if (this.buildings && typeof this.buildings.buildBarrels === 'function') {
      const barrels = this.buildings.buildBarrels(cx + 4, cz + 8, 3);
      if (barrels && barrels.traverse) {
        // Repaint to char color for "burned out" look
        barrels.traverse(c => {
          if (c.isMesh && c.material && c.material.color) {
            c.material = m.charDark;
          }
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 3. Fishing Village on River — (320, 0, -100)
  // ════════════════════════════════════════════════════════════════
  buildFishingVillage(cx, cz) {
    const m = this._materials();

    // 3 small thatched huts (use buildVietHut with small dimensions)
    const huts = [
      { x: cx - 8, z: cz + 4, w: 3.6, d: 3.2, h: 2.4, rot:  0.20 },
      { x: cx,     z: cz + 2, w: 3.2, d: 3.0, h: 2.3, rot: -0.10 },
      { x: cx + 7, z: cz + 5, w: 3.4, d: 3.1, h: 2.4, rot:  0.30 },
    ];
    if (this.buildings && typeof this.buildings.buildVietHut === 'function') {
      for (const h of huts) this.buildings.buildVietHut(h);
    }

    // 4-5 wooden fishing platforms extending toward the river (south = -z)
    const platforms = [
      { ox: -10, oz: -4, w: 1.6, d: 5 },
      { ox:  -4, oz: -5, w: 1.6, d: 6 },
      { ox:   2, oz: -5, w: 1.4, d: 6 },
      { ox:   8, oz: -4, w: 1.6, d: 5 },
      { ox:  12, oz: -3, w: 1.4, d: 4 },
    ];
    const fvGroup = new THREE.Group();
    for (const p of platforms) {
      const plat = new THREE.Group();
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, 0.1, p.d),
        m.plank
      );
      deck.position.set(0, 0.55, 0);
      plat.add(deck);
      // 4 corner posts
      for (const [sx, sz] of [
        [-p.w / 2 + 0.1, -p.d / 2 + 0.1],
        [ p.w / 2 - 0.1, -p.d / 2 + 0.1],
        [-p.w / 2 + 0.1,  p.d / 2 - 0.1],
        [ p.w / 2 - 0.1,  p.d / 2 - 0.1],
      ]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.85, 5),
          m.plankDark
        );
        post.position.set(sx, 0.2, sz);
        plat.add(post);
      }
      plat.position.set(p.ox, 0, p.oz);
      fvGroup.add(plat);
    }

    // 2 drying-fish racks — horizontal poles between two posts with white strips
    for (const [rx, rz] of [[-7, 1], [3, 0]]) {
      const rack = new THREE.Group();
      const rackLen = 2.4;
      const rackH = 1.4;
      // Two posts
      for (const sx of [-rackLen / 2, rackLen / 2]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, rackH, 5),
          m.bamboo
        );
        post.position.set(sx, rackH / 2, 0);
        rack.add(post);
      }
      // 2 horizontal poles
      for (let py = 0; py < 2; py++) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, rackLen, 5),
          m.bamboo
        );
        pole.rotation.z = Math.PI / 2;
        pole.position.set(0, 0.7 + py * 0.45, 0);
        rack.add(pole);
        // 4 fish strips hanging from each pole
        for (let i = 0; i < 4; i++) {
          const strip = new THREE.Mesh(
            new THREE.PlaneGeometry(0.18, 0.34),
            m.fish
          );
          strip.position.set(-rackLen / 2 + 0.4 + i * 0.55, 0.7 + py * 0.45 - 0.18, 0);
          rack.add(strip);
        }
      }
      rack.position.set(rx, 0, rz);
      fvGroup.add(rack);
    }

    // 2 beached longboats — sampan-style (bezier hull like buildRiverCrossing)
    for (const [bx, bz, br] of [[-12, -1, 0.4], [10, 0, -0.3]]) {
      const boatShape = new THREE.Shape();
      boatShape.moveTo(-1.4, 0);
      boatShape.bezierCurveTo(-1.1, 0.5, 1.1, 0.5, 1.4, 0);
      boatShape.bezierCurveTo(1.1, -0.5, -1.1, -0.5, -1.4, 0);
      const hull = new THREE.Mesh(
        new THREE.ExtrudeGeometry(boatShape, {
          depth: 0.45, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.04, bevelThickness: 0.04,
        }),
        m.plankDark
      );
      hull.rotation.x = -Math.PI / 2;
      hull.position.set(bx, 0.3, bz);
      hull.rotation.z = br;
      fvGroup.add(hull);
      // Inner hollow
      const hollow = new THREE.Mesh(
        new THREE.ExtrudeGeometry(boatShape, { depth: 0.32, bevelEnabled: false }),
        new THREE.MeshStandardMaterial({ color: 0x080503, roughness: 1.0 })
      );
      hollow.scale.set(0.85, 0.85, 1);
      hollow.rotation.x = -Math.PI / 2;
      hollow.position.set(bx, 0.45, bz);
      hollow.rotation.z = br;
      fvGroup.add(hollow);
      this.addCollider(bx, bz, 1.5, 0.5);
    }

    // Abandoned fishing nets between two posts (a sagging plane)
    for (const [nx, nz] of [[-2, -2]]) {
      // Post pair
      for (const [sx] of [[-1.6], [1.6]]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, 1.5, 5),
          m.bamboo
        );
        post.position.set(nx + sx, 0.75, nz);
        fvGroup.add(post);
      }
      const net = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 1.0),
        m.net
      );
      net.position.set(nx, 0.85, nz);
      fvGroup.add(net);
    }

    shadowify(fvGroup);
    this.scene.add(fvGroup);
  }

  // ════════════════════════════════════════════════════════════════
  // 4. AAA Gun Emplacement — (-280, 0, 100)
  // ════════════════════════════════════════════════════════════════
  buildAAAEmplacement(cx, cz) {
    const m = this._materials();

    // Circular sandbag wall — call buildSandbags 4 times in a square ring
    if (this.buildings && typeof this.buildings.buildSandbags === 'function') {
      const r = 4.5;
      // North wall (long axis along x)
      const nW = this.buildings.buildSandbags(cx, cz - r, 7, 0);
      const sW = this.buildings.buildSandbags(cx, cz + r, 7, 0);
      // East / west walls (long axis along z)
      const eW = this.buildings.buildSandbags(cx + r, cz, 0, 7);
      const wW = this.buildings.buildSandbags(cx - r, cz, 0, 7);
    }

    // Quad AAA gun on a pedestal in the middle
    const gun = new THREE.Group();
    // Pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.85, 1.1, 12),
      m.metalDark
    );
    ped.position.y = 0.55;
    gun.add(ped);
    // Mount plate
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.18, 12),
      m.metal
    );
    plate.position.y = 1.18;
    gun.add(plate);
    // Center yoke
    const yoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.5),
      m.metalDark
    );
    yoke.position.y = 1.45;
    gun.add(yoke);
    // 4 barrels arrayed around the yoke, pointing skyward at ~60°
    const barrelOffsets = [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]];
    for (const [ox, oz] of barrelOffsets) {
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 2.6, 0.10),
        m.metalDark
      );
      // The barrel mesh is vertical along Y — tilt 30° from vertical (=60° elevation)
      barrel.position.set(ox, 1.45 + 1.0 * Math.cos(Math.PI / 6), oz + 1.0 * Math.sin(Math.PI / 6));
      barrel.rotation.x = Math.PI / 6; // tip leans forward (positive z)
      gun.add(barrel);
      // Muzzle
      const muzzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 0.18, 8),
        m.metal
      );
      muzzle.position.copy(barrel.position);
      muzzle.position.y += 1.3 * Math.cos(Math.PI / 6);
      muzzle.position.z += 1.3 * Math.sin(Math.PI / 6);
      muzzle.rotation.x = Math.PI / 6;
      gun.add(muzzle);
    }
    gun.position.set(cx, 0, cz);
    shadowify(gun);
    this.scene.add(gun);
    this.addCollider(cx, cz, 0.85, 1.6);

    // 2 ammo box stacks (use buildCrates if available, else inline)
    if (this.buildings && typeof this.buildings.buildCrates === 'function') {
      this.buildings.buildCrates(cx + 3.5, cz - 2.5, 2);
      this.buildings.buildCrates(cx - 3.5, cz + 2.5, 2);
    }

    // Spotlight mast — tall thin cylinder + cone-shaped spotlight head
    const mast = new THREE.Group();
    const mastPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6),
      m.metalDark
    );
    mastPole.position.y = 2.25;
    mast.add(mastPole);
    // Spotlight head — cone (large open end forward)
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.18, 0.55, 12),
      m.metal
    );
    head.rotation.z = Math.PI / 2;
    head.position.set(0.3, 4.4, 0);
    mast.add(head);
    // Bracket
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.18, 0.06),
      m.metalDark
    );
    bracket.position.set(0.05, 4.4, 0);
    mast.add(bracket);
    mast.position.set(cx + 3.0, 0, cz + 3.0);
    shadowify(mast);
    this.scene.add(mast);
    this.addCollider(cx + 3.0, cz + 3.0, 0.12, 4.5);

    // Dim red point light at the gun base for atmosphere
    const redLight = new THREE.PointLight(0xff2818, 0.35, 8, 2);
    redLight.position.set(cx, 1.2, cz);
    this.scene.add(redLight);
  }

  // ════════════════════════════════════════════════════════════════
  // 5. Abandoned Wooden Bridge — (180, 0, -150)
  // ════════════════════════════════════════════════════════════════
  buildAbandonedBridge(cx, cz) {
    const m = this._materials();
    const g = new THREE.Group();

    // Bridge runs along X — 25m long.
    const bridgeLen = 25;
    const bridgeW = 2.2;
    const deckY = 1.4;

    // Deck — built as 12 plank slats with 1 missing and 2 tilted
    const slatCount = 14;
    const slatLen = bridgeLen / slatCount;
    const missingIdx = 6;
    const tiltedIdxs = new Set([4, 9]);
    for (let i = 0; i < slatCount; i++) {
      if (i === missingIdx) continue; // missing plank
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(slatLen - 0.04, 0.14, bridgeW),
        m.plank
      );
      slat.position.set(-bridgeLen / 2 + slatLen * (i + 0.5), deckY, 0);
      if (tiltedIdxs.has(i)) {
        slat.rotation.z = this.rand(-0.4, 0.4);
        slat.position.y += this.rand(-0.1, 0.1);
      }
      g.add(slat);
    }

    // Side stringers (the long beams the slats sit on)
    for (const sz of [-bridgeW / 2 - 0.05, bridgeW / 2 + 0.05]) {
      const stringer = new THREE.Mesh(
        new THREE.BoxGeometry(bridgeLen, 0.18, 0.16),
        m.plankDark
      );
      stringer.position.set(0, deckY - 0.16, sz);
      g.add(stringer);
    }

    // 6 vertical posts on each side + handrails
    const postCount = 6;
    for (const side of [-1, 1]) {
      const handY = deckY + 1.0;
      const postZ = side * (bridgeW / 2 + 0.15);
      for (let i = 0; i < postCount; i++) {
        const t = i / (postCount - 1);
        const px = -bridgeLen / 2 + 1.0 + t * (bridgeLen - 2.0);
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.10, 1.1, 5),
          m.plankDark
        );
        post.position.set(px, deckY + 0.55, postZ);
        g.add(post);
      }
      // Top handrail
      const handrail = new THREE.Mesh(
        new THREE.BoxGeometry(bridgeLen - 1.5, 0.08, 0.1),
        m.plankDark
      );
      handrail.position.set(0, handY, postZ);
      g.add(handrail);
    }

    // 3 supporting trestles underneath — X-bracing made from cylinders
    const trestleSpacing = bridgeLen / 4;
    for (let t = 1; t <= 3; t++) {
      const tx = -bridgeLen / 2 + t * trestleSpacing;
      // Two outer legs
      for (const sz of [-bridgeW / 2, bridgeW / 2]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.10, 0.13, deckY, 6),
          m.plankDark
        );
        leg.position.set(tx, deckY / 2, sz);
        g.add(leg);
      }
      // X-bracing between the two legs (along Z)
      const diagLen = Math.hypot(bridgeW, deckY * 0.85);
      const diagAngle = Math.atan2(deckY * 0.85, bridgeW);
      for (const sgn of [1, -1]) {
        const brace = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, diagLen, 5),
          m.plankDark
        );
        brace.rotation.z = Math.PI / 2;
        brace.rotation.y = sgn * diagAngle;
        brace.position.set(tx, deckY * 0.45, 0);
        g.add(brace);
      }
    }

    // Approach paths on both sides — small tan plane strips
    for (const sx of [-1, 1]) {
      const approach = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 3),
        m.dirtPale
      );
      approach.rotateX(-Math.PI / 2);
      approach.position.set(sx * (bridgeLen / 2 + 2.5), 0.04, 0);
      g.add(approach);
    }

    g.position.set(cx, 0, cz);
    shadowify(g);
    this.scene.add(g);

    // Colliders for the trestle legs (so the player can't walk through pillars)
    for (let t = 1; t <= 3; t++) {
      const tx = -bridgeLen / 2 + t * trestleSpacing;
      this.addCollider(cx + tx, cz, 0.5, deckY);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 6. Trail Crossroads with Spirit Shrine — (0, 0, 250)
  // ════════════════════════════════════════════════════════════════
  buildTrailCrossroads(cx, cz) {
    const m = this._materials();
    const g = new THREE.Group();

    // Circular flat dirt clearing (radius 6)
    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(6, 28),
      m.dirtPale
    );
    clearing.rotateX(-Math.PI / 2);
    clearing.position.y = 0.04;
    g.add(clearing);

    // 5 trail-marker posts at radius 5, pointing in cardinal-ish directions
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const px = Math.cos(ang) * 5;
      const pz = Math.sin(ang) * 5;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 1.4, 5),
        m.bamboo
      );
      post.position.set(px, 0.7, pz);
      g.add(post);
      // Marker plank pointing out
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.15, 0.06),
        m.plank
      );
      sign.position.set(px + Math.cos(ang) * 0.25, 1.15, pz + Math.sin(ang) * 0.25);
      sign.rotation.y = ang + Math.PI / 2;
      g.add(sign);
    }

    // Central spirit shrine: 1.5m bamboo post + tiny shrine box on top
    const shrinePost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 1.5, 6),
      m.bamboo
    );
    shrinePost.position.y = 0.75;
    g.add(shrinePost);
    const shrineBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.5),
      m.plankDark
    );
    shrineBox.position.y = 1.55;
    g.add(shrineBox);
    // Tiny pitched roof on the box
    const shrineRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.25, 4),
      m.plankDark
    );
    shrineRoof.position.y = 1.92;
    shrineRoof.rotation.y = Math.PI / 4;
    g.add(shrineRoof);
    // 5 thin red incense sticks rising from inside the box
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4),
        m.incense
      );
      stick.position.set(Math.cos(a) * 0.06, 1.85, Math.sin(a) * 0.06);
      stick.rotation.x = Math.cos(a) * 0.15;
      stick.rotation.z = Math.sin(a) * 0.15;
      g.add(stick);
      // Tiny ember tip
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 5),
        m.incenseTip
      );
      tip.position.set(Math.cos(a) * 0.06, 2.05, Math.sin(a) * 0.06);
      g.add(tip);
    }

    // Side bamboo post with hanging brass bell
    const bellPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.7, 5),
      m.bamboo
    );
    bellPost.position.set(1.0, 0.85, 0);
    g.add(bellPost);
    // Crossarm
    const crossarm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4),
      m.bamboo
    );
    crossarm.rotation.z = Math.PI / 2;
    crossarm.position.set(1.2, 1.6, 0);
    g.add(crossarm);
    // Bell
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8),
      m.brass
    );
    bell.position.set(1.4, 1.45, 0);
    g.add(bell);
    // Bell rope
    const bellRope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4),
      m.rope
    );
    bellRope.position.set(1.4, 1.55, 0);
    g.add(bellRope);

    // 2-3 fluttering prayer flag strips on a string between two side posts
    const flagPostL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5),
      m.bamboo
    );
    flagPostL.position.set(-1.5, 1.1, 1.5);
    g.add(flagPostL);
    const flagPostR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5),
      m.bamboo
    );
    flagPostR.position.set(-1.5, 1.1, -1.5);
    g.add(flagPostR);
    const flagLine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 3.0, 4),
      m.rope
    );
    flagLine.rotation.x = Math.PI / 2;
    flagLine.position.set(-1.5, 2.05, 0);
    g.add(flagLine);
    const flagMats = [m.flagRed, m.flagYellow, m.flagBlue];
    for (let i = 0; i < 3; i++) {
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.55),
        flagMats[i % flagMats.length]
      );
      flag.position.set(-1.5, 1.78, -0.9 + i * 0.9);
      flag.rotation.y = this.rand(-0.2, 0.2);
      g.add(flag);
    }

    g.position.set(cx, 0, cz);
    shadowify(g);
    this.scene.add(g);

    // Minimal collider — only the central shrine post (let players walk between markers)
    this.addCollider(cx, cz, 0.3, 1.9);
  }

  // ════════════════════════════════════════════════════════════════
  // 7. Mountain Spotter Post — (-300, 0, -300)
  // ════════════════════════════════════════════════════════════════
  buildSpotterPost(cx, cz) {
    const m = this._materials();
    const g = new THREE.Group();

    // Stone bunker — low concrete-grey box with a horizontal slit cut as darker box
    const bunkerW = 4, bunkerH = 1.5, bunkerD = 3;
    const bunker = new THREE.Mesh(
      new THREE.BoxGeometry(bunkerW, bunkerH, bunkerD),
      m.concrete
    );
    bunker.position.set(0, bunkerH / 2, 0);
    g.add(bunker);
    // Horizontal slit — darker box embedded slightly proud of the front
    const slit = new THREE.Mesh(
      new THREE.BoxGeometry(bunkerW * 0.7, 0.28, 0.06),
      m.concreteDk
    );
    slit.position.set(0, bunkerH * 0.65, bunkerD / 2 + 0.03);
    g.add(slit);
    // Roof slab (slightly larger)
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(bunkerW + 0.4, 0.18, bunkerD + 0.4),
      m.concreteDk
    );
    roof.position.set(0, bunkerH + 0.09, 0);
    g.add(roof);

    // Radio antenna mast — thin cylinder + 3 cross-arms
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 4, 6),
      m.metalDark
    );
    mast.position.set(bunkerW / 2 - 0.3, bunkerH + 2.0, -bunkerD / 2 + 0.3);
    g.add(mast);
    for (let i = 0; i < 3; i++) {
      const armW = 0.6 - i * 0.12;
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(armW, 0.04, 0.04),
        m.metalDark
      );
      arm.position.set(bunkerW / 2 - 0.3, bunkerH + 1.2 + i * 0.7, -bunkerD / 2 + 0.3);
      g.add(arm);
    }

    // Olive-drab tent — semi-cylindrical canvas (ARVN-outpost style)
    const tentW = 2.4, tentD = 1.8;
    const tent = new THREE.Mesh(
      new THREE.CylinderGeometry(tentD / 2, tentD / 2, tentW, 12, 1, false, 0, Math.PI),
      m.olive
    );
    tent.material.side = THREE.DoubleSide;
    tent.rotation.z = Math.PI / 2;
    tent.position.set(-3.2, tentD / 2, 1.2);
    g.add(tent);
    // Tent end caps
    for (const sx of [-1, 1]) {
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(tentD / 2, 12, 0, Math.PI),
        m.olive
      );
      cap.material.side = THREE.DoubleSide;
      cap.rotation.y = sx * Math.PI / 2;
      cap.position.set(-3.2 + sx * (tentW / 2), tentD / 2, 1.2);
      g.add(cap);
    }
    // Door flap on one side (dark)
    const tentDoor = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, tentD - 0.2),
      new THREE.MeshStandardMaterial({ color: 0x080503, roughness: 1.0 })
    );
    tentDoor.rotation.y = -Math.PI / 2;
    tentDoor.position.set(-3.2 - tentW / 2 - 0.01, (tentD - 0.2) / 2 + 0.05, 1.2);
    g.add(tentDoor);

    // 2 ammo boxes in front of the tent
    for (let i = 0; i < 2; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.4, 0.5),
        m.olive
      );
      box.position.set(-3.0 + i * 0.8, 0.2, -0.3);
      box.rotation.y = this.rand(-0.15, 0.15);
      g.add(box);
    }

    // Smoldering campfire — small dark circle + tiny ember
    const ash = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 14),
      m.charDark
    );
    ash.rotateX(-Math.PI / 2);
    ash.position.set(-1.2, 0.04, -1.6);
    g.add(ash);
    // Little ring of stones
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.1, 0.14),
        m.ruinStoneD
      );
      stone.position.set(-1.2 + Math.cos(ang) * 0.4, 0.05, -1.6 + Math.sin(ang) * 0.4);
      stone.rotation.y = this.rand(0, Math.PI);
      g.add(stone);
    }
    // Tiny ember at the center (basic emissive material)
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 5),
      m.ember
    );
    ember.position.set(-1.2, 0.08, -1.6);
    g.add(ember);

    g.position.set(cx, 0, cz);
    shadowify(g);
    this.scene.add(g);

    // Bunker is the only major collider (slit + roof move with the body)
    this.addCollider(cx, cz, Math.max(bunkerW, bunkerD) / 2 + 0.1, bunkerH + 0.2);

    // Interactable for future quest hook
    this.addInteractable({
      x: cx, z: cz,
      radius: 3.0,
      label: 'Investigate Spotter Post',
      id: 'spotter_post',
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 8. Riverbank Graveyard — (300, 0, 0)
  // ════════════════════════════════════════════════════════════════
  buildRiverbankGraveyard(cx, cz) {
    const m = this._materials();
    const g = new THREE.Group();

    // 12-15 wooden grave markers — small thin boxes with cross-piece on top
    const markerCount = 13;
    // Lay them out in a loose grid-ish pattern
    const rows = 4, cols = 4;
    let placed = 0;
    for (let r = 0; r < rows && placed < markerCount; r++) {
      for (let c = 0; c < cols && placed < markerCount; c++) {
        const mx = (c - (cols - 1) / 2) * 1.6 + this.rand(-0.25, 0.25);
        const mz = (r - (rows - 1) / 2) * 1.6 + this.rand(-0.25, 0.25);
        const marker = new THREE.Group();
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.85 + this.rand(-0.1, 0.1), 0.06),
          m.plankDark
        );
        post.position.y = post.geometry.parameters.height / 2;
        marker.add(post);
        // Cross-piece OR rounded top (mix it up)
        if ((r + c) & 1) {
          const cross = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.08, 0.06),
            m.plankDark
          );
          cross.position.y = post.geometry.parameters.height * 0.78;
          marker.add(cross);
        } else {
          const round = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 6),
            m.plankDark
          );
          round.position.y = post.geometry.parameters.height + 0.04;
          marker.add(round);
        }
        marker.position.set(mx, 0, mz);
        marker.rotation.y = this.rand(-0.1, 0.1);
        g.add(marker);
        placed++;
      }
    }

    // 3 larger tombstone-style markers (taller stone slabs)
    const tombPositions = [[-3.5, -3], [3.5, -3], [0, -3]];
    for (const [tx, tz] of tombPositions) {
      const tomb = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 1.4, 0.18),
        m.ruinStone
      );
      tomb.position.set(tx, 0.7, tz);
      tomb.rotation.y = this.rand(-0.05, 0.05);
      g.add(tomb);
      // Small base
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.15, 0.3),
        m.ruinStoneD
      );
      base.position.set(tx, 0.075, tz);
      g.add(base);
    }

    // One tilted/fallen marker
    const fallen = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.85, 0.06),
      m.plankDark
    );
    fallen.position.set(2.3, 0.06, 1.8);
    fallen.rotation.set(0, this.rand(0, Math.PI), Math.PI / 2 - 0.2);
    g.add(fallen);

    // Wilted flower offerings — small red+yellow circle decals on the ground
    for (let i = 0; i < 6; i++) {
      const fx = this.rand(-3, 3);
      const fz = this.rand(-2.5, 2.5);
      const flower = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 8),
        (i & 1) ? m.flowerRed : m.flowerYellow
      );
      flower.rotateX(-Math.PI / 2);
      flower.position.set(fx, 0.05, fz);
      g.add(flower);
    }

    // Low stone wall fragment on one side (eastern edge)
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, 3),
      m.ruinStone
    );
    wall.position.set(4.5, 0.3, 0);
    wall.rotation.y = this.rand(-0.05, 0.05);
    g.add(wall);
    this.addCollider(cx + 4.5, cz, 1.6, 0.6);

    g.position.set(cx, 0, cz);
    shadowify(g);
    this.scene.add(g);

    // A single large weeping banyan at one corner (NW of plot)
    if (this.vegetation && typeof this.vegetation.buildBanyan === 'function') {
      try {
        this.vegetation.buildBanyan(cx - 6, cz - 5);
      } catch (e) { /* veg unavailable; skip */ }
    }

    // Marker collider — small overall radius so player can walk between graves
    // (only the tall tombstones get individual colliders)
    for (const [tx, tz] of tombPositions) {
      this.addCollider(cx + tx, cz + tz, 0.4, 1.4);
    }
  }
}
