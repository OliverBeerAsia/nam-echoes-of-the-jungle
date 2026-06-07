extends Node3D
class_name FoliageClusterField

const MatLib = preload("res://scripts/world/material_library.gd")

@export var seed: int = 1771
@export var center: Vector3 = Vector3(0, 0, 20)
@export var radius: float = 132.0
@export var exclusion_radius: float = 24.0
@export var near_tree_base_count: int = 220
@export var far_tree_base_count: int = 340
@export var undergrowth_base_count: int = 380
@export var canopy_sway_scale: float = 1.0
@export var canopy_speed: float = 1.5
@export var ground_noise_strength: float = 0.55
@export var canopy_base_color: Color = Color(0.19, 0.33, 0.17, 1.0)
@export var canopy_tip_color: Color = Color(0.31, 0.45, 0.24, 1.0)
@export var undergrowth_base_color: Color = Color(0.17, 0.29, 0.15, 1.0)
@export var undergrowth_tip_color: Color = Color(0.28, 0.41, 0.2, 1.0)
@export var trunk_base_color: Color = Color(0.26, 0.18, 0.11)
@export var trunk_accent_color: Color = Color(0.33, 0.24, 0.15)
@export var trunk_detail_color: Color = Color(0.19, 0.12, 0.08)

var _height_noise: FastNoiseLite

func _ready() -> void:
	_height_noise = FastNoiseLite.new()
	_height_noise.seed = seed + 991
	_height_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_height_noise.frequency = 0.028

	var foliage_density: float = clamp(float(GraphicsSettings.get_setting("foliage_density", 1.0)), 0.35, 1.45)
	var clutter_density: float = clamp(float(GraphicsSettings.get_setting("clutter_density", foliage_density)), 0.35, 1.45)
	_build_tree_layers(foliage_density)
	_build_undergrowth_layer(foliage_density, clutter_density)
	_build_vine_layer(clutter_density)

func apply_profile(profile: Dictionary) -> void:
	if profile.is_empty():
		return
	seed = int(profile.get("seed", seed))
	center = _vec3_from_array(profile.get("center", [center.x, center.y, center.z]), center)
	radius = float(profile.get("radius", radius))
	exclusion_radius = float(profile.get("exclusion_radius", exclusion_radius))
	near_tree_base_count = int(profile.get("near_tree_count", near_tree_base_count))
	far_tree_base_count = int(profile.get("far_tree_count", far_tree_base_count))
	undergrowth_base_count = int(profile.get("undergrowth_count", undergrowth_base_count))
	canopy_sway_scale = float(profile.get("canopy_sway_scale", canopy_sway_scale))
	canopy_speed = float(profile.get("canopy_speed", canopy_speed))
	ground_noise_strength = float(profile.get("ground_noise_strength", ground_noise_strength))
	canopy_base_color = _color_from_value(profile.get("canopy_base", canopy_base_color), canopy_base_color)
	canopy_tip_color = _color_from_value(profile.get("canopy_tip", canopy_tip_color), canopy_tip_color)
	undergrowth_base_color = _color_from_value(profile.get("undergrowth_base", undergrowth_base_color), undergrowth_base_color)
	undergrowth_tip_color = _color_from_value(profile.get("undergrowth_tip", undergrowth_tip_color), undergrowth_tip_color)
	trunk_base_color = _color_from_value(profile.get("trunk_base", trunk_base_color), trunk_base_color)
	trunk_accent_color = _color_from_value(profile.get("trunk_accent", trunk_accent_color), trunk_accent_color)
	trunk_detail_color = _color_from_value(profile.get("trunk_detail", trunk_detail_color), trunk_detail_color)

func _build_tree_layers(density: float) -> void:
	var near_count: int = max(60, int(round(float(near_tree_base_count) * density)))
	var far_count: int = max(100, int(round(float(far_tree_base_count) * density)))

	var near_trunks := _create_multimesh_instance(
		_trunk_mesh(),
		near_count,
		seed + 11,
		0.0,
		76.0,
		Vector3(0.82, 0.82, 0.82),
		Vector3(1.24, 1.38, 1.24)
	)
	near_trunks.material_override = MatLib.make_weathered_pbr_material(trunk_base_color, trunk_accent_color, trunk_detail_color, 211, 0.9, 0.01, 3, 0.32)
	add_child(near_trunks)

	var near_canopy := _create_multimesh_instance(
		_canopy_mesh(),
		near_count,
		seed + 19,
		0.0,
		76.0,
		Vector3(0.8, 0.9, 0.8),
		Vector3(1.3, 1.45, 1.3),
		4.2
	)
	var canopy_mat := MatLib.make_wind_foliage_material(canopy_base_color, canopy_tip_color)
	canopy_mat.set_shader_parameter("sway", 0.06 + canopy_sway_scale * 0.05)
	canopy_mat.set_shader_parameter("speed", canopy_speed)
	near_canopy.material_override = canopy_mat
	add_child(near_canopy)

	var far_trees := _create_multimesh_instance(
		_far_tree_mesh(),
		far_count,
		seed + 31,
		62.0,
		230.0,
		Vector3(0.74, 0.78, 0.74),
		Vector3(1.32, 1.38, 1.32),
		1.8
	)
	far_trees.material_override = MatLib.make_weathered_pbr_material(Color(0.25, 0.36, 0.2), Color(0.31, 0.43, 0.25), Color(0.35, 0.46, 0.28), 391, 0.88, 0.0, 2, 0.18)
	add_child(far_trees)

