extends Node3D
class_name HamletModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 86.0
@export var lod_far_begin: float = 69.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()
	_spawn_hamlet_atmosphere()

func _build_materials() -> void:
	_materials = {
		"bamboo": MatLib.make_pbr_material(Color(0.42, 0.36, 0.24), Color(0.49, 0.43, 0.29), Color(0.56, 0.5, 0.35), 2171, 0.85, 0.01, 3),
		"thatch": MatLib.make_pbr_material(Color(0.46, 0.39, 0.22), Color(0.54, 0.46, 0.28), Color(0.62, 0.54, 0.34), 2243, 0.94, 0.0, 3),
		"clay": MatLib.make_pbr_material(Color(0.41, 0.31, 0.24), Color(0.48, 0.37, 0.28), Color(0.54, 0.43, 0.33), 2317, 0.88, 0.0, 2),
		"cloth": MatLib.make_pbr_material(Color(0.42, 0.48, 0.38), Color(0.49, 0.55, 0.44), Color(0.56, 0.62, 0.5), 2381, 0.79, 0.0, 2),
		"wood": MatLib.make_pbr_material(Color(0.31, 0.24, 0.16), Color(0.38, 0.29, 0.2), Color(0.45, 0.35, 0.24), 2459, 0.85, 0.01, 3),
		"stone": MatLib.make_pbr_material(Color(0.35, 0.35, 0.33), Color(0.42, 0.42, 0.39), Color(0.5, 0.5, 0.46), 2521, 0.9, 0.0, 3)
	}

func _build_from_zone_definition() -> void:
	var definition = DataStore.get_zone_definition("hamlet")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id = str(anchor.get("asset_id", ""))
			if asset_id.contains("hamlet_hut"):
				_spawn_stilt_hut(anchor)
			elif asset_id.contains("market_canopy"):
				_spawn_market_canopy(anchor)
			elif asset_id.contains("fishing_rack"):
				_spawn_fishing_rack(anchor)
			elif asset_id.contains("supply_cart"):
				_spawn_supply_cart(anchor)
			elif asset_id.contains("cooking_fire"):
				_spawn_cooking_fire(anchor)
			elif asset_id.contains("water_jars"):
				_spawn_water_jars(anchor)

