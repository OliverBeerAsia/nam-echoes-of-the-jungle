// ═══════════════════════════════════════════
//  CONFIG — Constants, Quest Data, Dialogue
// ═══════════════════════════════════════════

export const CONFIG = {
  PLAYER_HEIGHT:        1.75,
  PLAYER_CROUCH_HEIGHT: 1.1,
  PLAYER_RADIUS:        0.4,
  PLAYER_SPEED:         5.0,
  SPRINT_SPEED:         9.5,
  CROUCH_SPEED:         2.5,
  JUMP_FORCE:           8.0,
  GRAVITY:             -22.0,

  WEAPONS: {
    m16:    { name:'M16A1',       damage:35, rate:0.09, range:110, magSize:30, reserve:120, auto:true,  spread:0.022, reloadTime:2.4 },
    pistol: { name:'M1911',       damage:28, rate:0.55, range:55,  magSize:7,  reserve:35,  auto:false, spread:0.058, reloadTime:1.6 },
    grenade:{ name:'M67 Grenade', damage:95, radius:9,  cookTime:4.0, count:3 },
    knife:  { name:'Knife',       damage:60, range:2.2, rate:0.9,  auto:false },
  },

  ENEMY: {
    health:      70,
    speed:       2.8,
    patrolSpeed: 1.4,
    sightRange:  26,
    sightAngle:  0.65 * Math.PI,
    attackRange: 20,
    damage:      7,
    shootRate:   2.2,
    hearRange:   14,
  },

  FOV:          80,
  FOG_COLOR:    0x6c7365,
  FOG_DENSITY:  0.0035,
  SUN_COLOR:    0xffa857,
  WORLD_SIZE:   800,
  INTERACT_RANGE: 3.2,
};

// ─── Quest definitions ─────────────────────
export const QUESTS = [
  {
    id: 'aftershock',
    title: 'Aftershock',
    desc: 'Recover your bearings after the crash and reach the village alive.',
    objectives: [
      { id: 'recover_map', text: 'Recover your map fragment from the crash site', done: false },
      { id: 'find_village', text: 'Reach the nearby village', done: false },
    ],
  },
  {
    id: 'hearts_of_the_village',
    title: 'Hearts of the Village',
    desc: 'Earn Elder Nguyen\'s confidence before chasing squad rumors through the valley.',
    objectives: [
      { id: 'talk_elder', text: 'Speak with Elder Nguyen', done: false },
      { id: 'secure_local_trust', text: 'Earn a local trust lead', done: false },
      { id: 'help_thanh', text: '[Optional] Help Thanh reunite with Duc', done: false, optional: true },
    ],
  },
  {
    id: 'rescue',
    title: 'Leave No One Behind',
    desc: 'Locate the VC camp and rescue Pvt. Rodriguez.',
    objectives: [
      { id: 'find_camp', text: 'Locate the VC camp', done: false },
      { id: 'kill_radio', text: '[Optional] Destroy the radio tower', done: false, optional: true },
      { id: 'free_pow', text: 'Rescue Pvt. Rodriguez', done: false },
    ],
  },
  {
    id: 'medic_down',
    title: 'Medic Down',
    desc: 'Track down Cpl. Whitaker near the abandoned mission clinic.',
    objectives: [
      { id: 'locate_clinic', text: 'Locate the mission clinic', done: false },
      { id: 'reach_whitaker', text: 'Reach Cpl. Whitaker', done: false },
    ],
  },
  {
    id: 'field_surgery',
    title: 'Field Surgery',
    desc: 'Get medical supplies and stabilize Whitaker for movement.',
    objectives: [
      { id: 'obtain_field_kit', text: 'Obtain a field treatment kit', done: false },
      { id: 'stabilize_whitaker', text: 'Stabilize Whitaker for travel', done: false },
    ],
  },
  {
    id: 'silent_crossing',
    title: 'Silent Crossing',
    desc: 'Secure a river crossing route for the regrouped squad.',
    objectives: [
      { id: 'secure_ferry_pass', text: 'Secure passage at the ferry crossing', done: false },
      { id: 'cross_river', text: 'Cross the river corridor', done: false },
    ],
  },
  {
    id: 'radio_ghost',
    title: 'Radio Ghost',
    desc: 'Find Specialist Hale and convince him to rejoin the team.',
    objectives: [
      { id: 'find_hale', text: 'Find Specialist Hale near the river hamlet', done: false },
      { id: 'convince_hale', text: 'Convince Hale to move with the squad', done: false },
    ],
  },
  {
    id: 'convoy_to_arvn',
    title: 'Convoy to ARVN',
    desc: 'Move enough of the regrouped squad through hostile territory to ARVN lines.',
    objectives: [
      { id: 'regroup_team', text: 'Regroup at least two squadmates (all three for best outcome)', done: false },
      { id: 'reach_arvn', text: 'Reach the ARVN perimeter', done: false },
    ],
  },
  {
    id: 'last_checkpoint',
    title: 'Last Checkpoint',
    desc: 'Clear final checkpoint protocol and enter the ARVN outpost.',
    objectives: [
      { id: 'resolve_checkpoint', text: 'Resolve gate protocol with Sgt. Kiet', done: false },
      { id: 'enter_arvn', text: 'Enter the ARVN outpost', done: false },
    ],
  },
];

