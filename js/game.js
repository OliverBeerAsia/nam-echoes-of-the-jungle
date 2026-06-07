// ════════════════════════════════════════════
//  NAM: Echoes of the Jungle — Main Game
//  Three.js FPS/RPG · Vietnam War 1968
// ════════════════════════════════════════════
import * as THREE from 'three';
import { CONFIG, LEVEL } from './config.js';
import { AudioManager }  from './audio.js';
import { RPGSystem }     from './rpg.js';
import { HUD }           from './hud.js';
import { World }         from './world.js';
import { Player }        from './player.js';
import { EnemyManager }  from './enemies.js';
import { NPCManager }    from './npcs.js';
import { GraphicsManager } from './graphics.js';
import { AssetManager } from './assets.js';
import { PhysicsWorld, importLegacyColliders } from './physics.js';
import { ViewModel } from './viewmodel.js';
import { DecalManager, CameraShake } from './decals.js';
import { VegetationTime, VegetationSun } from './vegetation.js';

// ─── Grenade physics helper ────────────────
class Grenade {
  constructor(pos, dir, scene, enemies, hud, audio, physics, fx = null) {
    this.scene = scene; this.enemies = enemies; this.hud = hud;
    this.audio = audio; this.physics = physics;
    this.fx = fx; // { decals, shake }
    this.pos = pos.clone();
    this.vel = dir.clone().multiplyScalar(12);
    this.vel.y += 4;
    this.timer = 3.8;
    this.exploded = false;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 0.6, metalness: 0.4 })
    );
    this.mesh.position.copy(pos);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Try Rapier-backed projectile; falls back to manual integration if Rapier failed.
    this.body = this.physics?.spawnProjectile?.({
      pos: this.pos,
      velocity: this.vel,
      radius: 0.1,
      mass: 0.4,
      restitution: 0.45,
      friction: 0.5,
      mesh: this.mesh,
    });
  }

  update(dt) {
    if (this.exploded) return true;

    if (this.body) {
      // Rapier syncs mesh position automatically via physics.step()
      this.pos.copy(this.mesh.position);
    } else {
      // Legacy manual integration (Rapier unavailable)
      this.vel.y += CONFIG.GRAVITY * dt * 0.8;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < 0.1) {
        this.pos.y = 0.1;
        this.vel.y *= -0.4;
        this.vel.x *= 0.7;
        this.vel.z *= 0.7;
      }
      this.mesh.position.copy(this.pos);
    }

    this.timer -= dt;
    if (this.timer <= 0) { this._explode(); return true; }
    return false;
  }

  _explode() {
    this.exploded = true;
    this.scene.remove(this.mesh);
    this.audio.playExplosion();

    // Visual flash
    const light = new THREE.PointLight(0xff6600, 8, 20);
    light.position.copy(this.pos);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 200);

    // Damage enemies
    const radius = CONFIG.WEAPONS.grenade.radius;
    this.enemies.enemies.forEach(e => {
      if (e.state === 4) return;
      const dist = e.pos.distanceTo(this.pos);
      if (dist < radius) {
        const dmg = Math.floor(CONFIG.WEAPONS.grenade.damage * (1 - dist / radius));
        this.enemies.hitEnemy(e, dmg);
      }
    });

    // Knock physics props around
    if (this.physics && !this.physics.fallback) {
      const bodies = this.physics.bodiesNearPoint(this.pos, radius);
      for (const b of bodies) {
        const p = b.translation();
        const dir = new THREE.Vector3(p.x - this.pos.x, p.y - this.pos.y + 0.5, p.z - this.pos.z);
        const dist = Math.max(0.5, dir.length());
        dir.normalize().multiplyScalar(25 * (1 - Math.min(1, dist / radius)));
        this.physics.applyImpulseAtPoint(b, dir, { x: p.x, y: p.y, z: p.z });
      }
      // Remove the projectile body
      if (this.body) this.physics.removeBody(this.body);
    }

    // Camera shake — feel the blast
    this.fx?.shake?.shake(0.08, 0.5);

    this.hud.notify('💥 Grenade!', '#ff6600');
  }
}

// ─── Item world object ────────────────────
class WorldItem {
  constructor(data, scene, world = null) {
    this.data   = data;
    this.scene  = scene;
    this.picked = false;
    this.world  = world;
    this.baseY  = (world?.getHeightAt?.(data.x, data.z) ?? 0) + 0.3;
    this.mesh   = this._build();
    this.mesh.position.set(data.x, this.baseY, data.z);
    scene.add(this.mesh);
    this._t = Math.random() * Math.PI * 2;
  }

