// ════════════════════════════════════════════
//  HUD — DOM-based heads-up display manager
// ════════════════════════════════════════════

// Helper: create element with text content
function el(tag, text, cls, style) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls)   e.className = cls;
  if (style) e.style.cssText = style;
  return e;
}

// Helper: append children to parent
function append(parent, ...children) {
  children.forEach(c => { if (c) parent.appendChild(c); });
  return parent;
}

function itemCode(item) {
  if (!item) return '---';
  const type = item.type || '';
  if (type.includes('ammo_m16')) return '5.56';
  if (type.includes('ammo_pistol')) return '.45';
  if (type.includes('medkit')) return 'MED';
  if (type.includes('document')) return 'DOC';
  if (type.includes('radio')) return 'RAD';
  if (type.includes('map')) return 'MAP';
  return (item.label || type || 'KIT').slice(0, 3).toUpperCase();
}

export class HUD {
  constructor(rpg) {
    this.rpg = rpg;
    this._hitTimeout = null;

    this._els = {
      hud:          document.getElementById('hud'),
      barHp:        document.getElementById('bar-hp'),
      barMorale:    document.getElementById('bar-morale'),
      barStam:      document.getElementById('bar-stam'),
      barXp:        document.getElementById('bar-xp'),
      valHp:        document.getElementById('val-hp'),
      valMorale:    document.getElementById('val-morale'),
      weaponName:   document.getElementById('weapon-name'),
      ammoMag:      document.getElementById('ammo-mag'),
      ammoReserve:  document.getElementById('ammo-reserve'),
      grenadeCount: document.getElementById('grenade-count'),
      objList:      document.getElementById('obj-list'),
      companionList:document.getElementById('companion-list'),
      compassRose:  document.getElementById('compass-rose'),
      interactP:    document.getElementById('interact-prompt'),
      interactLbl:  document.getElementById('interact-label'),
      hitFlash:     document.getElementById('hit-flash'),
      notifications:document.getElementById('notifications'),
      lvl:          document.getElementById('player-level'),
      sprintWarn:   document.getElementById('sprint-warning'),
      invUI:        document.getElementById('inventory-ui'),
      invGrid:      document.getElementById('inv-grid'),
      invDesc:      document.getElementById('inv-desc'),
      statsDisplay: document.getElementById('stats-display'),
      moralDisplay: document.getElementById('moral-display'),
      journalUI:    document.getElementById('journal-ui'),
      journalContent: document.getElementById('journal-content'),
    };
  }

  show() { this._els.hud.classList.remove('hidden'); }
  hide() { this._els.hud.classList.add('hidden'); }

  // ─── Health / Morale / Stamina ───────────
  updateHealth(hp, maxHp) {
    const pct = (hp / maxHp) * 100;
    this._els.barHp.style.width = pct + '%';
    this._els.valHp.textContent = Math.ceil(hp);
    this._els.barHp.style.background =
      pct > 50 ? 'linear-gradient(90deg,#c0392b,#e74c3c)' :
      pct > 25 ? 'linear-gradient(90deg,#e67e22,#f39c12)' :
                 'linear-gradient(90deg,#c0392b,#ff6b6b)';
  }

  updateMorale(morale) {
    this._els.barMorale.style.width = morale + '%';
    this._els.valMorale.textContent = Math.ceil(morale);
  }

  updateStamina(stamina) {
    this._els.barStam.style.width = stamina + '%';
    this._els.sprintWarn.classList.toggle('hidden', stamina >= 15);
  }

  updateXP(xp, xpToNext, level) {
    this._els.barXp.style.width = ((xp / xpToNext) * 100) + '%';
    this._els.lvl.textContent = level;
  }

  // ─── Weapon / Ammo ───────────────────────
  updateWeapon(name, mag, reserve, grenades) {
    this._els.weaponName.textContent = name;
    this._els.ammoMag.textContent    = mag === Infinity ? 'INF' : mag;
    this._els.ammoReserve.textContent = reserve === Infinity ? 'INF' : reserve;
    this._els.grenadeCount.textContent = grenades;
  }

  // ─── Objectives ──────────────────────────
  updateObjectives(objs) {
    const list = this._els.objList;
    list.textContent = '';
    const visible = objs.slice(0, 3);
    visible.forEach(obj => {
      const li = el('li', obj.text);
      if (obj.done) li.classList.add('done');
      if (obj.optional) {
        const s = el('span', ' [OPT]', '', 'font-size:9px;color:#4a5c3a;');
        li.appendChild(s);
      }
      list.appendChild(li);
    });
    if (objs.length > visible.length) {
      list.appendChild(el('li', '+' + (objs.length - visible.length) + ' more in journal', 'meta'));
    }
  }

