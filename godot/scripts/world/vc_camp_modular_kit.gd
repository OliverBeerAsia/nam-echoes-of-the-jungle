extends Node3D
class_name VCCampModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 86.0
@export var lod_far_begin: float = 72.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()
	_add_camp_atmosphere()

func _build_materials() -> void:
	_materials = {
		"wood": MatLib.make_pbr_material(Color(0.29, 0.22, 0.14), Color(0.37, 0.27, 0.17), Color(0.44, 0.32, 0.2), 809, 0.86, 0.01, 3),
		"mud": MatLib.make_pbr_material(Color(0.33, 0.29, 0.23), Color(0.4, 0.34, 0.26), Color(0.48, 0.39, 0.31), 887, 0.92, 0.0, 2),
		"cloth": MatLib.make_pbr_material(Color(0.36, 0.42, 0.3), Color(0.42, 0.48, 0.35), Color(0.49, 0.54, 0.39), 951, 0.8, 0.0, 2),
		"metal": MatLib.make_pbr_material(Color(0.36, 0.37, 0.35), Color(0.42, 0.43, 0.4), Color(0.5, 0.5, 0.47), 1033, 0.58, 0.24, 3),
		"sandbag": MatLib.make_pbr_material(Color(0.55, 0.48, 0.33), Color(0.63, 0.54, 0.37), Color(0.68, 0.6, 0.43), 1117, 0.93, 0.0, 2)
	}

func _build_from_zone_definition() -> void:
	var definition = DataStore.get_zone_definition("vc_camp")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id = str(anchor.get("asset_id", ""))
			if asset_id.contains("command_bunker"):
				_spawn_command_bunker(anchor)
			elif asset_id.contains("radio_post"):
				_spawn_radio_post(anchor)
			elif asset_id.contains("prison_cage"):
				_spawn_prison_cage(anchor)
			elif asset_id.contains("watchtower"):
				_spawn_watchtower(anchor)
			elif asset_id.contains("sandbag"):
				_spawn_sandbag_line(anchor)

func _spawn_command_bunker(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [7.0, 3.5, 5.0]), Vector3(7.0, 3.5, 5.0))

	var near = Node3D.new()
	root.add_child(near)
	var far = Node3D.new()
	root.add_child(far)

	var body = MeshInstance3D.new()
	var body_mesh = BoxMesh.new()
	body_mesh.size = Vector3(size.x, size.y, size.z)
	body.mesh = body_mesh
	body.position.y = size.y * 0.5
	body.material_override = _materials["mud"]
	body.visibility_range_end = lod_near_end
	near.add_child(body)

	var roof = MeshInstance3D.new()
	var roof_mesh = BoxMesh.new()
	roof_mesh.size = Vector3(size.x + 0.8, 0.25, size.z + 0.7)
	roof.mesh = roof_mesh
	roof.position = Vector3(0.0, size.y + 0.1, 0.0)
	roof.material_override = _materials["wood"]
	roof.visibility_range_end = lod_near_end
	near.add_child(roof)

	var row_count = _scaled_count(2, 1)
	var bag_cols = _scaled_count(8, 4)
	for row in range(row_count):
		for i in range(bag_cols):
			var bag = MeshInstance3D.new()
			var bag_mesh = BoxMesh.new()
			bag_mesh.size = Vector3(0.86, 0.26, 0.42)
			bag.mesh = bag_mesh
			bag.position = Vector3(-size.x * 0.46 + i * 0.86, size.y + 0.24 + row * 0.29, size.z * 0.52)
			bag.material_override = _materials["sandbag"]
			bag.visibility_range_end = lod_near_end
			near.add_child(bag)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = BoxMesh.new()
	far_mesh.size = Vector3(size.x, size.y + 0.8, size.z)
	far_proxy.mesh = far_mesh
	far_proxy.position.y = (size.y + 0.8) * 0.5
	far_proxy.material_override = _materials["mud"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 250.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	far.add_child(far_proxy)

	_build_static_collider(root, size)

func _spawn_radio_post(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [5.0, 4.5, 4.0]), Vector3(5.0, 4.5, 4.0))

	var mast = MeshInstance3D.new()
	var mast_mesh = CylinderMesh.new()
	mast_mesh.top_radius = 0.08
	mast_mesh.bottom_radius = 0.1
	mast_mesh.height = 8.6
	mast_mesh.radial_segments = 6
	mast.mesh = mast_mesh
	mast.position.y = 4.3
	mast.material_override = _materials["metal"]
	mast.visibility_range_end = lod_near_end + 25.0
	root.add_child(mast)

	for h in [2.2, 4.4, 6.6]:
		var arm = MeshInstance3D.new()
		var arm_mesh = CylinderMesh.new()
		arm_mesh.top_radius = 0.05
		arm_mesh.bottom_radius = 0.05
		arm_mesh.height = 2.3
		arm_mesh.radial_segments = 5
		arm.mesh = arm_mesh
		arm.rotation_degrees.z = 90
		arm.position = Vector3(0.0, h, 0.0)
		arm.material_override = _materials["metal"]
		arm.visibility_range_end = lod_near_end
		root.add_child(arm)

	var light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.25, 0.19)
	light.light_energy = 1.1
	light.omni_range = 6.0
	light.position = Vector3(0.0, 8.8, 0.0)
	root.add_child(light)

	_build_static_collider(root, size)

