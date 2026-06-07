extends Node3D
class_name CrashSiteModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 90.0
@export var lod_far_begin: float = 72.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()
	_spawn_crash_atmosphere()

func _build_materials() -> void:
	_materials = {
		"hull": MatLib.make_pbr_material(Color(0.27, 0.31, 0.29), Color(0.33, 0.38, 0.35), Color(0.4, 0.44, 0.41), 3011, 0.65, 0.3, 2),
		"charred": MatLib.make_pbr_material(Color(0.13, 0.13, 0.13), Color(0.19, 0.18, 0.18), Color(0.26, 0.24, 0.24), 3089, 0.87, 0.02, 2),
		"metal": MatLib.make_pbr_material(Color(0.31, 0.32, 0.31), Color(0.39, 0.39, 0.38), Color(0.46, 0.46, 0.45), 3157, 0.56, 0.34, 3),
		"cloth": MatLib.make_pbr_material(Color(0.37, 0.33, 0.24), Color(0.44, 0.39, 0.29), Color(0.5, 0.45, 0.34), 3221, 0.84, 0.01, 2),
		"crate": MatLib.make_pbr_material(Color(0.3, 0.23, 0.16), Color(0.37, 0.29, 0.21), Color(0.44, 0.35, 0.25), 3299, 0.85, 0.01, 3),
		"scorch": MatLib.make_pbr_material(Color(0.14, 0.12, 0.11), Color(0.18, 0.15, 0.14), Color(0.22, 0.2, 0.19), 3371, 0.95, 0.0, 2)
	}

func _build_from_zone_definition() -> void:
	var definition = DataStore.get_zone_definition("crash_site")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id = str(anchor.get("asset_id", ""))
			if asset_id.contains("helicopter_fuselage"):
				_spawn_helicopter_fuselage(anchor)
			elif asset_id.contains("tail_boom"):
				_spawn_tail_boom(anchor)
			elif asset_id.contains("rotor_hub"):
				_spawn_rotor_hub(anchor)
			elif asset_id.contains("debris_field"):
				_spawn_debris_field(anchor)
			elif asset_id.contains("fire_bed"):
				_spawn_fire_bed(anchor)
			elif asset_id.contains("smoke_column"):
				_spawn_smoke_column(anchor)
			elif asset_id.contains("supply_crates"):
				_spawn_supply_crates(anchor)
			elif asset_id.contains("map_case"):
				_spawn_map_case(anchor)
			elif asset_id.contains("scorch_decal"):
				_spawn_scorch_decal(anchor)

