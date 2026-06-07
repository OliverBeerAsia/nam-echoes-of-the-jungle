extends Node3D

const TerrainSplatmapScript = preload("res://scripts/world/terrain_splatmap.gd")
const FoliageClusterFieldScript = preload("res://scripts/world/foliage_cluster_field.gd")
const ARVNOutpostModularKitScript = preload("res://scripts/world/arvn_outpost_modular_kit.gd")
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
	terrain.world_size = Vector2(212.0, 172.0)
	terrain.terrain_origin = Vector3(96.0, -0.12, -72.0)
	terrain.uv_scale = 21.0
	terrain.splat_scale = 2.05
	terrain.displacement_strength = 0.36
	terrain.grass_base = Color(0.3, 0.36, 0.27)
	terrain.grass_accent = Color(0.36, 0.42, 0.31)
	terrain.grass_detail = Color(0.43, 0.48, 0.36)
	terrain.mud_base = Color(0.33, 0.29, 0.24)
	terrain.mud_accent = Color(0.39, 0.34, 0.28)
	terrain.mud_detail = Color(0.47, 0.41, 0.34)
	terrain.path_base = Color(0.46, 0.4, 0.31)
	terrain.path_accent = Color(0.53, 0.46, 0.36)
	terrain.path_detail = Color(0.61, 0.54, 0.43)
	terrain.noise_seed = 2771
	var definition = DataStore.get_zone_definition("arvn_outpost")
	terrain.apply_profile(DataStore.get_terrain_profile(str(definition.get("terrain_material_set", ""))))
	terrain_root.add_child(terrain)

func _spawn_foliage() -> void:
	var foliage = FoliageClusterFieldScript.new()
	foliage.seed = 2969
	foliage.center = Vector3(96.0, 0.0, -72.0)
	foliage.radius = 118.0
	foliage.exclusion_radius = 36.0
	var definition = DataStore.get_zone_definition("arvn_outpost")
	foliage.apply_profile(DataStore.get_foliage_profile(str(definition.get("foliage_profile_id", ""))))
	foliage_root.add_child(foliage)

func _spawn_modular_kit() -> void:
	var kit = ARVNOutpostModularKitScript.new()
	kit.lod_near_end = 96.0
	kit.lod_far_begin = 80.0
	kit_root.add_child(kit)

func _spawn_npcs() -> void:
	var definition = DataStore.get_zone_definition("arvn_outpost")
	for spawn in definition.get("npc_spawns", []):
		var npc = RiggedNPCScript.new()
		npc.profile_id = str(spawn.get("profile_id", "sgt_kiet"))
		npc.display_name = str(spawn.get("name", "NPC"))
		npc.state_id = str(spawn.get("state", "guard_idle"))
		npc.position = _vec3_from_array(spawn.get("position", [0, 0, 0]))
		npc.rotation_degrees.y = float(spawn.get("rotation_y", 0.0))
		npc_root.add_child(npc)

func _spawn_atmosphere() -> void:
	var definition = DataStore.get_zone_definition("arvn_outpost")
	var zone_record := DataStore.find_zone_record("arvn_outpost")
	var controller := ZoneAtmosphereControllerScript.new()
	controller.zone_id = "arvn_outpost"
	controller.atmosphere_profile_id = str(definition.get("atmosphere_profile_id", ""))
	controller.zone_center = _vec3_from_array(zone_record.get("center", [0, 0, 0]))
	controller.quest_contract = definition.get("quest_readability", {}).duplicate(true)
	atmosphere_root.add_child(controller)

func _vec3_from_array(values: Variant) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return Vector3.ZERO
