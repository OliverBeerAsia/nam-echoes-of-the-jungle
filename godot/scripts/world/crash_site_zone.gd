extends Node3D

const TerrainSplatmapScript = preload("res://scripts/world/terrain_splatmap.gd")
const FoliageClusterFieldScript = preload("res://scripts/world/foliage_cluster_field.gd")
const CrashSiteModularKitScript = preload("res://scripts/world/crash_site_modular_kit.gd")
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
	terrain.world_size = Vector2(182.0, 156.0)
	terrain.terrain_origin = Vector3(-18.0, -0.16, 85.0)
	terrain.uv_scale = 18.5
	terrain.splat_scale = 1.85
	terrain.displacement_strength = 0.4
	terrain.grass_base = Color(0.29, 0.35, 0.26)
	terrain.grass_accent = Color(0.35, 0.4, 0.3)
	terrain.grass_detail = Color(0.41, 0.46, 0.35)
	terrain.mud_base = Color(0.31, 0.28, 0.24)
	terrain.mud_accent = Color(0.38, 0.34, 0.29)
	terrain.mud_detail = Color(0.45, 0.4, 0.34)
	terrain.path_base = Color(0.27, 0.24, 0.21)
	terrain.path_accent = Color(0.33, 0.29, 0.25)
	terrain.path_detail = Color(0.39, 0.34, 0.29)
	terrain.noise_seed = 3119
	var definition = DataStore.get_zone_definition("crash_site")
	terrain.apply_profile(DataStore.get_terrain_profile(str(definition.get("terrain_material_set", ""))))
	terrain_root.add_child(terrain)

func _spawn_foliage() -> void:
	var foliage = FoliageClusterFieldScript.new()
	foliage.seed = 3253
	foliage.center = Vector3(-18.0, 0.0, 85.0)
	foliage.radius = 121.0
	foliage.exclusion_radius = 34.0
	var definition = DataStore.get_zone_definition("crash_site")
	foliage.apply_profile(DataStore.get_foliage_profile(str(definition.get("foliage_profile_id", ""))))
	foliage_root.add_child(foliage)

func _spawn_modular_kit() -> void:
	var kit = CrashSiteModularKitScript.new()
	kit.lod_near_end = 90.0
	kit.lod_far_begin = 72.0
	kit_root.add_child(kit)

func _spawn_npcs() -> void:
	var definition = DataStore.get_zone_definition("crash_site")
	for spawn in definition.get("npc_spawns", []):
		var npc = RiggedNPCScript.new()
		npc.profile_id = str(spawn.get("profile_id", "father_bao"))
		npc.display_name = str(spawn.get("name", "NPC"))
		npc.state_id = str(spawn.get("state", "idle_talk"))
		npc.position = _vec3_from_array(spawn.get("position", [0, 0, 0]))
		npc.rotation_degrees.y = float(spawn.get("rotation_y", 0.0))
		npc_root.add_child(npc)

func _spawn_atmosphere() -> void:
	var definition = DataStore.get_zone_definition("crash_site")
	var zone_record := DataStore.find_zone_record("crash_site")
	var controller := ZoneAtmosphereControllerScript.new()
	controller.zone_id = "crash_site"
	controller.atmosphere_profile_id = str(definition.get("atmosphere_profile_id", ""))
	controller.zone_center = _vec3_from_array(zone_record.get("center", [0, 0, 0]))
	controller.quest_contract = definition.get("quest_readability", {}).duplicate(true)
	atmosphere_root.add_child(controller)

func _vec3_from_array(values: Variant) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return Vector3.ZERO
