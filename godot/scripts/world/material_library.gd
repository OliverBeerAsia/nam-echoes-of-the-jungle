extends RefCounted
class_name MaterialLibrary

static func make_pbr_material(base: Color, accent: Color, detail: Color, seed: int, roughness: float = 0.82, metallic: float = 0.03, tile: int = 4) -> StandardMaterial3D:
	var detail_scale: float = _resolve_material_detail_scale()
	var uv_tile: float = max(0.25, float(tile) * detail_scale)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = make_noise_texture(base, accent, detail, seed)
	mat.roughness_texture = make_roughness_texture(seed + 97)
	mat.normal_enabled = false
	mat.roughness_texture_channel = StandardMaterial3D.TEXTURE_CHANNEL_RED
	mat.uv1_scale = Vector3(uv_tile, uv_tile, 1.0)
	mat.roughness = roughness
	mat.metallic = metallic
	mat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return mat

static func make_weathered_pbr_material(base: Color, accent: Color, detail: Color, seed: int, roughness: float = 0.82, metallic: float = 0.03, tile: int = 4, weathering: float = 0.35) -> StandardMaterial3D:
	var detail_scale: float = _resolve_material_detail_scale()
	var uv_tile: float = max(0.25, float(tile) * detail_scale)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = make_weathered_noise_texture(base, accent, detail, seed, weathering)
	mat.roughness_texture = make_weathered_roughness_texture(seed + 97, weathering)
	mat.normal_enabled = false
	mat.roughness_texture_channel = StandardMaterial3D.TEXTURE_CHANNEL_RED
	mat.uv1_scale = Vector3(uv_tile, uv_tile, 1.0)
	mat.roughness = roughness
	mat.metallic = metallic
	mat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return mat

static func make_noise_texture(base: Color, accent: Color, detail: Color, seed: int, size: int = 256) -> Texture2D:
	var resolved_size := _resolve_texture_size(size)
	var image := Image.create(resolved_size, resolved_size, false, Image.FORMAT_RGBA8)
	var noise := FastNoiseLite.new()
	noise.seed = seed
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise.frequency = 0.05

	for y in range(resolved_size):
		for x in range(resolved_size):
			var n: float = noise.get_noise_2d(x, y) * 0.5 + 0.5
			var m: float = sin((x + seed) * 0.19) * cos((y - seed) * 0.21) * 0.5 + 0.5
			var c: Color = base.lerp(accent, n)
			c = c.lerp(detail, m * 0.35)
			image.set_pixel(x, y, Color(c.r, c.g, c.b, 1.0))

	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)

static func make_roughness_texture(seed: int, size: int = 256) -> Texture2D:
	var resolved_size := _resolve_texture_size(size)
	var image := Image.create(resolved_size, resolved_size, false, Image.FORMAT_RGBA8)
	var noise := FastNoiseLite.new()
	noise.seed = seed
	noise.noise_type = FastNoiseLite.TYPE_VALUE_CUBIC
	noise.frequency = 0.08

	for y in range(resolved_size):
		for x in range(resolved_size):
			var n: float = noise.get_noise_2d(x, y) * 0.5 + 0.5
			var v: float = clamp(0.62 + n * 0.32, 0.0, 1.0)
			image.set_pixel(x, y, Color(v, v, v, 1.0))

	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)

static func make_weathered_noise_texture(base: Color, accent: Color, detail: Color, seed: int, weathering: float, size: int = 256) -> Texture2D:
	var resolved_size := _resolve_texture_size(size)
	var image := Image.create(resolved_size, resolved_size, false, Image.FORMAT_RGBA8)
	var noise_main := FastNoiseLite.new()
	noise_main.seed = seed
	noise_main.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise_main.frequency = 0.045
	var noise_grime := FastNoiseLite.new()
	noise_grime.seed = seed + 37
	noise_grime.noise_type = FastNoiseLite.TYPE_VALUE_CUBIC
	noise_grime.frequency = 0.12
	var weather: float = clamp(weathering, 0.0, 1.0)

	for y in range(resolved_size):
		for x in range(resolved_size):
			var n: float = noise_main.get_noise_2d(x, y) * 0.5 + 0.5
			var g: float = noise_grime.get_noise_2d(x, y) * 0.5 + 0.5
			var grain: float = sin((x + seed) * 0.13) * cos((y - seed) * 0.16) * 0.5 + 0.5
			var grime: float = clamp((1.0 - n) * 0.74 + g * 0.26, 0.0, 1.0)
			var c: Color = base.lerp(accent, n)
			c = c.lerp(detail, grain * 0.33)
			c = c.lerp(Color(0.1, 0.09, 0.08), grime * weather * 0.52)
			c = c.lightened((1.0 - grime) * weather * 0.08)
			image.set_pixel(x, y, Color(c.r, c.g, c.b, 1.0))

	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)

