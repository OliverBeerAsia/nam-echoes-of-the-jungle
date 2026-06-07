extends Node3D
class_name ARVNOutpostModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 96.0
@export var lod_far_begin: float = 80.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()
	_add_outpost_fx()

func _build_materials() -> void:
	_materials = {
		"concrete": MatLib.make_pbr_material(Color(0.44, 0.45, 0.43), Color(0.51, 0.52, 0.5), Color(0.58, 0.59, 0.56), 2611, 0.86, 0.03, 3),
		"metal": MatLib.make_pbr_material(Color(0.34, 0.36, 0.35), Color(0.4, 0.42, 0.4), Color(0.48, 0.49, 0.47), 2687, 0.58, 0.31, 3),
		"canvas": MatLib.make_pbr_material(Color(0.45, 0.52, 0.42), Color(0.52, 0.58, 0.49), Color(0.59, 0.65, 0.56), 2749, 0.76, 0.0, 2),
		"wood": MatLib.make_pbr_material(Color(0.31, 0.24, 0.16), Color(0.38, 0.29, 0.2), Color(0.45, 0.36, 0.24), 2833, 0.84, 0.01, 3),
		"sandbag": MatLib.make_pbr_material(Color(0.58, 0.52, 0.37), Color(0.64, 0.57, 0.41), Color(0.7, 0.63, 0.47), 2903, 0.93, 0.0, 2)
	}

func _build_from_zone_definition() -> void:
	var definition = DataStore.get_zone_definition("arvn_outpost")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id = str(anchor.get("asset_id", ""))
			if asset_id.contains("outpost_gate"):
				_spawn_gate(anchor)
			elif asset_id.contains("command_post"):
				_spawn_command_post(anchor)
			elif asset_id.contains("watch_tower"):
				_spawn_watch_tower(anchor)
			elif asset_id.contains("triage_tent"):
				_spawn_triage_tent(anchor)
			elif asset_id.contains("checkpoint_barrier"):
				_spawn_checkpoint_barrier(anchor)
			elif asset_id.contains("sandbag_nest"):
				_spawn_sandbag_nest(anchor)
			elif asset_id.contains("comms_corner"):
				_spawn_comms_corner(anchor)
			elif asset_id.contains("spotlight_mast"):
				_spawn_spotlight_mast(anchor)

func _spawn_gate(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [5.8, 3.2, 1.5]), Vector3(5.8, 3.2, 1.5))

	for x in [-size.x * 0.46, size.x * 0.46]:
		var post = MeshInstance3D.new()
		var post_mesh = BoxMesh.new()
		post_mesh.size = Vector3(0.44, size.y, 0.44)
		post.mesh = post_mesh
		post.position = Vector3(x, size.y * 0.5, 0.0)
		post.material_override = _materials["concrete"]
		post.visibility_range_end = lod_near_end
		root.add_child(post)

	var beam = MeshInstance3D.new()
	var beam_mesh = BoxMesh.new()
	beam_mesh.size = Vector3(size.x, 0.36, 0.44)
	beam.mesh = beam_mesh
	beam.position = Vector3(0.0, size.y - 0.2, 0.0)
	beam.material_override = _materials["metal"]
	beam.visibility_range_end = lod_near_end
	root.add_child(beam)

	var gate_panel = MeshInstance3D.new()
	var panel_mesh = BoxMesh.new()
	panel_mesh.size = Vector3(size.x * 0.9, size.y * 0.56, 0.12)
	gate_panel.mesh = panel_mesh
	gate_panel.position = Vector3(0.0, panel_mesh.size.y * 0.5, 0.0)
	gate_panel.material_override = _materials["metal"]
	gate_panel.visibility_range_end = lod_near_end
	root.add_child(gate_panel)

	var stripe = MeshInstance3D.new()
	var stripe_mesh = BoxMesh.new()
	stripe_mesh.size = Vector3(size.x * 0.9, 0.16, 0.14)
	stripe.mesh = stripe_mesh
	stripe.position = Vector3(0.0, 1.2, 0.01)
	var stripe_mat = StandardMaterial3D.new()
	stripe_mat.albedo_color = Color(0.77, 0.14, 0.13)
	stripe_mat.emission_enabled = true
	stripe_mat.emission = Color(0.55, 0.12, 0.1)
	stripe_mat.emission_energy_multiplier = 0.45
	stripe.material_override = stripe_mat
	stripe.visibility_range_end = lod_near_end
	root.add_child(stripe)

	_build_static_collider(root, size)

