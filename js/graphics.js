// ════════════════════════════════════════════
//  GraphicsManager — AAA-style Three.js pipeline
//  Sky + atmospheric scattering, cinematic lighting,
//  AgX tone mapping, SSAO + GodRays + Bloom + color grading + SMAA
// ════════════════════════════════════════════
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ─── Tone mapping resolution (AgX with ACES fallback) ─
let _agxFallbackWarned = false;
function _resolveToneMapping() {
  if (THREE.AgXToneMapping !== undefined) return THREE.AgXToneMapping;
  if (!_agxFallbackWarned) {
    console.warn('[GraphicsManager] THREE.AgXToneMapping unavailable; falling back to ACESFilmicToneMapping.');
    _agxFallbackWarned = true;
  }
  return THREE.ACESFilmicToneMapping;
}

// ─── Quality presets ──────────────────────────
const PRESETS = {
  low: {
    pixelRatioCap: 1.0,
    shadowMapSize: 1024,
    shadows: true,
    ssao: false,
    bloom: true,
    grading: true,
    aa: false,
    bloomStrength: 0.025,
    toneExposure: 0.78,
    foliageMultiplier: 0.55,
    godRays: false,
    godRayIntensity: 0.0,
    hazeMix: 0.16,
  },
  medium: {
    pixelRatioCap: 1.4,
    shadowMapSize: 2048,
    shadows: true,
    ssao: true,
    bloom: true,
    grading: true,
    aa: true,
    bloomStrength: 0.035,
    toneExposure: 0.82,
    foliageMultiplier: 1.0,
    godRays: true,
    godRayIntensity: 0.10,
    hazeMix: 0.20,
  },
  high: {
    pixelRatioCap: 1.5,
    shadowMapSize: 4096,
    shadows: true,
    ssao: true,
    bloom: true,
    grading: true,
    aa: true,
    bloomStrength: 0.045,
    toneExposure: 0.84,
    foliageMultiplier: 1.6,
    godRays: true,
    godRayIntensity: 0.16,
    hazeMix: 0.24,
  },
};

