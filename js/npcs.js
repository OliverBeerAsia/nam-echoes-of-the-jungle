// ════════════════════════════════════════════
//  NPCManager — NPCs and dialogue system
// ════════════════════════════════════════════
import * as THREE from 'three';
import { LEVEL, DIALOGUE } from './config.js';
import { buildHuman } from './humanoid.js';

class NPC {
  constructor(data, scene) {
    this.id       = data.id;
    this.dialogId = data.dialogId;
    this.caged    = data.caged || false;
    this.hidden   = data.hidden || false;
    this.quest    = data.quest || null;
    this.pos      = new THREE.Vector3(data.x, 0, data.z);
    this.freed    = false;
    this.mesh     = this._buildMesh();
    this.mesh.position.set(data.x, 0, data.z);
    if (this.hidden) this.mesh.visible = false;
    scene.add(this.mesh);
  }

  _groundY(terrain, x = this.pos.x, z = this.pos.z) {
    const y = terrain?.getHeightAt?.(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  alignToTerrain(terrain) {
    this.pos.y = this._groundY(terrain);
    this.mesh.position.y = this.pos.y;
  }

  _buildMesh() {
    const presets = {
      elder: {
        skin: 0x8a6548, shirt: 0xd8d0a8, pants: 0x8a8468,
        shoe: 0x4a3520, belt: null, hair: false,
        hatType: 'conical', hatColor: 0xd4b060, rifle: null,
      },
      thanh: {
        skin: 0x8a6040, shirt: 0x3a5a70, pants: 0x1c1c14,
        shoe: 0x3a2a14, belt: null, hair: 0x0c0808,
        hatType: null, rifle: null,
      },
      binh: {
        skin: 0x8a6040, shirt: 0x566b3b, pants: 0x2c311c,
        shoe: 0x3a2a14, belt: null, hair: 0x121010,
        hatType: null, rifle: null,
      },
      father_bao: {
        skin: 0x875f3f, shirt: 0xb8b08a, pants: 0x4b4634,
        shoe: 0x3a2a14, belt: null, hair: false,
        hatType: null, rifle: null,
      },
      sister_lan: {
        skin: 0x8a6040, shirt: 0x7f8f96, pants: 0x3a3a32,
        shoe: 0x2c2418, belt: null, hair: 0x120808,
        hatType: null, rifle: null,
      },
      rodriguez: {
        skin: 0x7a5035, shirt: 0x4a6035, pants: 0x4a5528,
        shoe: 0x1a1008, belt: 0x2a1a08, hair: 0x201208,
        hatType: 'boonie', hatColor: 0x4a5528, rifle: 0x3c2a10,
      },
      duc: {
        skin: 0x8a6040, shirt: 0x4a5a2c, pants: 0x3a3820,
        shoe: 0x3a2a14, belt: null, hair: 0x0c0808,
        hatType: null, rifle: null,
      },
      cpl_whitaker: {
        skin: 0xb07a58, shirt: 0x4e5f72, pants: 0x44503a,
        shoe: 0x1e140a, belt: 0x2f2110, hair: 0x2d1b10,
        hatType: null, rifle: 0x3c2a10,
      },
      ferryman_huy: {
        skin: 0x8a6040, shirt: 0x3d4f62, pants: 0x2d3420,
        shoe: 0x271b10, belt: null, hair: 0x1a1008,
        hatType: null, rifle: null,
      },
      mai: {
        skin: 0x8a6040, shirt: 0x7a4f3c, pants: 0x3f3626,
        shoe: 0x311f10, belt: null, hair: 0x0f0908,
        hatType: null, rifle: null,
      },
      spc_hale: {
        skin: 0xb07a58, shirt: 0x576a40, pants: 0x465233,
        shoe: 0x1e140a, belt: 0x2f2110, hair: 0x362216,
        hatType: 'boonie', hatColor: 0x4c5531, rifle: 0x3c2a10,
      },
      lt_pham: {
        skin: 0x8a6040, shirt: 0x5f6b4a, pants: 0x3c432a,
        shoe: 0x23190d, belt: 0x2a1a08, hair: false,
        hatType: null, rifle: 0x3c2a10,
      },
      sgt_kiet: {
        skin: 0x8a6040, shirt: 0x4f5d3f, pants: 0x3a4128,
        shoe: 0x23190d, belt: 0x2a1a08, hair: 0x140e0a,
        hatType: 'boonie', hatColor: 0x4f5d3f, rifle: 0x3c2a10,
      },
    };

    const preset = presets[this.id] || presets.duc;
    const g = buildHuman(preset);

    const indicator = new THREE.Group();
    indicator.name = 'indicator';
    indicator.position.y = 2.20;

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10),
      new THREE.MeshBasicMaterial({ color: 0xddaa00 })
    );
    indicator.add(disc);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.28, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x111108 })
    );
    bar.position.y = 0.10;
    indicator.add(bar);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x111108 })
    );
    dot.position.y = 0.46;
    indicator.add(dot);

    g.add(indicator);
    g.traverse(c => { if (c.isMesh) c.castShadow = true; });
    return g;
  }

  update() {
    const t = Date.now() * 0.001;
    this.mesh.position.y = this.pos.y + Math.sin(t * 0.8 + this.pos.x) * 0.035;
    const ind = this.mesh.getObjectByName('indicator');
    if (ind) {
      ind.position.y = 2.20 + Math.sin(t * 2.2) * 0.09;
      ind.rotation.y = t * 1.4;
    }
  }

  distanceTo(pos) {
    const dx = this.pos.x - pos.x;
    const dz = this.pos.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  reveal() {
    this.freed = true;
    this.hidden = false;
    this.mesh.visible = true;
  }
}

