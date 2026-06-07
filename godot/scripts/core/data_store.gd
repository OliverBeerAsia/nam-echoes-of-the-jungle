extends Node

const ZONES_INDEX_PATH := "res://data/zones/zones_index.json"
const GRAPHICS_PRESETS_PATH := "res://data/graphics/presets.json"
const ENV_ASSET_CATALOG_PATH := "res://data/assets/catalog/environment_assets.json"
const CHARACTER_PROFILES_PATH := "res://data/npc/character_profiles.json"
const LIGHTING_PROFILES_PATH := "res://data/lighting/zone_lighting_profiles.json"
const TERRAIN_PROFILES_PATH := "res://data/world/terrain_profiles.json"
const FOLIAGE_PROFILES_PATH := "res://data/world/foliage_profiles.json"
const ATMOSPHERE_PROFILES_PATH := "res://data/world/atmosphere_profiles.json"
const ACCEPTANCE_TARGETS_PATH := "res://data/benchmark/acceptance_targets.json"
const SHARED_STORY_PATH := "res://data/shared/story.v1.json"

var _cache: Dictionary = {}

func _ready() -> void:
	_cache["zones_index"] = _load_json(ZONES_INDEX_PATH)
	_cache["graphics_presets"] = _load_json(GRAPHICS_PRESETS_PATH)
	_cache["environment_assets"] = _load_json(ENV_ASSET_CATALOG_PATH)
	_cache["character_profiles"] = _load_json(CHARACTER_PROFILES_PATH)
	_cache["lighting_profiles"] = _load_json(LIGHTING_PROFILES_PATH)
	_cache["terrain_profiles"] = _load_json(TERRAIN_PROFILES_PATH)
	_cache["foliage_profiles"] = _load_json(FOLIAGE_PROFILES_PATH)
	_cache["atmosphere_profiles"] = _load_json(ATMOSPHERE_PROFILES_PATH)
	_cache["acceptance_targets"] = _load_json(ACCEPTANCE_TARGETS_PATH)
	_cache["shared_story"] = _load_json(SHARED_STORY_PATH)

func get_zone_index() -> Array:
	return _cache.get("zones_index", {}).get("zones", [])

func find_zone_record(zone_id: String) -> Dictionary:
	for zone in get_zone_index():
		if str(zone.get("id", "")) == zone_id:
			return zone
	return {}

func get_zone_definition(zone_id: String) -> Dictionary:
	var cache_key := "zone_definition:%s" % zone_id
	if _cache.has(cache_key):
		return _cache[cache_key]

	var zone := find_zone_record(zone_id)
	if zone.is_empty():
		return {}

	var definition_path := str(zone.get("definition", ""))
	if definition_path.is_empty():
		return {}

	var definition := _load_json(definition_path)
	_cache[cache_key] = definition
	return definition

func get_graphics_presets() -> Dictionary:
	return _cache.get("graphics_presets", {}).get("presets", {})

func get_graphics_default() -> String:
	return str(_cache.get("graphics_presets", {}).get("default", "medium"))

func get_environment_asset(asset_id: String) -> Dictionary:
	return _cache.get("environment_assets", {}).get("assets", {}).get(asset_id, {})

func get_character_profile(profile_id: String) -> Dictionary:
	return _cache.get("character_profiles", {}).get("profiles", {}).get(profile_id, {})

func get_lighting_profiles() -> Dictionary:
	return _cache.get("lighting_profiles", {})

func get_lighting_profile(profile_id: String) -> Dictionary:
	return _cache.get("lighting_profiles", {}).get("profiles", {}).get(profile_id, {})

func get_terrain_profile(profile_id: String) -> Dictionary:
	return _cache.get("terrain_profiles", {}).get("profiles", {}).get(profile_id, {})

func get_foliage_profile(profile_id: String) -> Dictionary:
	return _cache.get("foliage_profiles", {}).get("profiles", {}).get(profile_id, {})

func get_atmosphere_profile(profile_id: String) -> Dictionary:
	return _cache.get("atmosphere_profiles", {}).get("profiles", {}).get(profile_id, {})

func get_acceptance_targets() -> Dictionary:
	return _cache.get("acceptance_targets", {})

func get_story_data() -> Dictionary:
	return _cache.get("shared_story", {})

func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_warning("DataStore missing file: %s" % path)
		return {}

	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_warning("DataStore cannot open file: %s" % path)
		return {}

	var text := file.get_as_text()
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		push_warning("DataStore JSON parse failed for %s: %s" % [path, json.get_error_message()])
		return {}

	if typeof(json.data) != TYPE_DICTIONARY:
		push_warning("DataStore expected Dictionary at %s" % path)
		return {}

	return json.data
