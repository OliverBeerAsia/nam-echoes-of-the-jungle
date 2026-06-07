extends Node3D

const PRESETS: Array[String] = ["low", "medium", "high"]
const ZONE_ORDER: Array[String] = [
	"crash_site",
	"village",
	"vc_camp",
	"clinic",
	"river_crossing",
	"hamlet",
	"arvn_outpost"
]
const CAMERA_OFFSETS: Array[Vector3] = [
	Vector3(-22.0, 8.0, 24.0),
	Vector3(0.0, 9.0, -28.0),
	Vector3(26.0, 6.0, 10.0)
]
const SWEEP_START_OFFSET := Vector3(-24.0, 7.0, 14.0)
const SWEEP_END_OFFSET := Vector3(24.0, 7.0, -14.0)
const LOOK_TARGET_OFFSET := Vector3(0.0, 1.4, 0.0)
const REPORT_ROOT := "res://reports/acceptance"
const SHOT_ROOT := "res://reports/acceptance/screenshots"

@onready var zone_root: Node3D = $ZoneRoot
@onready var camera: Camera3D = $Camera3D
@onready var sun: DirectionalLight3D = $Sun
@onready var fill_light: DirectionalLight3D = $FillLight
@onready var world_environment: WorldEnvironment = $WorldEnvironment

var _zone_records: Dictionary = {}
var _active_zone: Node3D
var _run_started_ms: int = 0

func _ready() -> void:
	_run_started_ms = Time.get_ticks_msec()
	call_deferred("_run_acceptance")

func _run_acceptance() -> void:
	_build_zone_lookup()
	_ensure_dir(REPORT_ROOT)
	_ensure_dir(SHOT_ROOT)

	var report := {
		"generated_at": Time.get_datetime_string_from_system(false, true),
		"presets": {},
		"zone_order": ZONE_ORDER,
		"camera_offsets": _vec3_array_to_json(CAMERA_OFFSETS),
		"sweep": {
			"start_offset": _vec3_to_json(SWEEP_START_OFFSET),
			"end_offset": _vec3_to_json(SWEEP_END_OFFSET)
		}
	}

	for preset in PRESETS:
		GraphicsSettings.apply_quality(preset)
		await _settle_frames(5)

		var preset_report := {}
		for zone_id in ZONE_ORDER:
			preset_report[zone_id] = await _capture_zone_pass(zone_id, preset)
		report["presets"][preset] = preset_report

	report["duration_ms"] = Time.get_ticks_msec() - _run_started_ms
	var report_paths := _write_report_files(report)
	print("[acceptance] report: %s" % report_paths.get("latest", "<none>"))
	get_tree().quit()

func _capture_zone_pass(zone_id: String, preset: String) -> Dictionary:
	var zone_record: Dictionary = _zone_records.get(zone_id, {})
	if zone_record.is_empty():
		return {"error": "missing_zone_record"}

	var scene_path := str(zone_record.get("scene", ""))
	var packed := load(scene_path)
	if packed == null or not (packed is PackedScene):
		return {
			"error": "scene_load_failed",
			"scene": scene_path
		}

	var zone_definition := DataStore.get_zone_definition(zone_id)
	_apply_lighting_profile(str(zone_definition.get("light_rig_id", "dusk_reference")))

	_active_zone = (packed as PackedScene).instantiate() as Node3D
	zone_root.add_child(_active_zone)
	await _settle_frames(6)

	var center := _vec3_from_array(zone_record.get("center", [0, 0, 0]), Vector3.ZERO)
	var target := center + LOOK_TARGET_OFFSET
	var camera_samples: Array = []
	var captures: Array = []

	for i in range(CAMERA_OFFSETS.size()):
		var cam_pos: Vector3 = center + CAMERA_OFFSETS[i]
		_position_camera(cam_pos, target)
		await _settle_frames(4)

		var sample := await _measure_fps_frames(12)
		sample["camera_index"] = i + 1
		sample["position"] = _vec3_to_json(cam_pos)
		camera_samples.append(sample)

		var shot_path := "%s/%s_%s_cam%02d.png" % [SHOT_ROOT, zone_id, preset, i + 1]
		var shot_ok := _capture_screenshot(shot_path)
		captures.append({
			"camera_index": i + 1,
			"path": shot_path,
			"captured": shot_ok
		})

	var sweep := await _run_sweep(center, target)
	var zone_stats := _collect_zone_scene_stats()
	var summary := _summarize_samples(camera_samples)

	_active_zone.queue_free()
	_active_zone = null
	await _settle_frames(3)

	return {
		"center": _vec3_to_json(center),
		"summary": summary,
		"camera_samples": camera_samples,
		"sweep": sweep,
		"scene_stats": zone_stats,
		"captures": captures
	}

