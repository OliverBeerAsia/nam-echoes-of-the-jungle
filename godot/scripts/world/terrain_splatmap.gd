extends MeshInstance3D
class_name TerrainSplatmap

const MatLib = preload("res://scripts/world/material_library.gd")

@export var world_size: Vector2 = Vector2(260.0, 260.0)
@export var terrain_origin: Vector3 = Vector3(20.0, -0.1, 8.0)
@export var uv_scale: float = 24.0
@export var splat_scale: float = 2.3
@export var displacement_strength: float = 0.75
@export var path_contrast: float = 1.1
@export var mud_wetness: float = 0.42
@export var macro_noise_strength: float = 0.28
@export var puddle_lowland_bias: float = 0.38
@export var grass_base: Color = Color(0.34, 0.41, 0.30)
@export var grass_accent: Color = Color(0.41, 0.48, 0.36)
@export var grass_detail: Color = Color(0.49, 0.53, 0.40)
@export var mud_base: Color = Color(0.36, 0.29, 0.22)
@export var mud_accent: Color = Color(0.43, 0.34, 0.25)
@export var mud_detail: Color = Color(0.51, 0.40, 0.29)
@export var path_base: Color = Color(0.43, 0.36, 0.29)
@export var path_accent: Color = Color(0.50, 0.41, 0.32)
@export var path_detail: Color = Color(0.58, 0.48, 0.37)
@export var noise_seed: int = 903

func _ready() -> void:
	mesh = _make_plane_mesh()
	material_override = _build_material()
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	position = terrain_origin

func apply_profile(profile: Dictionary) -> void:
	if profile.is_empty():
		return

	world_size = _vec2_from_array(profile.get("world_size", [world_size.x, world_size.y]), world_size)
	terrain_origin = _vec3_from_array(profile.get("terrain_origin", [terrain_origin.x, terrain_origin.y, terrain_origin.z]), terrain_origin)
	uv_scale = float(profile.get("uv_scale", uv_scale))
	splat_scale = float(profile.get("splat_scale", splat_scale))
	displacement_strength = float(profile.get("displacement_strength", displacement_strength))
	path_contrast = float(profile.get("path_contrast", path_contrast))
	mud_wetness = float(profile.get("mud_wetness", mud_wetness))
	macro_noise_strength = float(profile.get("macro_noise_strength", macro_noise_strength))
	puddle_lowland_bias = float(profile.get("puddle_lowland_bias", puddle_lowland_bias))

	grass_base = _color_from_value(profile.get("grass_base", grass_base), grass_base)
	grass_accent = _color_from_value(profile.get("grass_accent", grass_accent), grass_accent)
	grass_detail = _color_from_value(profile.get("grass_detail", grass_detail), grass_detail)
	mud_base = _color_from_value(profile.get("mud_base", mud_base), mud_base)
	mud_accent = _color_from_value(profile.get("mud_accent", mud_accent), mud_accent)
	mud_detail = _color_from_value(profile.get("mud_detail", mud_detail), mud_detail)
	path_base = _color_from_value(profile.get("path_base", path_base), path_base)
	path_accent = _color_from_value(profile.get("path_accent", path_accent), path_accent)
	path_detail = _color_from_value(profile.get("path_detail", path_detail), path_detail)
	noise_seed = int(profile.get("noise_seed", noise_seed))

func _make_plane_mesh() -> PlaneMesh:
	var plane := PlaneMesh.new()
	plane.size = world_size
	plane.subdivide_depth = 220
	plane.subdivide_width = 220
	return plane

func _build_material() -> ShaderMaterial:
	var grass_tex: Texture2D = MatLib.make_noise_texture(grass_base, grass_accent, grass_detail, noise_seed + 11)
	var mud_tex: Texture2D = MatLib.make_noise_texture(mud_base, mud_accent, mud_detail, noise_seed + 27)
	var path_tex: Texture2D = MatLib.make_noise_texture(path_base, path_accent, path_detail, noise_seed + 53)
	var detail_scale: float = clamp(float(GraphicsSettings.get_setting("material_detail_scale", 1.0)), 0.7, 1.45)
	var splat_tex: Texture2D = _build_splat_texture(max(256, int(round(512.0 * detail_scale))))

	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode depth_draw_opaque, cull_back;

uniform sampler2D grass_tex : source_color;
uniform sampler2D mud_tex : source_color;
uniform sampler2D path_tex : source_color;
uniform sampler2D splat_tex : source_color;
uniform float uv_scale = 24.0;
uniform float detail_scale = 1.0;
uniform float splat_scale = 2.3;
uniform float displacement_strength = 0.75;
uniform float path_contrast = 1.1;
uniform float mud_wetness = 0.42;
uniform float macro_noise_strength = 0.28;
uniform float puddle_lowland_bias = 0.38;