func _spawn_command_post(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [7.4, 3.8, 5.4]), Vector3(7.4, 3.8, 5.4))

	var near = Node3D.new()
	root.add_child(near)
	var far = Node3D.new()
	root.add_child(far)

	var body = MeshInstance3D.new()
	var body_mesh = BoxMesh.new()
	body_mesh.size = size
	body.mesh = body_mesh
	body.position.y = size.y * 0.5
	body.material_override = _materials["concrete"]
	body.visibility_range_end = lod_near_end
	near.add_child(body)

	var roof = MeshInstance3D.new()
	var roof_mesh = BoxMesh.new()
	roof_mesh.size = Vector3(size.x + 0.8, 0.26, size.z + 0.8)
	roof.mesh = roof_mesh
	roof.position = Vector3(0.0, size.y + 0.14, 0.0)
	roof.material_override = _materials["metal"]
	roof.visibility_range_end = lod_near_end
	near.add_child(roof)

	var frontage_bags = _scaled_count(4, 2)
	for i in range(frontage_bags):
		var sandbag = MeshInstance3D.new()
		var bag_mesh = BoxMesh.new()
		bag_mesh.size = Vector3(0.9, 0.28, 0.44)
		sandbag.mesh = bag_mesh
		sandbag.position = Vector3(-size.x * 0.34 + i * 0.96, 0.16, size.z * 0.56)
		sandbag.material_override = _materials["sandbag"]
		sandbag.visibility_range_end = lod_near_end
		near.add_child(sandbag)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = BoxMesh.new()
	far_mesh.size = Vector3(size.x, size.y + 0.8, size.z)
	far_proxy.mesh = far_mesh
	far_proxy.position.y = (size.y + 0.8) * 0.5
	far_proxy.material_override = _materials["concrete"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 260.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	far.add_child(far_proxy)

	_build_static_collider(root, size)

func _spawn_watch_tower(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [4.8, 7.2, 4.2]), Vector3(4.8, 7.2, 4.2))

	for corner in [
		Vector3(-size.x * 0.34, 0.0, -size.z * 0.34),
		Vector3(size.x * 0.34, 0.0, -size.z * 0.34),
		Vector3(-size.x * 0.34, 0.0, size.z * 0.34),
		Vector3(size.x * 0.34, 0.0, size.z * 0.34)
	]:
		var leg = MeshInstance3D.new()
		var leg_mesh = CylinderMesh.new()
		leg_mesh.top_radius = 0.09
		leg_mesh.bottom_radius = 0.12
		leg_mesh.height = size.y
		leg_mesh.radial_segments = 6
		leg.mesh = leg_mesh
		leg.position = corner + Vector3(0.0, size.y * 0.5, 0.0)
		leg.material_override = _materials["metal"]
		leg.visibility_range_end = lod_near_end
		root.add_child(leg)

	var platform = MeshInstance3D.new()
	var platform_mesh = BoxMesh.new()
	platform_mesh.size = Vector3(size.x + 0.3, 0.2, size.z + 0.3)
	platform.mesh = platform_mesh
	platform.position = Vector3(0.0, size.y - 0.18, 0.0)
	platform.material_override = _materials["wood"]
	platform.visibility_range_end = lod_near_end
	root.add_child(platform)

	var roof = MeshInstance3D.new()
	var roof_mesh = PrismMesh.new()
	roof_mesh.size = Vector3(size.x + 0.9, 1.3, size.z + 0.9)
	roof.mesh = roof_mesh
	roof.position = Vector3(0.0, size.y + 0.54, 0.0)
	roof.material_override = _materials["canvas"]
	roof.visibility_range_end = lod_near_end
	root.add_child(roof)

	_build_static_collider(root, size)

func _spawn_triage_tent(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [6.2, 2.9, 4.2]), Vector3(6.2, 2.9, 4.2))

	var shell = MeshInstance3D.new()
	var shell_mesh = PrismMesh.new()
	shell_mesh.size = Vector3(size.x, size.y, size.z)
	shell.mesh = shell_mesh
	shell.position.y = size.y * 0.5
	shell.material_override = _materials["canvas"]
	shell.visibility_range_end = lod_near_end
	root.add_child(shell)

	var cot_count = _scaled_count(3, 1)
	for i in range(cot_count):
		var cot = MeshInstance3D.new()
		var cot_mesh = BoxMesh.new()
		cot_mesh.size = Vector3(1.5, 0.12, 0.62)
		cot.mesh = cot_mesh
		cot.position = Vector3(-1.7 + i * 1.6, 0.44, 0.0)
		cot.material_override = _materials["wood"]
		cot.visibility_range_end = lod_near_end
		root.add_child(cot)

	_build_static_collider(root, size)

func _spawn_checkpoint_barrier(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [5.2, 1.4, 0.9]), Vector3(5.2, 1.4, 0.9))

	var barrier_count = _scaled_count(6, 3)
	for i in range(barrier_count):
		var barrier = MeshInstance3D.new()
		var barrier_mesh = BoxMesh.new()
		barrier_mesh.size = Vector3(0.74, 0.24, 0.38)
		barrier.mesh = barrier_mesh
		barrier.position = Vector3(-size.x * 0.44 + i * 0.84, 0.22, 0.0)
		barrier.material_override = _materials["sandbag"]
		barrier.visibility_range_end = lod_near_end
		root.add_child(barrier)

	_build_static_collider(root, size)

