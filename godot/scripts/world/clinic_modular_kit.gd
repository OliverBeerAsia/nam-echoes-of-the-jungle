extends Node3D
class_name ClinicModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 84.0
@export var lod_far_begin: float = 68.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()
	_spawn_clinic_fx()

func _build_materials() -> void:
	_materials = {
		"plaster": MatLib.make_pbr_material(Color(0.62, 0.6, 0.53), Color(0.69, 0.67, 0.59), Color(0.75, 0.73, 0.64), 1297, 0.85, 0.01, 3),
		"roof": MatLib.make_pbr_material(Color(0.28, 0.31, 0.33), Color(0.34, 0.37, 0.39), Color(0.4, 0.43, 0.45), 1361, 0.7, 0.18, 2),
		"wood": MatLib.make_pbr_material(Color(0.36, 0.28, 0.19), Color(0.42, 0.33, 0.23), Color(0.49, 0.39, 0.28), 1433, 0.82, 0.02, 3),
		"crate": MatLib.make_pbr_material(Color(0.34, 0.28, 0.2), Color(0.41, 0.33, 0.23), Color(0.47, 0.39, 0.27), 1511, 0.86, 0.02, 2),
		"metal": MatLib.make_pbr_material(Color(0.36, 0.38, 0.39), Color(0.43, 0.44, 0.44), Color(0.5, 0.51, 0.5), 1597, 0.58, 0.3, 3),
		"canvas": MatLib.make_pbr_material(Color(0.49, 0.54, 0.45), Color(0.56, 0.6, 0.51), Color(0.62, 0.66, 0.57), 1663, 0.74, 0.01, 2)
	}

func _build_from_zone_definition() -> void:
	var definition = DataStore.get_zone_definition("clinic")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id = str(anchor.get("asset_id", ""))
			if asset_id.contains("main_building"):
				_spawn_main_building(anchor)
			elif asset_id.contains("cache_box"):
				_spawn_cache_box(anchor)
			elif asset_id.contains("ambulance_wreck"):
				_spawn_ambulance_wreck(anchor)
			elif asset_id.contains("triage_tent"):
				_spawn_triage_tent(anchor)

func _spawn_main_building(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [12.0, 3.6, 8.0]), Vector3(12.0, 3.6, 8.0))
	var near = Node3D.new()
	root.add_child(near)
	var far = Node3D.new()
	root.add_child(far)

	var body = MeshInstance3D.new()
	var body_mesh = BoxMesh.new()
	body_mesh.size = size
	body.mesh = body_mesh
	body.position.y = size.y * 0.5
	body.material_override = _materials["plaster"]
	body.visibility_range_end = lod_near_end
	near.add_child(body)

	var roof = MeshInstance3D.new()
	var roof_mesh = BoxMesh.new()
	roof_mesh.size = Vector3(size.x + 0.6, 0.25, size.z + 0.8)
	roof.mesh = roof_mesh
	roof.position = Vector3(0.0, size.y + 0.15, 0.0)
	roof.material_override = _materials["roof"]
	roof.visibility_range_end = lod_near_end
	near.add_child(roof)

	# Broken roof panels to avoid clean-block look.
	var roof_panels = [
		Vector3(-2.2, size.y + 0.27, -1.6),
		Vector3(1.3, size.y + 0.27, 0.4),
		Vector3(3.0, size.y + 0.27, -0.8)
	]
	var panel_count = min(roof_panels.size(), _scaled_count(roof_panels.size(), 1))
	for i in range(panel_count):
		var panel: Vector3 = roof_panels[i]
		var shard = MeshInstance3D.new()
		var shard_mesh = BoxMesh.new()
		shard_mesh.size = Vector3(1.7, 0.07, 0.9)
		shard.mesh = shard_mesh
		shard.position = panel
		shard.rotation_degrees = Vector3(-9.0, 0.0, 8.0)
		shard.material_override = _materials["roof"]
		shard.visibility_range_end = lod_near_end
		near.add_child(shard)

	var awning = MeshInstance3D.new()
	var awning_mesh = BoxMesh.new()
	awning_mesh.size = Vector3(4.1, 0.1, 1.8)
	awning.mesh = awning_mesh
	awning.position = Vector3(size.x * 0.42, size.y * 0.66, 0.0)
	awning.material_override = _materials["canvas"]
	awning.visibility_range_end = lod_near_end
	near.add_child(awning)

	var cross = MeshInstance3D.new()
	var cross_mesh = BoxMesh.new()
	cross_mesh.size = Vector3(0.17, 1.0, 0.06)
	cross.mesh = cross_mesh
	cross.position = Vector3(size.x * 0.5 + 0.08, size.y * 0.65, 0.0)
	var cross_mat = StandardMaterial3D.new()
	cross_mat.albedo_color = Color(0.76, 0.18, 0.16)
	cross_mat.emission_enabled = true
	cross_mat.emission = Color(0.76, 0.18, 0.16)
	cross_mat.emission_energy_multiplier = 0.6
	cross.material_override = cross_mat
	cross.visibility_range_end = lod_near_end
	near.add_child(cross)

	var cross_h = MeshInstance3D.new()
	var cross_h_mesh = BoxMesh.new()
	cross_h_mesh.size = Vector3(0.92, 0.2, 0.06)
	cross_h.mesh = cross_h_mesh
	cross_h.position = Vector3(size.x * 0.5 + 0.08, size.y * 0.65, 0.0)
	cross_h.material_override = cross_mat
	cross_h.visibility_range_end = lod_near_end
	near.add_child(cross_h)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = BoxMesh.new()
	far_mesh.size = Vector3(size.x, size.y + 0.8, size.z)
	far_proxy.mesh = far_mesh
	far_proxy.position.y = (size.y + 0.8) * 0.5
	far_proxy.material_override = _materials["plaster"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 240.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	far.add_child(far_proxy)

	_build_static_collider(root, size)

func _spawn_cache_box(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.4, 1.0, 1.4]), Vector3(1.4, 1.0, 1.4))

	var crate = MeshInstance3D.new()
	var crate_mesh = BoxMesh.new()
	crate_mesh.size = size
	crate.mesh = crate_mesh
	crate.position.y = size.y * 0.5
	crate.material_override = _materials["crate"]
	crate.visibility_range_end = lod_near_end
	root.add_child(crate)

	_build_static_collider(root, size)