// ─── Dialogue trees ────────────────────────
export const DIALOGUE = {
  elder: {
    id: 'elder',
    name: 'Elder Nguyen Van Tho',
    portrait: '👴',
    nodes: {
      root: {
        text: 'You survived the crash. Many do not. Sit, soldier. Speak clearly, and perhaps this village can help.',
        choices: [
          { label: 'Any word of my squad?', go: 'survivors' },
          { label: 'I need the village to trust me.', go: 'trust' },
          { label: 'Where is the VC camp?', go: 'camp' },
        ],
      },
      survivors: {
        text: 'There are rumors: one American in a cage, one wounded near the old clinic, one radio man east. Rumors become routes only after trust.',
        choices: [
          {
            label: 'Then I earn that trust first.',
            go: 'end',
            actions: [
              'setFlag:talked_elder',
              'completeObjective:hearts_of_the_village:talk_elder',
              'notify:Elder Nguyen wants proof before he marks a route.',
            ],
          },
        ],
      },
      trust: {
        text: 'Trust is earned here, not demanded. Talk to Thanh or Binh. Help one family, or calm one fear, and ten will remember.',
        choices: [
          {
            label: 'I understand.',
            go: 'end',
            actions: [
              'setFlag:talked_elder',
              'completeObjective:hearts_of_the_village:talk_elder',
              'notify:Earn one local trust lead before pursuing the camp.',
            ],
          },
        ],
      },
      camp: {
        text: 'Northwest path, beyond the ridge and wire. I can mark the safer approach, but first my people need to know you will not bring fire here.',
        choices: [
          {
            label: 'Point me to someone I can help.',
            go: 'end',
            actions: [
              'setFlag:talked_elder',
              'completeObjective:hearts_of_the_village:talk_elder',
              'notify:Thanh and Binh can tell you what the village needs.',
            ],
          },
        ],
      },
      end: {
        text: 'Go carefully. Bring your men back, and do not make enemies of everyone in this valley.',
        choices: [],
      },
    },
  },

  thanh: {
    id: 'thanh',
    name: 'Thanh',
    portrait: '👩',
    nodes: {
      root: {
        text: 'The jungle carries sound. You move like a storm, soldier. If you want help, you pay in trust.',
        choices: [
          { label: 'Help me reach the camp unseen.', go: 'deal' },
          { label: 'Tell me about your brother Duc.', go: 'duc' },
        ],
      },
      deal: {
        text: 'The tunnels can take you around their patrols. Bring my brother Duc back, and I will mark a safe route for you.',
        choices: [
          {
            label: "Deal. I'll find Duc.",
            go: 'route',
            actions: ['setFlag:find_duc', 'revealNpc:duc'],
          },
          { label: "I can't promise that.", go: 'cold' },
        ],
      },
      duc: {
        text: 'He is young and stubborn. They grabbed him near the storage huts at the camp. If he still breathes, he will be there.',
        choices: [
          {
            label: 'I will look for him.',
            go: 'route',
            actions: ['setFlag:find_duc', 'revealNpc:duc'],
          },
        ],
      },
      route: {
        text: 'Take the narrow gully northeast of the market, then cut west at the three palms. Less noise, fewer rifles.',
        choices: [
          {
            label: 'Understood.',
            go: null,
            actions: [
              'setFlag:tunnel_access',
              'completeObjective:hearts_of_the_village:secure_local_trust',
              'resolution:nonviolent',
              'adjustTrust:6',
            ],
          },
        ],
      },
      cold: {
        text: 'Then do not expect my people to risk themselves for you.',
        choices: [
          { label: 'Fair.', go: null },
        ],
      },
    },
  },

  binh: {
    id: 'binh',
    name: 'Binh',
    portrait: '🧢',
    nodes: {
      root: {
        text: 'You are the downed American, yes? People here are split. Some want to help, some want you gone.',
        choices: [
          {
            label: 'Help me calm the village. I need guides, not fear.',
            go: null,
            actions: [
              'completeObjective:hearts_of_the_village:secure_local_trust',
              'resolution:nonviolent',
              'adjustTrust:4',
            ],
          },
          {
            label: 'I am not asking. You will cooperate.',
            go: null,
            actions: [
              'setFlag:binh_coerced',
              'completeObjective:hearts_of_the_village:secure_local_trust',
              'resolution:violent',
              'adjustTrust:-8',
            ],
          },
        ],
      },
    },
  },

  father_bao: {
    id: 'father_bao',
    name: 'Father Bao',
    portrait: '⛪',
    nodes: {
      root: {
        text: 'Our mission clinic is ruined, but one of your men was carried there at dawn. He was bleeding badly.',
        choices: [
          {
            label: 'Show me the clinic route.',
            go: null,
            actions: [
              'setFlag:clinic_tip',
              'notify:Father Bao confirms a wounded squadmate was carried toward the clinic.',
            ],
          },
          { label: 'What condition was he in?', go: 'status' },
        ],
      },
      status: {
        text: 'Conscious, but fading. If he is still alive, he needs a treatment kit before he can walk.',
        choices: [
          { label: 'I will remember that.', go: null, actions: ['setFlag:clinic_tip'] },
        ],
      },
    },
  },

  sister_lan: {
    id: 'sister_lan',
    name: 'Sister Lan',
    portrait: '🩺',
    nodes: {
      root: {
        text: 'If this is about your medic, I still have one field kit. But I will not hand it to someone who burns through villages.',
        choices: [
          {
            label: 'I will cover your civilians. Give me the kit.',
            go: null,
            actions: [
              'setFlag:field_kit',
              'startQuest:field_surgery',
              'completeObjective:field_surgery:obtain_field_kit',
              'resolution:nonviolent',
              'adjustTrust:8',
            ],
          },
          {
            label: 'I am taking the kit now.',
            go: null,
            actions: [
              'setFlag:field_kit',
              'startQuest:field_surgery',
              'completeObjective:field_surgery:obtain_field_kit',
              'resolution:violent',
              'adjustTrust:-10',
            ],
          },
        ],
      },
    },
  },

  rodriguez: {
    id: 'rodriguez',
    name: 'Pvt. E. Rodriguez',
    portrait: '🪖',
    nodes: {
      caged: {
        text: 'Sarge?! I thought you were KIA. They keep rotating guards and calling for backup. We have to move now.',
        choices: [
          {
            label: "I'm getting you out.",
            go: 'freed',
            actions: [
              'setFlag:rodriguez_freed',
              'joinCompanion:rodriguez',
              'startQuest:rescue',
              'completeObjective:rescue:find_camp',
              'completeObjective:rescue:free_pow',
              'startQuest:medic_down',
              'resolution:nonviolent',
              'adjustTrust:3',
            ],
          },
        ],
      },
      freed: {
        text: 'Good to breathe outside that cage. If Whitaker is still alive, he will be at the old clinic. Hale was moving east last I heard.',
        choices: [
          { label: "Let's regroup the whole squad.", go: null },
        ],
      },
    },
  },

  duc: {
    id: 'duc',
    name: "Duc (Thanh's Brother)",
    portrait: '👦',
    nodes: {
      root: {
        text: 'Please, please do not leave me here. I only carried rice because they threatened my family.',
        choices: [
          {
            label: "You're coming with me.",
            go: 'freed',
            actions: [
              'setFlag:duc_freed',
              'completeObjective:hearts_of_the_village:help_thanh',
              'completeObjective:hearts_of_the_village:secure_local_trust',
              'resolution:nonviolent',
              'adjustTrust:10',
              'xp:75',
            ],
          },
          { label: 'Stay down. I will clear your path.', go: null },
        ],
      },
      freed: {
        text: 'Thanh will not believe this... thank you. I will run for the village now.',
        choices: [
          { label: 'Go. Stay low.', go: null },
        ],
      },
    },
  },

  cpl_whitaker: {
    id: 'cpl_whitaker',
    name: 'Cpl. Dana Whitaker',
    portrait: '💉',
    nodes: {
      wounded: {
        text: 'Miller...? I took shrapnel in the hip. I can shoot, but I cannot march without treatment.',
        choices: [
          { label: 'Hold on. I will get a field kit.', go: null, actions: ['startQuest:field_surgery'] },
        ],
      },
      stable: {
        text: 'You got the kit. Give me thirty seconds and some pressure bandage work.',
        choices: [
          {
            label: 'Patch up and move. We regroup at ARVN.',
            go: 'joined',
            actions: [
              'setFlag:whitaker_stabilized',
              'joinCompanion:cpl_whitaker',
              'completeObjective:medic_down:reach_whitaker',
              'completeObjective:field_surgery:stabilize_whitaker',
              'startQuest:silent_crossing',
              'resolution:nonviolent',
            ],
          },
        ],
      },
      joined: {
        text: 'Leg is ugly, but serviceable. Point me at the crossing and keep me off open ground.',
        choices: [
          { label: 'Stay close.', go: null },
        ],
      },
    },
  },

  ferryman_huy: {
    id: 'ferryman_huy',
    name: 'Ferryman Huy',
    portrait: '🚤',
    nodes: {
      root: {
        text: 'River is watched. I can move people quietly, but I do not move killers for free.',
        choices: [
          {
            label: 'We protect your people. Get us across.',
            go: null,
            actions: [
              'setFlag:ferry_pass',
              'completeObjective:silent_crossing:secure_ferry_pass',
              'resolution:nonviolent',
              'adjustTrust:4',
            ],
          },
          {
            label: 'Move the boat now. No more talking.',
            go: null,
            actions: [
              'setFlag:ferry_forced',
              'completeObjective:silent_crossing:secure_ferry_pass',
              'resolution:violent',
              'adjustTrust:-7',
            ],
          },
        ],
      },
    },
  },

  mai: {
    id: 'mai',
    name: 'Mai',
    portrait: '🧺',
    nodes: {
      root: {
        text: 'Hale is hiding near the rice sheds. He will not move because civilians are trapped on the road.',
        choices: [
          {
            label: 'I will cover the convoy and get them through.',
            go: null,
            actions: [
              'setFlag:convoy_protected',
              'resolution:nonviolent',
              'adjustTrust:7',
            ],
          },
          {
            label: 'I cannot stop for civilians now.',
            go: null,
            actions: [
              'setFlag:convoy_abandoned',
              'resolution:violent',
              'adjustTrust:-9',
            ],
          },
        ],
      },
    },
  },

  spc_hale: {
    id: 'spc_hale',
    name: 'Spc. Owen Hale',
    portrait: '📻',
    nodes: {
      root: {
        text: 'I heard what happened at the camp. I am not moving until those civilians are clear. I will not repeat Da Nang.',
        choices: [
          { label: 'Understood. I will clear the convoy route.', go: null },
          {
            label: 'Orders are orders. Move now.',
            go: 'joined',
            actions: [
              'completeObjective:radio_ghost:convince_hale',
              'joinCompanion:spc_hale',
              'startQuest:convoy_to_arvn',
              'resolution:violent',
              'adjustTrust:-8',
            ],
          },
        ],
      },
      ready: {
        text: 'Mai told me you covered them. That is enough for me. I am back on the net and ready to move.',
        choices: [
          {
            label: 'Fall in. ARVN perimeter is next.',
            go: 'joined',
            actions: [
              'completeObjective:radio_ghost:convince_hale',
              'joinCompanion:spc_hale',
              'startQuest:convoy_to_arvn',
              'resolution:nonviolent',
              'adjustTrust:5',
            ],
          },
        ],
      },
      joined: {
        text: 'Radio check green. I can warn us before patrols close in. Let us finish this.',
        choices: [
          { label: 'Move out.', go: null },
        ],
      },
    },
  },

  lt_pham: {
    id: 'lt_pham',
    name: 'Lt. Pham',
    portrait: '🎖',
    nodes: {
      root: {
        text: 'You made it farther than most. Gate discipline is strict tonight. Speak with Sgt. Kiet and keep your people together.',
        choices: [
          {
            label: 'We have wounded and civilians with us.',
            go: null,
            actions: ['setFlag:pham_briefed', 'adjustTrust:3'],
          },
          { label: 'Understood. I will clear the checkpoint.', go: null },
        ],
      },
    },
  },

  sgt_kiet: {
    id: 'sgt_kiet',
    name: 'Sgt. Kiet',
    portrait: '🛡',
    nodes: {
      root: {
        text: 'Hold position at the wire. I need a clean account before I open this gate.',
        choices: [
          {
            label: 'Lt. Pham has our report. Open for regroup.',
            go: 'resolved',
            actions: [
              'setFlag:checkpoint_resolved',
              'completeObjective:last_checkpoint:resolve_checkpoint',
              'resolution:nonviolent',
              'adjustTrust:4',
            ],
          },
          {
            label: 'Open the gate now, Sergeant.',
            go: 'resolved',
            actions: [
              'setFlag:checkpoint_resolved',
              'completeObjective:last_checkpoint:resolve_checkpoint',
              'resolution:violent',
              'adjustTrust:-6',
            ],
          },
        ],
      },
      resolved: {
        text: 'Checkpoint cleared. Bring your people forward and signal at the command post.',
        choices: [
          { label: 'Moving in.', go: null },
        ],
      },
    },
  },
};

