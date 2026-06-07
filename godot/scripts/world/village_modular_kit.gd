extends Node3D
class_name VillageModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 78.0
@export var lod_far_begin: float = 64.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()

func _build_materials() -> void:
	_materials = {
		"wall": MatLib.make_pbr_material(Color(0.46, 0.38, 0.28), Color(0.53, 0.44, 0.31), Color(0.59, 0.5, 0.36), 101, 0.86, 0.02, 3),
		"roof": MatLib.make_pbr_material(Color(0.36, 0.28, 0.17), Color(0.44, 0.33, 0.2), Color(0.5, 0.4, 0.24), 211, 0.94, 0.0, 2),
		"wood": MatLib.make_pbr_material(Color(0.28, 0.2, 0.12), Color(0.34, 0.24, 0.14), Color(0.39, 0.29, 0.18), 307, 0.88, 0.01, 3),
		"cloth": MatLib.make_pbr_material(Color(0.42, 0.45, 0.3), Color(0.49, 0.51, 0.35), Color(0.56, 0.58, 0.42), 401, 0.72, 0.0, 2),
		"stone": MatLib.make_pbr_material(Color(0.39, 0.39, 0.36), Color(0.45, 0.45, 0.41), Color(0.52, 0.51, 0.48), 509, 0.92, 0.02, 3)
	}

func _build_from_zone_definition() -> void:
	var definition := DataStore.get_zone_definition("village")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id := str(anchor.get("asset_id", ""))
			if asset_id.contains("hut") or asset_id.contains("market_hall"):
				_spawn_hut_lod(anchor, asset_id.contains("market"))
			elif asset_id.contains("stall"):
				_spawn_market_stall(anchor)
			elif asset_id.contains("well"):
				_spawn_well(anchor)
			elif asset_id.contains("crate"):
				_spawn_crate_cluster(anchor)

func _spawn_hut_lod(anchor: Dictionary, is_market_hall: bool) -> void:
	var anchor_node := _create_anchor_root(anchor)
	add_child(anchor_node)

	var near := Node3D.new()
	near.name = "NearLOD"
	anchor_node.add_child(near)

	var far := Node3D.new()
	far.name = "FarLOD"
	anchor_node.add_child(far)

	var size := _vec3_from_array(anchor.get("proxy_size", [4.0, 3.0, 3.5]), Vector3(4.0, 3.0, 3.5))
	_build_hut_detail(near, size, is_market_hall)
	_build_hut_far(far, size)
	_build_static_collider(anchor_node, size)

func _build_hut_detail(parent: Node3D, size: Vector3, is_market_hall: bool) -> void:
	var wall_height := size.y
	var wall := MeshInstance3D.new()
	var wall_mesh := BoxMesh.new()
	wall_mesh.size = Vector3(size.x, wall_height, size.z)
	wall.mesh = wall_mesh
	wall.position.y = wall_height * 0.5
	wall.material_override = _materials["wall"]
	wall.visibility_range_end = lod_near_end
	parent.add_child(wall)

	# Structural posts add depth and silhouette breakup.
	for corner in [
		Vector3(-size.x * 0.46, 0.0, -size.z * 0.46),
		Vector3(size.x * 0.46, 0.0, -size.z * 0.46),
		Vector3(-size.x * 0.46, 0.0, size.z * 0.46),
		Vector3(size.x * 0.46, 0.0, size.z * 0.46)
	]:
		var post := MeshInstance3D.new()
		var post_mesh := CylinderMesh.new()
		post_mesh.top_radius = 0.09
		post_mesh.bottom_radius = 0.12
		post_mesh.height = wall_height + 0.22
		post_mesh.radial_segments = 6
		post.mesh = post_mesh
		post.position = corner + Vector3(0.0, (wall_height + 0.22) * 0.5, 0.0)
		post.material_override = _materials["wood"]
		post.visibility_range_end = lod_near_end
		parent.add_child(post)

	var roof := MeshInstance3D.new()
	var roof_mesh := PrismMesh.new()
	roof_mesh.size = Vector3(size.x + 0.9, max(1.35, size.y * 0.58), size.z + 0.9)
	roof.mesh = roof_mesh
	roof.position.y = wall_height + roof_mesh.size.y * 0.5 - 0.02
	roof.rotation_degrees.y = 0.0 if is_market_hall else 90.0
	roof.material_override = _materials["roof"]
	roof.visibility_range_end = lod_near_end
	parent.add_child(roof)

	if is_market_hall:
		var canopy_count := _scaled_count(3, 1)
		for i in range(canopy_count):
			var canopy := MeshInstance3D.new()
			var canopy_mesh := BoxMesh.new()
			canopy_mesh.size = Vector3(1.6, 0.08, 1.1)
			canopy.mesh = canopy_mesh
			canopy.position = Vector3(-size.x * 0.5 + 1.2 + i * 1.8, wall_height * 0.7, size.z * 0.58)
			canopy.rotation_degrees.x = -8.0
			canopy.material_override = _materials["cloth"]
			canopy.visibility_range_end = lod_near_end
			parent.add_child(canopy)

