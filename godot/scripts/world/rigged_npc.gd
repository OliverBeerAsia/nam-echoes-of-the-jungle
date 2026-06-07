extends Node3D
class_name RiggedNPC

const MatLib = preload("res://scripts/world/material_library.gd")

@export var profile_id: String = "elder_nguyen"
@export var display_name: String = "NPC"
@export var state_id: String = "idle_talk"
@export var body_tint: Color = Color(0.73, 0.58, 0.45, 1.0)
@export var cloth_primary: Color = Color(0.34, 0.41, 0.31, 1.0)
@export var cloth_secondary: Color = Color(0.29, 0.35, 0.26, 1.0)
@export var cloth_leg: Color = Color(0.25, 0.31, 0.25, 1.0)
@export var face_marker_color: Color = Color(0.1, 0.1, 0.1, 1.0)

var _skeleton: Skeleton3D
var _bone_index: Dictionary = {}
var _time := 0.0

func _ready() -> void:
	_apply_profile_defaults()
	_build_rig()

func _process(delta: float) -> void:
	_time += delta
	_apply_state_pose(delta)

func set_anim_state(new_state: String) -> void:
	state_id = new_state

func _build_rig() -> void:
	_skeleton = Skeleton3D.new()
	add_child(_skeleton)

	var root := _add_bone("root", -1, Transform3D(Basis.IDENTITY, Vector3.ZERO))
	var spine := _add_bone("spine", root, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.92, 0.0)))
	var neck := _add_bone("neck", spine, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.47, 0.0)))
	var head := _add_bone("head", neck, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.26, 0.0)))
	var shoulder_l := _add_bone("shoulder_l", spine, Transform3D(Basis.IDENTITY, Vector3(-0.23, 0.38, 0.0)))
	var arm_l := _add_bone("arm_l", shoulder_l, Transform3D(Basis.IDENTITY, Vector3(-0.28, -0.18, 0.0)))
	var shoulder_r := _add_bone("shoulder_r", spine, Transform3D(Basis.IDENTITY, Vector3(0.23, 0.38, 0.0)))
	var arm_r := _add_bone("arm_r", shoulder_r, Transform3D(Basis.IDENTITY, Vector3(0.28, -0.18, 0.0)))
	var hip_l := _add_bone("hip_l", root, Transform3D(Basis.IDENTITY, Vector3(-0.14, 0.0, 0.0)))
	var leg_l := _add_bone("leg_l", hip_l, Transform3D(Basis.IDENTITY, Vector3(0.0, -0.66, 0.0)))
	var hip_r := _add_bone("hip_r", root, Transform3D(Basis.IDENTITY, Vector3(0.14, 0.0, 0.0)))
	var leg_r := _add_bone("leg_r", hip_r, Transform3D(Basis.IDENTITY, Vector3(0.0, -0.66, 0.0)))

	_add_bone_mesh("root", _capsule_mesh(0.16, 0.92), Vector3(0.0, 0.46, 0.0), _cloth_mat(cloth_primary))
	_add_bone_mesh("spine", _capsule_mesh(0.22, 0.66), Vector3(0.0, 0.33, 0.0), _cloth_mat(cloth_primary.lightened(0.04)))
	_add_bone_mesh("head", _sphere_mesh(0.16), Vector3(0.0, 0.12, 0.0), _skin_mat(body_tint))

	_add_bone_mesh("arm_l", _capsule_mesh(0.07, 0.58), Vector3(-0.03, -0.24, 0.0), _cloth_mat(cloth_secondary))
	_add_bone_mesh("arm_r", _capsule_mesh(0.07, 0.58), Vector3(0.03, -0.24, 0.0), _cloth_mat(cloth_secondary))
	_add_bone_mesh("leg_l", _capsule_mesh(0.08, 0.72), Vector3(0.0, -0.36, 0.0), _cloth_mat(cloth_leg))
	_add_bone_mesh("leg_r", _capsule_mesh(0.08, 0.72), Vector3(0.0, -0.36, 0.0), _cloth_mat(cloth_leg))

	# Small face marker to avoid mannequin look in dialogue range.
	var face := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(0.11, 0.07)
	face.mesh = plane
	face.position = Vector3(0.0, 1.67, 0.16)
	face.material_override = _face_marker_mat()
	add_child(face)

	global_position.y = 0.95