func _spawn_helicopter_fuselage(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [8.0, 2.8, 2.8]), Vector3(8.0, 2.8, 2.8))
	var near = Node3D.new()
	root.add_child(near)
	var far = Node3D.new()
	root.add_child(far)

	var body = MeshInstance3D.new()
	var body_mesh = CapsuleMesh.new()
	body_mesh.radius = size.z * 0.38
	body_mesh.height = size.x
	body_mesh.radial_segments = 12
	body_mesh.rings = 6
	body.mesh = body_mesh
	body.rotation_degrees.z = 90.0
	body.position = Vector3(0.0, 1.18, 0.0)
	body.material_override = _materials["hull"]
	body.visibility_range_end = lod_near_end
	near.add_child(body)

	var cockpit = MeshInstance3D.new()
	var cockpit_mesh = SphereMesh.new()
	cockpit_mesh.radius = 0.9
	cockpit_mesh.height = 1.35
	cockpit_mesh.radial_segments = 10
	cockpit_mesh.rings = 8
	cockpit.mesh = cockpit_mesh
	cockpit.position = Vector3(size.x * 0.42, 1.24, 0.0)
	cockpit.material_override = _make_glass_material()
	cockpit.visibility_range_end = lod_near_end
	near.add_child(cockpit)

	var door_cut = MeshInstance3D.new()
	var door_cut_mesh = BoxMesh.new()
	door_cut_mesh.size = Vector3(1.8, 1.2, 0.08)
	door_cut.mesh = door_cut_mesh
	door_cut.position = Vector3(-0.4, 1.2, size.z * 0.38)
	door_cut.rotation_degrees = Vector3(-12.0, 0.0, 14.0)
	door_cut.material_override = _materials["charred"]
	door_cut.visibility_range_end = lod_near_end
	near.add_child(door_cut)

	for x in [-1.1, 1.1]:
		var skid = MeshInstance3D.new()
		var skid_mesh = CylinderMesh.new()
		skid_mesh.top_radius = 0.07
		skid_mesh.bottom_radius = 0.08
		skid_mesh.height = size.x * 0.62
		skid_mesh.radial_segments = 7
		skid.mesh = skid_mesh
		skid.position = Vector3(0.0, 0.38, x)
		skid.rotation_degrees.z = 90.0
		skid.material_override = _materials["metal"]
		skid.visibility_range_end = lod_near_end
		near.add_child(skid)

	for x in [-1.3, 0.0, 1.3]:
		var strut = MeshInstance3D.new()
		var strut_mesh = CylinderMesh.new()
		strut_mesh.top_radius = 0.04
		strut_mesh.bottom_radius = 0.05
		strut_mesh.height = 0.9
		strut_mesh.radial_segments = 6
		strut.mesh = strut_mesh
		strut.position = Vector3(x, 0.72, 1.05)
		strut.rotation_degrees.z = 22.0
		strut.material_override = _materials["metal"]
		strut.visibility_range_end = lod_near_end
		near.add_child(strut)

	var mast = MeshInstance3D.new()
	var mast_mesh = CylinderMesh.new()
	mast_mesh.top_radius = 0.14
	mast_mesh.bottom_radius = 0.17
	mast_mesh.height = 1.22
	mast_mesh.radial_segments = 8
	mast.mesh = mast_mesh
	mast.position = Vector3(0.22, 2.0, 0.0)
	mast.material_override = _materials["charred"]
	mast.visibility_range_end = lod_near_end
	near.add_child(mast)

	for shard_pos in [Vector3(1.7, 1.12, -1.0), Vector3(-2.0, 1.34, 0.92), Vector3(0.4, 0.9, -1.2)]:
		var shard = MeshInstance3D.new()
		var shard_mesh = BoxMesh.new()
		shard_mesh.size = Vector3(0.9, 0.06, 0.54)
		shard.mesh = shard_mesh
		shard.position = shard_pos
		shard.rotation_degrees = Vector3(-16.0, 0.0, 18.0)
		shard.material_override = _materials["charred"]
		shard.visibility_range_end = lod_near_end
		near.add_child(shard)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = CapsuleMesh.new()
	far_mesh.radius = size.z * 0.38
	far_mesh.height = size.x
	far_mesh.radial_segments = 7
	far_mesh.rings = 4
	far_proxy.mesh = far_mesh
	far_proxy.rotation_degrees.z = 90.0
	far_proxy.position = Vector3(0.0, 1.16, 0.0)
	far_proxy.material_override = _materials["charred"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 252.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	far.add_child(far_proxy)

	_build_static_collider(root, size)

func _spawn_tail_boom(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [5.2, 1.4, 1.2]), Vector3(5.2, 1.4, 1.2))

	var boom = MeshInstance3D.new()
	var boom_mesh = CylinderMesh.new()
	boom_mesh.top_radius = 0.26
	boom_mesh.bottom_radius = 0.34
	boom_mesh.height = size.x
	boom_mesh.radial_segments = 8
	boom.mesh = boom_mesh
	boom.rotation_degrees.z = 90.0
	boom.position = Vector3(0.0, 0.7, 0.0)
	boom.material_override = _materials["charred"]
	boom.visibility_range_end = lod_near_end
	root.add_child(boom)

	var fin = MeshInstance3D.new()
	var fin_mesh = BoxMesh.new()
	fin_mesh.size = Vector3(0.18, 1.2, 1.0)
	fin.mesh = fin_mesh
	fin.position = Vector3(size.x * 0.5 - 0.2, 1.12, 0.0)
	fin.material_override = _materials["metal"]
	fin.visibility_range_end = lod_near_end
	root.add_child(fin)

	var fan = MeshInstance3D.new()
	var fan_mesh = CylinderMesh.new()
	fan_mesh.top_radius = 0.4
	fan_mesh.bottom_radius = 0.4
	fan_mesh.height = 0.08
	fan_mesh.radial_segments = 8
	fan.mesh = fan_mesh
	fan.position = Vector3(size.x * 0.52, 0.9, 0.0)
	fan.rotation_degrees.x = 90.0
	fan.material_override = _materials["metal"]
	fan.visibility_range_end = lod_near_end
	root.add_child(fan)

	_build_static_collider(root, size)

