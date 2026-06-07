// ════════════════════════════════════════════
//  EnemyManager — Patrol / Alert / Attack AI
// ════════════════════════════════════════════
import * as THREE from 'three';
import { CONFIG, LEVEL } from './config.js';
import { buildHuman } from './humanoid.js';

const STATES = { PATROL:0, ALERT:1, CHASE:2, ATTACK:3, DEAD:4 };

class Enemy {
  constructor(data, scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.state = STATES.PATROL;
    this.health = CONFIG.ENEMY.health;
    this.pos = new THREE.Vector3(data.x, 0, data.z);
    this.dir = new THREE.Vector3(0, 0, -1);
    this.patrol = data.patrol ? data.patrol.map(p => new THREE.Vector3(p[0], 0, p[1])) : null;
    this.patrolIdx = 0;
    this.stationary = data.stationary || false;
    this.camp = data.camp || false;

    // Timers
    this.alertTimer   = 0;
    this.shootTimer   = 0;
    this.lostTimer    = 0;
    this.deadTimer    = 0;
    this.stuckTimer   = 0;

    this.lastPos = this.pos.clone();
    this.id = Math.random().toString(36).slice(2);
    this.mesh = this._buildMesh();
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = 0;
    scene.add(this.mesh);
  }

  _groundY(terrain, x = this.pos.x, z = this.pos.z) {
    const y = terrain?.getHeightAt?.(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  _buildMesh() {
    // Slight appearance variation per enemy for visual variety
    const variants = [
      { shirt: 0x1a2018, pants: 0x1a2018 }, // black pajamas
      { shirt: 0x263020, pants: 0x263020 }, // dark green
      { shirt: 0x1c1c14, pants: 0x1c1c14 }, // near-black
    ];
    const v = variants[Math.floor(Math.random() * variants.length)];

    const g = buildHuman({
      skin:     0x8a6040,
      shirt:    v.shirt,
      pants:    v.pants,
      shoe:     0x1a1008,
      belt:     0x3a2810,
      hair:     0x0c0808, // hidden under helmet
      hatType:  'pith',
      hatColor: 0x3a5020,
      rifle:    0x2a1808,  // dark wood AK stock
    });

    // Alert indicator (exclamation / eye icon) hidden by default
    const alertGrp = new THREE.Group();
    alertGrp.name = 'alert';
    alertGrp.position.y = 2.15;
    alertGrp.visible = false;

    const alertDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.035, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3300 })
    );
    alertGrp.add(alertDisc);