func _spawn_prison_cage(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [4.0, 2.5, 4.0]), Vector3(4.0, 2.5, 4.0))
	var floor = MeshInstance3D.new()
	var floor_mesh = BoxMesh.new()
	floor_mesh.size = Vector3(size.x, 0.1, size.z)
	floor.mesh = floor_mesh
	floor.position.y = 0.05
	floor.material_override = _materials["wood"]
	floor.visibility_range_end = lod_near_end
	root.add_child(floor)

	var bar_count = _scaled_count(6, 4)
	for i in range(bar_count):
		var x = -size.x * 0.5 + 0.2 + i * ((size.x - 0.4) / max(1.0, float(bar_count - 1)))
		var bar = MeshInstance3D.new()
		var bar_mesh = CylinderMesh.new()
		bar_mesh.top_radius = 0.03
		bar_mesh.bottom_radius = 0.03
		bar_mesh.height = size.y
		bar_mesh.radial_segments = 5
		bar.mesh = bar_mesh
		bar.position = Vector3(x, size.y * 0.5, size.z * 0.5)
		bar.material_override = _materials["metal"]
		bar.visibility_range_end = lod_near_end
		root.add_child(bar)

	var shell = MeshInstance3D.new()
	var shell_mesh = BoxMesh.new()
	shell_mesh.size = size
	shell.mesh = shell_mesh
	shell.position.y = size.y * 0.5
	shell.material_override = _materials["metal"]
	shell.transparency = 0.75
	shell.visibility_range_begin = lod_far_begin
	shell.visibility_range_end = 230.0
	shell.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	root.add_child(shell)

	_build_static_collider(root, size)

func _spawn_watchtower(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [3.2, 7.8, 3.2]), Vector3(3.2, 7.8, 3.2))
	var half = Vector3(size.x * 0.36, 0.0, size.z * 0.36)

	for corner in [
		Vector3(-half.x, 0.0, -half.z),
		Vector3(half.x, 0.0, -half.z),
		Vector3(-half.x, 0.0, half.z),
		Vector3(half.x, 0.0, half.z)
	]:
		var leg = MeshInstance3D.new()
		var leg_mesh = CylinderMesh.new()
		leg_mesh.top_radius = 0.08
		leg_mesh.bottom_radius = 0.11
		leg_mesh.height = size.y
		leg_mesh.radial_segments = 5
		leg.mesh = leg_mesh
		leg.position = corner + Vector3(0.0, size.y * 0.5, 0.0)
		leg.material_override = _materials["wood"]
		leg.visibility_range_end = lod_near_end
		root.add_child(leg)

	var platform = MeshInstance3D.new()
	var platform_mesh = BoxMesh.new()
	platform_mesh.size = Vector3(size.x + 0.4, 0.25, size.z + 0.4)
	platform.mesh = platform_mesh
	platform.position = Vector3(0.0, size.y - 0.2, 0.0)
	platform.material_override = _materials["wood"]
	platform.visibility_range_end = lod_near_end
	root.add_child(platform)

	var roof = MeshInstance3D.new()
	var roof_mesh = PrismMesh.new()
	roof_mesh.size = Vector3(size.x + 1.0, 1.3, size.z + 1.0)
	roof.mesh = roof_mesh
	roof.position = Vector3(0.0, size.y + 0.55, 0.0)
	roof.material_override = _materials["cloth"]
	roof.visibility_range_end = lod_near_end
	root.add_child(roof)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = CylinderMesh.new()
	far_mesh.top_radius = 0.65
	far_mesh.bottom_radius = 0.9
	far_mesh.height = size.y + 1.2
	far_mesh.radial_segments = 6
	far_proxy.mesh = far_mesh
	far_proxy.position.y = (size.y + 1.2) * 0.5
	far_proxy.material_override = _materials["wood"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 240.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	root.add_child(far_proxy)

	_build_static_collider(root, size)

func _spawn_sandbag_line(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [6.5, 1.2, 1.2]), Vector3(6.5, 1.2, 1.2))
	var bag_count = int(round((size.x / 0.85) * _clutter_density))
	if bag_count < 4:
		bag_count = 4

	var row_count = _scaled_count(2, 1)
	for row in range(row_count):
		for i in range(bag_count):
			var bag = MeshInstance3D.new()
			var bag_mesh = BoxMesh.new()
			bag_mesh.size = Vector3(0.8, 0.28, 0.38)
			bag.mesh = bag_mesh
			bag.position = Vector3(-size.x * 0.5 + 0.42 + i * 0.84, 0.15 + row * 0.3, 0.0)
			bag.material_override = _materials["sandbag"]
			bag.visibility_range_end = lod_near_end
			root.add_child(bag)

	_build_static_collider(root, size)

func _add_camp_atmosphere() -> void:
	var fire_positions = [Vector3(-53.0, 0.0, -35.0), Vector3(-47.0, 0.0, -46.0)]
	var fire_count = min(fire_positions.size(), _scaled_count(fire_positions.size(), 1))
	for i in range(fire_count):
		var fire_pos: Vector3 = fire_positions[i]
		var fire = OmniLight3D.new()
		fire.light_color = Color(1.0, 0.49, 0.22)
		fire.light_energy = 1.9
		fire.omni_range = 11.0
		fire.position = fire_pos + Vector3(0.0, 1.0, 0.0)
		add_child(fire)

		var ember = MeshInstance3D.new()
		ember.mesh = SphereMesh.new()
		ember.position = fire_pos + Vector3(0.0, 0.12, 0.0)
		ember.scale = Vector3(0.24, 0.1, 0.24)
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(1.0, 0.38, 0.12)
		mat.emission_enabled = true
		mat.emission = Color(1.0, 0.42, 0.14)
		mat.emission_energy_multiplier = 2.6
		ember.material_override = mat
		add_child(ember)

func _build_static_collider(parent: Node3D, size: Vector3) -> void:
	var body = StaticBody3D.new()
	var shape = CollisionShape3D.new()
	var box_shape = BoxShape3D.new()
	box_shape.size = size
	shape.shape = box_shape
	shape.position = Vector3(0, size.y * 0.5, 0)
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