  updateCompanions(companions) {
    const list = this._els.companionList;
    if (!list) return;
    list.textContent = '';
    const labels = {
      rodriguez: 'R.',
      cpl_whitaker: 'W.',
      spc_hale: 'H.',
    };
    const joined = Object.keys(labels).filter(id => companions[id]).length;
    const summary = el('li');
    append(summary, el('span', 'UNIT'), el('span', joined + '/3 ACTIVE', joined > 0 ? 'ok' : 'miss'));
    list.appendChild(summary);
    Object.keys(labels).forEach(id => {
      const li = el('li');
      const name = el('span', labels[id]);
      const status = el('span', companions[id] ? 'OK' : 'MIA', companions[id] ? 'ok' : 'miss');
      append(li, name, status);
      list.appendChild(li);
    });
  }

  // ─── Compass ─────────────────────────────
  updateCompass(yawDeg) {
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    const idx = Math.floor(((yawDeg % 360 + 360) % 360) / 45 + 0.5) % 8;
    const spans = this._els.compassRose.querySelectorAll('span');
    spans.forEach((s, i) => {
      const shifted = dirs[(i + idx) % 8];
      s.textContent = shifted;
      const isCurrent = shifted === dirs[0]; // N is always current direction ref
      // Actually highlight the center span (index 4 = center of 8)
    });
    // Simpler: just show the facing direction label
    const facing = dirs[idx];
    spans.forEach((s, i) => {
      s.textContent = dirs[(idx + i - Math.floor(spans.length / 2) + 8) % 8];
      s.style.color = i === Math.floor(spans.length / 2) ? '#d4860a' : '#6e7a52';
      s.style.fontWeight = i === Math.floor(spans.length / 2) ? 'bold' : 'normal';
    });
  }

  // ─── Interact prompt ─────────────────────
  showInteract(label) {
    this._els.interactLbl.textContent = label;
    this._els.interactP.classList.remove('hidden');
  }

  hideInteract() {
    this._els.interactP.classList.add('hidden');
  }

  // ─── Hit flash ───────────────────────────
  flashHit() {
    const f = this._els.hitFlash;
    f.style.background = 'rgba(192,57,43,0.35)';
    f.classList.add('flashing');
    clearTimeout(this._hitTimeout);
    this._hitTimeout = setTimeout(() => {
      f.classList.remove('flashing');
      f.style.background = '';
    }, 150);
  }

  flashHeal() {
    const f = this._els.hitFlash;
    f.style.background = 'rgba(39,174,96,0.25)';
    f.classList.add('flashing');
    clearTimeout(this._hitTimeout);
    this._hitTimeout = setTimeout(() => {
      f.classList.remove('flashing');
      f.style.background = '';
    }, 200);
  }