// ─── Level layout ──────────────────────────
export const LEVEL = {
  playerStart: { x: -8, y: 0, z: 100 },
  crashSite:   { x: -18, y: 0, z: 85 },
  lz:          { x: 96,  y: 0, z: -64 }, // compatibility alias for final destination

  village: {
    center: { x: 0, z: 20 },
    buildings: [
      { x:-4,  z:16,  w:6,  d:5,  h:3.2, type:'hut',    label:"Elder's Hut", npcId:'elder' },
      { x: 9,  z:22,  w:4,  d:3.5,h:3.0, type:'hut' },
      { x:15,  z:12,  w:4,  d:4,  h:3.0, type:'hut' },
      { x:-14, z:26,  w:4,  d:3.5,h:3.0, type:'hut' },
      { x:-7,  z:36,  w:7,  d:5,  h:3.5, type:'market', label:'Market' },
      { x: 10, z:36,  w:4,  d:3.5,h:3.0, type:'hut' },
      { x: 0,  z:46,  w:4,  d:4,  h:3.0, type:'hut' },
      { x:-20, z:10,  w:3,  d:3,  h:2.5, type:'small'  },
    ],
  },

  vcCamp: {
    center: { x:-52, z:-42 },
    buildings: [
      { x:-54, z:-28, w:7,  d:5,  h:3.5, type:'bunker',  label:'Command Bunker' },
      { x:-44, z:-44, w:5,  d:4,  h:3.2, type:'radio',   label:'Radio Tower', interactive:true, id:'radio_tower' },
      { x:-64, z:-38, w:4,  d:4,  h:2.8, type:'hut' },
      { x:-50, z:-54, w:4,  d:4,  h:2.8, type:'hut' },
      { x:-40, z:-32, w:4,  d:4,  h:2.5, type:'cage',    label:'Prisoner Cage', interactive:true, id:'cage', npcId:'rodriguez' },
      { x:-58, z:-50, w:4,  d:4,  h:2.8, type:'storage', label:'Storage Shed', id:'storage' },
    ],
  },

  clinic: {
    center: { x: 58, z: 18 },
    cache:  { x: 62, z: 14 },
  },

  riverCrossing: {
    center: { x: 83, z: -6 },
    post:   { x: 85, z: -8 },
    convoy: { x: 89, z: 6 },
  },

  hamlet: {
    center: { x: 95, z: 18 },
  },

  arvnOutpost: {
    center: { x: 96, z: -72 },
    gate:   { x: 96, z: -64 },
    buildings: [
      { x: 92, z: -72, w: 7, d: 5, h: 3.5, type: 'bunker', label: 'Command Post' },
      { x: 102, z: -74, w: 5, d: 4, h: 3.0, type: 'tower', label: 'Watch Tower' },
      { x: 96, z: -80, w: 6, d: 4, h: 2.8, type: 'tent', label: 'Triage Tent' },
    ],
  },

  npcs: [
    { id:'elder',         x:-2,  z:19,  dialogId:'elder',         quest:'hearts_of_the_village' },
    { id:'thanh',         x:13,  z:29,  dialogId:'thanh',         quest:'hearts_of_the_village' },
    { id:'binh',          x:-11, z:35,  dialogId:'binh',          quest:'hearts_of_the_village' },
    { id:'father_bao',    x:18,  z:18,  dialogId:'father_bao',    quest:'medic_down', hidden:true },
    { id:'rodriguez',     x:-40, z:-32, dialogId:'rodriguez',     quest:'rescue', caged:true },
    { id:'duc',           x:-58, z:-50, dialogId:'duc',           hidden:true },
    { id:'sister_lan',    x:56,  z:20,  dialogId:'sister_lan',    quest:'field_surgery', hidden:true },
    { id:'cpl_whitaker',  x:58,  z:16,  dialogId:'cpl_whitaker',  quest:'medic_down', hidden:true },
    { id:'ferryman_huy',  x:84,  z:-7,  dialogId:'ferryman_huy',  quest:'silent_crossing', hidden:true },
    { id:'mai',           x:90,  z:12,  dialogId:'mai',           quest:'radio_ghost', hidden:true },
    { id:'spc_hale',      x:96,  z:20,  dialogId:'spc_hale',      quest:'radio_ghost', hidden:true },
    { id:'lt_pham',       x:92,  z:-70, dialogId:'lt_pham',       quest:'last_checkpoint', hidden:true },
    { id:'sgt_kiet',      x:96,  z:-66, dialogId:'sgt_kiet',      quest:'last_checkpoint', hidden:true },
  ],

  enemies: [
    { x:-26, z:-4,  patrol:[[-26,-4],[-36,-4],[-36,6],[-26,6]] },
    { x: 26, z: 4,  patrol:[[26,4],[36,4],[36,-4],[26,-4]] },
    { x:-40, z:32,  patrol:[[-40,32],[-50,22],[-50,42],[-40,32]] },
    { x: 32, z:-18, patrol:[[32,-18],[42,-28],[32,-38],[22,-28]] },
    { x:-46, z:-34, patrol:[[-46,-34],[-62,-34],[-62,-50],[-46,-50]], camp:true },
    { x:-56, z:-54, patrol:[[-56,-54],[-66,-44],[-66,-54],[-56,-54]], camp:true },
    { x:-46, z:-50, patrol:[[-46,-50],[-36,-50],[-36,-40],[-46,-40]], camp:true },
    { x:-62, z:-30, patrol:[[-62,-30],[-67,-36],[-62,-42],[-56,-36]], camp:true },
    { x:-38, z:-42, stationary:true, camp:true },
    { x:-50, z:-24, patrol:[[-50,-24],[-56,-30],[-50,-36],[-44,-30]], camp:true },
    { x: 52, z: 8,  patrol:[[52,8],[62,6],[62,16],[52,14]] },
    { x: 76, z:-10, patrol:[[76,-10],[88,-12],[90,-2],[78,2]] },
    { x: 92, z:-34, patrol:[[92,-34],[104,-40],[102,-52],[90,-46]] },
    { x: 82, z:-52, patrol:[[82,-52],[94,-58],[90,-66],[78,-60]] },
  ],

  items: [
    { type:'medkit',      x:-24, z:84 },
    { type:'ammo_m16',    x:-17, z:87 },
    { type:'compass',     x:-21, z:82 },
    { type:'document',    x:-19, z:86, label:'Map Fragment', text:'Hand-marked terrain sketch. Route annotations point toward a village and ARVN-held roads to the southeast.' },
    { type:'medkit',      x:4,   z:28 },
    { type:'ammo_pistol', x:-3,  z:21 },
    { type:'document',    x:-4,  z:16, label:'Patrol Orders', text:'VC patrol schedules intercepted. Camp checkpoints rotate every forty minutes.' },
    { type:'ammo_m16',    x:-28, z:52 },
    { type:'medkit',      x:22,  z:-18 },
    { type:'grenade',     x:-10, z:-10 },
    { type:'ammo_m16',    x:-62, z:-44 },
    { type:'ammo_m16',    x:-48, z:-52 },
    { type:'grenade',     x:-56, z:-34 },
    { type:'grenade',     x:-42, z:-48 },
    { type:'medkit',      x:-58, z:-32 },
    { type:'document',    x:-54, z:-28, label:'Enemy Intel', text:'Prisoner count: one confirmed American. Secondary transfer planned toward river corridor by dusk.' },
    { type:'medkit',      x:58,  z:22 },
    { type:'ammo_pistol', x:60,  z:16 },
    { type:'document',    x:61,  z:19, label:'Clinic Register', text:'Entry notes mention Cpl. Whitaker treated for shrapnel trauma and moved to temporary shelter.' },
    { type:'document',    x:96,  z:16, label:'Transit Orders', text:'ARVN checkpoint protocol: allied squads must report with personnel count and civilian status before gate entry.' },
  ],
};
