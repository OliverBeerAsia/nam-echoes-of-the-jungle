// ════════════════════════════════════════════
//  GraphicsManager — late-90s tactical realism profile
//  Flat humid sky, simple lighting, restrained color grade, low object cost
// ════════════════════════════════════════════
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
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
    pixelRatioCap: 0.85,
    shadowMapSize: 512,
    shadows: false,
    ssao: false,
    bloom: false,
    grading: false,
    aa: false,
    bloomStrength: 0.0,
    toneExposure: 1.05,
    foliageMultiplier: 0.22,
    godRays: false,
    godRayIntensity: 0.0,
    hazeMix: 0.08,
  },
  medium: {
    pixelRatioCap: 1.0,
    shadowMapSize: 768,
    shadows: true,
    ssao: false,
    bloom: false,
    grading: true,
    aa: false,
    bloomStrength: 0.0,
    toneExposure: 1.00,
    foliageMultiplier: 0.35,
    godRays: false,
    godRayIntensity: 0.0,
    hazeMix: 0.10,
  },
  high: {
    pixelRatioCap: 1.15,
    shadowMapSize: 1024,
    shadows: true,
    ssao: false,
    bloom: false,
    grading: true,
    aa: false,
    bloomStrength: 0.0,
    toneExposure: 0.98,
    foliageMultiplier: 0.55,
    godRays: false,
    godRayIntensity: 0.0,
    hazeMix: 0.12,
  },
};

// ─── Cinematic color-grade + vignette + atmospheric haze shader ──
// Warm shadows (amber lift), cool teal-gold highlights, slight saturation
// boost, S-curve tonal contrast, soft corner vignette, plus a horizon-band
// haze tint that warmly washes distant pixels for open-world depth cues.
const ColorGradeShader = {
  uniforms: {
    tDiffuse:        { value: null },
    uVignette:       { value: 0.06 },   // corner darken amount (0..1)
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

    if (cores >= 8 && mem >= 8 && dpr <= 1.5) return 'medium';
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

  // ─── Flat overcast sky and no PMREM ────
  _setupSkyAndEnvironment() {
    const phi = THREE.MathUtils.degToRad(48);
    const theta = THREE.MathUtils.degToRad(220);
    this.sunDirection.setFromSphericalCoords(1, phi, theta).normalize();
    this.scene.background = new THREE.Color(0x8b927e);
    this.scene.environment = null;
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
    const hemi = new THREE.HemisphereLight(0xc7c0a2, 0x252d22, 0.75);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);
    this.hemiLight = hemi;

    // Main directional sun, aligned to Hosek-Wilkie sun
    const sun = new THREE.DirectionalLight(0xc7b986, 1.25);
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
    const fill = new THREE.DirectionalLight(0x6d7a70, 0.25);
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
    scene.fog = new THREE.FogExp2(0x68705f, 0.0042);
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

    // Cinematic color grade + vignette + horizon haze
    this.gradePass = new ShaderPass(ColorGradeShader);
    this.gradePass.uniforms.uHazeMix.value = this.settings.hazeMix;
    this.composer.addPass(this.gradePass);
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
