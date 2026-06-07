// ════════════════════════════════════════════
//  viewmodel.js — First-person weapon viewmodel
//  Renders an M16/M1911 in front of the camera with bob, sway,
//  recoil kick, ADS, reload dip, weapon-swap dip, and muzzle flash.
//  Uses its own scene+camera rendered over the main composer pass
//  (renderer.autoClear=false; clearDepth) so it never z-fights with
//  the world.
//
//  INTEGRATION (for game.js wiring step):
//    1. import { ViewModel } from './viewmodel.js';
//    2. In Game ctor (after this.player exists):
//         this.viewmodel = new ViewModel(this.renderer);
//         this.viewmodel.setWeapon(this.player.currentWeapon.id);
//       Then wrap player methods: _shoot (call onShoot if mag dropped &
//       not knife), _startReload (call onReload), _switchWeapon (call
//       setWeapon + onWeaponSwap on idx change).
//    3. In _loop(), AFTER `this.graphics.render()`:
//         const moving = !!(player.keys.KeyW||KeyS||KeyA||KeyD);
//         const sprinting = !!player.keys.ShiftLeft && moving &&
//                           !player.crouching && rpg.stamina>0;
//         this.viewmodel.update(dt, { moving, sprinting,
//           ads: player.mouse.right, reloading: player.reloading,
//           mainCamera: this.camera });
//         this.viewmodel.render();
// ════════════════════════════════════════════

import * as THREE from 'three';

// ─── Pose constants (tweak for feel) ──────────────────────────
const POSES = {
  m16: {
    hip:    new THREE.Vector3( 0.22, -0.28, -0.54),
    ads:    new THREE.Vector3( 0.00, -0.13, -0.34),
    sprint: new THREE.Vector3( 0.25, -0.36, -0.62),
    sprintTilt: 0.30,
    muzzle: new THREE.Vector3( 0.00,  0.00, -0.62),
  },
  pistol: {
    hip:    new THREE.Vector3( 0.15, -0.23, -0.37),
    ads:    new THREE.Vector3( 0.00, -0.10, -0.27),
    sprint: new THREE.Vector3( 0.19, -0.31, -0.46),
    sprintTilt: 0.34,
    muzzle: new THREE.Vector3( 0.00,  0.01, -0.26),
  },
  knife: {
    hip:    new THREE.Vector3( 0.19, -0.24, -0.34),
    ads:    new THREE.Vector3( 0.12, -0.18, -0.30),
    sprint: new THREE.Vector3( 0.23, -0.31, -0.44),
    sprintTilt: 0.36,
    muzzle: new THREE.Vector3( 0.00,  0.00, -0.32),
  },
};