func _spawn_rotor_hub(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [4.2, 0.8, 0.8]), Vector3(4.2, 0.8, 0.8))

	var hub = MeshInstance3D.new()
	var hub_mesh = CylinderMesh.new()
	hub_mesh.top_radius = 0.28
	hub_mesh.bottom_radius = 0.32
	hub_mesh.height = 0.36
	hub_mesh.radial_segments = 9
	hub.mesh = hub_mesh
	hub.position = Vector3(0.0, 0.58, 0.0)
	hub.material_override = _materials["metal"]
	hub.visibility_range_end = lod_near_end
	root.add_child(hub)

	for i in range(4):
		var blade = MeshInstance3D.new()
		var blade_mesh = BoxMesh.new()
		blade_mesh.size = Vector3(size.x, 0.08, 0.24)
		blade.mesh = blade_mesh
		blade.position = Vector3(0.0, 0.58, 0.0)
		blade.rotation_degrees = Vector3(6.0 if i % 2 == 0 else -4.0, float(i) * 90.0 + 11.0, 0.0)
		blade.material_override = _materials["charred"]
		blade.visibility_range_end = lod_near_end
		root.add_child(blade)

	_build_static_collider(root, size)

func _spawn_debris_field(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [6.4, 1.2, 5.4]), Vector3(6.4, 1.2, 5.4))

	var rng = RandomNumberGenerator.new()
	var p: Vector3 = root.position
	rng.seed = int(abs(p.x * 73.0 + p.z * 41.0) * 1000.0)

	var debris_count = _scaled_count(22, 10)
	for i in range(debris_count):
		var shard = MeshInstance3D.new()
		var shard_mesh = BoxMesh.new()
		shard_mesh.size = Vector3(rng.randf_range(0.24, 1.0), rng.randf_range(0.04, 0.28), rng.randf_range(0.12, 0.56))
		shard.mesh = shard_mesh
		shard.position = Vector3(rng.randf_range(-size.x * 0.5, size.x * 0.5), rng.randf_range(0.02, 0.28), rng.randf_range(-size.z * 0.5, size.z * 0.5))
		shard.rotation_degrees = Vector3(rng.randf_range(-28.0, 28.0), rng.randf_range(0.0, 360.0), rng.randf_range(-16.0, 16.0))
		shard.material_override = _materials["charred"] if i % 3 != 0 else _materials["metal"]
		shard.visibility_range_end = lod_near_end
		root.add_child(shard)

	_build_static_collider(root, size)

