extends Node3D
class_name RiverCrossingModularKit

const MatLib = preload("res://scripts/world/material_library.gd")

@export var lod_near_end: float = 92.0
@export var lod_far_begin: float = 74.0

var _materials: Dictionary = {}
var _clutter_density: float = 1.0

func _ready() -> void:
	_clutter_density = _resolve_clutter_density()
	_build_materials()
	_build_from_zone_definition()
	_spawn_river_fx()

func _build_materials() -> void:
	_materials = {
		"timber": MatLib.make_pbr_material(Color(0.29, 0.22, 0.15), Color(0.36, 0.28, 0.19), Color(0.42, 0.32, 0.22), 1701, 0.88, 0.01, 3),
		"rope": MatLib.make_pbr_material(Color(0.49, 0.41, 0.28), Color(0.56, 0.47, 0.33), Color(0.63, 0.54, 0.38), 1777, 0.9, 0.0, 4),
		"hull": MatLib.make_pbr_material(Color(0.22, 0.25, 0.2), Color(0.27, 0.31, 0.24), Color(0.33, 0.38, 0.29), 1831, 0.77, 0.08, 2),
		"cloth": MatLib.make_pbr_material(Color(0.4, 0.47, 0.37), Color(0.48, 0.55, 0.44), Color(0.55, 0.62, 0.5), 1907, 0.79, 0.0, 2),
		"metal": MatLib.make_pbr_material(Color(0.35, 0.36, 0.34), Color(0.42, 0.42, 0.39), Color(0.49, 0.49, 0.46), 1973, 0.58, 0.32, 3),
		"crate": MatLib.make_pbr_material(Color(0.31, 0.25, 0.17), Color(0.38, 0.3, 0.21), Color(0.45, 0.36, 0.25), 2053, 0.86, 0.01, 3)
	}

func _build_from_zone_definition() -> void:
	var definition = DataStore.get_zone_definition("river_crossing")
	if definition.is_empty():
		return

	for group in definition.get("prop_groups", []):
		for anchor in group.get("anchors", []):
			var asset_id = str(anchor.get("asset_id", ""))
			if asset_id.contains("water_plane"):
				_spawn_water_plane(anchor)
			elif asset_id.contains("dock_platform"):
				_spawn_dock_platform(anchor)
			elif asset_id.contains("ferry_post"):
				_spawn_ferry_post(anchor)
			elif asset_id.contains("river_boat"):
				_spawn_boat(anchor)
			elif asset_id.contains("rope_winch"):
				_spawn_rope_winch(anchor)
			elif asset_id.contains("crate_cluster"):
				_spawn_crate_cluster(anchor)
			elif asset_id.contains("lantern_post"):
				_spawn_lantern_post(anchor)

func _spawn_water_plane(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [28.0, 0.2, 13.0]), Vector3(28.0, 0.2, 13.0))
	var water = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(size.x, size.z)
	plane.subdivide_depth = 44
	plane.subdivide_width = 44
	water.mesh = plane
	water.position.y = 0.09
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	water.material_override = _make_water_material()
	root.add_child(water)

func _spawn_dock_platform(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [5.2, 1.4, 3.2]), Vector3(5.2, 1.4, 3.2))
	var deck = MeshInstance3D.new()
	var deck_mesh = BoxMesh.new()
	deck_mesh.size = Vector3(size.x, 0.18, size.z)
	deck.mesh = deck_mesh
	deck.position.y = 1.12
	deck.material_override = _materials["timber"]
	deck.visibility_range_end = lod_near_end
	root.add_child(deck)

	for x in [-size.x * 0.44, size.x * 0.44]:
		for z in [-size.z * 0.38, size.z * 0.38]:
			var post = MeshInstance3D.new()
			var post_mesh = CylinderMesh.new()
			post_mesh.top_radius = 0.08
			post_mesh.bottom_radius = 0.1
			post_mesh.height = 2.4
			post_mesh.radial_segments = 6
			post.mesh = post_mesh
			post.position = Vector3(x, 1.2, z)
			post.material_override = _materials["timber"]
			post.visibility_range_end = lod_near_end
			root.add_child(post)

	var plank_count = _scaled_count(5, 3)
	for i in range(plank_count):
		var plank = MeshInstance3D.new()
		var plank_mesh = BoxMesh.new()
		plank_mesh.size = Vector3(0.2, 0.14, size.z * 0.86)
		plank.mesh = plank_mesh
		plank.position = Vector3(-size.x * 0.4 + i * 0.96, 1.2, 0.0)
		plank.material_override = _materials["timber"]
		plank.visibility_range_end = lod_near_end
		root.add_child(plank)

	_build_static_collider(root, size)