func _build_undergrowth_layer(foliage_density: float, clutter_density: float) -> void:
	var clump_count: int = max(95, int(round(float(undergrowth_base_count) * foliage_density * clutter_density)))
	var undergrowth := _create_multimesh_instance(
		_undergrowth_mesh(),
		clump_count,
		seed + 79,
		0.0,
		102.0,
		Vector3(0.72, 0.7, 0.72),
		Vector3(1.28, 1.25, 1.28),
		0.12
	)
	var undergrowth_mat := MatLib.make_wind_foliage_material(undergrowth_base_color, undergrowth_tip_color)
	undergrowth_mat.set_shader_parameter("sway", 0.04 + canopy_sway_scale * 0.035)
	undergrowth_mat.set_shader_parameter("speed", canopy_speed * 1.25)
	undergrowth.material_override = undergrowth_mat
	add_child(undergrowth)

func _build_vine_layer(clutter_density: float) -> void:
	var vine_count: int = max(24, int(round(46.0 * clutter_density)))
	var vines := _create_multimesh_instance(
		_vine_mesh(),
		vine_count,
		seed + 109,
		22.0,
		164.0,
		Vector3(0.75, 0.7, 0.75),
		Vector3(1.35, 1.35, 1.35),
		2.5
	)
	var vine_mat := MatLib.make_wind_foliage_material(
		canopy_base_color.darkened(0.08),
		canopy_tip_color.lightened(0.08),
		0.93
	)
	vine_mat.set_shader_parameter("sway", 0.09 + canopy_sway_scale * 0.03)
	vine_mat.set_shader_parameter("speed", canopy_speed * 0.85)
	vines.material_override = vine_mat
	add_child(vines)

func _create_multimesh_instance(
	base_mesh: Mesh,
	count: int,
	local_seed: int,
	vis_begin: float,
	vis_end: float,
	min_scale: Vector3,
	max_scale: Vector3,
	y_offset: float = 0.0
) -> MultiMeshInstance3D:
	var rng := RandomNumberGenerator.new()
	rng.seed = local_seed

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.instance_count = count
	mm.mesh = base_mesh

	for i in range(count):
		var pos := _random_ring_position(rng)
		pos.y += y_offset
		var sx := rng.randf_range(min_scale.x, max_scale.x)
		var sy := rng.randf_range(min_scale.y, max_scale.y)
		var sz := rng.randf_range(min_scale.z, max_scale.z)
		var rot := Basis.from_euler(Vector3(0.0, rng.randf_range(0.0, TAU), 0.0))
		var basis := rot.scaled(Vector3(sx, sy, sz))
		mm.set_instance_transform(i, Transform3D(basis, pos))

	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	node.visibility_range_begin = vis_begin
	node.visibility_range_end = vis_end
	node.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	return node

func _random_ring_position(rng: RandomNumberGenerator) -> Vector3:
	var angle := rng.randf_range(0.0, TAU)
	var d := sqrt(rng.randf_range(exclusion_radius * exclusion_radius, radius * radius))
	var x := cos(angle) * d
	var z := sin(angle) * d
	var y := _height_noise.get_noise_2d(center.x + x, center.z + z) * ground_noise_strength
	return center + Vector3(x, y, z)

func _trunk_mesh() -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.07
	mesh.bottom_radius = 0.16
	mesh.height = 7.2
	mesh.radial_segments = 8
	return mesh

func _canopy_mesh() -> CapsuleMesh:
	var mesh := CapsuleMesh.new()
	mesh.radius = 1.18
	mesh.height = 4.0
	mesh.radial_segments = 7
	mesh.rings = 4
	return mesh

func _far_tree_mesh() -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.0
	mesh.bottom_radius = 1.7
	mesh.height = 5.4
	mesh.radial_segments = 6
	return mesh

func _undergrowth_mesh() -> CapsuleMesh:
	var mesh := CapsuleMesh.new()
	mesh.radius = 0.25
	mesh.height = 1.25
	mesh.radial_segments = 5
	mesh.rings = 3
	return mesh

func _vine_mesh() -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.035
	mesh.bottom_radius = 0.055
	mesh.height = 2.4
	mesh.radial_segments = 5
	return mesh

func _vec3_from_array(values: Variant, fallback: Vector3) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return fallback

func _color_from_value(value: Variant, fallback: Color) -> Color:
	if value is String:
		var text := str(value)
		if text.begins_with("#"):
			return Color.from_string(text, fallback)
	if value is Array and value.size() >= 3:
		return Color(float(value[0]), float(value[1]), float(value[2]), 1.0)
	return fallback
