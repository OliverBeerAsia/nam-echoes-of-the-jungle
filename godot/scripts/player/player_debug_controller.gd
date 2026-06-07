extends Node3D

@export var move_speed: float = 8.0
@export var sprint_multiplier: float = 1.65
@export var look_sensitivity: float = 0.11
@export var vertical_limit_deg: float = 82.0

@onready var camera: Camera3D = $Camera3D

var _pitch_deg: float = 0.0

func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(deg_to_rad(-event.relative.x * look_sensitivity))
		_pitch_deg = clamp(_pitch_deg - event.relative.y * look_sensitivity, -vertical_limit_deg, vertical_limit_deg)
		camera.rotation_degrees.x = _pitch_deg
		return

	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		return

	if event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	var movement := Vector3.ZERO
	var forward := -global_transform.basis.z
	var right := global_transform.basis.x

	if Input.is_key_pressed(KEY_W):
		movement += forward
	if Input.is_key_pressed(KEY_S):
		movement -= forward
	if Input.is_key_pressed(KEY_D):
		movement += right
	if Input.is_key_pressed(KEY_A):
		movement -= right

	movement.y = 0.0
	if movement.length_squared() <= 0.0:
		return

	var speed := move_speed
	if Input.is_key_pressed(KEY_SHIFT):
		speed *= sprint_multiplier

	global_position += movement.normalized() * speed * delta
