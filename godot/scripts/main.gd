extends Node3D

const ZONE_LIGHTING_RADIUS: float = 132.0

@onready var zone_streamer = $WorldRoot/ZoneStreamingManager
@onready var player_rig: Node3D = $PlayerRig
@onready var sun: DirectionalLight3D = $Sun
@onready var fill_light: DirectionalLight3D = $FillLight
@onready var world_environment: WorldEnvironment = $WorldEnvironment

var _active_light_profile_id: String = ""
var _active_light_zone_id: String = ""

func _ready() -> void:
	GraphicsSettings.apply_quality(DataStore.get_graphics_default())
	GraphicsSettings.quality_changed.connect(_on_quality_changed)
	zone_streamer.player_path = player_rig.get_path()
	zone_streamer.configure_from_index(DataStore.get_zone_index())
	_refresh_zone_lighting()

func _process(_delta: float) -> void:
	_refresh_zone_lighting()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_F1:
			GraphicsSettings.apply_quality("low")
		elif event.keycode == KEY_F2:
			GraphicsSettings.apply_quality("medium")
		elif event.keycode == KEY_F3:
			GraphicsSettings.apply_quality("high")

func _on_quality_changed(_preset: String, _settings: Dictionary) -> void:
	# Keep fog behavior coherent with quality toggles.
	if not _active_light_profile_id.is_empty():
		_apply_lighting_profile(_active_light_profile_id)

func _refresh_zone_lighting() -> void:
	var target := _resolve_target_lighting()
	var target_profile_id := str(target.get("profile_id", "dusk_reference"))
	var target_zone_id := str(target.get("zone_id", ""))
	if target_profile_id == _active_light_profile_id and target_zone_id == _active_light_zone_id:
		return

	_apply_lighting_profile(target_profile_id)
	_active_light_profile_id = target_profile_id
	_active_light_zone_id = target_zone_id

func _resolve_target_lighting() -> Dictionary:
	var global_default := str(DataStore.get_lighting_profiles().get("global_default", "dusk_reference"))
	var target_zone_id := ""
	var target_profile_id := global_default

	if player_rig == null:
		return {"zone_id": target_zone_id, "profile_id": target_profile_id}

	var player_pos := player_rig.global_position
	var nearest_dist := ZONE_LIGHTING_RADIUS

	for zone in DataStore.get_zone_index():
		var zone_center := _vec3_from_array(zone.get("center", [0, 0, 0]), Vector3.ZERO)
		var dist := player_pos.distance_to(zone_center)
		if dist >= nearest_dist:
			continue
		nearest_dist = dist
		target_zone_id = str(zone.get("id", ""))

	if not target_zone_id.is_empty():
		var zone_def := DataStore.get_zone_definition(target_zone_id)
		var zone_profile_id := str(zone_def.get("light_rig_id", ""))
		if not zone_profile_id.is_empty():
			target_profile_id = zone_profile_id

	return {"zone_id": target_zone_id, "profile_id": target_profile_id}

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

func _vec3_from_array(values: Variant, fallback: Vector3 = Vector3.ZERO) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return fallback