// ─── Cinematic color-grade + vignette + atmospheric haze shader ──
// Warm shadows (amber lift), cool teal-gold highlights, slight saturation
// boost, S-curve tonal contrast, soft corner vignette, plus a horizon-band
// haze tint that warmly washes distant pixels for open-world depth cues.
const ColorGradeShader = {
  uniforms: {
    tDiffuse:        { value: null },
    uVignette:       { value: 0.18 },   // corner darken amount (0..1)
    uVignetteSoft:   { value: 0.55 },   // smoothness of falloff
    uShadowWarm:     { value: new THREE.Vector3(0.04, 0.015, -0.02) }, // amber lift
    uHighlightCool:  { value: new THREE.Vector3(-0.01, 0.012, 0.04) }, // teal-gold push
    uSaturation:     { value: 0.96 },
    uContrast:       { value: 1.03 },
    uHazeMix:        { value: 0.20 },   // strength of horizon haze gradient
    uHazeTint:       { value: new THREE.Vector3(0.78, 0.76, 0.66) }, // humid tan haze
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uVignetteSoft;
    uniform vec3  uShadowWarm;
    uniform vec3  uHighlightCool;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uHazeMix;
    uniform vec3  uHazeTint;
    varying vec2 vUv;

    // Luma for sat/contrast
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;

      // — Tonal split-tone: lift shadows warm, push highlights cool-gold
      float l = clamp(luma(col), 0.0, 1.0);
      float shadowMask    = 1.0 - smoothstep(0.0, 0.55, l);
      float highlightMask = smoothstep(0.45, 1.0, l);
      col += uShadowWarm    * shadowMask;
      col += uHighlightCool * highlightMask;

      // — Saturation
      float gray = luma(col);
      col = mix(vec3(gray), col, uSaturation);

      // — Soft contrast around mid-grey (S-curve approximation)
      col = (col - 0.5) * uContrast + 0.5;

      // — Atmospheric haze gradient: a soft horizon band near vUv.y = 0.55
      //   Acts as a screen-space proxy for distant atmospheric scattering.
      float distFromHorizon = abs(vUv.y - 0.55);
      float hazeMask = smoothstep(0.0, 0.3, 1.0 - distFromHorizon);
      col = mix(col, mix(col, uHazeTint, 0.20 * hazeMask), uHazeMix);

      // — Vignette: radial darken with smooth falloff
      vec2  d = vUv - 0.5;
      float r = dot(d, d) * 2.0; // 0 at center, ~0.5 at corners
      float v = 1.0 - smoothstep(uVignetteSoft - 0.25, uVignetteSoft + 0.35, r) * uVignette * 4.0;
      v = clamp(v, 1.0 - uVignette, 1.0);
      col *= v;

      gl_FragColor = vec4(max(col, 0.0), src.a);
    }
  `,
  customProgramCacheKey: function () { return 'SquadColorGradeHaze_v2'; },
};

// ─── Volumetric god-ray shader (analytical / radial) ──
// Pragmatic v1: skips the depth-mask render. Builds rays analytically from
// the projected sun screen position with a radial falloff plus an angular
// modulation for ray bands, then additively composites onto the main color.
const GodRayShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uSunUV:     { value: new THREE.Vector2(0.5, 0.7) },
    uIntensity: { value: 0.4 },
    uOnScreen:  { value: 1.0 },     // 0 when sun is behind camera / off-screen
    uAspect:    { value: 16.0 / 9.0 },
    uRayColor:  { value: new THREE.Vector3(1.0, 0.88, 0.55) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2  uSunUV;
    uniform float uIntensity;
    uniform float uOnScreen;
    uniform float uAspect;
    uniform vec3  uRayColor;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);

      // Aspect-corrected delta from sun for round (not stretched) falloff
      vec2 dir = vec2((vUv.x - uSunUV.x) * uAspect, vUv.y - uSunUV.y);
      float dist = length(dir);

      // Radial intensity falloff — bright near sun, fading outward
      float falloff = smoothstep(1.0, 0.0, dist);

      // Angular ray bands (8 rays around the sun)
      float angle = atan(dir.y, dir.x);
      float bands = 0.7 + 0.3 * sin(angle * 8.0);

      float rays = falloff * bands * uIntensity * uOnScreen;
      vec3 contrib = uRayColor * rays;

      gl_FragColor = base + vec4(contrib, 0.0);
    }
  `,
  customProgramCacheKey: function () { return 'SquadGodRays_v1'; },
};

