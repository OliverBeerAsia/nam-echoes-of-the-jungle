extends Node3D

const INTERACTION_RADIUS: float = 3.4
const SaveSystem = preload("res://scripts/crpg/save_system.gd")

const INTERACTABLES: Array[Dictionary] = [
	{
		"id": "map_case",
		"prompt": "Recover map fragment",
		"position": Vector3(-28.0, 0.0, -8.0),
		"color": Color(0.79, 0.69, 0.38),
		"quest": "aftershock",
		"objective": "recover_map",
	},
	{
		"id": "village_gate",
		"prompt": "Reach village boundary",
		"position": Vector3(-6.0, 0.0, 0.0),
		"color": Color(0.34, 0.57, 0.26),
		"quest": "aftershock",
		"objective": "find_village",
	},
	{
		"id": "elder_nguyen",
		"prompt": "Talk to Elder Nguyen",
		"position": Vector3(2.0, 0.0, 6.0),
		"color": Color(0.30, 0.44, 0.76),
		"quest": "hearts_of_the_village",
		"objective": "talk_elder",
	},
	{
		"id": "camp_perimeter",
		"prompt": "Scout VC camp perimeter",
		"position": Vector3(28.0, 0.0, -1.0),
		"color": Color(0.66, 0.30, 0.22),
		"quest": "rescue",
		"objective": "find_camp",
	},
	{
		"id": "radio_tower",
		"prompt": "Sabotage radio tower (optional)",
		"position": Vector3(35.0, 0.0, 9.0),
		"color": Color(0.52, 0.28, 0.57),
		"quest": "rescue",
		"objective": "kill_radio",
	},
	{
		"id": "pow_cage",
		"prompt": "Free Pvt. Rodriguez",
		"position": Vector3(41.0, 0.0, -6.0),
		"color": Color(0.77, 0.35, 0.35),
		"quest": "rescue",
		"objective": "free_pow",
	},
]

@onready var _player: Node3D = $PlayerPawn
@onready var _ui: CanvasLayer = $CanvasLayer
@onready var _interactables_root: Node3D = $Interactables

var _interactable_nodes: Dictionary = {}
var _nearest_interactable_id: String = ""

var _quests: Dictionary = {}
var _quest_order: Array[String] = []
var _party_state: Dictionary = {
	"rodriguez": false,
	"cpl_whitaker": false,
	"spc_hale": false,
}
var _world_flags: Dictionary = {}
var _civilian_trust: int = 50
var _nonviolent_resolutions: int = 0

func _ready() -> void:
	_spawn_interactables()
	_bootstrap_story_state()
	_start_quest("aftershock")
	_refresh_zone_label()
	_refresh_ui()
	_ui.push_log("Vertical slice active: Crash Site -> Village -> VC Camp")
	_ui.push_log("Click to move. Press E near objectives. F5 save, F9 load.")

func _process(_delta: float) -> void:
	_refresh_zone_label()
	_refresh_nearest_interactable()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_E:
			_try_interact()
		elif event.keycode == KEY_F5:
			_save_slot_1()
		elif event.keycode == KEY_F9:
			_load_slot_1()

func _spawn_interactables() -> void:
	for def in INTERACTABLES:
		var node := Node3D.new()
		node.name = str(def["id"])
		node.position = def["position"]
		node.set_meta("interact_id", def["id"])
		node.set_meta("prompt", def["prompt"])
		node.set_meta("quest", def["quest"])
		node.set_meta("objective", def["objective"])

		var marker := MeshInstance3D.new()
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.55
		mesh.bottom_radius = 0.65
		mesh.height = 1.45
		marker.mesh = mesh
		marker.position.y = 0.72

		var material := StandardMaterial3D.new()
		material.albedo_color = def["color"]
		material.roughness = 0.6
		marker.material_override = material
		node.add_child(marker)

		_interactable_nodes[str(def["id"])] = node
		_interactables_root.add_child(node)