  _build() {
    const colorMap = {
      medkit:     0xff4444, ammo_m16:   0x884400,
      ammo_pistol:0xaaaa00, grenade:    0x226622,
      compass:    0x4444aa, document:   0xddddaa,
    };
    const color = colorMap[this.data.type] || 0xffffff;
    const geo   = this.data.type === 'medkit'
      ? new THREE.BoxGeometry(0.4, 0.35, 0.4)
      : new THREE.SphereGeometry(0.18, 6, 5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
    mesh.castShadow = true;
    return mesh;
  }

  update(dt) {
    this._t += dt * 1.5;
    this.mesh.position.y = this.baseY + Math.sin(this._t) * 0.1;
    this.mesh.rotation.y += dt * 1.2;
  }

  distanceTo(pos) {
    return this.mesh.position.distanceTo(pos);
  }

  pick() {
    this.picked = true;
    this.scene.remove(this.mesh);
  }
}

// ════════════════════════════════════════════
//  GAME CLASS
// ════════════════════════════════════════════
class Game {
  constructor() {
    this.state   = 'menu';
    this.clock   = new THREE.Clock(false);
    this.grenades = [];
    this.worldItems = [];
    this.initialized = false;
    this.requestedGraphicsPreset = localStorage.getItem('nam_gfx_preset') || 'auto';

    this._bindUI();
    this._bindLockPrompt(); // set up lock-prompt click handler once globally
  }

