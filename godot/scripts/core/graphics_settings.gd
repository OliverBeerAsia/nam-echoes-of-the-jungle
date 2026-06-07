extends Node

signal quality_changed(preset: String, settings: Dictionary)

const FALLBACK_PRESET := "medium"

var current_preset: String = FALLBACK_PRESET
var current_settings: Dictionary = {}

func _ready() -> void:
	apply_quality(DataStore.get_graphics_default())

func apply_quality(preset: String) -> void:
	var presets := DataStore.get_graphics_presets()
	if presets.is_empty():
		presets = {
			"medium": {
				"render_scale": 1.0,
				"msaa_3d": 1,
				"foliage_density": 1.0,
				"shadow_quality": "medium",
				"clutter_density": 1.0,
				"max_dynamic_lights": 10,
				"shadow_distance": 110.0,
				"material_detail_scale": 1.0,
				"post_fx_strength": 0.6
			}
		}

	if not presets.has(preset):
		preset = FALLBACK_PRESET
	if not presets.has(preset):
		preset = presets.keys()[0]

	current_preset = preset
	current_settings = presets[preset]
	_apply_viewport_settings(current_settings)
	emit_signal("quality_changed", current_preset, current_settings)

func get_setting(name: String, fallback: Variant = null) -> Variant:
	return current_settings.get(name, fallback)

func _apply_viewport_settings(settings: Dictionary) -> void:
	var root_viewport := get_tree().root
	root_viewport.scaling_3d_scale = float(settings.get("render_scale", 1.0))
	root_viewport.msaa_3d = int(settings.get("msaa_3d", 0))
