extends Node
class_name ZoneStreamingManager

@export var player_path: NodePath
@export var load_radius: float = 185.0
@export var unload_radius: float = 240.0

var _zone_records: Array = []

func configure_from_index(zone_index: Array) -> void:
	_zone_records.clear()
	for zone in zone_index:
		var center := _vec3_from_array(zone.get("center", [0, 0, 0]))
		_zone_records.append({
			"id": str(zone.get("id", "")),
			"scene": str(zone.get("scene", "")),
			"center": center,
			"instance": null,
		})

func _process(_delta: float) -> void:
	if _zone_records.is_empty():
		return

	var player := get_node_or_null(player_path) as Node3D
	if player == null:
		return

	var player_pos := player.global_position
	for i in range(_zone_records.size()):
		var record: Dictionary = _zone_records[i]
		var center: Vector3 = record["center"]
		var dist := player_pos.distance_to(center)

		if record["instance"] == null and dist <= load_radius:
			record["instance"] = _spawn_zone(record)
		elif record["instance"] != null and dist >= unload_radius:
			var node := record["instance"] as Node
			if node != null:
				node.queue_free()
			record["instance"] = null

		_zone_records[i] = record

func _spawn_zone(record: Dictionary) -> Node:
	var scene_path := str(record.get("scene", ""))
	if scene_path.is_empty():
		push_warning("Zone %s has no scene path" % record.get("id", "<unknown>"))
		return null

	var packed := load(scene_path)
	if packed == null or not (packed is PackedScene):
		push_warning("Zone %s failed to load scene: %s" % [record.get("id", "<unknown>"), scene_path])
		return null

	var instance := (packed as PackedScene).instantiate()
	add_child(instance)
	return instance

func _vec3_from_array(values: Variant) -> Vector3:
	if values is Array and values.size() >= 3:
		return Vector3(float(values[0]), float(values[1]), float(values[2]))
	return Vector3.ZERO