const PORTRAIT_CODES = {
  elder: 'EL',
  thanh: 'TH',
  binh: 'BI',
  father_bao: 'BA',
  sister_lan: 'LA',
  rodriguez: 'RG',
  duc: 'DU',
  cpl_whitaker: 'WK',
  ferryman_huy: 'HU',
  mai: 'MA',
  spc_hale: 'HA',
  lt_pham: 'PH',
  sgt_kiet: 'KT',
};

function portraitCode(npcId, name) {
  if (PORTRAIT_CODES[npcId]) return PORTRAIT_CODES[npcId];
  return String(name || 'NPC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

class DialogueUI {
  constructor() {
    this._ui       = document.getElementById('dialogue-ui');
    this._portrait = document.getElementById('dlg-portrait');
    this._name     = document.getElementById('dlg-name');
    this._text     = document.getElementById('dlg-text');
    this._choices  = document.getElementById('dlg-choices');
    this.active    = false;
    this._onChoice = null;
  }

  show(npcId, nodeKey, onChoice) {
    const tree = DIALOGUE[npcId];
    if (!tree) return;
    const node = tree.nodes[nodeKey];
    if (!node) return;

    this._onChoice = onChoice;
    this._portrait.textContent = portraitCode(npcId, tree.name);
    this._name.textContent = tree.name;
    this._text.textContent = node.text;

    this._choices.textContent = '';
    node.choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.className = 'dlg-choice';
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        if (this._onChoice) this._onChoice(choice, idx);
      });
      this._choices.appendChild(btn);
    });

    if (node.choices.length === 0) {
      const btn = document.createElement('button');
      btn.className = 'dlg-choice';
      btn.textContent = '[Continue]';
      btn.addEventListener('click', () => {
        if (this._onChoice) this._onChoice({ go: null }, -1);
      });
      this._choices.appendChild(btn);
    }

    this._ui.classList.remove('hidden');
    this.active = true;
  }

  hide() {
    this._ui.classList.add('hidden');
    this.active = false;
    this._onChoice = null;
  }
}

export class NPCManager {
  constructor(scene, rpg, hud, audio) {
    this.scene = scene;
    this.rpg = rpg;
    this.hud = hud;
    this.audio = audio;
    this.npcs = [];
    this.dialogUI = new DialogueUI();
    this._activeNpc = null;
    this._nodeKey = 'root';
    this.onDialogueEnd = null;
  }

  spawn(terrain = null) {
    LEVEL.npcs.forEach(data => {
      const npc = new NPC(data, this.scene);
      npc.alignToTerrain(terrain);
      this.npcs.push(npc);
    });
  }

  update() {
    this.npcs.forEach(npc => { if (npc.mesh.visible) npc.update(); });
  }

  getNPC(id) {
    return this.npcs.find(npc => npc.id === id);
  }