func _spawn_fire_bed(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.6, 1.2, 1.6]), Vector3(1.6, 1.2, 1.6))

	var rock_count = _scaled_count(6, 3)
	for i in range(rock_count):
		var rock = MeshInstance3D.new()
		var rock_mesh = SphereMesh.new()
		rock_mesh.radius = 0.16 + i * 0.01
		rock_mesh.height = 0.2
		rock_mesh.radial_segments = 7
		rock_mesh.rings = 5
		rock.mesh = rock_mesh
		rock.position = Vector3(cos(float(i) * TAU / 6.0) * 0.5, 0.12, sin(float(i) * TAU / 6.0) * 0.5)
		rock.material_override = _materials["charred"]
		rock.visibility_range_end = lod_near_end
		root.add_child(rock)

	var ember = MeshInstance3D.new()
	ember.mesh = SphereMesh.new()
	ember.scale = Vector3(0.35, 0.1, 0.35)
	ember.position = Vector3(0.0, 0.14, 0.0)
	var ember_mat = StandardMaterial3D.new()
	ember_mat.albedo_color = Color(1.0, 0.34, 0.12)
	ember_mat.emission_enabled = true
	ember_mat.emission = Color(1.0, 0.39, 0.14)
	ember_mat.emission_energy_multiplier = 2.8
	ember.material_override = ember_mat
	ember.visibility_range_end = lod_near_end
	root.add_child(ember)

	var light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.46, 0.22)
	light.light_energy = 2.0
	light.omni_range = 10.0
	light.position = Vector3(0.0, 1.0, 0.0)
	root.add_child(light)

	_build_static_collider(root, size)

func _spawn_smoke_column(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.6, 5.2, 1.6]), Vector3(1.6, 5.2, 1.6))

	var smoke_mat = _make_smoke_material()
	var smoke_count = _scaled_count(4, 2)
	for i in range(smoke_count):
		var puff = MeshInstance3D.new()
		var puff_mesh = SphereMesh.new()
		puff_mesh.radius = 0.5 + float(i) * 0.18
		puff_mesh.height = 0.5 + float(i) * 0.18
		puff_mesh.radial_segments = 8
		puff_mesh.rings = 6
		puff.mesh = puff_mesh
		puff.position = Vector3((float(i) - 1.5) * 0.12, 0.7 + float(i) * 1.05, (2.0 - float(i)) * 0.08)
		puff.material_override = smoke_mat
		puff.visibility_range_end = lod_near_end + 32.0
		root.add_child(puff)

func _spawn_supply_crates(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [2.8, 1.5, 2.0]), Vector3(2.8, 1.5, 2.0))

	for p in [Vector3(0.0, 0.36, 0.0), Vector3(0.84, 0.36, 0.1), Vector3(0.42, 1.06, -0.18)]:
		var crate = MeshInstance3D.new()
		var crate_mesh = BoxMesh.new()
		crate_mesh.size = Vector3(0.78, 0.72, 0.72)
		crate.mesh = crate_mesh
		crate.position = p
		crate.material_override = _materials["crate"]
		crate.visibility_range_end = lod_near_end
		root.add_child(crate)

	_build_static_collider(root, size)

func _spawn_map_case(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.2, 0.8, 0.9]), Vector3(1.2, 0.8, 0.9))

	var case_box = MeshInstance3D.new()
	var case_mesh = BoxMesh.new()
	case_mesh.size = Vector3(0.72, 0.24, 0.5)
	case_box.mesh = case_mesh
	case_box.position = Vector3(0.0, 0.18, 0.0)
	case_box.material_override = _materials["metal"]
	case_box.visibility_range_end = lod_near_end
	root.add_child(case_box)

	var latch = MeshInstance3D.new()
	var latch_mesh = BoxMesh.new()
	latch_mesh.size = Vector3(0.12, 0.08, 0.06)
	latch.mesh = latch_mesh
	latch.position = Vector3(0.0, 0.25, 0.28)
	var latch_mat = StandardMaterial3D.new()
	latch_mat.albedo_color = Color(0.13, 0.56, 0.24)
	latch_mat.emission_enabled = true
	latch_mat.emission = Color(0.13, 0.56, 0.24)
	latch_mat.emission_energy_multiplier = 1.2
	latch.material_override = latch_mat
	latch.visibility_range_end = lod_near_end
	root.add_child(latch)

	var marker = OmniLight3D.new()
	marker.light_color = Color(0.35, 0.9, 0.45)
	marker.light_energy = 0.65
	marker.omni_range = 2.4
	marker.position = Vector3(0.0, 0.3, 0.26)
	root.add_child(marker)

	_build_static_collider(root, size)