  // ─── UI bindings ─────────────────────────
  _bindUI() {
    document.getElementById('btn-start').addEventListener('click', () => this._startGame());
    document.getElementById('btn-controls').addEventListener('click', () => {
      document.getElementById('menu-screen').classList.add('hidden');
      document.getElementById('controls-screen').classList.remove('hidden');
    });
    document.getElementById('btn-back').addEventListener('click', () => {
      document.getElementById('controls-screen').classList.add('hidden');
      document.getElementById('menu-screen').classList.remove('hidden');
    });
    document.getElementById('btn-resume').addEventListener('click',   () => this._resume());
    document.getElementById('btn-to-menu').addEventListener('click',  () => location.reload());
    document.getElementById('btn-respawn').addEventListener('click',  () => this._respawn());
    document.getElementById('btn-restart').addEventListener('click',  () => location.reload());
    document.getElementById('btn-inv-close').addEventListener('click',    () => this.hud.closeInventory());
    document.getElementById('btn-journal-close').addEventListener('click', () => this.hud.closeJournal());

    const gfxSelect = document.getElementById('gfx-quality');
    if (gfxSelect) {
      gfxSelect.value = this.requestedGraphicsPreset;
      gfxSelect.addEventListener('change', () => {
        this.requestedGraphicsPreset = gfxSelect.value;
        localStorage.setItem('nam_gfx_preset', this.requestedGraphicsPreset);
        if (this.graphics) this._applyGraphicsPreset(this.requestedGraphicsPreset, true);
      });
    }

    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') this._onEsc();
      if (e.code === 'KeyI' && this.state === 'playing') this.hud.toggleInventory();
      if (e.code === 'KeyJ' && this.state === 'playing') this.hud.toggleJournal();
    });
  }

  // ─── Init Three.js ───────────────────────
  _initThree() {
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(CONFIG.FOV, innerWidth / innerHeight, 0.05, 1400);
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: true,
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    // Match clear color to fog so "empty" pixels show the right color
    this.renderer.setClearColor(CONFIG.FOG_COLOR, 1);

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      if (this.graphics) this.graphics.onResize(innerWidth, innerHeight);
    });
  }

  // ─── Start game ──────────────────────────
  async _startGame() {
    if (!this.initialized) {
      try {
        await this._init();
      } catch (err) {
        console.error('[NAM] Fatal init error:', err);
        this._showBootError('Failed to initialize the mission. Check browser console and refresh.');
        return;
      }
    }
    // Hide menu, show click-to-start prompt (pointer lock MUST come from a direct canvas/document click)
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('lock-prompt-text').textContent = 'CLICK TO START';
    document.getElementById('lock-prompt').classList.remove('hidden');
    this._attemptPointerLock();
  }

  async _init() {
    this.initialized = true;

    this._initThree();

    // Systems
    this.audio  = new AudioManager();
    this.audio.init();
    this.audio.resume();

    this.graphics = new GraphicsManager(this.renderer, this.scene, this.camera);
    this.assetManager = new AssetManager(this.renderer);
    this.physics = new PhysicsWorld();
    await this.physics.init({ gravity: CONFIG.GRAVITY });
    this._applyGraphicsPreset(this.requestedGraphicsPreset, false);

    // Sky/lighting/fog now live in graphics.js (moved out of world.js).
    this.graphics.installLighting(this.scene);
    this.graphics.installFog(this.scene);

    this.rpg    = new RPGSystem();
    this.hud    = new HUD(this.rpg);
    this.world  = new World(this.scene, this.graphics.getWorldQuality(), this.assetManager);
    try {
      this.world.build();
      console.log('[NAM] World built OK — scene objects:', this.scene.children.length);
    } catch(e) {
      console.error('[NAM] World build FAILED:', e);
      throw e;
    }

    importLegacyColliders(this.physics, this.world.colliders);
    this.physics.addGroundPlane(CONFIG.WORLD_SIZE);

    this.player = new Player(this.camera, this.renderer, this.rpg, this.audio, this.hud);
    this.player.setPhysics?.(this.physics);
    this._placePlayer(LEVEL.playerStart);

    // First-person weapon viewmodel + decals + camera shake
    this.viewmodel = new ViewModel(this.renderer);
    try { this.viewmodel.setWeapon(this.player.currentWeapon?.id || 'm16'); } catch (_) {}
    this.decals = new DecalManager(this.scene);
    this.shake  = new CameraShake();
    // Seed shared foliage shader uniforms once
    VegetationSun.uSunDir.value.copy(this.graphics.sunDirection);
    // Wrap player methods to drive viewmodel events
    this._wireViewmodelHooks();

    this.enemyMgr = new EnemyManager(this.scene, this.audio, this.rpg);
    this.enemyMgr.spawn(this.world);
    this.enemyMgr.onPlayerHit = (dmg) => this.player.takeDamage(dmg);

    this.npcMgr = new NPCManager(this.scene, this.rpg, this.hud, this.audio);
    this.npcMgr.spawn(this.world);
    this.npcMgr.onDialogueEnd = (npc) => this._onDialogueEnd(npc);

    // World items
    LEVEL.items.forEach(item => {
      this.worldItems.push(new WorldItem(item, this.scene, this.world));
    });

    // RPG callbacks
    this.rpg.on('healthChanged', (hp) => this.hud.updateHealth(hp, this.rpg.maxHealth));
    this.rpg.on('staminaChanged', (s) => this.hud.updateStamina(s));
    this.rpg.on('levelUp', (lvl) => {
      this.hud.notifyLevelUp(lvl);
      this._refreshMissionHud();
    });
    this.rpg.on('died', () => this._onDie());
    this.rpg.on('notification', (msg) => this.hud.notify(msg, '#d4860a'));
    this.rpg.on('questStarted',   (q) => {
      this.hud.notifyObjective('Quest started: ' + q.title);
      this._revealQuestActors(q.id);
      this._refreshMissionHud();
    });
    this.rpg.on('questCompleted', (q) => {
      this.hud.notify('MISSION COMPLETE: ' + q.title, '#27ae60');
      if (q.id === 'hearts_of_the_village' && !this._isQuestStarted('rescue')) {
        this.rpg.startQuest('rescue');
        this.hud.notify('Village trust secured. Elder Nguyen marked the VC camp approach.', '#27ae60');
      }
      this._refreshMissionHud();
    });
    this.rpg.on('objectiveCompleted', (q, obj) => {
      this.hud.notify('✓ ' + obj.text, '#3498db');
      this._refreshMissionHud();
    });
    this.rpg.on('trustChanged', (trust, delta) => {
      this._notifyTrustChange(trust, delta);
      this._refreshMissionHud();
    });
    this.rpg.on('companionsChanged', () => this._refreshMissionHud());

    // Player callbacks
    this.player.onShootHit = (ray, dmg) => this._onShoot(ray, dmg);
    this.player.onInteract  = () => this._onInteract();
    this.player.onThrowGrenade = (pos, dir) => {
      this.grenades.push(new Grenade(pos, dir, this.scene, this.enemyMgr, this.hud, this.audio, this.physics, { decals: this.decals, shake: this.shake }));
    };

    // Pointer lock callbacks (direct API — see player.js)
    this.player.onLock   = () => this._onLock();
    this.player.onUnlock = () => this._onUnlock();

    // Start quests
    this.rpg.startQuest('aftershock');
    this._refreshMissionHud();
    this.audio.startAmbient();

    // Helicopter sound hint
    setTimeout(() => {
      this.hud.notifyDanger('A helicopter went down. You are behind enemy lines.');
      setTimeout(() => this.hud.notify('Recover your map fragment, then move toward the village.', '#d4860a'), 3500);
    }, 1500);

    this._startLoop();
  }

  _applyGraphicsPreset(preset, showNotice = false) {
    const applied = this.graphics.init ? this.graphics.init(preset) : this.graphics.applyPreset(preset);
    this.requestedGraphicsPreset = preset;
    localStorage.setItem('nam_gfx_preset', preset);

    const select = document.getElementById('gfx-quality');
    if (select) {
      if (preset === 'auto') {
        const autoLabel = select.querySelector('option[value="auto"]');
        if (autoLabel) autoLabel.textContent = 'AUTO (' + applied.toUpperCase() + ')';
      }
      select.value = preset;
    }

    if (this.world?.setQuality) {
      this.world.setQuality(this.graphics.getWorldQuality());
    }

    if (showNotice && this.hud) {
      this.hud.notifyInfo('Graphics preset: ' + applied.toUpperCase());
    }
  }

  _placePlayer(pos) {
    const groundY = this.world?.getHeightAt?.(pos.x, pos.z) ?? 0;
    this.player.pos.set(pos.x, groundY, pos.z);
    this.player.yaw   = 0; // yaw=0 → camera faces -Z (south, toward village at z=20)
    this.player.pitch = 0;
    // Update camera immediately so the pre-lock render shows the scene
    this.camera.position.set(pos.x, groundY + CONFIG.PLAYER_HEIGHT, pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = 0;
    this.camera.rotation.x = 0;
  }

  _startLoop() {
    // Clock is started in _onLock; just start the render loop
    this.renderer.setAnimationLoop(() => this._loop());
  }

  // ─── Pointer lock ───────────────────────
  _bindLockPrompt() {
    const tryLock = () => {
      if (!this.initialized || !this.player) return;
      if (this.player.isLocked()) return;
      if (this.state === 'playing' || this.state === 'paused_lock' || this.state === 'menu') {
        this._attemptPointerLock();
      }
    };

    // Primary: direct click on the lock-prompt overlay
    document.getElementById('lock-prompt').addEventListener('click', tryLock);

    // Fallback: any click anywhere on the page
    document.addEventListener('click', tryLock);
  }

  _attemptPointerLock() {
    if (!this.player || this.player.isLocked()) return;
    this.player.lock();
    setTimeout(() => {
      if (!this.player || this.player.isLocked() || this.state === 'playing') return;
      const txt = document.getElementById('lock-prompt-text');
      if (txt) txt.textContent = 'CLICK TO START (RETRY)';
    }, 450);
  }

  _showBootError(message) {
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('lock-prompt').classList.add('hidden');
    const lore = document.querySelector('#menu-screen .lore-text');
    if (lore) {
      lore.innerHTML = `${message}<br><br><em>Open DevTools console for details.</em>`;
    }
  }

  _onLock() {
    console.log('[NAM] _onLock fired — starting game');
    this.state = 'playing';
    this.hud.show();
    document.getElementById('lock-prompt').classList.add('hidden');
    document.getElementById('lock-prompt-text').textContent = 'CLICK TO RESUME';
    if (!this.clock.running) this.clock.start();
    this.audio.resume();
    this.hud.notify('MISSION STARTED — WASD: Move  Mouse: Look  ESC: Pause', '#d4860a');
  }

  _onUnlock() {
    if (this.state === 'playing') {
      this.state = 'paused_lock';
      document.getElementById('lock-prompt').classList.remove('hidden');
    }
  }

  _onEsc() {
    if (this.npcMgr?.isDialogueActive()) {
      document.getElementById('dialogue-ui').classList.add('hidden');
      this.state = 'paused_lock';
      document.getElementById('lock-prompt').classList.remove('hidden');
      return;
    }
    if (this.hud?.isInventoryOpen()) { this.hud.closeInventory(); return; }
    if (this.hud?.isJournalOpen())   { this.hud.closeJournal();   return; }

    if (this.state === 'playing') {
      this._pause();
    } else if (this.state === 'paused') {
      this._resume();
    }
  }

  _pause() {
    this.state = 'paused';
    this.player.unlock();
    this.clock.stop();
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('pause-screen').classList.remove('hidden');
    document.getElementById('lock-prompt').classList.add('hidden');
  }

  _resume() {
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    // Show click-to-resume prompt — pointer lock must come from a direct user click
    this.state = 'paused_lock';
    document.getElementById('lock-prompt').classList.remove('hidden');
    if (!this.clock.running) this.clock.start();
  }

  // ─── Main loop ───────────────────────────
  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state !== 'playing') {
      this.graphics.render();
      return;
    }

    // Step physics first so meshes attached to bodies sync before render
    this.physics.step(dt);

    // Update systems
    this.player.update(dt, this.world);
    const playerPos = this.player.getPosition();
    this.enemyMgr.update(dt, playerPos, this.world.colliders, this.world);
    this.npcMgr.update(dt);
    this.world.update(dt, this.camera.position);

    // Grenades
    this.grenades = this.grenades.filter(g => !g.update(dt));

    // World items
    this.worldItems.forEach(item => { if (!item.picked) item.update(dt); });
    this._checkItemPickup(playerPos);

    // Interact prompt
    this._updateInteractPrompt(playerPos);

    // Zone triggers
    this._checkZoneTriggers(playerPos);

    // Foliage shader uniform: advance time
    VegetationTime.uTime.value += dt;

    // Decals fade + camera shake (apply BEFORE render)
    this.decals.update(dt);
    this.shake.update(dt);
    this.shake.apply(this.camera);

    this.graphics.render();

    // Viewmodel overlay: rendered last with cleared depth
    if (this.viewmodel) {
      const isMoving = !!(this.player.keys['KeyW'] || this.player.keys['KeyS'] ||
                          this.player.keys['KeyA'] || this.player.keys['KeyD']);
      const isSprinting = !!this.player.keys['ShiftLeft'] && isMoving &&
                          !this.player.crouching && this.rpg.stamina > 0;
      this.viewmodel.update(dt, {
        moving: isMoving,
        sprinting: isSprinting,
        ads: this.player.mouse.right,
        reloading: this.player.reloading,
        mainCamera: this.camera,
      });
      this.viewmodel.render();
    }
  }

  _wireViewmodelHooks() {
    if (!this.player) return;
    const origShoot = this.player._shoot?.bind(this.player);
    if (origShoot) {
      this.player._shoot = () => {
        const before = this.player.currentWeapon?.mag ?? 0;
        origShoot();
        if (this.player.currentWeapon?.id !== 'knife' &&
            (this.player.currentWeapon?.mag ?? 0) < before) {
          this.viewmodel?.onShoot();
          this.shake?.shake(0.012, 0.05);
        }
      };
    }
    const origReload = this.player._startReload?.bind(this.player);
    if (origReload) {
      this.player._startReload = () => {
        const wasReloading = this.player.reloading;
        origReload();
        if (!wasReloading && this.player.reloading) this.viewmodel?.onReload();
      };
    }
    const origSwap = this.player._switchWeapon?.bind(this.player);
    if (origSwap) {
      this.player._switchWeapon = (idx) => {
        const prev = this.player.weaponIdx;
        origSwap(idx);
        if (this.player.weaponIdx !== prev) {
          this.viewmodel?.setWeapon(this.player.currentWeapon?.id);
          this.viewmodel?.onWeaponSwap();
        }
      };
    }
    // Player damage shake
    const origTakeDamage = this.player.takeDamage?.bind(this.player);
    if (origTakeDamage) {
      this.player.takeDamage = (dmg) => {
        origTakeDamage(dmg);
        this.shake?.shake(Math.min(0.08, 0.02 + dmg * 0.003), 0.3);
      };
    }
  }

  // ─── Shooting ────────────────────────────
  _onShoot(raycaster, damage) {
    // Check enemy hits
    const hitEnemy = this.enemyMgr.checkBulletHit(raycaster);
    if (hitEnemy) {
      const killed = this.enemyMgr.hitEnemy(hitEnemy, damage);
      if (killed) {
        this.hud.notify('Enemy down.', '#c0392b');
      }
      this._showBulletHitEffect(hitEnemy.pos);
      return;
    }

    // (Future: world surface decal hook would raycast against a curated list,
    //  not the full scene graph — sprites in the scene make a recursive
    //  intersect throw on missing raycaster.camera.)
  }

  _showBulletHitEffect(pos) {
    // Blood/impact — just a quick PointLight flash
    const l = new THREE.PointLight(0xff2200, 3, 4);
    l.position.copy(pos);
    l.position.y = 1.2;
    this.scene.add(l);
    setTimeout(() => this.scene.remove(l), 80);
  }

  // ─── Interact ────────────────────────────
  _onInteract() {
    if (this.npcMgr.isDialogueActive()) return;
    if (this.hud.isInventoryOpen() || this.hud.isJournalOpen()) return;

    const playerPos = this.player.getPosition();
    playerPos.y = 1;

    // Check NPC
    const nearNpc = this.npcMgr.getNearby(playerPos);
    if (nearNpc) {
      const npcGate = this._getNpcGate(nearNpc);
      if (npcGate) {
        this.hud.notify(npcGate, '#d4860a');
        return;
      }
      this.state = 'dialogue';
      this.player.unlock();
      this.npcMgr.startDialogue(nearNpc);
      return;
    }

    // Check world interactables
    const interactable = this.world.getNearbyInteractable(playerPos);
    if (!interactable) return;
    const interactableGate = this._getInteractableGate(interactable);
    if (interactableGate) {
      this.hud.notify(interactableGate, '#d4860a');
      return;
    }

    switch (interactable.id) {
      case 'well':
        if (this.rpg.health < this.rpg.maxHealth) {
          this.player.heal(15);
          this.hud.notify('You drink from the well. +15 HP', '#27ae60');
        } else {
          this.hud.notify('You are at full health.', '#d4860a');
        }
        break;

      case 'radio_tower':
        if (!this.rpg.getFlag('radio_destroyed')) {
          this.rpg.setFlag('radio_destroyed', true);
          this.rpg.completeObjective('rescue', 'kill_radio');
          this.rpg.recordResolution('violent');
          this.rpg.adjustHeartsAndMinds(-2);
          this.rpg.gainXP(50);
          this.hud.notify('Radio tower destroyed! Enemy reinforcements delayed.', '#27ae60');
          this.audio.playExplosion();
          // Visual: collapse the tower (just flash and notify)
          const light = new THREE.PointLight(0xff6600, 6, 18);
          light.position.set(interactable.x, 5, interactable.z);
          this.scene.add(light);
          setTimeout(() => this.scene.remove(light), 400);
        } else {
          this.hud.notify('Radio already destroyed.', '#d4860a');
        }
        break;

      case 'clinic_cache':
        if (!this.rpg.getFlag('field_kit')) {
          this.rpg.setFlag('field_kit', true);
          this.rpg.completeObjective('field_surgery', 'obtain_field_kit');
          this.rpg.recordResolution('violent');
          this.rpg.adjustHeartsAndMinds(-8);
          this.hud.notify('You forced open the clinic cache and took a field kit.', '#d4860a');
        } else {
          this.hud.notify('The clinic cache is empty.', '#6e7a52');
        }
        break;

      case 'ferry_post':
        if (!this.rpg.isObjectiveDone('silent_crossing', 'secure_ferry_pass')) {
          this.rpg.setFlag('ferry_forced', true);
          this.rpg.completeObjective('silent_crossing', 'secure_ferry_pass');
          this.rpg.recordResolution('violent');
          this.rpg.adjustHeartsAndMinds(-6);
          this.hud.notify('Ferry post forced. Crossing route opened.', '#d4860a');
        } else {
          this.hud.notify('The crossing is already secured.', '#6e7a52');
        }
        break;

      case 'civilian_convoy':
        if (!this.rpg.getFlag('convoy_protected')) {
          this.rpg.setFlag('convoy_protected', true);
          this.rpg.recordResolution('nonviolent');
          this.rpg.adjustHeartsAndMinds(7);
          this.hud.notify('You secured the civilian convoy route.', '#27ae60');
        } else {
          this.hud.notify('Civilians are already moving to safety.', '#6e7a52');
        }
        break;

      case 'cage':
        this.state = 'dialogue';
        this.player.unlock();
        this.npcMgr.interactWithCage();
        break;

      case 'arvn_gate':
      case 'lz_signal':
        if (!this.rpg.getFlag('checkpoint_resolved')) {
          this.hud.notify('Checkpoint unresolved. Speak with Sgt. Kiet first.', '#c0392b');
          break;
        }
        if (this.rpg.getCompanionCount() < 2) {
          const names = {
            rodriguez: 'Rodriguez',
            cpl_whitaker: 'Whitaker',
            spc_hale: 'Hale',
          };
          const missing = Object.entries(this.rpg.companions)
            .filter(([, joined]) => !joined)
            .map(([id]) => names[id] || id)
            .join(', ');
          this.hud.notify('You cannot enter yet - too few squadmates accounted for: ' + missing, '#c0392b');
        } else {
          this._triggerExtraction();
        }
        break;
    }
  }

  _onDialogueEnd(npc) {
    this.state = 'paused_lock';
    document.getElementById('lock-prompt').classList.remove('hidden');
  }

  _revealQuestActors(questId) {
    const byQuest = {
      medic_down: ['father_bao'],
      field_surgery: ['sister_lan', 'cpl_whitaker'],
      silent_crossing: ['ferryman_huy'],
      radio_ghost: ['mai'],
      last_checkpoint: ['lt_pham', 'sgt_kiet'],
    };
    (byQuest[questId] || []).forEach(id => this.npcMgr.revealNPC(id));
  }

  _getNpcGate(npc) {
    if (!npc?.quest) return null;
    if (['elder', 'thanh', 'binh'].includes(npc.id)) return null;
    if (npc.id === 'spc_hale' && this.rpg.getFlag('hale_found')) return null;
    if (this._isQuestStarted(npc.quest)) return null;
    const labels = {
      medic_down: 'Find the medic lead before questioning Father Bao.',
      field_surgery: 'Locate Whitaker before asking Sister Lan for treatment supplies.',
      silent_crossing: 'Stabilize Whitaker before committing to a river crossing.',
      radio_ghost: 'Cross the river corridor before chasing Hale rumors.',
      last_checkpoint: 'Reach the ARVN perimeter before opening gate protocol.',
    };
    return labels[npc.quest] || 'This contact is not relevant yet.';
  }

  _getInteractableGate(interactable) {
    switch (interactable.id) {
      case 'radio_tower':
      case 'cage':
        return this._isQuestStarted('rescue') ? null : 'You need confirmed POW intel before acting on the VC camp.';
      case 'clinic_cache':
        return this._isQuestStarted('field_surgery') ? null : 'Find Whitaker before taking medical supplies from the clinic.';
      case 'ferry_post':
        return this._isQuestStarted('silent_crossing') ? null : 'Regroup Whitaker before forcing a river crossing.';
      case 'civilian_convoy':
        return (this._isQuestStarted('radio_ghost') && this.rpg.getFlag('hale_found'))
          ? null
          : 'Find Hale before diverting the squad to convoy cover.';
      case 'arvn_gate':
      case 'lz_signal':
        return this._isQuestStarted('last_checkpoint') ? null : 'Reach the ARVN perimeter before requesting gate entry.';
      default:
        return null;
    }
  }

  // ─── Interact prompt update ──────────────
  _updateInteractPrompt(playerPos) {
    const pos3d = new THREE.Vector3(playerPos.x, 1, playerPos.z);

    const nearNpc = this.npcMgr.getNearby(pos3d);
    if (nearNpc) {
      if (this._getNpcGate(nearNpc)) {
        this.hud.hideInteract();
        return;
      }
      const tree = {
        elder: 'Talk to Elder',
        thanh: 'Talk to Thanh',
        binh: 'Talk to Binh',
        father_bao: 'Talk to Father Bao',
        sister_lan: 'Talk to Sister Lan',
        rodriguez: 'Talk to Rodriguez',
        duc: 'Talk to Duc',
        cpl_whitaker: 'Talk to Whitaker',
        ferryman_huy: 'Talk to Ferryman Huy',
        mai: 'Talk to Mai',
        spc_hale: 'Talk to Hale',
        lt_pham: 'Talk to Lt. Pham',
        sgt_kiet: 'Talk to Sgt. Kiet',
      };
      this.hud.showInteract(tree[nearNpc.id] || 'Talk');
      return;
    }

    const interactable = this.world.getNearbyInteractable(pos3d);
    if (interactable && !this._getInteractableGate(interactable)) {
      this.hud.showInteract(interactable.label);
      return;
    }

    const nearItem = this.worldItems.find(i => !i.picked && i.distanceTo(pos3d) < 2.0);
    if (nearItem) {
      this.hud.showInteract('Pick up ' + (nearItem.data.label || nearItem.data.type));
      return;
    }

    this.hud.hideInteract();
  }

  // ─── Item pickup ─────────────────────────
  _checkItemPickup(playerPos) {
    const pos3d = new THREE.Vector3(playerPos.x, 0.3, playerPos.z);
    this.worldItems.forEach(item => {
      if (item.picked) return;
      if (item.distanceTo(pos3d) < 1.5) {
        item.pick();
        this.player.tryPickup(item.data);
        if (item.data.type === 'document' && item.data.label === 'Map Fragment') {
          this.rpg.completeObjective('aftershock', 'recover_map');
          this._maybeStartVillageTrust();
        }
      }
    });
  }

  _isQuestStarted(questId) {
    const q = this.rpg.quests.find(quest => quest.id === questId);
    return !!q?.started;
  }

  _refreshMissionHud() {
    if (!this.hud || !this.rpg) return;
    this.hud.updateHealth(this.rpg.health, this.rpg.maxHealth);
    this.hud.updateMorale(this.rpg.morale);
    this.hud.updateStamina(this.rpg.stamina);
    this.hud.updateXP(this.rpg.xp, this.rpg.xpToNext, this.rpg.level);
    this.hud.updateObjectives(this.rpg.getActiveObjectives());
    this.hud.updateCompanions(this.rpg.companions);
  }

  _maybeStartVillageTrust() {
    if (this._isQuestStarted('hearts_of_the_village')) return false;
    if (!this.rpg.getFlag('reached_village')) return false;
    if (!this.rpg.isObjectiveDone('aftershock', 'recover_map')) return false;
    if (!this.rpg.isObjectiveDone('aftershock', 'find_village')) return false;
    this.rpg.startQuest('hearts_of_the_village');
    this.hud.notify('Find Elder Nguyen and earn local trust.', '#27ae60');
    return true;
  }

  _notifyTrustChange(trust, delta = 0) {
    if (!this.hud || !delta) return;
    const tier = trust >= 70 ? 'TRUSTED' : trust >= 40 ? 'NEUTRAL' : 'FEARED';
    const sign = delta > 0 ? '+' : '';
    const color = delta > 0 ? '#27ae60' : '#c0392b';
    this.hud.notify('Civilian trust ' + sign + delta + ' (' + trust + '/100 - ' + tier + ')', color);
    if (trust < 40) {
      this.hud.notifyDanger('Low trust will limit local help and shape the extraction report.');
    }
  }

  _syncRegroupObjective() {
    if (!this._isQuestStarted('convoy_to_arvn')) return;
    if (this.rpg.isObjectiveDone('convoy_to_arvn', 'regroup_team')) return;
    if (!this.rpg.allRequiredCompanionsJoined()) return;
    this.rpg.completeObjective('convoy_to_arvn', 'regroup_team');
    this.hud.notify('All squadmates regrouped. Move to ARVN lines.', '#27ae60');
  }

  // ─── Zone triggers ───────────────────────
  _checkZoneTriggers(playerPos) {
    const { x, z } = playerPos;

    this._syncRegroupObjective();

    if (!this.rpg.getFlag('reached_village')) {
      const vc = LEVEL.village.center;
      if (Math.sqrt((x - vc.x) ** 2 + (z - vc.z) ** 2) < 18) {
        this.rpg.setFlag('reached_village', true);
        this.rpg.completeObjective('aftershock', 'find_village');
        if (!this._maybeStartVillageTrust()) {
          this.hud.notify('Village reached. Recover your crash-site map before asking for routes.', '#d4860a');
        }
        this.rpg.gainXP(30);
      }
    }

    if (this._isQuestStarted('rescue') && !this.rpg.getFlag('found_camp')) {
      const cc = LEVEL.vcCamp.center;
      if (Math.sqrt((x - cc.x) ** 2 + (z - cc.z) ** 2) < 25) {
        this.rpg.setFlag('found_camp', true);
        this.rpg.completeObjective('rescue', 'find_camp');
        this.hud.notifyDanger('VC camp located. Proceed carefully.');
        this.rpg.gainXP(40);
      }
    }

    if (this._isQuestStarted('medic_down') && !this.rpg.getFlag('clinic_found')) {
      const clinic = LEVEL.clinic.center;
      if (Math.sqrt((x - clinic.x) ** 2 + (z - clinic.z) ** 2) < 16) {
        this.rpg.setFlag('clinic_found', true);
        this.rpg.completeObjective('medic_down', 'locate_clinic');
        this.rpg.startQuest('field_surgery');
        this.npcMgr.revealNPC('cpl_whitaker');
        this.hud.notify('Mission clinic located. Whitaker should be nearby.', '#27ae60');
      }
    }

    if (this._isQuestStarted('medic_down') && !this.rpg.getFlag('whitaker_contacted')) {
      const whitaker = LEVEL.npcs.find(npc => npc.id === 'cpl_whitaker');
      if (whitaker && Math.sqrt((x - whitaker.x) ** 2 + (z - whitaker.z) ** 2) < 7) {
        this.rpg.setFlag('whitaker_contacted', true);
        this.rpg.completeObjective('medic_down', 'reach_whitaker');
        this.hud.notify('Whitaker found. Stabilize and regroup.', '#27ae60');
      }
    }

    if (this._isQuestStarted('silent_crossing') &&
        this.rpg.isObjectiveDone('silent_crossing', 'secure_ferry_pass') &&
        !this.rpg.getFlag('river_crossed')) {
      const crossing = LEVEL.riverCrossing.center;
      if (Math.sqrt((x - crossing.x) ** 2 + (z - crossing.z) ** 2) < 11) {
        this.rpg.setFlag('river_crossed', true);
        this.rpg.completeObjective('silent_crossing', 'cross_river');
        this.rpg.startQuest('radio_ghost');
        this.hud.notify('River crossed. Find Hale at the eastern hamlet.', '#27ae60');
      }
    }

    if (this._isQuestStarted('radio_ghost') && !this.rpg.getFlag('hale_found')) {
      const hamlet = LEVEL.hamlet.center;
      if (Math.sqrt((x - hamlet.x) ** 2 + (z - hamlet.z) ** 2) < 14) {
        this.rpg.setFlag('hale_found', true);
        this.rpg.completeObjective('radio_ghost', 'find_hale');
        this.npcMgr.revealNPC('spc_hale');
        this.hud.notify('Hale is in the hamlet. Convince him to move.', '#27ae60');
      }
    }

    if (this._isQuestStarted('convoy_to_arvn') && !this.rpg.getFlag('arvn_perimeter_reached')) {
      const outpost = LEVEL.arvnOutpost.center;
      if (Math.sqrt((x - outpost.x) ** 2 + (z - outpost.z) ** 2) < 18) {
        this.rpg.setFlag('arvn_perimeter_reached', true);
        this.rpg.completeObjective('convoy_to_arvn', 'reach_arvn');
        this.rpg.startQuest('last_checkpoint');
        this.hud.notify('ARVN perimeter reached. Clear gate protocol.', '#27ae60');
      }
    }
  }

  // ─── Extraction (win) ────────────────────
  _triggerExtraction() {
    if (this.rpg.getFlag('extraction_done')) return;
    if (!this._isQuestStarted('last_checkpoint') ||
        !this.rpg.isObjectiveDone('last_checkpoint', 'resolve_checkpoint')) {
      this.hud.notify('Checkpoint unresolved. Sgt. Kiet needs the account first.', '#c0392b');
      return;
    }
    if (this.rpg.getCompanionCount() < 2) {
      this.hud.notify('Extraction denied. Too few squadmates are accounted for.', '#c0392b');
      return;
    }
    if (!this.rpg.allRequiredCompanionsJoined()) {
      this.hud.notifyDanger('Proceeding with a missing squadmate will affect the ending.');
    }
    this.rpg.setFlag('extraction_done', true);
    this.rpg.completeObjective('last_checkpoint', 'enter_arvn');
    this.audio.playLZ();

    this.hud.notify('Gate opened. Your squad is moving into ARVN lines.', '#27ae60');
    setTimeout(() => this._showWinScreen(), 4000);
  }

  _showWinScreen() {
    this.state = 'win';
    this.player.unlock();
    this.clock.stop();

    const ending = this.rpg.getEnding();
    const endingText = {
      best: 'You reached ARVN lines with Rodriguez, Whitaker, and Hale alive. Civilians were protected, and the valley remembers your restraint.\n\n"Some men choose to return with people, not trophies." - Elder Nguyen',
      good: 'You reached ARVN lines with enough of the squad to keep moving. Not everyone trusted your methods, but the team survived the trek.',
      fail: 'You reached ARVN lines, but the regroup failed. Missing squadmates or burned trust left the mission unfinished in spirit.',
    };

    const stats = document.getElementById('win-stats');
    stats.textContent = '';
    const companionSummary = Object.entries(this.rpg.companions)
      .map(([id, joined]) => {
        const labels = { rodriguez: 'Rodriguez', cpl_whitaker: 'Whitaker', spc_hale: 'Hale' };
        return labels[id] + (joined ? ' ✓' : ' ✗');
      })
      .join('  ');
    const lines = [
      ['Enemies KIA',         this.enemyMgr.enemies.filter(e => e.state === 4).length + '/' + LEVEL.enemies.length],
      ['Squadmates regrouped', companionSummary],
      ['Civilian rescued',    this.rpg.getFlag('duc_freed') ? 'Duc ✓' : '—'],
      ['Civilian Trust',      this.rpg.civilianTrust + '/100'],
      ['Nonviolent Resolutions', this.rpg.nonviolentResolutions],
      ['Violent Resolutions', this.rpg.violentResolutions],
      ['XP Earned',           this.rpg.xp + ' + ' + (this.rpg.level - 1) * this.rpg.xpToNext],
    ];
    lines.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #2d3520';
      const key = document.createElement('span');
      key.textContent = k;
      key.style.color = '#6e7a52';
      const val = document.createElement('span');
      val.textContent = v;
      row.appendChild(key);
      row.appendChild(val);
      stats.appendChild(row);
    });

    document.getElementById('win-screen').querySelector('p').textContent = endingText[ending] || endingText.fail;
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('win-screen').classList.remove('hidden');
  }

  // ─── Death / Respawn ─────────────────────
  _onDie() {
    this.state = 'dead';
    this.player.unlock();
    this.clock.stop();
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('death-screen').classList.remove('hidden');
    this.hud.hide();
  }

  _respawn() {
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    // Restore health
    this.rpg.health  = 60;
    this.rpg.morale  = Math.max(30, this.rpg.morale - 10);
    this.hud.updateHealth(60, this.rpg.maxHealth);
    this.hud.updateMorale(this.rpg.morale);
    // Reset to crash site
    this._placePlayer(LEVEL.crashSite);
    this.hud.show();
    this.state = 'paused_lock';
    document.getElementById('lock-prompt').classList.remove('hidden');
    if (!this.clock.running) this.clock.start();
    this.hud.notifyDanger('You respawned at the crash site. Be more careful.');
  }
}

// ─── Boot ─────────────────────────────────
const game = new Game();
window.game = game;