func _apply_profile_defaults() -> void:
	var profile := DataStore.get_character_profile(profile_id)
	if profile.is_empty():
		return

	var rig_id = str(profile.get("rig_id", ""))
	var material_variant = str(profile.get("material_variant_id", ""))

	if display_name == "NPC":
		display_name = profile_id.replace("_", " ").capitalize()

	if material_variant.contains("medic"):
		body_tint = Color(0.78, 0.62, 0.5, 1.0)
		cloth_primary = Color(0.7, 0.73, 0.64, 1.0)
		cloth_secondary = Color(0.55, 0.59, 0.52, 1.0)
		cloth_leg = Color(0.42, 0.46, 0.4, 1.0)
		face_marker_color = Color(0.18, 0.16, 0.16, 1.0)
	elif material_variant.contains("bloodied"):
		body_tint = Color(0.74, 0.58, 0.46, 1.0)
		cloth_primary = Color(0.34, 0.4, 0.29, 1.0)
		cloth_secondary = Color(0.4, 0.27, 0.24, 1.0)
		cloth_leg = Color(0.26, 0.31, 0.24, 1.0)
		face_marker_color = Color(0.15, 0.11, 0.11, 1.0)
	elif material_variant.contains("officer"):
		body_tint = Color(0.71, 0.56, 0.44, 1.0)
		cloth_primary = Color(0.29, 0.37, 0.31, 1.0)
		cloth_secondary = Color(0.24, 0.31, 0.26, 1.0)
		cloth_leg = Color(0.21, 0.27, 0.23, 1.0)
		face_marker_color = Color(0.1, 0.11, 0.12, 1.0)
	elif material_variant.contains("civilian"):
		body_tint = Color(0.75, 0.6, 0.47, 1.0)
		cloth_primary = Color(0.47, 0.42, 0.31, 1.0)
		cloth_secondary = Color(0.39, 0.34, 0.25, 1.0)
		cloth_leg = Color(0.31, 0.3, 0.24, 1.0)
		face_marker_color = Color(0.13, 0.11, 0.1, 1.0)
	elif material_variant.contains("uniform"):
		body_tint = Color(0.73, 0.58, 0.45, 1.0)
		cloth_primary = Color(0.33, 0.4, 0.29, 1.0)
		cloth_secondary = Color(0.28, 0.34, 0.25, 1.0)
		cloth_leg = Color(0.24, 0.29, 0.23, 1.0)
		face_marker_color = Color(0.1, 0.1, 0.1, 1.0)
	elif rig_id.contains("female"):
		body_tint = Color(0.77, 0.6, 0.48, 1.0)
		cloth_primary = Color(0.47, 0.52, 0.4, 1.0)
		cloth_secondary = Color(0.36, 0.42, 0.33, 1.0)
		cloth_leg = Color(0.29, 0.35, 0.28, 1.0)
		face_marker_color = Color(0.12, 0.1, 0.1, 1.0)

	var anim_state = str(profile.get("animation_state_machine_id", ""))
	if state_id == "idle_talk":
		if anim_state.contains("guard"):
			state_id = "guard_idle"
		elif anim_state.contains("briefing"):
			state_id = "briefing_talk"
		elif anim_state.contains("alert"):
			state_id = "alert"
		elif anim_state.contains("injured"):
			state_id = "injured"

