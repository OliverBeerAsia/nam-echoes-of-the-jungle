extends Node3D

const TerrainSplatmapScript = preload("res://scripts/world/terrain_splatmap.gd")
const FoliageClusterFieldScript = preload("res://scripts/world/foliage_cluster_field.gd")
const ClinicModularKitScript = preload("res://scripts/world/clinic_modular_kit.gd")
const RiggedNPCScript = preload("res://scripts/world/rigged_npc.gd")
const ZoneAtmosphereControllerScript = preload("res://scripts/world/zone_atmosphere_controller.gd")

@onready var terrain_root: Node3D = $Terrain
@onready var foliage_root: Node3D = $Foliage
@onready var kit_root: Node3D = $Kit
@onready var npc_root: Node3D = $NPCs
@onready var atmosphere_root: Node3D = $Atmosphere

func _ready() -> void:
	_spawn_terrain()
	_spawn_foliage()
	_spawn_modular_kit()
	_spawn_npcs()
	_spawn_atmosphere()

func _spawn_terrain() -> void:
	var terrain = TerrainSplatmapScript.new()
	terrain.world_size = Vector2(150.0, 130.0)
	terrain.terrain_origin = Vector3(58.0, -0.08, 18.0)
	terrain.uv_scale = 20.0
	terrain.splat_scale = 1.9
	terrain.displacement_strength = 0.42
	terrain.grass_base = Color(0.35, 0.4, 0.3)
	terrain.grass_accent = Color(0.41, 0.46, 0.35)
	terrain.grass_detail = Color(0.49, 0.53, 0.41)
	terrain.mud_base = Color(0.34, 0.3, 0.24)
	terrain.mud_accent = Color(0.42, 0.36, 0.29)
	terrain.mud_detail = Color(0.5, 0.42, 0.34)
	terrain.path_base = Color(0.45, 0.39, 0.31)
	terrain.path_accent = Color(0.53, 0.45, 0.35)
	terrain.path_detail = Color(0.6, 0.52, 0.4)
	terrain.noise_seed = 1373
	var definition = DataStore.get_zone_definition("clinic")
	terrain.apply_profile(DataStore.get_terrain_profile(str(definition.get("terrain_material_set", ""))))
	terrain_root.add_child(terrain)

func _spawn_foliage() -> void:
	var foliage = FoliageClusterFieldScript.new()
	foliage.seed = 2129
	foliage.center = Vector3(58.0, 0.0, 18.0)
	foliage.radius = 96.0
	foliage.exclusion_radius = 18.0
	var definition = DataStore.get_zone_definition("clinic")
	foliage.apply_profile(DataStore.get_foliage_profile(str(definition.get("foliage_profile_id", ""))))
	foliage_root.add_child(foliage)

func _spawn_modular_kit() -> void:
	var kit = ClinicModularKitScript.new()
	kit.lod_near_end = 84.0
	kit.lod_far_begin = 68.0
	kit_root.add_child(kit)

func _spawn_npcs() -> void:
	var definition = DataStore.get_zone_definition("clinic")
	for spawn in definition.get("npc_spawns", []):
		var npc = RiggedNPCScript.new()
		npc.profile_id = str(spawn.get("profile_id", "sister_lan"))
		npc.display_name = str(spawn.get("name", "NPC"))
		npc.state_id = str(spawn.get("state", "idle_talk"))
		npc.position = _vec3_from_array(spawn.get("position", [0, 0, 0]))
		npc.rotation_degrees.y = float(spawn.get("rotation_y", 0.0))
		npc_root.add_child(npc)

func _spawn_atmosphere() -> void:
	var definition = DataStore.get_zone_definition("clinic")
	var zone_record := DataStore.find_zone_record("clinic")
	var controller := ZoneAtmosphereControllerScript.new()
	controller.zone_id = "clinic"
	controller.atmosphere_profile_id = str(definition.get("atmosphere_profile_id", ""))
	controller.zone_center = _vec3_from_array(zone_record.get("center", [0, 0, 0]))
	controller.quest_contract = definition.get("quest_readability", {}).duplicate(true)
	atmosphere_root.add_child(controller)

func _vec3_from_array(values: Variant) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return Vector3.ZERO
