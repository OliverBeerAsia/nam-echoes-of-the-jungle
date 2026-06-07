// ════════════════════════════════════════════
//  RPGSystem — Stats, Inventory, Quests, XP
// ════════════════════════════════════════════
import { QUESTS } from './config.js';

export class RPGSystem {
  constructor() {
    this.health    = 100;
    this.maxHealth = 100;
    this.morale    = 80;
    this.stamina   = 100;
    this.xp        = 0;
    this.level     = 1;
    this.xpToNext  = 200;

    // Keep legacy field name for compatibility while introducing explicit trust semantics.
    this.civilianTrust  = 50;
    this.heartsAndMinds = this.civilianTrust;

    this.nonviolentResolutions = 0;
    this.violentResolutions    = 0;

    this.companions = {
      rodriguez: false,
      cpl_whitaker: false,
      spc_hale: false,
    };

    this.quests    = JSON.parse(JSON.stringify(QUESTS)); // deep copy
    this.flags     = {};   // story flags
    this.inventory = [];   // { type, qty, label, desc, emoji }
    this.documents = [];   // read intel

    this.listeners = {};   // event -> [fn]

    this._initInventory();
  }

  _initInventory() {
    this.inventory.push({ type:'ammo_m16', qty:30, label:'M16 Ammo', emoji:'🔴', desc:'5.56mm rounds for the M16A1.' });
    this.inventory.push({ type:'ammo_pistol', qty:14, label:'Pistol Ammo', emoji:'🟡', desc:'.45 ACP rounds for the M1911.' });
  }

  // ─── Health ───────────────────────────────
  takeDamage(amount) {
    const actual = Math.min(amount, this.health);
    this.health = Math.max(0, this.health - amount);
    this.morale = Math.max(0, this.morale - Math.floor(amount * 0.2));
    this.emit('healthChanged', this.health);
    if (this.health <= 0) this.emit('died');
    return actual;
  }

  heal(amount) {
    const prev = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.emit('healthChanged', this.health);
    return this.health - prev;
  }

  // ─── Stamina ──────────────────────────────
  drainStamina(dt, sprinting) {
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 18);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 12);
    }
    this.emit('staminaChanged', this.stamina);
    return this.stamina > 0;
  }

  // ─── XP & Leveling ────────────────────────
  gainXP(amount) {
    this.xp += amount;
    this.emit('xpChanged', this.xp, this.xpToNext);
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(this.xpToNext * 1.6);
      this.maxHealth = Math.min(150, this.maxHealth + 10);
      this.health = this.maxHealth;
      this.emit('levelUp', this.level);
    }
  }

  // ─── Inventory ────────────────────────────
  addItem(item) {
    const existing = this.inventory.find(i => i.type === item.type);
    if (existing) {
      existing.qty = (existing.qty || 1) + (item.qty || 1);
    } else {
      this.inventory.push({ ...item });
    }
    this.emit('inventoryChanged');
  }

  removeItem(type, qty = 1) {
    const idx = this.inventory.findIndex(i => i.type === type);
    if (idx === -1) return false;
    this.inventory[idx].qty -= qty;
    if (this.inventory[idx].qty <= 0) this.inventory.splice(idx, 1);
    this.emit('inventoryChanged');
    return true;
  }

  hasItem(type) {
    return this.inventory.some(i => i.type === type);
  }

  getItemQty(type) {
    const item = this.inventory.find(i => i.type === type);
    return item ? (item.qty || 1) : 0;
  }

  useItem(type) {
    if (!this.hasItem(type)) return false;
    if (type === 'medkit') {
      const healed = this.heal(40);
      this.removeItem('medkit', 1);
      this.emit('notification', `Healed ${healed} HP`);
      return true;
    }
    return false;
  }

  // ─── Quest system ─────────────────────────
  startQuest(questId) {
    const q = this.quests.find(quest => quest.id === questId);
    if (!q || q.started) return;
    q.started = true;
    this.emit('questStarted', q);
    this.emit('notification', `NEW OBJECTIVE: ${q.title}`);
  }

  completeObjective(questId, objId) {
    const q = this.quests.find(quest => quest.id === questId);
    if (!q) return;
    const obj = q.objectives.find(objective => objective.id === objId);
    if (!obj || obj.done) return;
    obj.done = true;
    this.emit('objectiveCompleted', q, obj);
    this.emit('notification', `✓ ${obj.text}`);

    const required = q.objectives.filter(objective => !objective.optional);
    if (required.every(objective => objective.done)) {
      this._completeQuest(q);
    }
  }

  _completeQuest(q) {
    if (q.completed) return;
    q.completed = true;
    const xpReward = {
      aftershock: 120,
      hearts_of_the_village: 170,
      rescue: 240,
      medic_down: 180,
      field_surgery: 190,
      silent_crossing: 210,
      radio_ghost: 220,
      convoy_to_arvn: 300,
      last_checkpoint: 420,
    }[q.id] || 120;
    this.gainXP(xpReward);
    this.morale = Math.min(100, this.morale + 12);
    this.emit('questCompleted', q);
    this.emit('notification', `MISSION COMPLETE: ${q.title}`);
  }

  isObjectiveDone(questId, objId) {
    const q = this.quests.find(quest => quest.id === questId);
    if (!q) return false;
    const obj = q.objectives.find(objective => objective.id === objId);
    return obj ? obj.done : false;
  }

  getActiveObjectives() {
    const out = [];
    for (const q of this.quests) {
      if (!q.started || q.completed) continue;
      for (const obj of q.objectives) {
        if (!obj.done) out.push({ quest: q.title, text: obj.text, optional: obj.optional });
      }
    }
    return out.slice(0, 6);
  }

  // ─── Story flags ──────────────────────────
  setFlag(name, value = true) {
    this.flags[name] = value;
    this.emit('flagSet', name, value);
  }

  getFlag(name) {
    return this.flags[name];
  }

  adjustHeartsAndMinds(delta) {
    const before = this.civilianTrust;
    this.civilianTrust = Math.max(0, Math.min(100, this.civilianTrust + delta));
    this.heartsAndMinds = this.civilianTrust;
    const actualDelta = this.civilianTrust - before;
    this.emit('trustChanged', this.civilianTrust, actualDelta);
    return actualDelta;
  }

  recordResolution(type) {
    if (type === 'nonviolent') this.nonviolentResolutions++;
    if (type === 'violent') this.violentResolutions++;
    this.emit('resolutionChanged', type, this.nonviolentResolutions, this.violentResolutions);
  }

  setCompanionStatus(id, joined = true) {
    if (!(id in this.companions)) return;
    this.companions[id] = joined;
    this.emit('companionsChanged', this.companions);
  }

  isCompanionJoined(id) {
    return !!this.companions[id];
  }

  getCompanionCount() {
    return Object.values(this.companions).filter(Boolean).length;
  }

  allRequiredCompanionsJoined() {
    return this.companions.rodriguez &&
           this.companions.cpl_whitaker &&
           this.companions.spc_hale;
  }

  getEnding() {
    const joined = this.getCompanionCount();
    const trust = this.civilianTrust;
    const nonviolent = this.nonviolentResolutions;

    if (joined >= 3 && trust >= 70 && nonviolent >= 2) return 'best';
    if (joined >= 2 && trust >= 40) return 'good';
    return 'fail';
  }

  // ─── Events ───────────────────────────────
  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  emit(event, ...args) {
    (this.listeners[event] || []).forEach(fn => fn(...args));
  }
}