func _spawn_scorch_decal(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [4.4, 0.1, 3.2]), Vector3(4.4, 0.1, 3.2))

	var decal = MeshInstance3D.new()
	var mesh = PlaneMesh.new()
	mesh.size = Vector2(size.x, size.z)
	decal.mesh = mesh
	decal.position = Vector3(0.0, 0.03, 0.0)
	decal.rotation_degrees.x = -90.0
	decal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	decal.material_override = _make_scorch_decal_material()
	decal.visibility_range_end = lod_near_end
	root.add_child(decal)

func _spawn_crash_atmosphere() -> void:
	var warning_positions = [Vector3(-20.0, 2.1, 83.8), Vector3(-15.2, 2.0, 87.6)]
	var warning_count = min(warning_positions.size(), _scaled_count(warning_positions.size(), 1))
	for i in range(warning_count):
		var p: Vector3 = warning_positions[i]
		var warning = OmniLight3D.new()
		warning.light_color = Color(0.94, 0.22, 0.16)
		warning.light_energy = 1.25
		warning.omni_range = 6.2
		warning.position = p
		add_child(warning)

	var glow = MeshInstance3D.new()
	glow.mesh = SphereMesh.new()
	glow.scale = Vector3(0.45, 0.2, 0.45)
	glow.position = Vector3(-18.0, 0.1, 85.2)
	var glow_mat = StandardMaterial3D.new()
	glow_mat.albedo_color = Color(1.0, 0.35, 0.12)
	glow_mat.emission_enabled = true
	glow_mat.emission = Color(1.0, 0.42, 0.16)
	glow_mat.emission_energy_multiplier = 2.2
	glow.material_override = glow_mat
	add_child(glow)

func _build_static_collider(parent: Node3D, size: Vector3) -> void:
	var body = StaticBody3D.new()
	var shape = CollisionShape3D.new()
	var box_shape = BoxShape3D.new()
	box_shape.size = size
	shape.shape = box_shape
	shape.position = Vector3(0.0, size.y * 0.5, 0.0)
	body.add_child(shape)
	parent.add_child(body)

func _create_anchor_root(anchor: Dictionary) -> Node3D:
	var root = Node3D.new()
	root.position = _vec3_from_array(anchor.get("position", [0, 0, 0]), Vector3.ZERO)
	root.rotation_degrees.y = float(anchor.get("rotation_y", 0.0))
	root.scale = _vec3_from_array(anchor.get("scale", [1, 1, 1]), Vector3.ONE)
	return root

func _vec3_from_array(values: Variant, fallback: Vector3) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return fallback

func _make_glass_material() -> StandardMaterial3D:
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.42, 0.57, 0.63, 0.46)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.14
	mat.metallic = 0.05
	mat.emission_enabled = true
	mat.emission = Color(0.1, 0.21, 0.23)
	mat.emission_energy_multiplier = 0.4
	return mat

func _make_smoke_material() -> StandardMaterial3D:
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.16, 0.16, 0.16, 0.34)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 1.0
	mat.metallic = 0.0
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.emission_enabled = true
	mat.emission = Color(0.08, 0.08, 0.08)
	mat.emission_energy_multiplier = 0.25
	return mat

func _make_scorch_decal_material() -> StandardMaterial3D:
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.06, 0.05, 0.05, 0.45)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.98
	mat.metallic = 0.0
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

func _resolve_clutter_density() -> float:
	return clamp(float(GraphicsSettings.get_setting("clutter_density", GraphicsSettings.get_setting("foliage_density", 1.0))), 0.55, 1.45)

func _scaled_count(base_count: int, min_count: int) -> int:
	return max(min_count, int(round(float(base_count) * _clutter_density)))
