extends Node3D

func _ready() -> void:
	_build_floor()
	_build_reference_spheres()
	_build_reference_boxes()

func _build_floor() -> void:
	var floor := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(24.0, 24.0)
	floor.mesh = plane
	floor.material_override = _material(Color(0.35, 0.35, 0.35), 1.0, 0.0)
	add_child(floor)

func _build_reference_spheres() -> void:
	var samples := [
		{"label": "chrome", "pos": Vector3(-4.0, 1.0, 0.0), "roughness": 0.05, "metal": 1.0, "color": Color(0.9, 0.9, 0.9)},
		{"label": "gray", "pos": Vector3(-1.0, 1.0, 0.0), "roughness": 0.55, "metal": 0.0, "color": Color(0.5, 0.5, 0.5)},
		{"label": "skin", "pos": Vector3(2.0, 1.0, 0.0), "roughness": 0.65, "metal": 0.0, "color": Color(0.76, 0.56, 0.47)},
		{"label": "foliage", "pos": Vector3(5.0, 1.0, 0.0), "roughness": 0.88, "metal": 0.0, "color": Color(0.26, 0.44, 0.22)}
	]

	for sample in samples:
		var mesh := MeshInstance3D.new()
		mesh.mesh = SphereMesh.new()
		mesh.position = sample["pos"]
		mesh.material_override = _material(sample["color"], sample["roughness"], sample["metal"])
		add_child(mesh)

func _build_reference_boxes() -> void:
	for i in range(4):
		var box := MeshInstance3D.new()
		var box_mesh := BoxMesh.new()
		box_mesh.size = Vector3(1.2, 2.0, 1.2)
		box.mesh = box_mesh
		box.position = Vector3(-5.4 + i * 3.6, 1.0, -4.0)
		box.material_override = _material(Color(0.42 + i * 0.08, 0.34 + i * 0.04, 0.28), 0.75, 0.02)
		add_child(box)

func _material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = roughness
	mat.metallic = metallic
	return mat