static func make_weathered_roughness_texture(seed: int, weathering: float, size: int = 256) -> Texture2D:
	var resolved_size := _resolve_texture_size(size)
	var image := Image.create(resolved_size, resolved_size, false, Image.FORMAT_RGBA8)
	var noise := FastNoiseLite.new()
	noise.seed = seed
	noise.noise_type = FastNoiseLite.TYPE_VALUE_CUBIC
	noise.frequency = 0.08
	var grime_noise := FastNoiseLite.new()
	grime_noise.seed = seed + 41
	grime_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	grime_noise.frequency = 0.16
	var weather: float = clamp(weathering, 0.0, 1.0)

	for y in range(resolved_size):
		for x in range(resolved_size):
			var n: float = noise.get_noise_2d(x, y) * 0.5 + 0.5
			var g: float = grime_noise.get_noise_2d(x, y) * 0.5 + 0.5
			var grime: float = clamp((1.0 - n) * 0.65 + g * 0.35, 0.0, 1.0)
			var v: float = clamp(0.57 + n * 0.25 + grime * weather * 0.2, 0.0, 1.0)
			image.set_pixel(x, y, Color(v, v, v, 1.0))

	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)

static func make_wind_foliage_material(base: Color, tip: Color, roughness: float = 0.9) -> ShaderMaterial:
	var fx_strength: float = _resolve_post_fx_strength()
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;

uniform vec4 base_color : source_color = vec4(0.24, 0.4, 0.2, 1.0);
uniform vec4 tip_color : source_color = vec4(0.38, 0.56, 0.3, 1.0);
uniform float sway = 0.08;
uniform float speed = 1.6;
uniform float roughness_factor = 0.9;

void vertex() {
	float phase = TIME * speed + (MODEL_MATRIX[3].x + MODEL_MATRIX[3].z) * 0.11;
	float weight = 1.0 - clamp(UV.y, 0.0, 1.0);
	VERTEX.x += sin(phase) * sway * weight;
	VERTEX.z += cos(phase * 1.37) * sway * 0.6 * weight;
}

void fragment() {
	vec3 col = mix(base_color.rgb, tip_color.rgb, clamp(UV.y * 1.1, 0.0, 1.0));
	ALBEDO = col;
	ROUGHNESS = roughness_factor;
	METALLIC = 0.0;
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("base_color", base)
	mat.set_shader_parameter("tip_color", tip)
	mat.set_shader_parameter("sway", 0.05 + fx_strength * 0.05)
	mat.set_shader_parameter("speed", 1.2 + fx_strength * 0.7)
	mat.set_shader_parameter("roughness_factor", roughness)
	return mat

static func _resolve_material_detail_scale() -> float:
	var settings := _get_graphics_settings_node()
	if settings == null:
		return 1.0
	var value: Variant = settings.call("get_setting", "material_detail_scale", 1.0)
	return clamp(float(value), 0.65, 1.45)

static func _resolve_post_fx_strength() -> float:
	var settings := _get_graphics_settings_node()
	if settings == null:
		return 0.6
	var value: Variant = settings.call("get_setting", "post_fx_strength", 0.6)
	return clamp(float(value), 0.2, 1.0)

static func _resolve_texture_size(base_size: int) -> int:
	var scaled := int(round(float(base_size) * _resolve_material_detail_scale()))
	return clamp(scaled, 96, 512)

static func _get_graphics_settings_node() -> Node:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		return null
	var root := tree.root
	if root == null:
		return null
	return root.get_node_or_null("/root/GraphicsSettings")
