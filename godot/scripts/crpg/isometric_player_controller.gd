extends Node3D
class_name IsometricPlayerController

signal destination_changed(position: Vector3)

@export var move_speed: float = 5.8
@export var arrival_threshold: float = 0.35
@export var keyboard_move_enabled: bool = true
@export var camera_path: NodePath
@export var facing_node_path: NodePath
@export var destination_marker_path: NodePath

var _has_target: bool = false
var _target_position: Vector3 = Vector3.ZERO

@onready var _camera: Camera3D = get_node_or_null(camera_path) as Camera3D
@onready var _facing_node: Node3D = get_node_or_null(facing_node_path) as Node3D
@onready var _destination_marker: Node3D = get_node_or_null(destination_marker_path) as Node3D

func _ready() -> void:
	_target_position = global_position
	if _destination_marker:
		_destination_marker.visible = false

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_set_target_from_screen(event.position)

func _physics_process(delta: float) -> void:
	var velocity := Vector3.ZERO

	if keyboard_move_enabled:
		var keyboard_dir := _get_keyboard_input_vector()
		if keyboard_dir.length_squared() > 0.0:
			_has_target = false
			if _destination_marker:
				_destination_marker.visible = false
			velocity = keyboard_dir.normalized() * move_speed

	if _has_target and velocity.length_squared() <= 0.0:
		var flat_delta := Vector3(
			_target_position.x - global_position.x,
			0.0,
			_target_position.z - global_position.z
		)
		if flat_delta.length() <= arrival_threshold:
			global_position.x = _target_position.x
			global_position.z = _target_position.z
			_has_target = false
			if _destination_marker:
				_destination_marker.visible = false
		else:
			velocity = flat_delta.normalized() * move_speed

	if velocity.length_squared() <= 0.0:
		return

	global_position += velocity * delta
	_orient_facing_node(velocity)

func _set_target_from_screen(screen_pos: Vector2) -> void:
	if _camera == null:
		return

	var ray_origin := _camera.project_ray_origin(screen_pos)
	var ray_dir := _camera.project_ray_normal(screen_pos)
	var ground_plane := Plane(Vector3.UP, 0.0)
	var hit := ground_plane.intersects_ray(ray_origin, ray_dir)
	if hit == null:
		return

	var hit_pos := hit as Vector3
	_set_target_position(Vector3(hit_pos.x, global_position.y, hit_pos.z))

func _set_target_position(new_target: Vector3) -> void:
	_target_position = new_target
	_has_target = true
	if _destination_marker:
		_destination_marker.visible = true
		_destination_marker.global_position = Vector3(new_target.x, global_position.y + 0.08, new_target.z)
	emit_signal("destination_changed", new_target)

func _get_keyboard_input_vector() -> Vector3:
	var out := Vector3.ZERO
	if Input.is_key_pressed(KEY_W):
		out += Vector3(0.0, 0.0, -1.0)
	if Input.is_key_pressed(KEY_S):
		out += Vector3(0.0, 0.0, 1.0)
	if Input.is_key_pressed(KEY_A):
		out += Vector3(-1.0, 0.0, 0.0)
	if Input.is_key_pressed(KEY_D):
		out += Vector3(1.0, 0.0, 0.0)
	return out

func _orient_facing_node(velocity: Vector3) -> void:
	if _facing_node == null:
		return
	var heading := atan2(velocity.x, velocity.z)
	_facing_node.rotation.y = heading