    const alertBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.25, 0.065),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    alertBar.position.y = 0.09;
    alertGrp.add(alertBar);

    const alertDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    alertDot.position.y = 0.41;
    alertGrp.add(alertDot);

    g.add(alertGrp);
    g.traverse(c => { if (c.isMesh) c.castShadow = true; });
    return g;
  }

  // Called by EnemyManager with the player world position
  update(dt, playerPos, worldColliders, terrain = null) {
    if (this.state === STATES.DEAD) {
      this.deadTimer -= dt;
      return;
    }

    const distToPlayer = this.pos.distanceTo(playerPos);
    const canSee = this._canSeePlayer(playerPos, distToPlayer);

    // Update state machine
    switch (this.state) {
      case STATES.PATROL: {
        if (canSee) {
          this._setAlert();
        } else if (this._canHearPlayer(playerPos, distToPlayer)) {
          this.state = STATES.ALERT;
          this.alertTimer = 6;
        } else {
          this._patrol(dt, worldColliders, terrain);
        }
        break;
      }
      case STATES.ALERT: {
        this.alertTimer -= dt;
        if (canSee) {
          this.state = STATES.CHASE;
          this.lostTimer = 0;
        } else if (this.alertTimer <= 0) {
          this.state = STATES.PATROL;
        }
        break;
      }
      case STATES.CHASE: {
        if (canSee) {
          this.lostTimer = 0;
          if (distToPlayer < CONFIG.ENEMY.attackRange) {
            this.state = STATES.ATTACK;
          } else {
            this._moveToward(playerPos, CONFIG.ENEMY.speed, dt, worldColliders, terrain);
          }
        } else {
          this.lostTimer += dt;
          if (this.lostTimer > 5) this.state = STATES.ALERT;
          else this._moveToward(playerPos, CONFIG.ENEMY.speed * 0.7, dt, worldColliders, terrain);
        }
        break;
      }
      case STATES.ATTACK: {
        if (!canSee) {
          this.state = STATES.CHASE;
          break;
        }
        if (distToPlayer > CONFIG.ENEMY.attackRange + 4) {
          this.state = STATES.CHASE;
          break;
        }
        // Face player
        this._faceTarget(playerPos);
        // Shoot
        this.shootTimer -= dt;
        break; // shooting is handled externally via shouldShoot()
      }
    }

    // Update visual
    this.pos.y = this._groundY(terrain);
    this.mesh.position.copy(this.pos);
    const alertMesh = this.mesh.getObjectByName('alert');
    if (alertMesh) alertMesh.visible = this.state === STATES.ALERT || this.state === STATES.CHASE;

    // Cycle leg animation (bob)
    if (this.state === STATES.PATROL || this.state === STATES.CHASE) {
      this.mesh.position.y = this.pos.y + Math.abs(Math.sin(Date.now() * 0.008)) * 0.05;
    }
  }

  shouldShoot(dt) {
    if (this.state !== STATES.ATTACK) return false;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = CONFIG.ENEMY.shootRate + (Math.random() * 0.8 - 0.4);
      return true;
    }
    return false;
  }

  _setAlert() {
    this.state = STATES.CHASE;
  }

  _canSeePlayer(playerPos, dist) {
    if (dist > CONFIG.ENEMY.sightRange) return false;
    const toPlayer = playerPos.clone().sub(this.pos).normalize();
    const dot = this.dir.dot(toPlayer);
    return dot > Math.cos(CONFIG.ENEMY.sightAngle / 2);
  }

  _canHearPlayer(playerPos, dist) {
    return dist < CONFIG.ENEMY.hearRange;
  }

  _patrol(dt, colliders, terrain) {
    if (this.stationary || !this.patrol) {
      // Just rotate slowly
      this.mesh.rotation.y += dt * 0.5;
      return;
    }
    const target = this.patrol[this.patrolIdx];
    const dist = this.pos.distanceTo(target);
    if (dist < 1.0) {
      this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
      return;
    }
    this._moveToward(target, CONFIG.ENEMY.patrolSpeed, dt, colliders, terrain);
  }

  _moveToward(target, speed, dt, colliders, terrain) {
    const toTarget = target.clone().sub(this.pos);
    toTarget.y = 0;
    const dist = toTarget.length();
    if (dist < 0.1) return;
    toTarget.normalize();

    this.dir.copy(toTarget);
    this._faceDir(toTarget);

    const step = toTarget.multiplyScalar(speed * dt);
    const newPos = this.pos.clone().add(step);
    newPos.y = this._groundY(terrain, newPos.x, newPos.z);

    // Simple collision check
    let blocked = false;
    if (colliders) {
      for (const c of colliders) {
        const dx = newPos.x - c.x, dz = newPos.z - c.z;
        const d = Math.sqrt(dx*dx + dz*dz);
        if (d < c.radius + 0.35) { blocked = true; break; }
      }
    }
    if (!blocked) this.pos.copy(newPos);
    else {
      // Try sliding
      const slideX = new THREE.Vector3(step.x, 0, 0);
      const slideZ = new THREE.Vector3(0, 0, step.z);
      [slideX, slideZ].forEach(slide => {
        const tryPos = this.pos.clone().add(slide);
        let ok = true;
        if (colliders) {
          for (const c of colliders) {
            const dx = tryPos.x - c.x, dz = tryPos.z - c.z;
            if (Math.sqrt(dx*dx + dz*dz) < c.radius + 0.35) { ok = false; break; }
          }
        }
        if (ok) this.pos.copy(tryPos);
      });
    }

    this.pos.y = this._groundY(terrain);
  }

  _faceTarget(target) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  _faceDir(dir) {
    this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) this._die();
    else {
      // Always alert when shot
      if (this.state === STATES.PATROL || this.state === STATES.ALERT) {
        this.state = STATES.CHASE;
      }
    }
    return this.health <= 0;
  }

  _die() {
    this.state = STATES.DEAD;
    this.deadTimer = 8; // seconds before removal
    // Slump mesh
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = this.pos.y - 0.3;
    const alertMesh = this.mesh.getObjectByName('alert');
    if (alertMesh) alertMesh.visible = false;
  }

  isDeadAndExpired() {
    return this.state === STATES.DEAD && this.deadTimer <= 0;
  }

  getShootOrigin() {
    return new THREE.Vector3(
      this.pos.x + this.dir.x * 0.4,
      this.pos.y + 1.1,
      this.pos.z + this.dir.z * 0.4
    );
  }
}