func _spawn_stilt_hut(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [3.6, 2.6, 3.0]), Vector3(3.6, 2.6, 3.0))
	var near = Node3D.new()
	root.add_child(near)
	var far = Node3D.new()
	root.add_child(far)

	var stilt_height = 1.1
	for corner in [
		Vector3(-size.x * 0.43, 0.0, -size.z * 0.43),
		Vector3(size.x * 0.43, 0.0, -size.z * 0.43),
		Vector3(-size.x * 0.43, 0.0, size.z * 0.43),
		Vector3(size.x * 0.43, 0.0, size.z * 0.43)
	]:
		var post = MeshInstance3D.new()
		var post_mesh = CylinderMesh.new()
		post_mesh.top_radius = 0.08
		post_mesh.bottom_radius = 0.1
		post_mesh.height = stilt_height + 0.5
		post_mesh.radial_segments = 6
		post.mesh = post_mesh
		post.position = corner + Vector3(0.0, (stilt_height + 0.5) * 0.5, 0.0)
		post.material_override = _materials["bamboo"]
		post.visibility_range_end = lod_near_end
		near.add_child(post)

	var floor = MeshInstance3D.new()
	var floor_mesh = BoxMesh.new()
	floor_mesh.size = Vector3(size.x, 0.16, size.z)
	floor.mesh = floor_mesh
	floor.position.y = stilt_height
	floor.material_override = _materials["wood"]
	floor.visibility_range_end = lod_near_end
	near.add_child(floor)

	var body = MeshInstance3D.new()
	var body_mesh = BoxMesh.new()
	body_mesh.size = Vector3(size.x * 0.9, size.y * 0.62, size.z * 0.88)
	body.mesh = body_mesh
	body.position = Vector3(0.0, stilt_height + body_mesh.size.y * 0.5 + 0.08, 0.0)
	body.material_override = _materials["clay"]
	body.visibility_range_end = lod_near_end
	near.add_child(body)

	var roof = MeshInstance3D.new()
	var roof_mesh = PrismMesh.new()
	roof_mesh.size = Vector3(size.x + 0.6, max(1.2, size.y * 0.54), size.z + 0.6)
	roof.mesh = roof_mesh
	roof.position.y = stilt_height + body_mesh.size.y + roof_mesh.size.y * 0.48
	roof.material_override = _materials["thatch"]
	roof.visibility_range_end = lod_near_end
	near.add_child(roof)

	for step in range(3):
		var stair = MeshInstance3D.new()
		var stair_mesh = BoxMesh.new()
		stair_mesh.size = Vector3(0.86, 0.1, 0.34)
		stair.mesh = stair_mesh
		stair.position = Vector3(size.x * 0.45, 0.2 + step * 0.22, -0.3 + step * 0.18)
		stair.material_override = _materials["wood"]
		stair.visibility_range_end = lod_near_end
		near.add_child(stair)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = BoxMesh.new()
	far_mesh.size = Vector3(size.x, size.y + 1.4, size.z)
	far_proxy.mesh = far_mesh
	far_proxy.position.y = (size.y + 1.4) * 0.5
	far_proxy.material_override = _materials["clay"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 236.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	far.add_child(far_proxy)

	_build_static_collider(root, Vector3(size.x, size.y + 1.2, size.z))

func _spawn_market_canopy(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [4.2, 2.2, 2.4]), Vector3(4.2, 2.2, 2.4))

	var canopy = MeshInstance3D.new()
	var canopy_mesh = BoxMesh.new()
	canopy_mesh.size = Vector3(size.x, 0.1, size.z)
	canopy.mesh = canopy_mesh
	canopy.position = Vector3(0.0, size.y - 0.24, 0.0)
	canopy.material_override = _materials["cloth"]
	canopy.visibility_range_end = lod_near_end
	root.add_child(canopy)

	for x in [-size.x * 0.43, size.x * 0.43]:
		for z in [-size.z * 0.4, size.z * 0.4]:
			var pole = MeshInstance3D.new()
			var pole_mesh = CylinderMesh.new()
			pole_mesh.top_radius = 0.06
			pole_mesh.bottom_radius = 0.07
			pole_mesh.height = size.y
			pole_mesh.radial_segments = 6
			pole.mesh = pole_mesh
			pole.position = Vector3(x, size.y * 0.5, z)
			pole.material_override = _materials["bamboo"]
			pole.visibility_range_end = lod_near_end
			root.add_child(pole)

	var table = MeshInstance3D.new()
	var table_mesh = BoxMesh.new()
	table_mesh.size = Vector3(size.x * 0.72, 0.14, size.z * 0.58)
	table.mesh = table_mesh
	table.position = Vector3(0.0, 0.78, 0.0)
	table.material_override = _materials["wood"]
	table.visibility_range_end = lod_near_end
	root.add_child(table)

	_build_static_collider(root, size)

func _spawn_fishing_rack(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [2.8, 1.8, 1.4]), Vector3(2.8, 1.8, 1.4))

	for x in [-size.x * 0.44, size.x * 0.44]:
		var post = MeshInstance3D.new()
		var post_mesh = CylinderMesh.new()
		post_mesh.top_radius = 0.06
		post_mesh.bottom_radius = 0.08
		post_mesh.height = size.y
		post_mesh.radial_segments = 6
		post.mesh = post_mesh
		post.position = Vector3(x, size.y * 0.5, 0.0)
		post.material_override = _materials["bamboo"]
		post.visibility_range_end = lod_near_end
		root.add_child(post)

	var beam = MeshInstance3D.new()
	var beam_mesh = CylinderMesh.new()
	beam_mesh.top_radius = 0.05
	beam_mesh.bottom_radius = 0.05
	beam_mesh.height = size.x
	beam_mesh.radial_segments = 6
	beam.mesh = beam_mesh
	beam.position = Vector3(0.0, size.y - 0.18, 0.0)
	beam.rotation_degrees.z = 90.0
	beam.material_override = _materials["bamboo"]
	beam.visibility_range_end = lod_near_end
	root.add_child(beam)

	var fish_count = _scaled_count(4, 2)
	for i in range(fish_count):
		var fish = MeshInstance3D.new()
		var fish_mesh = CapsuleMesh.new()
		fish_mesh.radius = 0.05
		fish_mesh.height = 0.32
		fish_mesh.radial_segments = 7
		fish_mesh.rings = 4
		fish.mesh = fish_mesh
		fish.position = Vector3(-size.x * 0.32 + i * 0.42, size.y * 0.56, 0.0)
		fish.rotation_degrees.z = 90.0
		fish.material_override = _materials["stone"]
		fish.visibility_range_end = lod_near_end
		root.add_child(fish)

	_build_static_collider(root, size)