func _bootstrap_story_state() -> void:
	var story: Dictionary = DataStore.get_story_data()
	var quests: Array = story.get("quests", [])
	for raw_quest in quests:
		var quest_id := str(raw_quest.get("id", ""))
		if quest_id.is_empty():
			continue

		var objectives: Array[Dictionary] = []
		for raw_objective in raw_quest.get("objectives", []):
			objectives.append({
				"id": str(raw_objective.get("id", "")),
				"text": str(raw_objective.get("text", "")),
				"optional": bool(raw_objective.get("optional", false)),
				"done": false,
			})

		_quests[quest_id] = {
			"id": quest_id,
			"title": str(raw_quest.get("title", quest_id)),
			"desc": str(raw_quest.get("desc", "")),
			"started": false,
			"completed": false,
			"objectives": objectives,
		}
		_quest_order.append(quest_id)

func _start_quest(quest_id: String) -> void:
	var quest: Dictionary = _quests.get(quest_id, {})
	if quest.is_empty() or bool(quest.get("started", false)):
		return
	quest["started"] = true
	_quests[quest_id] = quest
	_ui.push_log("Quest started: %s" % quest.get("title", quest_id))
	_refresh_ui()

func _complete_objective(quest_id: String, objective_id: String) -> void:
	var quest: Dictionary = _quests.get(quest_id, {})
	if quest.is_empty():
		return

	if not bool(quest.get("started", false)):
		_start_quest(quest_id)
		quest = _quests.get(quest_id, {})

	var objectives: Array = quest.get("objectives", [])
	for i in range(objectives.size()):
		var objective: Dictionary = objectives[i]
		if str(objective.get("id", "")) != objective_id:
			continue
		if bool(objective.get("done", false)):
			return
		objective["done"] = true
		objectives[i] = objective
		_ui.push_log("Objective complete: %s" % objective.get("text", objective_id))
		break

	quest["objectives"] = objectives
	_quests[quest_id] = quest
	_maybe_complete_quest(quest_id)
	_sync_interactable_visibility()
	_refresh_ui()

func _maybe_complete_quest(quest_id: String) -> void:
	var quest: Dictionary = _quests.get(quest_id, {})
	if quest.is_empty() or bool(quest.get("completed", false)):
		return

	var required_done := true
	for objective in quest.get("objectives", []):
		if bool(objective.get("optional", false)):
			continue
		if not bool(objective.get("done", false)):
			required_done = false
			break

	if not required_done:
		return

	quest["completed"] = true
	_quests[quest_id] = quest
	_ui.push_log("Quest complete: %s" % quest.get("title", quest_id))

	if quest_id == "aftershock":
		_start_quest("hearts_of_the_village")
	elif quest_id == "hearts_of_the_village":
		_start_quest("rescue")
	elif quest_id == "rescue":
		_world_flags["vertical_slice_complete"] = true
		_ui.push_log("Vertical slice checkpoint reached. Rodriguez regrouped.")

func _refresh_nearest_interactable() -> void:
	var best_id := ""
	var best_dist := INTERACTION_RADIUS

	for interact_id in _interactable_nodes.keys():
		var node := _interactable_nodes[interact_id] as Node3D
		if node == null or not node.visible:
			continue
		var dist := _player.global_position.distance_to(node.global_position)
		if dist < best_dist:
			best_dist = dist
			best_id = interact_id

	_nearest_interactable_id = best_id
	if best_id.is_empty():
		_ui.set_prompt("", false)
		return

	var prompt := str((_interactable_nodes[best_id] as Node3D).get_meta("prompt", "Interact"))
	_ui.set_prompt("[E] %s" % prompt, true)

func _try_interact() -> void:
	if _nearest_interactable_id.is_empty():
		return
	var node := _interactable_nodes.get(_nearest_interactable_id, null) as Node3D
	if node == null or not node.visible:
		return

	var interact_id := str(node.get_meta("interact_id", ""))
	if interact_id.is_empty():
		return

	_match_interaction(interact_id)
	_sync_interactable_visibility()
	_refresh_ui()

func _match_interaction(interact_id: String) -> void:
	match interact_id:
		"map_case":
			_complete_objective("aftershock", "recover_map")
			_world_flags["map_recovered"] = true
		"village_gate":
			_complete_objective("aftershock", "find_village")
		"elder_nguyen":
			_start_quest("hearts_of_the_village")
			_complete_objective("hearts_of_the_village", "talk_elder")
			_complete_objective("hearts_of_the_village", "secure_local_trust")
			_civilian_trust = clamp(_civilian_trust + 10, 0, 100)
			_nonviolent_resolutions += 1
			_ui.push_log("Civilian trust increased (%d)." % _civilian_trust)
		"camp_perimeter":
			_start_quest("rescue")
			_complete_objective("rescue", "find_camp")
		"radio_tower":
			_complete_objective("rescue", "kill_radio")
		"pow_cage":
			_start_quest("rescue")
			_complete_objective("rescue", "free_pow")
			_party_state["rodriguez"] = true
			_ui.push_log("Rodriguez joined your party.")

