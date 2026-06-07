// ════════════════════════════════════════════
//  Player — FPS controller (direct pointer lock, no PointerLockControls)
// ════════════════════════════════════════════
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Player {
  constructor(camera, renderer, rpg, audio, hud) {
    this.camera   = camera;
    this.renderer = renderer;
    this.rpg      = rpg;
    this.audio    = audio;
    this.hud      = hud;

    // Position / physics
    this.pos      = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.crouching = false;
    this.height   = CONFIG.PLAYER_HEIGHT;
    this.targetHeight = CONFIG.PLAYER_HEIGHT;

    // Input state
    this.keys     = {};
    this.mouse    = { left: false, right: false, leftPrev: false };
    this.yaw      = 0;
    this.pitch    = 0;
    this._locked  = false;

    // Weapons
    this.weapons   = this._initWeapons();
    this.weaponIdx = 0;
    this.reloading = false;
    this.reloadTimer = 0;

    // Footstep
    this._stepTimer = 0;

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far  = 200;

    // Shoot cooldown
    this.shootCooldown = 0;

    // Callbacks (set externally)
    this.onShootHit    = null;
    this.onInteract    = null;
    this.onThrowGrenade = null;
    this.onLock        = null;
    this.onUnlock      = null;

    // Physics (injected via setPhysics; null until init completes)
    this.physics = null;

    this._setupPointerLock(renderer.domElement);
    this._bindKeys();

    // Set camera euler order once
    this.camera.rotation.order = 'YXZ';
  }

  // ─── Pointer lock (direct API) ─────────────
  _setupPointerLock(domElement) {
    this._domElement = domElement;

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this._locked;
      this._locked = (document.pointerLockElement === domElement ||
                      document.pointerLockElement === document.body ||
                      document.pointerLockElement === document.documentElement);
      if (this._locked && !wasLocked) { if (this.onLock)   this.onLock();   }
      if (!this._locked && wasLocked) { if (this.onUnlock) this.onUnlock(); }
    });

    document.addEventListener('pointerlockerror', () => {
      console.warn('Pointer lock failed. Retrying on next user click.');
    });
  }

  lock() {
    // Use document.body for better cross-browser reliability on first lock.
    const el = document.body && document.body.requestPointerLock
      ? document.body
      : this._domElement;
    if (!el.requestPointerLock) {
      console.error('[NAM] requestPointerLock not supported');
      return;
    }
    console.log('[NAM] Requesting pointer lock on', el.tagName || el);
    try {
      const p = el.requestPointerLock();
      if (p && typeof p.then === 'function') {
        p.then(() => console.log('[NAM] Pointer lock granted (Promise)'))
         .catch(err => console.warn('[NAM] Pointer lock rejected:', err.message || err));
      }
    } catch (e) {
      console.error('[NAM] requestPointerLock threw:', e);
    }
  }

  unlock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  isLocked() { return this._locked; }

  setPhysics(physics) { this.physics = physics; }

  _groundY(world, x = this.pos.x, z = this.pos.z) {
    const y = world?.getHeightAt?.(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  // ─── Init weapons ─────────────────────────
  _initWeapons() {
    return [
      { ...CONFIG.WEAPONS.m16,    mag: CONFIG.WEAPONS.m16.magSize,    id: 'm16'    },
      { ...CONFIG.WEAPONS.pistol, mag: CONFIG.WEAPONS.pistol.magSize, id: 'pistol' },
      { ...CONFIG.WEAPONS.knife,  mag: Infinity, reserve: Infinity,   id: 'knife'  },
    ];
  }

  get currentWeapon() { return this.weapons[this.weaponIdx]; }
  get grenadeCount()  { return this.rpg.getItemQty('grenade') || 0; }

  // ─── Input bindings ───────────────────────
  _bindKeys() {
    document.addEventListener('mousemove', e => this._onMouseMove(e));

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this._startReload();
      if (e.code === 'Digit1') this._switchWeapon(0);
      if (e.code === 'Digit2') this._switchWeapon(1);
      if (e.code === 'Digit3') this._switchWeapon(2);
      if (e.code === 'KeyG') this._throwGrenade();
      if (e.code === 'KeyE' && this.onInteract) this.onInteract();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    window.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.left  = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left  = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _onMouseMove(e) {
    if (!this._locked) return;
    const sens = 0.0022;
    this.yaw   -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch  = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  // ─── Update ───────────────────────────────
  update(dt, world) {
    if (!this._locked) return;
    this._handleMovement(dt, world);
    this._handleShooting(dt);
    this._handleReload(dt);
    this._updateCamera();
    this._updateHUD();
  }

  _handleMovement(dt, world) {
    const isSprinting = this.keys['ShiftLeft'] && !this.crouching && this.rpg.stamina > 0;
    const speed = this.crouching ? CONFIG.CROUCH_SPEED :
                  isSprinting    ? CONFIG.SPRINT_SPEED :
                                   CONFIG.PLAYER_SPEED;

    this.rpg.drainStamina(dt, isSprinting);

    // Crouch toggle
    const wantCrouch = !!(this.keys['ControlLeft'] || this.keys['ControlRight']);
    if (wantCrouch !== this.crouching) {
      this.crouching = wantCrouch;
      this.targetHeight = wantCrouch ? CONFIG.PLAYER_CROUCH_HEIGHT : CONFIG.PLAYER_HEIGHT;
    }
    this.height += (this.targetHeight - this.height) * Math.min(1, dt * 10);

    // Movement vectors (yaw-relative, no vertical component)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const forward = new THREE.Vector3(-sy, 0, -cy);
    const right   = new THREE.Vector3( cy, 0, -sy);

    let move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    move.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  move.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  move.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      this._stepTimer -= dt;
      if (this._stepTimer <= 0) {
        this.audio.playFootstep();
        this._stepTimer = isSprinting ? 0.28 : 0.46;
      }
    }

    // Gravity
    if (!this.onGround) this.velocity.y += CONFIG.GRAVITY * dt;

    // Jump
    if (this.keys['Space'] && this.onGround && !this.crouching) {
      this.velocity.y = CONFIG.JUMP_FORCE;
      this.onGround = false;
    }

    // Integrate
    const newPos = this.pos.clone();
    newPos.x += (move.x + this.velocity.x) * dt;
    newPos.z += (move.z + this.velocity.z) * dt;
    newPos.y += this.velocity.y * dt;

    const targetGroundY = this._groundY(world, newPos.x, newPos.z);
    if (this.onGround) newPos.y = targetGroundY;

    // Ground
    if (newPos.y <= targetGroundY) {
      newPos.y = targetGroundY;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // World collision — Rapier capsule sweep (with NaN safety) plus legacy AABB
    // fallback for any colliders the legacy system catches but Rapier may miss.
    let resolvedByPhysics = false;
    if (this.physics && !this.physics.fallback) {
      const sweep = this.physics.capsuleSweep(this.pos, newPos, CONFIG.PLAYER_RADIUS, 0.85);
      if (sweep.hit && Number.isFinite(sweep.toi)) {
        const t = Math.max(0, Math.min(1, sweep.toi - 0.001));
        const nx = Number.isFinite(sweep.normal?.x) ? sweep.normal.x : 0;
        const nz = Number.isFinite(sweep.normal?.z) ? sweep.normal.z : 0;
        const candX = this.pos.x + (newPos.x - this.pos.x) * t;
        const candZ = this.pos.z + (newPos.z - this.pos.z) * t;
        const candY = this.pos.y + (newPos.y - this.pos.y) * t;
        // Slide: project remaining horizontal motion onto wall plane
        const remainX = (newPos.x - this.pos.x) * (1 - t);
        const remainZ = (newPos.z - this.pos.z) * (1 - t);
        const dot = remainX * nx + remainZ * nz;
        const slideX = remainX - nx * dot;
        const slideZ = remainZ - nz * dot;
        const finalX = candX + slideX;
        const finalZ = candZ + slideZ;
        if (Number.isFinite(finalX) && Number.isFinite(finalZ) && Number.isFinite(candY)) {
          newPos.x = finalX;
          newPos.z = finalZ;
          newPos.y = candY;
          resolvedByPhysics = true;
        }
      } else if (!sweep.hit) {
        resolvedByPhysics = true;
      }
    }
    if (!resolvedByPhysics && world) {
      // Legacy AABB fallback (also runs as a safety net if physics had a bad result)
      const col = world.checkCollision(newPos, CONFIG.PLAYER_RADIUS);
      if (col.hit) {
        newPos.x += col.nx * col.overlap;
        newPos.z += col.nz * col.overlap;
      }
    }
    // Final NaN guard — never let bad math propagate to the camera
    if (!Number.isFinite(newPos.x) || !Number.isFinite(newPos.y) || !Number.isFinite(newPos.z)) {
      newPos.copy(this.pos);
    }

    // World bounds
    const bound = CONFIG.WORLD_SIZE / 2 - 2;
    newPos.x = Math.max(-bound, Math.min(bound, newPos.x));
    newPos.z = Math.max(-bound, Math.min(bound, newPos.z));
    const finalGroundY = this._groundY(world, newPos.x, newPos.z);
    if (this.onGround || newPos.y < finalGroundY) {
      newPos.y = finalGroundY;
      this.velocity.y = 0;
      this.onGround = true;
    }

    this.pos.copy(newPos);
  }

  _handleShooting(dt) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    const canFire = this.mouse.left && !this.reloading && this.shootCooldown <= 0;
    const isNewClick = this.mouse.left && !this.mouse.leftPrev;

    if (canFire && (this.currentWeapon.auto || isNewClick)) {
      this._shoot();
    }
    this.mouse.leftPrev = this.mouse.left;
  }

  _shoot() {
    const w = this.currentWeapon;
    if (w.id === 'knife') { this._knifeAttack(); return; }

    if (w.mag <= 0) {
      this._startReload();
      return;
    }

    w.mag--;
    this.shootCooldown = w.rate;

    // Build direction with spread
    const spread = this.mouse.right ? w.spread * 0.35 : w.spread;
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      -1
    );
    dir.applyQuaternion(this.camera.quaternion).normalize();
    this.raycaster.set(this.camera.position, dir);

    this.audio.playShoot(w.id);
    if (this.onShootHit) this.onShootHit(this.raycaster, w.damage);
  }

  _knifeAttack() {
    const w = this.currentWeapon;
    if (this.shootCooldown > 0) return;
    this.shootCooldown = w.rate;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.raycaster.set(this.camera.position, dir);
    this.raycaster.far = w.range;
    this.audio.playShoot('knife');
    if (this.onShootHit) this.onShootHit(this.raycaster, w.damage);
    this.raycaster.far = 200;
  }

  _startReload() {
    const w = this.currentWeapon;
    if (w.id === 'knife' || this.reloading) return;
    const ammoType = w.id === 'm16' ? 'ammo_m16' : 'ammo_pistol';
    if (w.mag >= w.magSize) return;
    if (this.rpg.getItemQty(ammoType) <= 0) {
      this.hud.notifyDanger('Out of ammo!');
      return;
    }
    this.reloading = true;
    this.reloadTimer = w.reloadTime;
    this.audio.playReload();
    this.hud.notify('Reloading…', '#d4860a');
  }

  _handleReload(dt) {
    if (!this.reloading) return;
    this.reloadTimer -= dt;
    if (this.reloadTimer <= 0) {
      this.reloading = false;
      const w = this.currentWeapon;
      const ammoType = w.id === 'm16' ? 'ammo_m16' : 'ammo_pistol';
      const needed = w.magSize - w.mag;
      const available = this.rpg.getItemQty(ammoType);
      const use = Math.min(needed, available);
      this.rpg.removeItem(ammoType, use);
      w.mag += use;
    }
  }

  _switchWeapon(idx) {
    if (idx >= this.weapons.length) return;
    this.weaponIdx = idx;
    this.reloading = false;
    this.hud.notify('Equipped: ' + this.currentWeapon.name);
  }

  _throwGrenade() {
    if (this.grenadeCount <= 0) { this.hud.notifyDanger('No grenades!'); return; }
    this.rpg.removeItem('grenade', 1);
    this.audio.playShoot('grenade');
    this.hud.notify('Grenade thrown!');
    if (this.onThrowGrenade) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.onThrowGrenade(this.camera.position.clone(), dir);
    }
  }

  // ─── Camera update ────────────────────────
  _updateCamera() {
    // Position camera at player position + eye height
    this.camera.position.set(this.pos.x, this.pos.y + this.height, this.pos.z);

    // ADS zoom
    const targetFOV = this.mouse.right ? 45 : CONFIG.FOV;
    this.camera.fov += (targetFOV - this.camera.fov) * 0.15;
    this.camera.updateProjectionMatrix();
  }

  // ─── HUD sync ─────────────────────────────
  _updateHUD() {
    const w = this.currentWeapon;
    const ammoType = w.id === 'm16' ? 'ammo_m16' : w.id === 'pistol' ? 'ammo_pistol' : null;
    const reserve = ammoType ? this.rpg.getItemQty(ammoType) : Infinity;
    this.hud.updateWeapon(w.name, w.mag, reserve, this.grenadeCount);

    const yawDeg = THREE.MathUtils.radToDeg(-this.yaw);
    this.hud.updateCompass(yawDeg);
    this.hud.updateObjectives(this.rpg.getActiveObjectives());
    this.hud.updateCompanions(this.rpg.companions);
    this.hud.updateXP(this.rpg.xp, this.rpg.xpToNext, this.rpg.level);
  }

  // ─── Damage / Heal ───────────────────────
  takeDamage(amount) {
    this.rpg.takeDamage(amount);
    this.hud.updateHealth(this.rpg.health, this.rpg.maxHealth);
    this.hud.updateMorale(this.rpg.morale);
    this.hud.flashHit();
    this.audio.playHurt();
  }

  heal(amount) {
    this.rpg.heal(amount);
    this.hud.updateHealth(this.rpg.health, this.rpg.maxHealth);
    this.hud.flashHeal();
  }

  // ─── Item pickup ─────────────────────────
  tryPickup(item) {
    switch (item.type) {
      case 'medkit':
        if (this.rpg.health >= this.rpg.maxHealth) {
          this.rpg.addItem({ type:'medkit', qty:1, label:'Med Kit', emoji:'🩹', desc:'Restores 40 HP. Use from inventory.' });
        } else {
          this.heal(40);
        }
        this.hud.notifyItem('Med Kit');
        break;
      case 'ammo_m16':
        this.rpg.addItem({ type:'ammo_m16', qty:30, label:'M16 Ammo', emoji:'🔴', desc:'5.56mm rounds for the M16A1.' });
        this.hud.notifyItem('M16 Ammo ×30');
        break;
      case 'ammo_pistol':
        this.rpg.addItem({ type:'ammo_pistol', qty:14, label:'Pistol Ammo', emoji:'🟡', desc:'.45 ACP rounds for the M1911.' });
        this.hud.notifyItem('Pistol Ammo ×14');
        break;
      case 'grenade':
        this.rpg.addItem({ type:'grenade', qty:2, label:'M67 Grenade', emoji:'🟢', desc:'Frag grenade. Throw with [G].' });
        this.hud.notifyItem('Grenade ×2');
        break;
      case 'compass':
        this.rpg.addItem({ type:'compass', qty:1, label:'Compass', emoji:'🧭', desc:'Navigation compass.' });
        this.hud.notifyItem('Compass');
        break;
      case 'document':
        this.rpg.documents.push({ label: item.label, text: item.text });
        this.rpg.addItem({ type:'doc_' + item.label, qty:1, label:item.label, emoji:'📄', desc:item.text });
        this.rpg.gainXP(20);
        this.hud.notifyItem('Document: ' + item.label);
        break;
    }
    this.audio.playPickup();
  }

  getPosition() { return this.pos.clone(); }
}