func _apply_state_pose(delta: float) -> void:
	if _skeleton == null:
		return

	var breathe := sin(_time * 1.2) * 0.03
	var talk := sin(_time * 3.0) * 0.18
	var alert_shift := sin(_time * 2.4) * 0.08

	var spine_target := _quat_from_euler(Vector3(0.0, 0.0, breathe))
	var neck_target := _quat_from_euler(Vector3(breathe * 0.35, 0.0, 0.0))
	var head_target := _quat_from_euler(Vector3(breathe * 0.4, 0.0, 0.0))
	var arm_l_target := _quat_from_euler(Vector3(-0.05, 0.0, -0.08))
	var arm_r_target := _quat_from_euler(Vector3(-0.05, 0.0, 0.08))
	var leg_l_target := Quaternion.IDENTITY
	var leg_r_target := Quaternion.IDENTITY

	match state_id:
		"idle_talk":
			head_target = _quat_from_euler(Vector3(talk * 0.18, talk * 0.06, 0.0))
			arm_l_target = _quat_from_euler(Vector3(-0.12, talk * 0.04, -0.18))
			arm_r_target = _quat_from_euler(Vector3(-0.08, -talk * 0.05, 0.12))
		"alert":
			spine_target = _quat_from_euler(Vector3(-0.06, alert_shift * 0.08, 0.0))
			head_target = _quat_from_euler(Vector3(-0.08, alert_shift * 0.2, 0.0))
			arm_l_target = _quat_from_euler(Vector3(-0.2, 0.2, -0.22))
			arm_r_target = _quat_from_euler(Vector3(-0.2, -0.2, 0.22))
		"guard_idle":
			spine_target = _quat_from_euler(Vector3(-0.02, alert_shift * 0.04, 0.0))
			head_target = _quat_from_euler(Vector3(-0.03, alert_shift * 0.12, 0.0))
			arm_l_target = _quat_from_euler(Vector3(-0.3, 0.08, -0.22))
			arm_r_target = _quat_from_euler(Vector3(-0.3, -0.08, 0.22))
		"briefing_talk":
			spine_target = _quat_from_euler(Vector3(-0.03, talk * 0.08, 0.0))
			head_target = _quat_from_euler(Vector3(-0.02, talk * 0.14, 0.0))
			arm_l_target = _quat_from_euler(Vector3(-0.16, 0.04, -0.16))
			arm_r_target = _quat_from_euler(Vector3(-0.38, -0.22, 0.44))
		"seated_rest":
			spine_target = _quat_from_euler(Vector3(0.32, 0.0, 0.0))
			head_target = _quat_from_euler(Vector3(0.08, talk * 0.04, 0.0))
			arm_l_target = _quat_from_euler(Vector3(-0.42, 0.0, -0.12))
			arm_r_target = _quat_from_euler(Vector3(-0.42, 0.0, 0.12))
			leg_l_target = _quat_from_euler(Vector3(-1.08, 0.0, 0.0))
			leg_r_target = _quat_from_euler(Vector3(-1.08, 0.0, 0.0))
		"crouch_injured":
			spine_target = _quat_from_euler(Vector3(0.56, 0.0, -0.16))
			head_target = _quat_from_euler(Vector3(0.24, 0.0, 0.0))
			arm_l_target = _quat_from_euler(Vector3(0.42, 0.0, -0.22))
			arm_r_target = _quat_from_euler(Vector3(0.54, 0.12, 0.46))
			leg_l_target = _quat_from_euler(Vector3(-0.86, 0.0, 0.0))
			leg_r_target = _quat_from_euler(Vector3(-0.86, 0.0, 0.0))
		"injured":
			spine_target = _quat_from_euler(Vector3(0.35, 0.0, -0.1))
			head_target = _quat_from_euler(Vector3(0.18, 0.0, 0.0))
			arm_l_target = _quat_from_euler(Vector3(0.2, 0.0, -0.1))
			arm_r_target = _quat_from_euler(Vector3(0.4, 0.1, 0.4))
			leg_l_target = _quat_from_euler(Vector3(-0.2, 0.0, 0.0))
			leg_r_target = _quat_from_euler(Vector3(0.14, 0.0, 0.0))
		_:
			pass

	_blend_bone("spine", spine_target, delta)
	_blend_bone("neck", neck_target, delta)
	_blend_bone("head", head_target, delta)
	_blend_bone("arm_l", arm_l_target, delta)
	_blend_bone("arm_r", arm_r_target, delta)
	_blend_bone("leg_l", leg_l_target, delta)
	_blend_bone("leg_r", leg_r_target, delta)

func _blend_bone(name: String, target: Quaternion, delta: float) -> void:
	if not _bone_index.has(name):
		return
	var idx := int(_bone_index[name])
	var current := _skeleton.get_bone_pose_rotation(idx)
	_skeleton.set_bone_pose_rotation(idx, current.slerp(target, min(1.0, delta * 6.0)))

func _quat_from_euler(euler: Vector3) -> Quaternion:
	return Basis.from_euler(euler).get_rotation_quaternion()

func _add_bone(name: String, parent_idx: int, rest: Transform3D) -> int:
	_skeleton.add_bone(name)
	var idx := _skeleton.find_bone(name)
	if parent_idx >= 0:
		_skeleton.set_bone_parent(idx, parent_idx)
	_skeleton.set_bone_rest(idx, rest)
	_bone_index[name] = idx
	return idx

func _add_bone_mesh(bone_name: String, mesh: Mesh, offset: Vector3, material: Material) -> void:
	var attachment := BoneAttachment3D.new()
	attachment.bone_name = bone_name
	_skeleton.add_child(attachment)

	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = material
	mi.position = offset
	attachment.add_child(mi)

func _capsule_mesh(radius: float, height: float) -> CapsuleMesh:
	var mesh := CapsuleMesh.new()
	mesh.radius = radius
	mesh.height = height
	mesh.radial_segments = 8
	mesh.rings = 3
	return mesh

func _sphere_mesh(radius: float) -> SphereMesh:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	return mesh

func _skin_mat(tint: Color) -> StandardMaterial3D:
	return MatLib.make_pbr_material(tint.darkened(0.04), tint, tint.lightened(0.1), 1709, 0.56, 0.0, 1)

func _cloth_mat(color: Color) -> StandardMaterial3D:
	var seed := int((color.r * 1000.0) + (color.g * 2000.0) + (color.b * 3000.0)) % 2048
	if seed < 0:
		seed = -seed
	return MatLib.make_pbr_material(color.darkened(0.06), color, color.lightened(0.1), seed, 0.82, 0.0, 2)

func _face_marker_mat() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = face_marker_color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	return mat