func _run_sweep(center: Vector3, target: Vector3) -> Dictionary:
	var sweep_values: Array = []
	for i in range(72):
		var t := float(i) / 71.0
		var sweep_pos := center + SWEEP_START_OFFSET.lerp(SWEEP_END_OFFSET, t)
		_position_camera(sweep_pos, target)
		await _settle_frames(1)
		sweep_values.append(float(Engine.get_frames_per_second()))

	return _metrics_from_values(sweep_values)

func _measure_fps_frames(frame_count: int) -> Dictionary:
	var values: Array = []
	for _i in range(frame_count):
		await _settle_frames(1)
		values.append(float(Engine.get_frames_per_second()))
	return _metrics_from_values(values)

func _metrics_from_values(values: Array) -> Dictionary:
	if values.is_empty():
		return {
			"frames": 0,
			"avg_fps": 0.0,
			"min_fps": 0.0,
			"max_fps": 0.0
		}

	var total := 0.0
	var min_v := 1e9
	var max_v := 0.0
	for v in values:
		var fps := float(v)
		total += fps
		if fps < min_v:
			min_v = fps
		if fps > max_v:
			max_v = fps

	return {
		"frames": values.size(),
		"avg_fps": snapped(total / float(values.size()), 0.01),
		"min_fps": snapped(min_v, 0.01),
		"max_fps": snapped(max_v, 0.01)
	}

func _summarize_samples(samples: Array) -> Dictionary:
	if samples.is_empty():
		return {
			"avg_fps": 0.0,
			"min_fps": 0.0,
			"max_fps": 0.0
		}

	var avg_total := 0.0
	var min_v := 1e9
	var max_v := 0.0
	for sample in samples:
		var avg_fps := float(sample.get("avg_fps", 0.0))
		var min_fps := float(sample.get("min_fps", 0.0))
		var max_fps := float(sample.get("max_fps", 0.0))
		avg_total += avg_fps
		if min_fps < min_v:
			min_v = min_fps
		if max_fps > max_v:
			max_v = max_fps

	return {
		"avg_fps": snapped(avg_total / float(samples.size()), 0.01),
		"min_fps": snapped(min_v, 0.01),
		"max_fps": snapped(max_v, 0.01)
	}

func _collect_zone_scene_stats() -> Dictionary:
	if _active_zone == null:
		return {}

	var stats := {
		"mesh_instances": 0,
		"multimesh_instances": 0,
		"lights": 0,
		"static_bodies": 0,
		"npc_instances": 0
	}

	var stack: Array[Node] = [_active_zone]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node is MeshInstance3D:
			stats["mesh_instances"] += 1
		if node is MultiMeshInstance3D:
			stats["multimesh_instances"] += 1
		if node is Light3D:
			stats["lights"] += 1
		if node is StaticBody3D:
			stats["static_bodies"] += 1
		var script: Script = node.get_script()
		if script != null and str(script.resource_path).ends_with("rigged_npc.gd"):
			stats["npc_instances"] += 1
		for child in node.get_children():
			if child is Node:
				stack.append(child)

	return stats

func _position_camera(position_3d: Vector3, look_target: Vector3) -> void:
	camera.global_position = position_3d
	camera.look_at(look_target, Vector3.UP)

func _capture_screenshot(res_path: String) -> bool:
	if DisplayServer.get_name() == "headless":
		return false
	var tex := get_viewport().get_texture()
	if tex == null:
		return false
	var image := tex.get_image()
	if image == null:
		return false
	if image.get_width() <= 0 or image.get_height() <= 0:
		return false
	image.flip_y()
	var save_err := image.save_png(ProjectSettings.globalize_path(res_path))
	return save_err == OK