func _sync_interactable_visibility() -> void:
	for def in INTERACTABLES:
		var interact_id := str(def["id"])
		var node := _interactable_nodes.get(interact_id, null) as Node3D
		if node == null:
			continue

		var quest_id := str(def["quest"])
		var objective_id := str(def["objective"])
		var objective_done := _is_objective_done(quest_id, objective_id)
		node.visible = not objective_done

func _is_objective_done(quest_id: String, objective_id: String) -> bool:
	var quest: Dictionary = _quests.get(quest_id, {})
	if quest.is_empty():
		return false
	for objective in quest.get("objectives", []):
		if str(objective.get("id", "")) == objective_id:
			return bool(objective.get("done", false))
	return false

func _refresh_zone_label() -> void:
	var x := _player.global_position.x
	var zone_name := "Crash Site"
	if x >= -10.0 and x < 18.0:
		zone_name = "Village"
	elif x >= 18.0:
		zone_name = "VC Camp"
	_ui.set_zone(zone_name)

func _refresh_ui() -> void:
	_ui.set_party_state(_party_state)
	_ui.set_objectives(_collect_objective_lines())

func _collect_objective_lines() -> Array[String]:
	var lines: Array[String] = []
	for quest_id in _quest_order:
		var quest: Dictionary = _quests.get(quest_id, {})
		if quest.is_empty() or not bool(quest.get("started", false)) or bool(quest.get("completed", false)):
			continue
		for objective in quest.get("objectives", []):
			if bool(objective.get("done", false)):
				continue
			var prefix := "[Optional] " if bool(objective.get("optional", false)) else ""
			lines.append("%s%s" % [prefix, str(objective.get("text", ""))])
	return lines

func _serialize_state() -> Dictionary:
	return {
		"player_state": {
			"position": [_player.global_position.x, _player.global_position.y, _player.global_position.z],
		},
		"party_state": _party_state,
		"quest_state": _quests,
		"quest_order": _quest_order,
		"world_flags": _world_flags,
		"meta": {
			"civilian_trust": _civilian_trust,
			"nonviolent_resolutions": _nonviolent_resolutions,
		},
	}

func _load_from_state(state: Dictionary) -> void:
	if state.is_empty():
		return

	var player_state: Dictionary = state.get("player_state", {})
	var pos: Array = player_state.get("position", [])
	if pos.size() >= 3:
		_player.global_position = Vector3(float(pos[0]), float(pos[1]), float(pos[2]))

	var loaded_party: Dictionary = state.get("party_state", {})
	for key in _party_state.keys():
		_party_state[key] = bool(loaded_party.get(key, _party_state[key]))

	var loaded_quests: Dictionary = state.get("quest_state", {})
	if not loaded_quests.is_empty():
		_quests = loaded_quests

	var loaded_order: Array = state.get("quest_order", [])
	if not loaded_order.is_empty():
		_quest_order.clear()
		for quest_id in loaded_order:
			_quest_order.append(str(quest_id))

	_world_flags = state.get("world_flags", {})

	var meta: Dictionary = state.get("meta", {})
	_civilian_trust = int(meta.get("civilian_trust", _civilian_trust))
	_nonviolent_resolutions = int(meta.get("nonviolent_resolutions", _nonviolent_resolutions))

	_sync_interactable_visibility()
	_refresh_ui()

func _save_slot_1() -> void:
	var success: bool = SaveSystem.save_slot(1, _serialize_state())
	if success:
		_ui.set_save_status("Saved slot 1 at %s" % Time.get_datetime_string_from_system(false))
	else:
		_ui.set_save_status("Save failed for slot 1")

func _load_slot_1() -> void:
	var payload: Dictionary = SaveSystem.load_slot(1)
	if payload.is_empty():
		_ui.set_save_status("No slot 1 save found")
		return
	_load_from_state(payload)
	_ui.set_save_status("Loaded slot 1 at %s" % Time.get_datetime_string_from_system(false))