func _spawn_sandbag_nest(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [3.6, 1.4, 3.2]), Vector3(3.6, 1.4, 3.2))

	var nest_rows = _scaled_count(2, 1)
	var nest_front = _scaled_count(5, 3)
	for row in range(nest_rows):
		for i in range(nest_front):
			var bag = MeshInstance3D.new()
			var bag_mesh = BoxMesh.new()
			bag_mesh.size = Vector3(0.72, 0.26, 0.4)
			bag.mesh = bag_mesh
			bag.position = Vector3(-1.4 + i * 0.7, 0.16 + row * 0.28, -size.z * 0.35)
			bag.material_override = _materials["sandbag"]
			bag.visibility_range_end = lod_near_end
			root.add_child(bag)

	var nest_side = _scaled_count(4, 2)
	for row in range(nest_rows):
		for i in range(nest_side):
			var bag_side = MeshInstance3D.new()
			var bag_side_mesh = BoxMesh.new()
			bag_side_mesh.size = Vector3(0.72, 0.26, 0.4)
			bag_side.mesh = bag_side_mesh
			bag_side.position = Vector3(-size.x * 0.4, 0.16 + row * 0.28, -0.9 + i * 0.62)
			bag_side.rotation_degrees.y = 90.0
			bag_side.material_override = _materials["sandbag"]
			bag_side.visibility_range_end = lod_near_end
			root.add_child(bag_side)

	_build_static_collider(root, size)

func _spawn_comms_corner(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [3.4, 2.6, 2.4]), Vector3(3.4, 2.6, 2.4))

	var table = MeshInstance3D.new()
	var table_mesh = BoxMesh.new()
	table_mesh.size = Vector3(2.4, 0.16, 1.2)
	table.mesh = table_mesh
	table.position = Vector3(0.0, 0.92, 0.0)
	table.material_override = _materials["wood"]
	table.visibility_range_end = lod_near_end
	root.add_child(table)

	var radio = MeshInstance3D.new()
	var radio_mesh = BoxMesh.new()
	radio_mesh.size = Vector3(0.92, 0.4, 0.5)
	radio.mesh = radio_mesh
	radio.position = Vector3(0.2, 1.22, 0.0)
	radio.material_override = _materials["metal"]
	radio.visibility_range_end = lod_near_end
	root.add_child(radio)

	var mast = MeshInstance3D.new()
	var mast_mesh = CylinderMesh.new()
	mast_mesh.top_radius = 0.06
	mast_mesh.bottom_radius = 0.08
	mast_mesh.height = 4.8
	mast_mesh.radial_segments = 6
	mast.mesh = mast_mesh
	mast.position = Vector3(-1.3, 2.4, -0.8)
	mast.material_override = _materials["metal"]
	mast.visibility_range_end = lod_near_end + 16.0
	root.add_child(mast)

	var status = OmniLight3D.new()
	status.light_color = Color(0.92, 0.19, 0.14)
	status.light_energy = 1.2
	status.omni_range = 4.2
	status.position = Vector3(0.56, 1.38, 0.0)
	root.add_child(status)

	_build_static_collider(root, size)

func _spawn_spotlight_mast(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.6, 6.4, 1.6]), Vector3(1.6, 6.4, 1.6))

	var mast = MeshInstance3D.new()
	var mast_mesh = CylinderMesh.new()
	mast_mesh.top_radius = 0.1
	mast_mesh.bottom_radius = 0.12
	mast_mesh.height = size.y
	mast_mesh.radial_segments = 6
	mast.mesh = mast_mesh
	mast.position.y = size.y * 0.5
	mast.material_override = _materials["metal"]
	mast.visibility_range_end = lod_near_end + 20.0
	root.add_child(mast)

	var lamp = SpotLight3D.new()
	lamp.light_color = Color(0.92, 0.95, 1.0)
	lamp.light_energy = 2.1
	lamp.spot_range = 24.0
	lamp.spot_angle = 35.0
	lamp.position = Vector3(0.0, size.y - 0.2, 0.0)
	lamp.rotation_degrees = Vector3(-42.0, 0.0, 0.0)
	root.add_child(lamp)

	_build_static_collider(root, size)

func _add_outpost_fx() -> void:
	var flood_positions = [Vector3(94.8, 4.0, -66.0), Vector3(100.3, 4.2, -79.0)]
	var flood_count = min(flood_positions.size(), _scaled_count(flood_positions.size(), 1))
	for i in range(flood_count):
		var p: Vector3 = flood_positions[i]
		var flood = OmniLight3D.new()
		flood.light_color = Color(0.83, 0.9, 1.0)
		flood.light_energy = 1.5
		flood.omni_range = 12.0
		flood.position = p
		add_child(flood)

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