func _spawn_supply_cart(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [2.5, 1.5, 1.5]), Vector3(2.5, 1.5, 1.5))

	var body = MeshInstance3D.new()
	var body_mesh = BoxMesh.new()
	body_mesh.size = Vector3(size.x, 0.7, size.z)
	body.mesh = body_mesh
	body.position = Vector3(0.0, 0.78, 0.0)
	body.material_override = _materials["wood"]
	body.visibility_range_end = lod_near_end
	root.add_child(body)

	for wheel_pos in [
		Vector3(-0.8, 0.35, -0.62),
		Vector3(0.8, 0.35, -0.62),
		Vector3(-0.8, 0.35, 0.62),
		Vector3(0.8, 0.35, 0.62)
	]:
		var wheel = MeshInstance3D.new()
		var wheel_mesh = CylinderMesh.new()
		wheel_mesh.top_radius = 0.28
		wheel_mesh.bottom_radius = 0.28
		wheel_mesh.height = 0.11
		wheel_mesh.radial_segments = 9
		wheel.mesh = wheel_mesh
		wheel.position = wheel_pos
		wheel.rotation_degrees.z = 90.0
		wheel.material_override = _materials["wood"]
		wheel.visibility_range_end = lod_near_end
		root.add_child(wheel)

	_build_static_collider(root, size)

func _spawn_cooking_fire(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.2, 1.0, 1.2]), Vector3(1.2, 1.0, 1.2))

	for p in [
		Vector3(-0.42, 0.12, -0.2),
		Vector3(0.38, 0.12, -0.14),
		Vector3(-0.08, 0.12, 0.42),
		Vector3(0.3, 0.12, 0.3)
	]:
		var rock = MeshInstance3D.new()
		var rock_mesh = SphereMesh.new()
		rock_mesh.radius = 0.16
		rock_mesh.height = 0.2
		rock_mesh.radial_segments = 7
		rock_mesh.rings = 5
		rock.mesh = rock_mesh
		rock.position = p
		rock.material_override = _materials["stone"]
		rock.visibility_range_end = lod_near_end
		root.add_child(rock)

	var ember = MeshInstance3D.new()
	ember.mesh = SphereMesh.new()
	ember.scale = Vector3(0.28, 0.1, 0.28)
	ember.position = Vector3(0.0, 0.16, 0.0)
	var ember_mat = StandardMaterial3D.new()
	ember_mat.albedo_color = Color(0.97, 0.32, 0.12)
	ember_mat.emission_enabled = true
	ember_mat.emission = Color(1.0, 0.38, 0.14)
	ember_mat.emission_energy_multiplier = 2.4
	ember.material_override = ember_mat
	ember.visibility_range_end = lod_near_end
	root.add_child(ember)

	var light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.52, 0.28)
	light.light_energy = 1.8
	light.omni_range = 8.0
	light.position = Vector3(0.0, 0.84, 0.0)
	root.add_child(light)

	_build_static_collider(root, size)

func _spawn_water_jars(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.8, 1.4, 1.6]), Vector3(1.8, 1.4, 1.6))

	var jar_count = _scaled_count(3, 2)
	for i in range(jar_count):
		var jar = MeshInstance3D.new()
		var jar_mesh = CylinderMesh.new()
		jar_mesh.top_radius = 0.18
		jar_mesh.bottom_radius = 0.24
		jar_mesh.height = 0.56 + i * 0.1
		jar_mesh.radial_segments = 9
		jar.mesh = jar_mesh
		jar.position = Vector3(-0.46 + i * 0.48, jar_mesh.height * 0.5, -0.1 + i * 0.08)
		jar.material_override = _materials["clay"]
		jar.visibility_range_end = lod_near_end
		root.add_child(jar)

	_build_static_collider(root, size)

func _spawn_hamlet_atmosphere() -> void:
	var lantern_positions = [Vector3(92.0, 1.9, 22.0), Vector3(98.5, 2.0, 13.8)]
	var lantern_count = min(lantern_positions.size(), _scaled_count(lantern_positions.size(), 1))
	for i in range(lantern_count):
		var p: Vector3 = lantern_positions[i]
		var lantern = OmniLight3D.new()
		lantern.light_color = Color(1.0, 0.77, 0.5)
		lantern.light_energy = 1.25
		lantern.omni_range = 5.4
		lantern.position = p
		add_child(lantern)

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

func _resolve_clutter_density() -> float:
	return clamp(float(GraphicsSettings.get_setting("clutter_density", GraphicsSettings.get_setting("foliage_density", 1.0))), 0.55, 1.45)

func _scaled_count(base_count: int, min_count: int) -> int:
	return max(min_count, int(round(float(base_count) * _clutter_density)))