varying vec3 world_pos;
varying float slope_factor;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void vertex() {
	float n = noise2(VERTEX.xz * 0.06) * 2.0 - 1.0;
	float m = noise2((VERTEX.xz + vec2(133.0, -71.0)) * 0.11) * 2.0 - 1.0;
	float macro = noise2((VERTEX.xz + vec2(31.0, -17.0)) * 0.035) * 2.0 - 1.0;
	VERTEX.y += (n * 0.66 + m * 0.24 + macro * 0.1) * displacement_strength;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	slope_factor = clamp(1.0 - NORMAL.y, 0.0, 1.0);
}

void fragment() {
	vec2 tiled_uv = UV * uv_scale * detail_scale;
	vec4 grass = texture(grass_tex, tiled_uv);
	vec4 mud = texture(mud_tex, tiled_uv * 1.07);
	vec4 path = texture(path_tex, tiled_uv * 0.86);
	vec3 splat = texture(splat_tex, UV * splat_scale).rgb;

	float authored_path = pow(clamp(splat.b, 0.0, 1.0), max(0.55, path_contrast));
	float lowland = 1.0 - smoothstep(0.2, 4.2, world_pos.y + 0.25);
	float mud_mask = clamp(lowland * (0.54 + mud_wetness * 0.36) + slope_factor * 0.28 + splat.g * 0.18, 0.0, 1.0);
	float path_mask = clamp(authored_path * 1.12, 0.0, 1.0);
	float grass_mask = clamp(1.0 - mud_mask * 0.82 - path_mask * 0.96, 0.0, 1.0);
	float total = max(grass_mask + mud_mask + path_mask, 0.0001);
	grass_mask /= total;
	mud_mask /= total;
	path_mask /= total;

	float macro = noise2(UV * 10.0 + vec2(7.0, -3.0));
	float shade = 0.9 + (macro - 0.5) * macro_noise_strength;
	vec3 col = (grass.rgb * grass_mask + mud.rgb * mud_mask + path.rgb * path_mask) * shade;
	float puddle = clamp((1.0 - slope_factor * 1.5) * mud_mask * (mud_wetness + lowland * puddle_lowland_bias), 0.0, 1.0);
	ALBEDO = col;
	ROUGHNESS = clamp(0.94 - path_mask * 0.17 - mud_mask * 0.1 - puddle * 0.46, 0.24, 0.99);
	SPECULAR = clamp(0.3 + puddle * 0.36, 0.0, 1.0);
	METALLIC = 0.01;
	AO = clamp(0.84 + macro * 0.12 - mud_mask * 0.08, 0.55, 1.0);
}
"""

	var material := ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("grass_tex", grass_tex)
	material.set_shader_parameter("mud_tex", mud_tex)
	material.set_shader_parameter("path_tex", path_tex)
	material.set_shader_parameter("splat_tex", splat_tex)
	material.set_shader_parameter("uv_scale", uv_scale)
	material.set_shader_parameter("detail_scale", detail_scale)
	material.set_shader_parameter("splat_scale", splat_scale)
	material.set_shader_parameter("displacement_strength", displacement_strength)
	material.set_shader_parameter("path_contrast", path_contrast)
	material.set_shader_parameter("mud_wetness", mud_wetness)
	material.set_shader_parameter("macro_noise_strength", macro_noise_strength)
	material.set_shader_parameter("puddle_lowland_bias", puddle_lowland_bias)
	return material

func _build_splat_texture(size: int) -> Texture2D:
	var image := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var noise := FastNoiseLite.new()
	noise.seed = noise_seed
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	noise.frequency = 0.015

	for y in range(size):
		for x in range(size):
			var u: float = float(x) / float(size - 1)
			var v: float = float(y) / float(size - 1)
			var world_x: float = (u - 0.5) * world_size.x
			var world_z: float = (v - 0.5) * world_size.y

			var n: float = noise.get_noise_2d(world_x, world_z) * 0.5 + 0.5
			var mud: float = clamp(0.2 + n * (0.46 + mud_wetness * 0.22), 0.0, 1.0)

			# Two authored trail ribbons to keep classic FPS readability.
			var path_main: float = exp(-pow((world_x - world_z * 0.14) * 0.05, 2.0))
			var path_branch: float = exp(-pow((world_x + 16.0 + world_z * 0.2) * 0.07, 2.0)) * smoothstep(-22.0, 48.0, world_z)
			var path: float = clamp(pow(path_main * 0.75 + path_branch * 0.65, max(0.65, path_contrast)), 0.0, 1.0)

			var grass: float = clamp(1.0 - mud * 0.75 - path * 0.92, 0.0, 1.0)
			image.set_pixel(x, y, Color(grass, mud, path, 1.0))

	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)

func _vec2_from_array(values: Variant, fallback: Vector2) -> Vector2:
	if values is Array and values.size() >= 2:
		return Vector2(float(values[0]), float(values[1]))
	return fallback

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