// ─── Manager ─────────────────────────────────
export class EnemyManager {
  constructor(scene, audio, rpg) {
    this.scene = scene;
    this.audio = audio;
    this.rpg   = rpg;
    this.enemies = [];
    this.onPlayerHit = null; // callback(damage)
    this.alertedAll = false;
  }

  spawn(terrain = null) {
    LEVEL.enemies.forEach(data => {
      const enemy = new Enemy(data, this.scene, this.audio);
      enemy.pos.y = enemy._groundY(terrain);
      enemy.mesh.position.y = enemy.pos.y;
      this.enemies.push(enemy);
    });
  }

  update(dt, playerPos, worldColliders, terrain = null, controls) {
    const toRemove = [];
    for (const e of this.enemies) {
      if (e.state !== STATES.DEAD) {
        e.update(dt, playerPos, worldColliders, terrain);

        // Shoot at player
        if (e.shouldShoot(dt)) {
          this._enemyShoot(e, playerPos);
        }
      } else {
        e.update(dt, playerPos, worldColliders, terrain);
      }

      if (e.isDeadAndExpired()) toRemove.push(e);
    }

    // Remove expired corpses
    toRemove.forEach(e => {
      this.scene.remove(e.mesh);
      this.enemies.splice(this.enemies.indexOf(e), 1);
    });

    // Alert all camp enemies if camp enemy is alerted
    if (!this.alertedAll) {
      const campAlerted = this.enemies.some(e =>
        e.camp && (e.state === STATES.CHASE || e.state === STATES.ATTACK)
      );
      if (campAlerted) {
        this.alertedAll = true;
        this.enemies.forEach(e => {
          if (e.camp && e.state === STATES.PATROL) e.state = STATES.ALERT;
        });
        this.rpg.emit('notification', '⚠ CAMP ALERTED — Enemies converging!');
      }
    }
  }

  _enemyShoot(enemy, playerPos) {
    this.audio.playShoot('pistol'); // enemies use pistols (different sound)

    // Accuracy check — hit within 20% chance per shot, scaled by distance
    const dist = enemy.pos.distanceTo(playerPos);
    const baseHitChance = Math.max(0.05, 0.35 - dist * 0.012);
    if (Math.random() < baseHitChance) {
      const dmg = CONFIG.ENEMY.damage + Math.floor(Math.random() * 5);
      if (this.onPlayerHit) this.onPlayerHit(dmg);
    }
  }

  // Raycast-based hit detection (called by player's shoot)
  checkBulletHit(raycaster) {
    const meshes = this.enemies
      .filter(e => e.state !== STATES.DEAD)
      .map(e => e.mesh);

    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;

    const hitMesh = hits[0].object;
    // Find the enemy whose mesh contains this object
    for (const e of this.enemies) {
      if (e.mesh === hitMesh || e.mesh.getObjectById(hitMesh.id)) {
        return e;
      }
    }
    // Fallback: check parent chain
    let obj = hitMesh;
    while (obj.parent) {
      for (const e of this.enemies) {
        if (e.mesh === obj.parent) return e;
      }
      obj = obj.parent;
    }
    return null;
  }

  hitEnemy(enemy, damage) {
    const killed = enemy.takeDamage(damage);
    if (killed) {
      this.rpg.gainXP(25);
      this.rpg.adjustHeartsAndMinds(-2);
      return true;
    }
    return false;
  }

  getLivingCount() {
    return this.enemies.filter(e => e.state !== STATES.DEAD).length;
  }

  areAllCampGuardsDead() {
    return this.enemies.filter(e => e.camp).every(e => e.state === STATES.DEAD);
  }
}