export class GraphicsManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene    = scene;
    this.camera   = camera;

    this.preset   = 'medium';
    this.settings = { ...PRESETS.medium };

    // Pipeline
    this.composer    = null;
    this.renderPass  = null;
    this.ssaoPass    = null;
    this.godRayPass  = null;
    this.bloomPass   = null;
    this.gradePass   = null;
    this.smaaPass    = null;

    // Sky + env
    this.sky         = null;
    this.skyParams   = null;
    this.pmrem       = null;
    this.envRT       = null;
    this.sunDirection = new THREE.Vector3(-0.5, 0.7, 0.3).normalize();

    // Lighting (filled in by installLighting)
    this.sunLight  = null;
    this.hemiLight = null;
    this.fillLight = null;

    // Scratch math objects (avoid per-frame allocations)
    this._sunWorldScratch = new THREE.Vector3();
    this._sunProjScratch  = new THREE.Vector3();

    this.initialized = false;
  }

  // ─── Auto-detect preset (Apple Silicon biased) ─
  autoDetectPreset() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    const mem   = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
    const dpr   = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    // Apple Silicon Macs are massively underrated by hardwareConcurrency alone —
    // bias aggressively to 'high' when on Mac with at least 8GB RAM.
    const isMac = /Mac|Macintosh|iPad|iPhone/i.test(ua);
    if (isMac && mem >= 8) return 'high';

    if (cores >= 8 && mem >= 8 && dpr <= 2.5) return 'high';
    if (cores >= 4 && mem >= 4) return 'medium';
    return 'low';
  }

  // ─── Lifecycle ─────────────────────────────
  init(preset = 'auto') {
    const chosen = preset === 'auto' ? this.autoDetectPreset() : preset;
    this.applyPreset(chosen);

    if (!this.initialized) {
      this._setupSkyAndEnvironment();
      this._setupComposer();
      this.initialized = true;
    }
    this._applyPassQuality();
    this.onResize(this._w(), this._h());
    return this.preset;
  }

  applyPreset(preset = 'medium') {
    const resolved = PRESETS[preset] ? preset : 'medium';
    this.preset = resolved;
    this.settings = { ...PRESETS[resolved] };
    this._applyRendererQuality();
    this._applyPassQuality();
    this._applyShadowQuality();
    this.onResize(this._w(), this._h());
    return this.preset;
  }

  // ─── Sky (Hosek-Wilkie) + PMREM env map ────
  _setupSkyAndEnvironment() {
    const sky = new Sky();
    sky.scale.setScalar(10000);
    this.scene.add(sky);
    this.sky = sky;

    // Late-afternoon warm-humid jungle haze tuning
    this.skyParams = {
      turbidity:       8.0,    // hazier (jungle humidity)
      rayleigh:        1.4,    // softer horizon scattering
      mieCoefficient:  0.005,  // less dust glare
      mieDirectionalG: 0.7,    // tighter sun glare
      elevation:       45,     // mid-afternoon sun height (higher = less harsh from below)
      azimuth:         220,    // sun in west sky behind player
      exposure:        0.28,
    };

    const u = sky.material.uniforms;
    u['turbidity'].value       = this.skyParams.turbidity;
    u['rayleigh'].value        = this.skyParams.rayleigh;
    u['mieCoefficient'].value  = this.skyParams.mieCoefficient;
    u['mieDirectionalG'].value = this.skyParams.mieDirectionalG;

    // Compute sun position from elevation/azimuth
    const phi   = THREE.MathUtils.degToRad(90 - this.skyParams.elevation);
    const theta = THREE.MathUtils.degToRad(this.skyParams.azimuth);
    const sunPos = new THREE.Vector3();
    sunPos.setFromSphericalCoords(1, phi, theta);
    u['sunPosition'].value.copy(sunPos);

    // Cache normalized sun direction for downstream lighting (world.js)
    this.sunDirection.copy(sunPos).normalize();

    // Generate an environment map from the sky and assign to scene
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(sky, 0.04);
    this.scene.environment = this.envRT.texture;
    // Keep the actual Sky mesh as the background (it tone-maps correctly).
    // Don't assign scene.background to the raw HDR env-map — it blows out bloom.
    this.scene.background = null;
  }

  /**
   * Returns normalized sun direction (THREE.Vector3) so external systems
   * (world.js lighting, terrain shaders, etc.) can stay in lockstep with
   * the sky.
   */
  getSunDirection() {
    return this.sunDirection.clone();
  }

  // ─── Public: install cinematic lighting rig ──
  installLighting(scene) {
    // Remove a previous rig if installLighting is called twice
    if (this.sunLight  && this.sunLight.parent)  this.sunLight.parent.remove(this.sunLight);
    if (this.sunTarget && this.sunTarget.parent) this.sunTarget.parent.remove(this.sunTarget);
    if (this.hemiLight && this.hemiLight.parent) this.hemiLight.parent.remove(this.hemiLight);
    if (this.fillLight && this.fillLight.parent) this.fillLight.parent.remove(this.fillLight);

    // Hemisphere — warm sky, cool ground bounce
    const hemi = new THREE.HemisphereLight(0xfff0d6, 0x3a4a35, 0.48);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);
    this.hemiLight = hemi;

    // Main directional sun, aligned to Hosek-Wilkie sun
    const sun = new THREE.DirectionalLight(0xffd0a0, 1.85);
    const dir = this.sunDirection.clone().multiplyScalar(160);
    sun.position.copy(dir);
    sun.target.position.set(0, 0, 0);
    scene.add(sun.target);
    this.sunTarget = sun.target;

    sun.castShadow = true;
    const sm = this.settings.shadowMapSize;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.near   = 5;
    sun.shadow.camera.far    = 250;
    sun.shadow.camera.left   = -90;
    sun.shadow.camera.right  =  90;
    sun.shadow.camera.top    =  90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.bias       = -0.0003;
    sun.shadow.normalBias =  0.04;
    scene.add(sun);
    this.sunLight = sun;

    // Cool fill — opposite the sun, sky-bounce blue-grey
    const fillDir = this.sunDirection.clone().negate().setY(Math.abs(this.sunDirection.y) * 0.4 + 0.2).normalize();
    const fill = new THREE.DirectionalLight(0x95a8be, 0.3);
    fill.position.copy(fillDir.multiplyScalar(120));
    scene.add(fill);
    this.fillLight = fill;

    return { sun, hemi, fill };
  }

  // ─── Public: install warm exponential fog ──
  installFog(scene) {
    // Open-world tuning: low density for ~280m sightlines so distant
    // mountain silhouettes & pagoda spires read while the warm tan tint
    // still ties everything to the Hosek-Wilkie sky.
    scene.fog = new THREE.FogExp2(0x9c967f, 0.0028);
    return scene.fog;
  }

  // ─── Composer / passes ─────────────────────
  _setupComposer() {
    const w = this._w();
    const h = this._h();

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(w, h);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // SSAO — tuned for jungle-scale geometry
    this.ssaoPass = new SSAOPass(this.scene, this.camera, w, h);
    this.ssaoPass.kernelRadius = 12;
    this.ssaoPass.minDistance  = 0.005;
    this.ssaoPass.maxDistance  = 0.15;
    if (SSAOPass.OUTPUT && SSAOPass.OUTPUT.Default !== undefined) {
      this.ssaoPass.output = SSAOPass.OUTPUT.Default;
    }
    this.composer.addPass(this.ssaoPass);

    // God rays — analytical radial shafts driven by projected sun position.
    // Sits between SSAO and Bloom so bloom further softens the bright shafts.
    this.godRayPass = new ShaderPass(GodRayShader);
    this.godRayPass.uniforms.uIntensity.value = this.settings.godRayIntensity;
    this.godRayPass.uniforms.uAspect.value    = (w && h) ? (w / h) : (16 / 9);
    this.composer.addPass(this.godRayPass);

    // Bloom — only sun-glare-bright pixels bloom
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.settings.bloomStrength,
      0.35,   // radius (smaller = less smear)
      1.10    // threshold (above sky brightness so only sun glints bloom)
    );
    this.composer.addPass(this.bloomPass);

    // Cinematic color grade + vignette + horizon haze
    this.gradePass = new ShaderPass(ColorGradeShader);
    this.gradePass.uniforms.uHazeMix.value = this.settings.hazeMix;
    this.composer.addPass(this.gradePass);

    // SMAA last — smooth post-pipeline aliasing
    const dpr = this.renderer.getPixelRatio();
    this.smaaPass = new SMAAPass(w * dpr, h * dpr);
    this.composer.addPass(this.smaaPass);
  }

  // ─── Renderer-level quality ────────────────
  _applyRendererQuality() {
    const s = this.settings;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.renderer.setPixelRatio(Math.min(dpr, s.pixelRatioCap));
    this.renderer.shadowMap.enabled = s.shadows;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = _resolveToneMapping();
    this.renderer.toneMappingExposure = s.toneExposure;
    this.renderer.outputColorSpace  = THREE.SRGBColorSpace;
  }

  _applyPassQuality() {
    if (!this.composer) return;
    const s = this.settings;

    if (this.ssaoPass) {
      this.ssaoPass.enabled = s.ssao;
      // Modest kernel scale per preset (kernelRadius is the base "12")
      this.ssaoPass.kernelRadius = this.preset === 'high' ? 14 : this.preset === 'medium' ? 12 : 10;
    }
    if (this.godRayPass) {
      this.godRayPass.enabled = !!s.godRays;
      this.godRayPass.uniforms.uIntensity.value = s.godRayIntensity || 0.0;
    }
    if (this.bloomPass) {
      this.bloomPass.enabled  = s.bloom;
      this.bloomPass.strength = s.bloomStrength;
      this.bloomPass.radius   = 0.35;
      this.bloomPass.threshold = 1.10;
    }
    if (this.gradePass) {
      this.gradePass.enabled = s.grading;
      this.gradePass.uniforms.uHazeMix.value = s.hazeMix != null ? s.hazeMix : 0.4;
    }
    if (this.smaaPass) {
      this.smaaPass.enabled = s.aa;
    }
  }

  _applyShadowQuality() {
    if (!this.sunLight) return;
    const sm = this.settings.shadowMapSize;
    if (this.sunLight.shadow.mapSize.x !== sm) {
      this.sunLight.shadow.mapSize.set(sm, sm);
      // Force shadow map rebuild on next render
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
    }
  }

  // ─── Resize ────────────────────────────────
  onResize(width, height) {
    if (!width || !height) return;
    if (this.composer)  this.composer.setSize(width, height);
    if (this.renderPass) this.renderPass.setSize?.(width, height);
    if (this.ssaoPass)  this.ssaoPass.setSize(width, height);
    if (this.godRayPass) {
      this.godRayPass.setSize?.(width, height);
      this.godRayPass.uniforms.uAspect.value = width / height;
    }
    if (this.bloomPass) this.bloomPass.setSize(width, height);
    if (this.gradePass) this.gradePass.setSize?.(width, height);
    if (this.smaaPass) {
      const dpr = this.renderer.getPixelRatio();
      this.smaaPass.setSize(width * dpr, height * dpr);
    }
  }

  /**
   * Project the sun direction into screen space and feed the god-ray pass.
   * Game code MAY call this each frame from its render loop with the active
   * camera; otherwise render() will call it internally with this.camera.
   */
  updateGodRayUniforms(camera) {
    if (!this.godRayPass) return;
    const cam = camera || this.camera;
    if (!cam) return;

    // Place a faux sun far along sunDirection from the camera so projection
    // is stable regardless of where the player stands in the open world.
    this._sunWorldScratch.copy(this.sunDirection).multiplyScalar(2000);
    if (cam.position) this._sunWorldScratch.add(cam.position);

    this._sunProjScratch.copy(this._sunWorldScratch).project(cam);

    const sx = (this._sunProjScratch.x + 1) * 0.5;
    const sy = (this._sunProjScratch.y + 1) * 0.5;

    this.godRayPass.uniforms.uSunUV.value.set(sx, sy);

    // z > 1 means behind camera in NDC; also fade if well off-screen
    const behind  = this._sunProjScratch.z > 1.0 ? 0.0 : 1.0;
    const margin  = 0.15;
    const onX = (sx > -margin && sx < 1.0 + margin) ? 1.0 : 0.0;
    const onY = (sy > -margin && sy < 1.0 + margin) ? 1.0 : 0.0;
    this.godRayPass.uniforms.uOnScreen.value = behind * onX * onY;
  }

  // ─── Render ────────────────────────────────
  render() {
    if (this.composer) {
      // Keep god-ray sun position in sync with camera each frame
      if (this.godRayPass && this.godRayPass.enabled) {
        this.updateGodRayUniforms(this.camera);
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ─── Reporting ─────────────────────────────
  getCurrentSettings() {
    return { preset: this.preset, ...this.settings };
  }

  getWorldQuality() {
    return {
      preset: this.preset,
      foliageMultiplier: this.settings.foliageMultiplier,
    };
  }

  // ─── Internals ─────────────────────────────
  _w() { return (typeof window !== 'undefined' && window.innerWidth)  || 1920; }
  _h() { return (typeof window !== 'undefined' && window.innerHeight) || 1080; }
}