  getNearby(playerPos, range = 3.5) {
    let best = null;
    let bestDist = range;
    for (const npc of this.npcs) {
      if (npc.hidden && !npc.freed) continue;
      const d = npc.distanceTo(playerPos);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  }

  startDialogue(npc) {
    this._activeNpc = npc;
    this._nodeKey = this._getStartNode(npc);
    this.dialogUI.show(npc.dialogId, this._nodeKey, choice => this._handleChoice(choice));
  }

  _getStartNode(npc) {
    switch (npc.id) {
      case 'rodriguez':
        return (this.rpg.getFlag('rodriguez_freed') || this.rpg.isCompanionJoined('rodriguez')) ? 'freed' : 'caged';
      case 'duc':
        return this.rpg.getFlag('duc_freed') ? 'freed' : 'root';
      case 'cpl_whitaker':
        if (this.rpg.isCompanionJoined('cpl_whitaker')) return 'joined';
        if (this.rpg.getFlag('field_kit')) return 'stable';
        return 'wounded';
      case 'spc_hale':
        if (this.rpg.isCompanionJoined('spc_hale')) return 'joined';
        if (this.rpg.getFlag('convoy_protected')) return 'ready';
        return 'root';
      case 'sgt_kiet':
        return this.rpg.getFlag('checkpoint_resolved') ? 'resolved' : 'root';
      default:
        return 'root';
    }
  }

  _handleChoice(choice) {
    if (choice.flag) {
      this.rpg.setFlag(choice.flag, true);
    }

    if (choice.completesObjective) {
      const questId = choice.questId || 'hearts_of_the_village';
      this.rpg.completeObjective(questId, choice.completesObjective);
    }

    if (choice.action) this._runAction(choice.action);
    if (Array.isArray(choice.actions)) {
      choice.actions.forEach(action => this._runAction(action));
    }

    if (choice.go === null || !DIALOGUE[this._activeNpc?.dialogId]) {
      this.dialogUI.hide();
      if (this.onDialogueEnd) this.onDialogueEnd(this._activeNpc);
      this._activeNpc = null;
      return;
    }

    this._nodeKey = choice.go;
    this.dialogUI.show(this._activeNpc.dialogId, this._nodeKey, c => this._handleChoice(c));
  }

  _runAction(action) {
    if (!action || typeof action !== 'string') return;

    // Backward compatibility with old action names.
    if (action === 'free_pow') {
      this._runAction('setFlag:rodriguez_freed');
      this._runAction('joinCompanion:rodriguez');
      this._runAction('completeObjective:rescue:free_pow');
      this._runAction('startQuest:medic_down');
      return;
    }
    if (action === 'free_duc') {
      this._runAction('setFlag:duc_freed');
      this._runAction('completeObjective:hearts_of_the_village:help_thanh');
      return;
    }

    const [kind, ...parts] = action.split(':');
    switch (kind) {
      case 'startQuest': {
        const questId = parts[0];
        this.rpg.startQuest(questId);
        return;
      }
      case 'completeObjective': {
        const questId = parts[0];
        const objectiveId = parts[1];
        this.rpg.completeObjective(questId, objectiveId);
        return;
      }
      case 'setFlag': {
        const flag = parts[0];
        this.rpg.setFlag(flag, true);
        return;
      }
      case 'adjustTrust': {
        const delta = Number(parts[0] || 0);
        this.rpg.adjustHeartsAndMinds(delta);
        return;
      }
      case 'resolution': {
        this.rpg.recordResolution(parts[0]);
        return;
      }
      case 'joinCompanion': {
        const companionId = parts[0];
        this.rpg.setCompanionStatus(companionId, true);
        if (companionId === 'rodriguez') this.rpg.setFlag('rodriguez_freed', true);
        if (companionId === 'cpl_whitaker') this.rpg.setFlag('whitaker_joined', true);
        if (companionId === 'spc_hale') this.rpg.setFlag('hale_joined', true);
        const npc = this.getNPC(companionId);
        if (npc) npc.reveal();
        const nameMap = {
          rodriguez: 'Rodriguez regrouped.',
          cpl_whitaker: 'Whitaker stabilized and moving.',
          spc_hale: 'Hale is back on comms.',
        };
        if (nameMap[companionId]) this.hud.notify(nameMap[companionId], '#27ae60');
        return;
      }
      case 'revealNpc': {
        const npcId = parts[0];
        this.revealNPC(npcId);
        return;
      }
      case 'xp': {
        const amount = Number(parts[0] || 0);
        this.rpg.gainXP(amount);
        return;
      }
      case 'notify': {
        const msg = parts.join(':');
        if (msg) this.hud.notify(msg, '#d4860a');
        return;
      }
    }
  }

  revealNPC(id) {
    const npc = this.getNPC(id);
    if (npc) npc.reveal();
  }

  isDialogueActive() {
    return this.dialogUI.active;
  }

  interactWithCage() {
    const rodriguez = this.getNPC('rodriguez');
    if (!rodriguez) return;
    if (this.rpg.getFlag('rodriguez_freed')) {
      this.hud.notify('Rodriguez is with you.', '#d4860a');
    } else {
      this.startDialogue(rodriguez);
    }
  }
}