func _build_hut_far(parent: Node3D, size: Vector3) -> void:
	var body := MeshInstance3D.new()
	var body_mesh := BoxMesh.new()
	body_mesh.size = Vector3(size.x, size.y + 0.7, size.z)
	body.mesh = body_mesh
	body.position.y = (size.y + 0.7) * 0.5
	body.material_override = _materials["wall"]
	body.visibility_range_begin = lod_far_begin
	body.visibility_range_end = 260.0
	body.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	parent.add_child(body)

func _spawn_market_stall(anchor: Dictionary) -> void:
	var root := _create_anchor_root(anchor)
	add_child(root)

	var top := MeshInstance3D.new()
	var top_mesh := BoxMesh.new()
	top_mesh.size = Vector3(2.4, 0.1, 1.5)
	top.mesh = top_mesh
	top.position = Vector3(0, 1.32, 0)
	top.material_override = _materials["cloth"]
	top.visibility_range_end = lod_near_end
	root.add_child(top)

	for x in [-0.95, 0.95]:
		for z in [-0.58, 0.58]:
			var leg := MeshInstance3D.new()
			var leg_mesh := CylinderMesh.new()
			leg_mesh.top_radius = 0.05
			leg_mesh.bottom_radius = 0.06
			leg_mesh.height = 1.3
			leg_mesh.radial_segments = 5
			leg.mesh = leg_mesh
			leg.position = Vector3(x, 0.65, z)
			leg.material_override = _materials["wood"]
			leg.visibility_range_end = lod_near_end
			root.add_child(leg)

	_build_static_collider(root, _vec3_from_array(anchor.get("proxy_size", [2.8, 2.2, 1.8]), Vector3(2.8, 2.2, 1.8)))

func _spawn_well(anchor: Dictionary) -> void:
	var root := _create_anchor_root(anchor)
	add_child(root)

	var ring := MeshInstance3D.new()
	var ring_mesh := CylinderMesh.new()
	ring_mesh.top_radius = 0.86
	ring_mesh.bottom_radius = 0.94
	ring_mesh.height = 0.9
	ring_mesh.radial_segments = 14
	ring.mesh = ring_mesh
	ring.position.y = 0.45
	ring.material_override = _materials["stone"]
	ring.visibility_range_end = lod_near_end
	root.add_child(ring)

	var beam := MeshInstance3D.new()
	var beam_mesh := CylinderMesh.new()
	beam_mesh.top_radius = 0.05
	beam_mesh.bottom_radius = 0.05
	beam_mesh.height = 1.1
	beam_mesh.radial_segments = 6
	beam.mesh = beam_mesh
	beam.rotation_degrees.z = 90
	beam.position = Vector3(0, 2.1, 0)
	beam.material_override = _materials["wood"]
	beam.visibility_range_end = lod_near_end
	root.add_child(beam)

	for x in [-0.44, 0.44]:
		var post := MeshInstance3D.new()
		var post_mesh := CylinderMesh.new()
		post_mesh.top_radius = 0.08
		post_mesh.bottom_radius = 0.09
		post_mesh.height = 2.15
		post_mesh.radial_segments = 6
		post.mesh = post_mesh
		post.position = Vector3(x, 1.08, 0)
		post.material_override = _materials["wood"]
		post.visibility_range_end = lod_near_end
		root.add_child(post)

	_build_static_collider(root, _vec3_from_array(anchor.get("proxy_size", [1.8, 2.2, 1.8]), Vector3(1.8, 2.2, 1.8)))

func _spawn_crate_cluster(anchor: Dictionary) -> void:
	var root := _create_anchor_root(anchor)
	add_child(root)

	var stack := [
		Vector3(0.0, 0.35, 0.0),
		Vector3(0.85, 0.35, 0.0),
		Vector3(0.42, 1.05, -0.2)
	]

	for pos in stack:
		var box := MeshInstance3D.new()
		var box_mesh := BoxMesh.new()
		box_mesh.size = Vector3(0.74, 0.7, 0.72)
		box.mesh = box_mesh
		box.position = pos
		box.material_override = _materials["wood"]
		box.visibility_range_end = lod_near_end
		root.add_child(box)

	_build_static_collider(root, _vec3_from_array(anchor.get("proxy_size", [2.6, 1.4, 1.8]), Vector3(2.6, 1.4, 1.8)))

func _build_static_collider(parent: Node3D, size: Vector3) -> void:
	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = size
	shape.shape = box_shape
	shape.position = Vector3(0, size.y * 0.5, 0)
	body.add_child(shape)
	parent.add_child(body)

func _create_anchor_root(anchor: Dictionary) -> Node3D:
	var root := Node3D.new()
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