func _write_report_files(report: Dictionary) -> Dictionary:
	var stamp := Time.get_datetime_string_from_system(false, true).replace(":", "-").replace(" ", "_")
	var run_path := "%s/acceptance_%s.json" % [REPORT_ROOT, stamp]
	var latest_path := "%s/latest.json" % REPORT_ROOT

	var run_file := FileAccess.open(run_path, FileAccess.WRITE)
	if run_file != null:
		run_file.store_string(JSON.stringify(report, "\t", true))

	var latest_file := FileAccess.open(latest_path, FileAccess.WRITE)
	if latest_file != null:
		latest_file.store_string(JSON.stringify(report, "\t", true))

	return {
		"run": run_path,
		"latest": latest_path
	}

func _build_zone_lookup() -> void:
	_zone_records.clear()
	for zone in DataStore.get_zone_index():
		_zone_records[str(zone.get("id", ""))] = zone

func _apply_lighting_profile(profile_id: String) -> void:
	var profile := DataStore.get_lighting_profile(profile_id)
	if profile.is_empty():
		return

	sun.light_energy = float(profile.get("sun_energy", 1.35))
	sun.light_color = _parse_color(profile.get("sun_color", "#f5ba74"), Color(0.96, 0.73, 0.45))
	sun.rotation_degrees = _vec3_from_array(profile.get("sun_rotation_deg", [-36.0, -42.0, 0.0]), Vector3(-36.0, -42.0, 0.0))
	sun.directional_shadow_max_distance = float(GraphicsSettings.get_setting("shadow_distance", 110.0))

	fill_light.light_energy = float(profile.get("fill_energy", 0.28))
	fill_light.light_color = _parse_color(profile.get("fill_color", "#6f89a6"), Color(0.43, 0.54, 0.65))
	fill_light.rotation_degrees = _vec3_from_array(profile.get("fill_rotation_deg", [-20.0, 128.0, 0.0]), Vector3(-20.0, 128.0, 0.0))

	if world_environment.environment == null:
		world_environment.environment = Environment.new()

	var env := world_environment.environment
	var post_fx: float = clamp(float(GraphicsSettings.get_setting("post_fx_strength", 0.6)), 0.2, 1.0)
	env.background_color = _parse_color(profile.get("sky_color", "#445a44"), Color(0.27, 0.35, 0.27))
	env.fog_enabled = true
	env.fog_light_color = _parse_color(profile.get("fog_color", "#6b7b59"), Color(0.42, 0.48, 0.35))
	env.fog_density = float(profile.get("fog_density", 0.0045)) * lerpf(0.88, 1.12, post_fx)
	env.volumetric_fog_enabled = bool(profile.get("volumetric_fog", true)) and bool(GraphicsSettings.get_setting("volumetric_fog", true))
	env.volumetric_fog_density = float(profile.get("volumetric_fog_density", 0.02)) * lerpf(0.86, 1.14, post_fx)

func _parse_color(value: Variant, fallback: Color) -> Color:
	var text := str(value)
	if not text.begins_with("#"):
		return fallback
	return Color.from_string(text, fallback)

func _ensure_dir(res_path: String) -> void:
	var abs := ProjectSettings.globalize_path(res_path)
	var err := DirAccess.make_dir_recursive_absolute(abs)
	if err != OK and err != ERR_ALREADY_EXISTS:
		push_warning("Could not create directory: %s" % res_path)

func _settle_frames(frame_count: int) -> void:
	for _i in range(frame_count):
		await get_tree().process_frame

func _vec3_from_array(values: Variant, fallback: Vector3) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return fallback

func _vec3_to_json(v: Vector3) -> Array:
	return [snapped(v.x, 0.01), snapped(v.y, 0.01), snapped(v.z, 0.01)]

func _vec3_array_to_json(items: Array) -> Array:
	var out: Array = []
	for item in items:
		if item is Vector3:
			out.append(_vec3_to_json(item))
	return out
