extends CanvasLayer
class_name CrpgUI

var _zone_label: Label
var _party_label: Label
var _objectives_label: RichTextLabel
var _log_label: RichTextLabel
var _prompt_label: Label
var _save_label: Label

var _log_lines: Array[String] = []

func _ready() -> void:
	layer = 10
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var status_panel := PanelContainer.new()
	status_panel.position = Vector2(18, 18)
	status_panel.size = Vector2(430, 315)
	root.add_child(status_panel)

	var status_margin := MarginContainer.new()
	status_margin.add_theme_constant_override("margin_left", 12)
	status_margin.add_theme_constant_override("margin_top", 10)
	status_margin.add_theme_constant_override("margin_right", 12)
	status_margin.add_theme_constant_override("margin_bottom", 10)
	status_panel.add_child(status_margin)

	var status_vbox := VBoxContainer.new()
	status_margin.add_child(status_vbox)

	_zone_label = Label.new()
	_zone_label.text = "Zone: Crash Site"
	status_vbox.add_child(_zone_label)

	_party_label = Label.new()
	_party_label.text = "Party: Rodriguez [ ]  Whitaker [ ]  Hale [ ]"
	status_vbox.add_child(_party_label)

	var objective_header := Label.new()
	objective_header.text = "Active Objectives"
	status_vbox.add_child(objective_header)

	_objectives_label = RichTextLabel.new()
	_objectives_label.fit_content = true
	_objectives_label.scroll_active = false
	_objectives_label.custom_minimum_size = Vector2(400, 220)
	status_vbox.add_child(_objectives_label)

	var log_panel := PanelContainer.new()
	log_panel.position = Vector2(18, 350)
	log_panel.size = Vector2(520, 190)
	root.add_child(log_panel)

	var log_margin := MarginContainer.new()
	log_margin.add_theme_constant_override("margin_left", 12)
	log_margin.add_theme_constant_override("margin_top", 10)
	log_margin.add_theme_constant_override("margin_right", 12)
	log_margin.add_theme_constant_override("margin_bottom", 10)
	log_panel.add_child(log_margin)

	var log_vbox := VBoxContainer.new()
	log_margin.add_child(log_vbox)

	var log_header := Label.new()
	log_header.text = "Mission Log"
	log_vbox.add_child(log_header)

	_log_label = RichTextLabel.new()
	_log_label.fit_content = true
	_log_label.scroll_active = false
	_log_label.custom_minimum_size = Vector2(485, 130)
	log_vbox.add_child(_log_label)

	_prompt_label = Label.new()
	_prompt_label.visible = false
	_prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt_label.position = Vector2(560, 680)
	_prompt_label.size = Vector2(800, 36)
	root.add_child(_prompt_label)

	_save_label = Label.new()
	_save_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_save_label.position = Vector2(1450, 20)
	_save_label.size = Vector2(430, 34)
	_save_label.text = "F5: Save slot 1  |  F9: Load slot 1"
	root.add_child(_save_label)

func set_zone(zone_name: String) -> void:
	if _zone_label:
		_zone_label.text = "Zone: %s" % zone_name

func set_party_state(party_state: Dictionary) -> void:
	if _party_label == null:
		return
	var rodriguez := "x" if bool(party_state.get("rodriguez", false)) else " "
	var whitaker := "x" if bool(party_state.get("cpl_whitaker", false)) else " "
	var hale := "x" if bool(party_state.get("spc_hale", false)) else " "
	_party_label.text = "Party: Rodriguez [%s]  Whitaker [%s]  Hale [%s]" % [rodriguez, whitaker, hale]

func set_objectives(lines: Array[String]) -> void:
	if _objectives_label == null:
		return
	if lines.is_empty():
		_objectives_label.text = "[color=#9fb09f]No active objectives.[/color]"
		return

	var payload := ""
	for line in lines:
		payload += "- %s\n" % line
	_objectives_label.text = payload.strip_edges()

func set_prompt(prompt_text: String, is_visible: bool) -> void:
	if _prompt_label == null:
		return
	_prompt_label.visible = is_visible
	_prompt_label.text = prompt_text

func set_save_status(text: String) -> void:
	if _save_label == null:
		return
	_save_label.text = text

func push_log(message: String) -> void:
	if _log_label == null:
		return
	_log_lines.append(message)
	if _log_lines.size() > 7:
		_log_lines = _log_lines.slice(_log_lines.size() - 7, _log_lines.size())
	var payload := ""
	for line in _log_lines:
		payload += "- %s\n" % line
	_log_label.text = payload.strip_edges()
