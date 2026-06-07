extends Node3D
class_name ZoneScene

const RiggedNPCScript = preload("res://scripts/world/rigged_npc.gd")
const ZoneAtmosphereControllerScript = preload("res://scripts/world/zone_atmosphere_controller.gd")

@export var zone_id: String = "village"
@export var anchor_color: Color = Color(0.41, 0.55, 0.36)
@export var ground_size: Vector2 = Vector2(84.0, 84.0)

@onready var props_root: Node3D = $Props

func _ready() -> void:
	_build_ground_proxy()
	_build_prop_proxies()
	_spawn_zone_npcs()
	_spawn_zone_atmosphere()

func _build_ground_proxy() -> void:
	var zone_record := DataStore.find_zone_record(zone_id)
	var center := _vec3_from_array(zone_record.get("center", [0, 0, 0]), Vector3.ZERO)

	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = ground_size
	ground.mesh = plane
	ground.position = center
	ground.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var mat := StandardMaterial3D.new()
	mat.albedo_color = anchor_color.darkened(0.33)
	mat.roughness = 0.96
	ground.material_override = mat
	add_child(ground)

func _build_prop_proxies() -> void:
	var definition := DataStore.get_zone_definition(zone_id)
	var prop_groups: Array = definition.get("prop_groups", [])

	for group in prop_groups:
		var group_id := str(group.get("group_id", "group"))
		var anchors: Array = group.get("anchors", [])
		for anchor in anchors:
			_spawn_proxy_anchor(group_id, anchor)

func _spawn_proxy_anchor(group_id: String, anchor: Dictionary) -> void:
	var anchor_name := str(anchor.get("asset_id", "asset"))
	var root := Node3D.new()
	root.name = "%s_%s" % [group_id, anchor_name]
	root.position = _vec3_from_array(anchor.get("position", [0, 0, 0]), Vector3.ZERO)
	root.rotation_degrees.y = float(anchor.get("rotation_y", 0.0))
	root.scale = _vec3_from_array(anchor.get("scale", [1, 1, 1]), Vector3.ONE)
	props_root.add_child(root)

	var proxy_size := _vec3_from_array(anchor.get("proxy_size", [2.0, 2.0, 2.0]), Vector3(2.0, 2.0, 2.0))

	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = proxy_size
	mesh.mesh = box
	mesh.position.y = proxy_size.y * 0.5
	mesh.material_override = _make_proxy_material(anchor_name)
	root.add_child(mesh)

	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = proxy_size
	shape.shape = box_shape
	shape.position.y = proxy_size.y * 0.5
	body.add_child(shape)
	root.add_child(body)

func _spawn_zone_npcs() -> void:
	var definition := DataStore.get_zone_definition(zone_id)
	for spawn in definition.get("npc_spawns", []):
		var npc = RiggedNPCScript.new()
		npc.profile_id = str(spawn.get("profile_id", "elder_nguyen"))
		npc.display_name = str(spawn.get("name", "NPC"))
		npc.state_id = str(spawn.get("state", "idle_talk"))
		npc.position = _vec3_from_array(spawn.get("position", [0, 0, 0]), Vector3.ZERO)
		npc.rotation_degrees.y = float(spawn.get("rotation_y", 0.0))
		add_child(npc)

func _spawn_zone_atmosphere() -> void:
	var definition := DataStore.get_zone_definition(zone_id)
	var zone_record := DataStore.find_zone_record(zone_id)
	var controller := ZoneAtmosphereControllerScript.new()
	controller.zone_id = zone_id
	controller.atmosphere_profile_id = str(definition.get("atmosphere_profile_id", ""))
	controller.zone_center = _vec3_from_array(zone_record.get("center", [0, 0, 0]), Vector3.ZERO)
	controller.quest_contract = definition.get("quest_readability", {}).duplicate(true)
	add_child(controller)

func _make_proxy_material(anchor_name: String) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	var tint := float(abs(anchor_name.hash() % 13)) * 0.005
	mat.albedo_color = anchor_color.lightened(0.06 + tint)
	mat.roughness = 0.8
	mat.metallic = 0.02
	return mat

func _vec3_from_array(values: Variant, fallback: Vector3) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return fallback
