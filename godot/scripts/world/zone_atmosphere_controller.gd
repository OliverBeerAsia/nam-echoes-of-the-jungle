extends Node3D
class_name ZoneAtmosphereController

@export var zone_id: String = ""
@export var atmosphere_profile_id: String = ""
@export var zone_center: Vector3 = Vector3.ZERO
@export var quest_contract: Dictionary = {}

func _ready() -> void:
	_build_profile()

func configure(profile_id: String, center: Vector3, contract: Dictionary = {}) -> void:
	atmosphere_profile_id = profile_id
	zone_center = center
	quest_contract = contract.duplicate(true)
	if is_inside_tree():
		_rebuild()

func _rebuild() -> void:
	for child in get_children():
		child.queue_free()
	_build_profile()

func _build_profile() -> void:
	var profile_id := atmosphere_profile_id
	if profile_id.is_empty() and not zone_id.is_empty():
		var definition := DataStore.get_zone_definition(zone_id)
		profile_id = str(definition.get("atmosphere_profile_id", ""))
		if quest_contract.is_empty():
			quest_contract = definition.get("quest_readability", {}).duplicate(true)

	if profile_id.is_empty():
		return

	var profile := DataStore.get_atmosphere_profile(profile_id)
	if profile.is_empty():
		return

	_spawn_mist_layers(profile.get("mist_layers", []))
	_spawn_practical_lights(profile.get("practical_lights", []))
	_spawn_beacon_markers(profile.get("beacon_markers", []))
	_spawn_ambience_emitters(profile.get("ambient_emitters", []))
	_spawn_contract_markers(quest_contract)

func _spawn_mist_layers(layers: Array) -> void:
	for layer_data in layers:
		if not (layer_data is Dictionary):
			continue
		var layer := MeshInstance3D.new()
		layer.mesh = SphereMesh.new()
		layer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		layer.position = _vec3_from_array(layer_data.get("position", [0.0, 1.0, 0.0]), zone_center)
		layer.scale = _vec3_from_array(layer_data.get("scale", [4.0, 1.4, 4.0]), Vector3(4.0, 1.4, 4.0))

		var mat := StandardMaterial3D.new()
		var base_color := _color_from_value(layer_data.get("color", "#4a5e4b"), Color(0.29, 0.37, 0.29, 1.0))
		var alpha: float = clamp(float(layer_data.get("alpha", 0.2)), 0.05, 0.7)
		mat.albedo_color = Color(base_color.r, base_color.g, base_color.b, alpha)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.roughness = 1.0
		mat.metallic = 0.0
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		layer.material_override = mat
		add_child(layer)

func _spawn_practical_lights(lights: Array) -> void:
	if lights.is_empty():
		return

	var target_budget := int(GraphicsSettings.get_setting("max_dynamic_lights", 10))
	var available: int = max(0, target_budget - _count_existing_zone_lights())
	if available <= 0:
		return

	var spawned := 0
	for light_data in lights:
		if spawned >= available:
			break
		if not (light_data is Dictionary):
			continue
		var kind := str(light_data.get("kind", "omni"))
		var node: Light3D
		if kind == "spot":
			var spot := SpotLight3D.new()
			spot.spot_angle = float(light_data.get("angle", 34.0))
			spot.spot_range = float(light_data.get("range", 14.0))
			node = spot
		else:
			var omni := OmniLight3D.new()
			omni.omni_range = float(light_data.get("range", 8.0))
			node = omni

		node.position = _vec3_from_array(light_data.get("position", [0.0, 1.0, 0.0]), zone_center)
		node.rotation_degrees = _vec3_from_array(light_data.get("rotation_deg", [0.0, 0.0, 0.0]), Vector3.ZERO)
		node.light_color = _color_from_value(light_data.get("color", "#ffd3a1"), Color(1.0, 0.83, 0.63, 1.0))
		node.light_energy = float(light_data.get("energy", 0.9))
		add_child(node)
		spawned += 1

func _spawn_beacon_markers(markers: Array) -> void:
	for marker_data in markers:
		if not (marker_data is Dictionary):
			continue
		var marker := MeshInstance3D.new()
		marker.mesh = SphereMesh.new()
		marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		marker.position = _vec3_from_array(marker_data.get("position", [0.0, 0.25, 0.0]), zone_center)
		marker.scale = _vec3_from_array(marker_data.get("scale", [0.22, 0.09, 0.22]), Vector3(0.22, 0.09, 0.22))

		var color := _color_from_value(marker_data.get("color", "#93d2aa"), Color(0.57, 0.82, 0.67, 1.0))
		var mat := StandardMaterial3D.new()
		mat.albedo_color = color
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = float(marker_data.get("emission", 0.75))
		mat.roughness = 0.78
		mat.metallic = 0.0
		marker.material_override = mat
		add_child(marker)

func _spawn_ambience_emitters(emitters: Array) -> void:
	for emitter_data in emitters:
		if not (emitter_data is Dictionary):
			continue
		var emitter := Node3D.new()
		emitter.name = "AmbienceEmitter_%s" % str(emitter_data.get("id", "ambient"))
		emitter.position = _vec3_from_array(emitter_data.get("position", [0.0, 1.0, 0.0]), zone_center)
		emitter.set_meta("ambience_id", str(emitter_data.get("id", "ambient")))
		emitter.set_meta("radius", float(emitter_data.get("radius", 12.0)))
		emitter.set_meta("intensity", float(emitter_data.get("intensity", 0.5)))
		add_child(emitter)

func _spawn_contract_markers(contract: Dictionary) -> void:
	if contract.is_empty():
		return

	for landmark in contract.get("landmarks", []):
		if not (landmark is Dictionary):
			continue
		var ring := MeshInstance3D.new()
		var ring_mesh := CylinderMesh.new()
		ring_mesh.top_radius = 0.46
		ring_mesh.bottom_radius = 0.5
		ring_mesh.height = 0.06
		ring_mesh.radial_segments = 18
		ring.mesh = ring_mesh
		ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ring.position = _vec3_from_array(landmark.get("position", [0.0, 0.12, 0.0]), zone_center)
		var color := _color_from_value(landmark.get("color", "#88c9a6"), Color(0.53, 0.79, 0.65, 1.0))
		var ring_mat := StandardMaterial3D.new()
		ring_mat.albedo_color = color
		ring_mat.emission_enabled = true
		ring_mat.emission = color
		ring_mat.emission_energy_multiplier = 0.35
		ring_mat.roughness = 0.7
		ring.material_override = ring_mat
		add_child(ring)

	for interactable in contract.get("interactables", []):
		if not (interactable is Dictionary):
			continue
		var marker := MeshInstance3D.new()
		marker.mesh = SphereMesh.new()
		marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		marker.position = _vec3_from_array(interactable.get("position", [0.0, 0.2, 0.0]), zone_center)
		marker.scale = Vector3(0.12, 0.12, 0.12)
		var marker_mat := StandardMaterial3D.new()
		marker_mat.albedo_color = Color(0.88, 0.93, 0.84)
		marker_mat.emission_enabled = true
		marker_mat.emission = Color(0.88, 0.93, 0.84)
		marker_mat.emission_energy_multiplier = 0.28
		marker_mat.roughness = 0.62
		marker.material_override = marker_mat
		add_child(marker)

func _count_existing_zone_lights() -> int:
	var zone_root := get_parent()
	if zone_root == null:
		return 0
	var count := 0
	var stack: Array[Node] = [zone_root]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node is Light3D:
			count += 1
		for child in node.get_children():
			if child is Node:
				stack.append(child)
	return count

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