func _spawn_ferry_post(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [1.1, 2.4, 1.1]), Vector3(1.1, 2.4, 1.1))
	var post = MeshInstance3D.new()
	var post_mesh = CylinderMesh.new()
	post_mesh.top_radius = 0.12
	post_mesh.bottom_radius = 0.18
	post_mesh.height = size.y + 0.8
	post_mesh.radial_segments = 7
	post.mesh = post_mesh
	post.position.y = (size.y + 0.8) * 0.5
	post.material_override = _materials["timber"]
	post.visibility_range_end = lod_near_end
	root.add_child(post)

	var tie = MeshInstance3D.new()
	var tie_mesh = CylinderMesh.new()
	tie_mesh.top_radius = 0.05
	tie_mesh.bottom_radius = 0.05
	tie_mesh.height = 0.75
	tie_mesh.radial_segments = 5
	tie.mesh = tie_mesh
	tie.position = Vector3(0.0, size.y, 0.0)
	tie.rotation_degrees.z = 90.0
	tie.material_override = _materials["rope"]
	tie.visibility_range_end = lod_near_end
	root.add_child(tie)

	_build_static_collider(root, size)

func _spawn_boat(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [3.4, 1.2, 1.9]), Vector3(3.4, 1.2, 1.9))
	var near = Node3D.new()
	root.add_child(near)
	var far = Node3D.new()
	root.add_child(far)

	var hull = MeshInstance3D.new()
	var hull_mesh = CapsuleMesh.new()
	hull_mesh.radius = size.z * 0.3
	hull_mesh.height = size.x
	hull_mesh.radial_segments = 10
	hull_mesh.rings = 5
	hull.mesh = hull_mesh
	hull.rotation_degrees.z = 90.0
	hull.position.y = 0.52
	hull.material_override = _materials["hull"]
	hull.visibility_range_end = lod_near_end
	near.add_child(hull)

	var deck = MeshInstance3D.new()
	var deck_mesh = BoxMesh.new()
	deck_mesh.size = Vector3(size.x * 0.82, 0.1, size.z * 0.74)
	deck.mesh = deck_mesh
	deck.position = Vector3(0.0, 0.66, 0.0)
	deck.material_override = _materials["timber"]
	deck.visibility_range_end = lod_near_end
	near.add_child(deck)

	var canopy = MeshInstance3D.new()
	var canopy_mesh = BoxMesh.new()
	canopy_mesh.size = Vector3(size.x * 0.42, 0.08, size.z * 0.82)
	canopy.mesh = canopy_mesh
	canopy.position = Vector3(0.3, 1.06, 0.0)
	canopy.rotation_degrees.z = -3.0
	canopy.material_override = _materials["cloth"]
	canopy.visibility_range_end = lod_near_end
	near.add_child(canopy)

	var far_proxy = MeshInstance3D.new()
	var far_mesh = CapsuleMesh.new()
	far_mesh.radius = size.z * 0.34
	far_mesh.height = size.x
	far_mesh.radial_segments = 6
	far_mesh.rings = 3
	far_proxy.mesh = far_mesh
	far_proxy.rotation_degrees.z = 90.0
	far_proxy.position.y = 0.56
	far_proxy.material_override = _materials["hull"]
	far_proxy.visibility_range_begin = lod_far_begin
	far_proxy.visibility_range_end = 248.0
	far_proxy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	far.add_child(far_proxy)

	_build_static_collider(root, size)

func _spawn_rope_winch(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)

	var size = _vec3_from_array(anchor.get("proxy_size", [1.8, 1.2, 1.3]), Vector3(1.8, 1.2, 1.3))
	for x in [-0.42, 0.42]:
		var support = MeshInstance3D.new()
		var support_mesh = BoxMesh.new()
		support_mesh.size = Vector3(0.16, 1.1, 0.16)
		support.mesh = support_mesh
		support.position = Vector3(x, 0.55, 0.0)
		support.material_override = _materials["timber"]
		support.visibility_range_end = lod_near_end
		root.add_child(support)

	var drum = MeshInstance3D.new()
	var drum_mesh = CylinderMesh.new()
	drum_mesh.top_radius = 0.25
	drum_mesh.bottom_radius = 0.25
	drum_mesh.height = 0.88
	drum_mesh.radial_segments = 10
	drum.mesh = drum_mesh
	drum.position = Vector3(0.0, 0.64, 0.0)
	drum.rotation_degrees.z = 90.0
	drum.material_override = _materials["metal"]
	drum.visibility_range_end = lod_near_end
	root.add_child(drum)

	var coil = MeshInstance3D.new()
	var coil_mesh = CylinderMesh.new()
	coil_mesh.top_radius = 0.29
	coil_mesh.bottom_radius = 0.33
	coil_mesh.height = 0.24
	coil_mesh.radial_segments = 11
	coil.mesh = coil_mesh
	coil.position = Vector3(0.0, 0.64, 0.0)
	coil.rotation_degrees.z = 90.0
	coil.material_override = _materials["rope"]
	coil.visibility_range_end = lod_near_end
	root.add_child(coil)

	_build_static_collider(root, size)