func _spawn_ambulance_wreck(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [3.8, 1.5, 2.2]), Vector3(3.8, 1.5, 2.2))

	var body = MeshInstance3D.new()
	var body_mesh = BoxMesh.new()
	body_mesh.size = size
	body.mesh = body_mesh
	body.position.y = size.y * 0.5
	body.material_override = _materials["metal"]
	body.visibility_range_end = lod_near_end
	root.add_child(body)

	for wheel_pos in [
		Vector3(-1.3, 0.35, -0.95),
		Vector3(1.3, 0.35, -0.95),
		Vector3(-1.3, 0.35, 0.95),
		Vector3(1.3, 0.35, 0.95)
	]:
		var wheel = MeshInstance3D.new()
		var wheel_mesh = CylinderMesh.new()
		wheel_mesh.top_radius = 0.28
		wheel_mesh.bottom_radius = 0.28
		wheel_mesh.height = 0.2
		wheel_mesh.radial_segments = 10
		wheel.mesh = wheel_mesh
		wheel.rotation_degrees.z = 90.0
		wheel.position = wheel_pos
		var wheel_mat = StandardMaterial3D.new()
		wheel_mat.albedo_color = Color(0.07, 0.07, 0.07)
		wheel_mat.roughness = 0.96
		wheel.material_override = wheel_mat
		wheel.visibility_range_end = lod_near_end
		root.add_child(wheel)

	_build_static_collider(root, size)

func _spawn_triage_tent(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [4.0, 2.3, 2.8]), Vector3(4.0, 2.3, 2.8))

	var tent = MeshInstance3D.new()
	var tent_mesh = PrismMesh.new()
	tent_mesh.size = Vector3(size.x, size.y, size.z)
	tent.mesh = tent_mesh
	tent.position.y = size.y * 0.5
	tent.material_override = _materials["canvas"]
	tent.visibility_range_end = lod_near_end
	root.add_child(tent)

	_build_static_collider(root, size)

func _spawn_clinic_fx() -> void:
	var lamp_positions = [Vector3(63.1, 2.3, 18.0), Vector3(60.8, 2.1, 14.4)]
	var lamp_count = min(lamp_positions.size(), _scaled_count(lamp_positions.size(), 1))
	for i in range(lamp_count):
		var p: Vector3 = lamp_positions[i]
		var lamp = OmniLight3D.new()
		lamp.light_color = Color(1.0, 0.95, 0.84)
		lamp.light_energy = 1.2
		lamp.omni_range = 7.0
		lamp.position = p
		add_child(lamp)

	var beacon = OmniLight3D.new()
	beacon.light_color = Color(0.78, 0.16, 0.14)
	beacon.light_energy = 1.3
	beacon.omni_range = 6.5
	beacon.position = Vector3(64.2, 2.35, 18.0)
	add_child(beacon)

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
