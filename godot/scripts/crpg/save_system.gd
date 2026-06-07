extends RefCounted
class_name CrpgSaveSystem

const SAVE_SCHEMA := "savegame_v1"
const SLOT_TEMPLATE := "user://crpg_slot_%d.json"

static func save_slot(slot_id: int, state: Dictionary) -> bool:
	var file_path := SLOT_TEMPLATE % slot_id
	var payload := {
		"schema": SAVE_SCHEMA,
		"saved_at": Time.get_datetime_string_from_system(true),
		"state": state,
	}

	var file := FileAccess.open(file_path, FileAccess.WRITE)
	if file == null:
		push_warning("Failed to open save file for writing: %s" % file_path)
		return false

	file.store_string(JSON.stringify(payload, "\t"))
	file.close()
	return true

static func load_slot(slot_id: int) -> Dictionary:
	var file_path := SLOT_TEMPLATE % slot_id
	if not FileAccess.file_exists(file_path):
		return {}

	var file := FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		push_warning("Failed to open save file for reading: %s" % file_path)
		return {}

	var parser := JSON.new()
	var parse_err := parser.parse(file.get_as_text())
	file.close()
	if parse_err != OK:
		push_warning("Failed to parse save file %s: %s" % [file_path, parser.get_error_message()])
		return {}

	if typeof(parser.data) != TYPE_DICTIONARY:
		push_warning("Save file %s has invalid payload type" % file_path)
		return {}

	var payload := parser.data as Dictionary
	if str(payload.get("schema", "")) != SAVE_SCHEMA:
		push_warning("Save file %s has unexpected schema" % file_path)
		return {}

	return payload.get("state", {})