  // ─── Notifications ───────────────────────
  notify(msg, borderColor) {
    const div = el('div', msg, 'notification');
    if (borderColor) div.style.borderLeftColor = borderColor;
    this._els.notifications.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 3300);
  }

  notifyObjective(text) { this.notify('OBJ ' + text, '#3498db'); }
  notifyLevelUp(lvl)    { this.notify('LEVEL UP ' + lvl + ' | MAX HP INCREASED', '#f0a030'); }
  notifyItem(text)      { this.notify('+ ' + text, '#27ae60'); }
  notifyDanger(text)    { this.notify('DANGER ' + text, '#c0392b'); }
  notifyInfo(text)      { this.notify(text, '#d4860a'); }

  // ─── Inventory UI ────────────────────────
  isInventoryOpen() { return !this._els.invUI.classList.contains('hidden'); }
  isJournalOpen()   { return !this._els.journalUI.classList.contains('hidden'); }

  toggleInventory() {
    if (this.isInventoryOpen()) {
      this._els.invUI.classList.add('hidden');
    } else {
      this._renderInventory();
      this._els.invUI.classList.remove('hidden');
    }
  }

  closeInventory() { this._els.invUI.classList.add('hidden'); }

  _renderInventory() {
    const rpg = this.rpg;
    const grid = this._els.invGrid;
    grid.textContent = '';

    for (let i = 0; i < 12; i++) {
      const item = rpg.inventory[i];
      const slot = el('div', '', 'inv-slot' + (item ? '' : ' empty'));

      if (item) {
        const codeSpan = el('span', itemCode(item), 'slot-code');
        const nameSpan  = el('span', item.label, 'slot-name');
        const qtySpan   = item.qty ? el('span', 'x' + item.qty, 'slot-qty') : null;
        append(slot, codeSpan, nameSpan, qtySpan);

        slot.addEventListener('click', () => {
          this._els.invDesc.textContent = '';
          const title = el('strong', item.label, '', 'color:#d4860a');
          const desc  = el('p', item.desc || '', '', 'margin-top:6px');
          append(this._els.invDesc, title, desc);
          if (item.type === 'document') {
            const quote = el('em', item.text || '', '', 'color:#9ab;font-size:11px');
            this._els.invDesc.appendChild(quote);
          }
        });

        if (item.type === 'medkit') {
          const useBtn = el('button', 'USE', 'btn btn-small', 'margin-top:4px;font-size:9px;padding:2px 6px');
          useBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (rpg.useItem('medkit')) this._renderInventory();
          });
          slot.appendChild(useBtn);
        }
      }
      grid.appendChild(slot);
    }

    // Stats
    this._els.statsDisplay.textContent = '';
    const statLines = [
      ['Health',  Math.ceil(rpg.health) + ' / ' + rpg.maxHealth],
      ['Morale',  Math.ceil(rpg.morale)],
      ['Level',   rpg.level],
      ['XP',      rpg.xp + ' / ' + rpg.xpToNext],
      ['Squadmates', rpg.getCompanionCount() + ' / 3'],
    ];
    statLines.forEach(([k, v]) => {
      const row = el('div', '', 'stat-line');
      append(row, el('span', k), el('span', v));
      this._els.statsDisplay.appendChild(row);
    });

    // Hearts & Minds
    this._els.moralDisplay.textContent = '';
    const hm = rpg.civilianTrust;
    const hmLabel = hm >= 70 ? 'TRUSTED' : hm >= 40 ? 'NEUTRAL' : 'FEARED';
    const hmColor = hm >= 70 ? '#27ae60' : hm >= 40 ? '#f39c12' : '#c0392b';
    const hmRow = el('div', '', 'stat-line');
    append(hmRow, el('span', 'Score'), el('span', hm + '/100 — ' + hmLabel, '', 'color:' + hmColor));
    const hmNote = el('div',
      'How you treat civilians affects your standing. High scores unlock better outcomes.',
      '', 'font-size:11px;margin-top:8px;color:#6e7a52;line-height:1.6');
    append(this._els.moralDisplay, hmRow, hmNote);
  }

  // ─── Journal UI ──────────────────────────
  toggleJournal() {
    if (this.isJournalOpen()) {
      this._els.journalUI.classList.add('hidden');
    } else {
      this._renderJournal();
      this._els.journalUI.classList.remove('hidden');
    }
  }

  closeJournal() { this._els.journalUI.classList.add('hidden'); }

  _renderJournal() {
    const content = this._els.journalContent;
    content.textContent = '';

    let hasAny = false;
    const chapterForQuest = {
      aftershock: 'REGROUP',
      hearts_of_the_village: 'REGROUP',
      rescue: 'RECOVERY',
      medic_down: 'RECOVERY',
      field_surgery: 'RECOVERY',
      silent_crossing: 'CROSSING',
      radio_ghost: 'CROSSING',
      convoy_to_arvn: 'OUTPOST',
      last_checkpoint: 'OUTPOST',
    };
    const chapterOrder = ['REGROUP', 'RECOVERY', 'CROSSING', 'OUTPOST'];
    const grouped = {};
    chapterOrder.forEach(ch => { grouped[ch] = []; });

    this.rpg.quests.forEach(q => {
      if (!q.started) return;
      hasAny = true;
      const chapter = chapterForQuest[q.id] || 'REGROUP';
      if (!grouped[chapter]) grouped[chapter] = [];
      grouped[chapter].push(q);
    });

    chapterOrder.forEach(ch => {
      const quests = grouped[ch];
      if (!quests || quests.length === 0) return;
      content.appendChild(el('h4', ch, '', 'margin:10px 0 8px;letter-spacing:3px;color:#d4860a;font-size:12px;'));
      quests.forEach(q => {
        const div = el('div', '', 'journal-quest' + (q.completed ? ' completed' : ''));
        const titleText = q.title + (q.completed ? ' [DONE]' : '');
        append(div,
          el('h4', titleText),
          el('p', q.desc, '', 'color:#6e7a52;font-size:11px;margin-bottom:8px')
        );
        q.objectives.forEach(obj => {
          const p = el('div', obj.text, 'journal-obj' + (obj.done ? ' done' : ''));
          div.appendChild(p);
        });
        content.appendChild(div);
      });
    });

    if (!hasAny) {
      content.appendChild(el('p', 'No active missions.', '', 'color:#6e7a52;font-size:13px'));
    }

    if (this.rpg.documents.length > 0) {
      const header = el('h4', 'COLLECTED INTEL', '', 'margin-top:20px;letter-spacing:4px;color:#d4860a;font-size:13px');
      content.appendChild(header);
      this.rpg.documents.forEach(doc => {
        const docDiv = el('div', '', '', 'font-size:11px;color:#6e7a52;margin:6px 0;padding:6px;border-left:2px solid #4a5c3a');
        append(docDiv,
          el('strong', doc.label, '', 'color:#c8d4a0;display:block;margin-bottom:3px'),
          el('span', doc.text)
        );
        content.appendChild(docDiv);
      });
    }
  }
}