func _spawn_crate_cluster(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [2.2, 1.4, 1.6]), Vector3(2.2, 1.4, 1.6))

	for p in [Vector3(0.0, 0.34, 0.0), Vector3(0.72, 0.34, 0.14), Vector3(0.3, 1.02, -0.18)]:
		var crate = MeshInstance3D.new()
		var crate_mesh = BoxMesh.new()
		crate_mesh.size = Vector3(0.62, 0.68, 0.58)
		crate.mesh = crate_mesh
		crate.position = p
		crate.material_override = _materials["crate"]
		crate.visibility_range_end = lod_near_end
		root.add_child(crate)

	_build_static_collider(root, size)

func _spawn_lantern_post(anchor: Dictionary) -> void:
	var root = _create_anchor_root(anchor)
	add_child(root)
	var size = _vec3_from_array(anchor.get("proxy_size", [1.0, 3.1, 1.0]), Vector3(1.0, 3.1, 1.0))

	var post = MeshInstance3D.new()
	var post_mesh = CylinderMesh.new()
	post_mesh.top_radius = 0.07
	post_mesh.bottom_radius = 0.09
	post_mesh.height = size.y
	post_mesh.radial_segments = 6
	post.mesh = post_mesh
	post.position.y = size.y * 0.5
	post.material_override = _materials["timber"]
	post.visibility_range_end = lod_near_end
	root.add_child(post)

	var arm = MeshInstance3D.new()
	var arm_mesh = CylinderMesh.new()
	arm_mesh.top_radius = 0.04
	arm_mesh.bottom_radius = 0.04
	arm_mesh.height = 0.8
	arm_mesh.radial_segments = 5
	arm.mesh = arm_mesh
	arm.position = Vector3(0.0, size.y - 0.22, 0.0)
	arm.rotation_degrees.z = 90.0
	arm.material_override = _materials["timber"]
	arm.visibility_range_end = lod_near_end
	root.add_child(arm)

	var lantern = MeshInstance3D.new()
	var lantern_mesh = BoxMesh.new()
	lantern_mesh.size = Vector3(0.2, 0.3, 0.2)
	lantern.mesh = lantern_mesh
	lantern.position = Vector3(0.34, size.y - 0.34, 0.0)
	var lantern_mat = StandardMaterial3D.new()
	lantern_mat.albedo_color = Color(1.0, 0.7, 0.34)
	lantern_mat.emission_enabled = true
	lantern_mat.emission = Color(1.0, 0.63, 0.26)
	lantern_mat.emission_energy_multiplier = 1.8
	lantern.material_override = lantern_mat
	lantern.visibility_range_end = lod_near_end
	root.add_child(lantern)

	var light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.78, 0.5)
	light.light_energy = 1.35
	light.omni_range = 6.0
	light.position = Vector3(0.34, size.y - 0.34, 0.0)
	root.add_child(light)

	_build_static_collider(root, size)

func _spawn_river_fx() -> void:
	var foam_positions = [Vector3(82.0, 0.12, -5.8), Vector3(86.7, 0.12, -6.2), Vector3(89.5, 0.12, -5.5)]
	var foam_count = min(foam_positions.size(), _scaled_count(foam_positions.size(), 1))
	for i in range(foam_count):
		var p: Vector3 = foam_positions[i]
		var foam = MeshInstance3D.new()
		var foam_mesh = SphereMesh.new()
		foam_mesh.radius = 0.38
		foam_mesh.height = 0.14
		foam_mesh.radial_segments = 8
		foam.mesh = foam_mesh
		foam.position = p
		var foam_mat = StandardMaterial3D.new()
		foam_mat.albedo_color = Color(0.82, 0.9, 0.88)
		foam_mat.emission_enabled = true
		foam_mat.emission = Color(0.62, 0.72, 0.7)
		foam_mat.emission_energy_multiplier = 0.42
		foam_mat.roughness = 0.55
		foam.material_override = foam_mat
		add_child(foam)

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

func _make_water_material() -> ShaderMaterial:
	var shader = Shader.new()
	shader.code = """
shader_type spatial;
render_mode blend_mix, depth_prepass_alpha, cull_back;

uniform vec4 shallow_color : source_color = vec4(0.17, 0.38, 0.3, 0.82);
uniform vec4 deep_color : source_color = vec4(0.08, 0.22, 0.24, 0.9);
uniform float wave_scale = 3.4;
uniform float speed = 0.24;

void vertex() {
	float wave = sin((VERTEX.x + TIME * 1.8) * 0.22) * 0.05;
	wave += cos((VERTEX.z - TIME * 1.4) * 0.26) * 0.04;
	VERTEX.y += wave;
}

void fragment() {
	float ripple = sin((UV.x * wave_scale + TIME * speed) * 6.28318) * 0.5 + 0.5;
	vec3 col = mix(deep_color.rgb, shallow_color.rgb, clamp(UV.y * 0.8 + ripple * 0.2, 0.0, 1.0));
	ALBEDO = col;
	ROUGHNESS = 0.22;
	METALLIC = 0.02;
	SPECULAR = 0.68;
	ALPHA = mix(deep_color.a, shallow_color.a, ripple);
}
"""

	var material = ShaderMaterial.new()
	material.shader = shader
	return material