export class ViewModel {
  constructor(renderer) {
    this.renderer = renderer;

    // Dedicated scene + camera so depth never collides with world.
    this.scene = new THREE.Scene();
    const aspect = (renderer.domElement.width || window.innerWidth) /
                   (renderer.domElement.height || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.01, 5);
    this.camera.position.set(0, 0, 0);

    // Lighting — warm key + cool fill, independent of world lighting.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.26));
    const key = new THREE.DirectionalLight(0xffd9a8, 0.55);
    key.position.set(0.5, 0.8, 0.3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.18);
    fill.position.set(-0.4, 0.2, 0.6);
    this.scene.add(fill);

    // Rig holds active weapon group; supports global dip/swap offsets.
    this.cameraRig = new THREE.Object3D();
    this.scene.add(this.cameraRig);

    this.weapons = {};          // cache: { m16, pistol, knife }
    this.weaponName = null;
    this.weaponGroup = null;
    this.muzzlePoint = null;

    this._buildMuzzleFlash();

    // Animation state
    this._bobTimer = 0;
    this._adsLerp = 0;
    this._lowerLerp = 0;
    this._lowerTarget = 0;
    this._lowerTimer = 0;
    this._recoilImpulse = new THREE.Vector3();
    this._recoilPitch = 0;
    this._flashTimer = 0;

    // Resize handling
    this._onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);
  }

  // ───────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────
  setWeapon(name) {
    if (this.weaponGroup) {
      this.cameraRig.remove(this.weaponGroup);
      this.weaponGroup = null;
      this.muzzlePoint = null;
    }
    if (!name) { this.weaponName = null; return; }

    if (!this.weapons[name]) {
      if (name === 'm16')         this.weapons[name] = this._buildM16();
      else if (name === 'pistol') this.weapons[name] = this._buildPistol();
      else if (name === 'knife')  this.weapons[name] = this._buildKnife();
      else { this.weaponName = null; return; }
    }

    this.weaponName = name;
    this.weaponGroup = this.weapons[name];
    this.cameraRig.add(this.weaponGroup);
    this.muzzlePoint = this.weaponGroup.userData.muzzle || null;
  }

  update(dt, opts = {}) {
    if (!this.weaponGroup) return;
    const moving    = !!opts.moving;
    const sprinting = !!opts.sprinting;
    const ads       = !!opts.ads && !sprinting; // can't ADS while sprinting
    const pose = POSES[this.weaponName] || POSES.m16;

    // ── Bob timer ─────────────────────────────
    const bobFreq = sprinting ? 9 : (moving ? 6 : 1.35);
    this._bobTimer += dt * bobFreq;

    // ── Smooth lerps ──────────────────────────
    const adsTarget = ads ? 1 : 0;
    this._adsLerp = THREE.MathUtils.damp(this._adsLerp, adsTarget, 14, dt);

    // Lower timer counts down; while >0 force lower target high
    if (this._lowerTimer > 0) {
      this._lowerTimer = Math.max(0, this._lowerTimer - dt);
    }
    const sprintLower = sprinting ? 0.55 : 0;
    const eventLower  = this._lowerTimer > 0 ? this._lowerTarget : 0;
    const lowerWant   = Math.max(sprintLower, eventLower);
    this._lowerLerp = THREE.MathUtils.damp(this._lowerLerp, lowerWant, 10, dt);

    // ── Base pose: blend hipfire ↔ ADS ────────
    const basePos = pose.hip.clone().lerp(pose.ads, this._adsLerp);

    // Apply sprint pose blend (additive on top of hip→ads, weighted by lower)
    if (sprinting) {
      basePos.lerp(pose.sprint, 0.7);
    }

    // ── Bob (idle is ~half amplitude) ─────────
    const bobAmp = sprinting ? 1.25 : (moving ? 0.72 : 0.25);
    const adsBobMul = (1 - this._adsLerp * 0.7); // ADS dampens bob
    const bobY = Math.sin(this._bobTimer * 2) * 0.005 * bobAmp * adsBobMul;
    const bobX = Math.cos(this._bobTimer)     * 0.004 * bobAmp * adsBobMul;
    basePos.x += bobX;
    basePos.y += bobY;

    // ── Recoil impulse (decay) ────────────────
    // Position kick is back along Z (toward player) and slight up
    basePos.z += this._recoilImpulse.z;
    basePos.y += this._recoilImpulse.y;
    basePos.x += this._recoilImpulse.x;

    // ── Reload / swap dip ─────────────────────
    basePos.y += -0.36 * this._lowerLerp;

    // ── Apply position ────────────────────────
    this.weaponGroup.position.copy(basePos);

    // ── Rotation: recoil pitch + dip rotation + sprint tilt + bob roll ─
    let rotX = -this._recoilPitch;
    let rotY = 0;
    let rotZ = 0;

    rotX += -0.6 * this._lowerLerp;

    if (sprinting) {
      rotZ += pose.sprintTilt * 0.6;
      rotY += -0.25;
    }

    // Subtle bob roll
    rotZ += Math.sin(this._bobTimer) * 0.004 * bobAmp * adsBobMul;

    this.weaponGroup.rotation.set(rotX, rotY, rotZ);

    // ── Decay recoil exponentially ────────────
    const decay = Math.exp(-dt * 14);
    this._recoilImpulse.multiplyScalar(decay);
    this._recoilPitch *= decay;

    // ── Muzzle flash timer ────────────────────
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) {
        this._flashQuad.visible = false;
        this._flashLight.visible = false;
      } else {
        // Random roll for variety
        this._flashQuad.rotation.z = Math.random() * Math.PI * 2;
        const s = 0.7 + Math.random() * 0.5;
        this._flashQuad.scale.setScalar(s);
      }
    }
  }

  render() {
    if (!this.weaponGroup) return;
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = prevAutoClear;
  }

  // ─── Event hooks ──────────────────────────
  onShoot() {
    if (!this.weaponGroup) return;
    if (this.weaponName === 'knife') return;

    const isPistol = this.weaponName === 'pistol';
    const kickZ = isPistol ? 0.014 : 0.019;
    const kickPitch = isPistol ? 0.036 : 0.048;

    this._recoilImpulse.z += kickZ;
    this._recoilImpulse.y += (Math.random() - 0.3) * 0.004;
    this._recoilImpulse.x += (Math.random() - 0.5) * 0.004;
    this._recoilPitch += kickPitch;

    // Position muzzle flash at muzzle tip (parented to weapon group)
    if (this.muzzlePoint) {
      this._flashQuad.position.copy(this.muzzlePoint.position);
      this._flashLight.position.copy(this.muzzlePoint.position);
    }
    this._flashQuad.visible = true;
    this._flashLight.visible = true;
    this._flashTimer = 0.035; // ~2 frames @60fps
  }

  onReload() {
    if (!this.weaponGroup) return;
    if (this.weaponName === 'knife') return;
    this._lowerTarget = 1.0;
    // Use the weapon's reload time if known, else ~1.5s
    this._lowerTimer = 1.4;
  }

  onWeaponSwap() {
    if (!this.weaponGroup) return;
    this._lowerTarget = 0.85;
    this._lowerTimer = 0.35;
    // Reset recoil on swap
    this._recoilImpulse.set(0, 0, 0);
    this._recoilPitch = 0;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    // Dispose all weapon geometries/materials
    for (const g of Object.values(this.weapons)) {
      g.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    if (this._flashQuad) {
      this._flashQuad.geometry.dispose();
      this._flashQuad.material.dispose();
    }
  }

  // ───────────────────────────────────────────────
  // Internal builders
  // ───────────────────────────────────────────────
  _buildMuzzleFlash() {
    const geo = new THREE.PlaneGeometry(0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd060,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this._flashQuad = new THREE.Mesh(geo, mat);
    this._flashQuad.visible = false;
    // Will be re-parented to active weapon group on first onShoot
    this.scene.add(this._flashQuad);

    this._flashLight = new THREE.PointLight(0xffaa55, 1.25, 0.8, 2);
    this._flashLight.visible = false;
    this.scene.add(this._flashLight);
  }

  // M16A1 — receiver, barrel, sights, carry handle, mag, stock, grip
  _buildM16() {
    const g = new THREE.Group();
    const furniture = 0x22281e;
    const metal = 0x151717;
    const dark  = 0x0f1110;

    const mk = (geom, color, opts = {}) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.7,
        metalness: opts.metalness ?? (color === metal ? 0.6 : 0.1),
      });
      return new THREE.Mesh(geom, mat);
    };

    // Receiver / lower
    const recv = mk(new THREE.BoxGeometry(0.04, 0.07, 0.32), furniture);
    g.add(recv);
    // Barrel
    const barrel = mk(new THREE.CylinderGeometry(0.012, 0.012, 0.50, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.012, -0.32);
    g.add(barrel);
    // Front sight post + base
    const fsight = mk(new THREE.BoxGeometry(0.012, 0.035, 0.025), dark);
    fsight.position.set(0, 0.045, -0.52);
    g.add(fsight);
    const fsBase = mk(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 8), dark);
    fsBase.position.set(0, 0.018, -0.52);
    g.add(fsBase);
    // Carry handle (top arch + front/rear legs)
    const chTop = mk(new THREE.BoxGeometry(0.018, 0.022, 0.16), dark);
    chTop.position.set(0, 0.07, -0.04);
    g.add(chTop);
    const chFront = mk(new THREE.BoxGeometry(0.018, 0.025, 0.018), dark);
    chFront.position.set(0, 0.05, -0.115);
    g.add(chFront);
    const chRear = mk(new THREE.BoxGeometry(0.022, 0.030, 0.025), dark);
    chRear.position.set(0, 0.05, 0.030);
    g.add(chRear);
    // Magazine (slight forward curve via tilt)
    const mag = mk(new THREE.BoxGeometry(0.030, 0.10, 0.040), metal);
    mag.position.set(0, -0.085, -0.04);
    mag.rotation.x = -0.16;
    g.add(mag);
    // Stock + toe
    const stock = mk(new THREE.BoxGeometry(0.035, 0.060, 0.18), furniture);
    stock.position.set(0, -0.005, 0.21);
    g.add(stock);
    const stockToe = mk(new THREE.BoxGeometry(0.035, 0.040, 0.04), furniture);
    stockToe.position.set(0, -0.025, 0.30);
    g.add(stockToe);
    // Pistol grip (angled)
    const grip = mk(new THREE.BoxGeometry(0.025, 0.080, 0.040), dark);
    grip.position.set(0, -0.060, 0.06);
    grip.rotation.x = 0.30;
    g.add(grip);
    // Trigger guard
    const tg = mk(new THREE.TorusGeometry(0.022, 0.004, 4, 12, Math.PI), dark);
    tg.position.set(0, -0.045, 0.025);
    tg.rotation.y = Math.PI / 2;
    g.add(tg);
    // Hand-guard around barrel
    const hg = mk(new THREE.CylinderGeometry(0.024, 0.024, 0.20, 8), 0x252b21);
    hg.rotation.x = Math.PI / 2;
    hg.position.set(0, 0.012, -0.22);
    g.add(hg);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.012, -0.58);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    return g;
  }

  // M1911 pistol
  _buildPistol() {
    const g = new THREE.Group();
    const blued  = 0x222428;
    const grip   = 0x3a2516;
    const dark   = 0x111111;

    const mk = (geom, color, opts = {}) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.55,
        metalness: opts.metalness ?? (color === blued ? 0.7 : 0.15),
      });
      return new THREE.Mesh(geom, mat);
    };

    // Slide
    const slide = mk(new THREE.BoxGeometry(0.025, 0.040, 0.18), blued);
    slide.position.set(0, 0.020, -0.04);
    g.add(slide);
    // Frame
    const frame = mk(new THREE.BoxGeometry(0.022, 0.035, 0.16), blued);
    frame.position.set(0, -0.012, -0.03);
    g.add(frame);
    // Barrel through front of slide
    const barrel = mk(new THREE.CylinderGeometry(0.0085, 0.0085, 0.04, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.018, -0.15);
    g.add(barrel);
    // Sights
    const fs = mk(new THREE.BoxGeometry(0.006, 0.008, 0.010), dark);
    fs.position.set(0, 0.044, -0.115);
    g.add(fs);
    const rs = mk(new THREE.BoxGeometry(0.020, 0.008, 0.012), dark);
    rs.position.set(0, 0.044, 0.038);
    g.add(rs);
    // Wood grip + checkered side strips
    const gripBody = mk(new THREE.BoxGeometry(0.025, 0.080, 0.050), grip);
    gripBody.position.set(0, -0.060, 0.020);
    gripBody.rotation.x = 0.18;
    g.add(gripBody);
    const checkL = mk(new THREE.BoxGeometry(0.001, 0.075, 0.045), 0x1a0f08, { roughness: 0.95, metalness: 0 });
    checkL.position.set(0.0135, -0.060, 0.020);
    checkL.rotation.x = 0.18;
    g.add(checkL);
    const checkR = checkL.clone();
    checkR.position.x = -0.0135;
    g.add(checkR);
    // Hammer + trigger guard + mag baseplate
    const hammer = mk(new THREE.BoxGeometry(0.014, 0.018, 0.010), dark);
    hammer.position.set(0, 0.032, 0.072);
    g.add(hammer);
    const tg = mk(new THREE.TorusGeometry(0.014, 0.003, 4, 10, Math.PI), dark);
    tg.position.set(0, -0.020, 0.005);
    tg.rotation.y = Math.PI / 2;
    g.add(tg);
    const magBase = mk(new THREE.BoxGeometry(0.025, 0.006, 0.045), blued);
    magBase.position.set(0, -0.105, 0.030);
    magBase.rotation.x = 0.18;
    g.add(magBase);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.018, -0.18);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    return g;
  }

  // Simple combat knife — fallback so 'knife' weapon still has a model
  _buildKnife() {
    const g = new THREE.Group();
    const blade = 0xb8bcc4;
    const handle = 0x2a1a10;

    const mk = (geom, color, opts = {}) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.4,
        metalness: opts.metalness ?? (color === blade ? 0.85 : 0.05),
      });
      return new THREE.Mesh(geom, mat);
    };

    const bladeGeo = mk(new THREE.BoxGeometry(0.004, 0.022, 0.16), blade);
    bladeGeo.position.set(0, 0.02, -0.12);
    g.add(bladeGeo);

    const guard = mk(new THREE.BoxGeometry(0.020, 0.030, 0.008), 0x444444);
    guard.position.set(0, 0.02, -0.04);
    g.add(guard);

    const grip = mk(new THREE.CylinderGeometry(0.012, 0.014, 0.10, 8), handle);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, 0.02, 0.02);
    g.add(grip);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, -0.20);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    return g;
  }
}
