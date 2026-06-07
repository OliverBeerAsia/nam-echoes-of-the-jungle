// ════════════════════════════════════════════
//  Textures — procedural PBR texture generation
//  Canvas-based albedo + normal + roughness builders for Three.js r162
// ════════════════════════════════════════════
import * as THREE from 'three';

// ─── Cache ───────────────────────────────────────────────────
const _cache = new Map();

function _cached(key, builder) {
  if (key && _cache.has(key)) return _cache.get(key);
  const out = builder();
  if (key) _cache.set(key, out);
  return out;
}

// ─── Color helpers ───────────────────────────────────────────
function hexToRgb(hex) {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function rgbStr(r, g, b, a = 1) {
  return `rgba(${clamp(r | 0, 0, 255)},${clamp(g | 0, 0, 255)},${clamp(b | 0, 0, 255)},${a})`;
}

function shade(rgb, amt) {
  // amt in [-1, 1]; negative darkens, positive lightens
  return {
    r: clamp(rgb.r + amt * 255, 0, 255),
    g: clamp(rgb.g + amt * 255, 0, 255),
    b: clamp(rgb.b + amt * 255, 0, 255),
  };
}

function jitterColor(rgb, range) {
  return {
    r: clamp(rgb.r + (Math.random() - 0.5) * range, 0, 255),
    g: clamp(rgb.g + (Math.random() - 0.5) * range, 0, 255),
    b: clamp(rgb.b + (Math.random() - 0.5) * range, 0, 255),
  };
}

// ─── Hash-based noise ────────────────────────────────────────
function _hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function _smooth(t) {
  return t * t * (3 - 2 * t);
}

// Value noise in [0,1]
function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = _hash2(xi, yi);
  const b = _hash2(xi + 1, yi);
  const c = _hash2(xi, yi + 1);
  const d = _hash2(xi + 1, yi + 1);
  const u = _smooth(xf);
  const v = _smooth(yf);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

// Multi-octave fbm in [0,1]
function fbm2(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// ─── Canvas helpers ──────────────────────────────────────────
function _newCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function _ctx(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

function _toTexture(canvas, { srgb = true, repeat = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 2;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Fill canvas with base color
function _fill(ctx, size, rgb) {
  ctx.fillStyle = rgbStr(rgb.r, rgb.g, rgb.b);
  ctx.fillRect(0, 0, size, size);
}

// Per-pixel noise wash on top of an existing canvas
function _noiseWash(ctx, size, scale, intensity, base) {
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm2(x / scale, y / scale, 4) - 0.5;
      const i = (y * size + x) * 4;
      data[i]     = clamp(data[i]     + n * intensity, 0, 255);
      data[i + 1] = clamp(data[i + 1] + n * intensity, 0, 255);
      data[i + 2] = clamp(data[i + 2] + n * intensity, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ════════════════════════════════════════════════════════════
// GROUND — dirt/grass speckled
// ════════════════════════════════════════════════════════════
export function makeGroundAlbedo({ base = 0x4a5530, accent = 0x6b6238, speck = 0x2a2a18, size = 256, key } = {}) {
  return _cached(key || `ground:${base}:${accent}:${speck}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(base);
    const accentRgb = hexToRgb(accent);
    const speckRgb = hexToRgb(speck);

    // Base noise blend between base & accent via fbm
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2(x / 32, y / 32, 5);
        const m = fbm2(x / 8 + 100, y / 8 + 100, 3) * 0.4 + 0.3;
        const t = clamp(n * 0.7 + m * 0.3, 0, 1);
        const r = baseRgb.r + (accentRgb.r - baseRgb.r) * t;
        const g = baseRgb.g + (accentRgb.g - baseRgb.g) * t;
        const b = baseRgb.b + (accentRgb.b - baseRgb.b) * t;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Add specks (small pebbles / debris)
    const speckCount = (size * size) / 200;
    for (let i = 0; i < speckCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 0.4 + Math.random() * 1.3;
      const c = jitterColor(speckRgb, 50);
      ctx.fillStyle = rgbStr(c.r, c.g, c.b, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Faint grass-blade scratches
    const blades = (size * size) / 600;
    for (let i = 0; i < blades; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 2 + Math.random() * 4;
      const ang = Math.random() * Math.PI * 2;
      const c = shade(accentRgb, (Math.random() - 0.5) * 0.2);
      ctx.strokeStyle = rgbStr(c.r, c.g, c.b, 0.4);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// BARK — vertical strips, cracks, knots
// ════════════════════════════════════════════════════════════
export function makeBarkAlbedo({ color = 0x4a3018, size = 128, key } = {}) {
  return _cached(key || `bark:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Vertical strip pattern — heavily anisotropic noise
        const stripe = fbm2(x / 6, y / 32, 4); // tall stretched
        const grain = fbm2(x / 2, y / 4, 3);
        const t = stripe * 0.7 + grain * 0.3;
        // Map to dark bark color
        const dark = shade(baseRgb, -0.3);
        const light = shade(baseRgb, 0.15);
        const r = dark.r + (light.r - dark.r) * t;
        const g = dark.g + (light.g - dark.g) * t;
        const b = dark.b + (light.b - dark.b) * t;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Vertical cracks — dark lines
    const crackCount = Math.max(6, size / 20);
    for (let i = 0; i < crackCount; i++) {
      const x0 = Math.random() * size;
      let x = x0;
      const dark = shade(baseRgb, -0.55);
      ctx.strokeStyle = rgbStr(dark.r, dark.g, dark.b, 0.7);
      ctx.lineWidth = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      const steps = 32;
      for (let s = 1; s <= steps; s++) {
        x += (Math.random() - 0.5) * 3;
        ctx.lineTo(x, (s / steps) * size);
      }
      ctx.stroke();
    }

    // Knots — circular dark spots
    const knots = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < knots; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 4 + Math.random() * 8;
      const dark = shade(baseRgb, -0.5);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgbStr(dark.r * 0.5, dark.g * 0.5, dark.b * 0.5, 1));
      grad.addColorStop(0.6, rgbStr(dark.r, dark.g, dark.b, 0.8));
      grad.addColorStop(1, rgbStr(dark.r, dark.g, dark.b, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// THATCH — diagonal woven straw
// ════════════════════════════════════════════════════════════
export function makeThatchAlbedo({ color = 0x8a6a3a, size = 128, key } = {}) {
  return _cached(key || `thatch:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);
    _fill(ctx, size, shade(baseRgb, -0.3));

    // Bundle bands — horizontal shadowed gaps every ~16-24px
    const bundleH = 18 + Math.random() * 8;
    for (let yb = 0; yb < size; yb += bundleH) {
      // Shadow gap
      const dark = shade(baseRgb, -0.55);
      ctx.fillStyle = rgbStr(dark.r, dark.g, dark.b, 0.85);
      ctx.fillRect(0, yb, size, 2);
    }

    // Individual straw strands — diagonal
    const strands = size * 6;
    for (let i = 0; i < strands; i++) {
      const x0 = Math.random() * size - 10;
      const y0 = Math.random() * size;
      const len = 14 + Math.random() * 22;
      const ang = (Math.random() - 0.5) * 0.6 + Math.PI * 0.05; // mostly horizontal w/ slight tilt
      const c = jitterColor(baseRgb, 70);
      // Highlight tip
      ctx.strokeStyle = rgbStr(c.r, c.g, c.b, 0.9);
      ctx.lineWidth = 0.7 + Math.random() * 1.0;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Lighter highlight strands (sun-bleached)
    const highlights = size * 1.5;
    for (let i = 0; i < highlights; i++) {
      const x0 = Math.random() * size;
      const y0 = Math.random() * size;
      const len = 6 + Math.random() * 14;
      const ang = (Math.random() - 0.5) * 0.5 + Math.PI * 0.04;
      const c = shade(baseRgb, 0.25);
      ctx.strokeStyle = rgbStr(c.r, c.g, c.b, 0.5);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Subtle noise wash for grit
    _noiseWash(ctx, size, 24, 30, baseRgb);

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// WOOD PLANKS — horizontal seams + woodgrain
// ════════════════════════════════════════════════════════════
export function makeWoodPlankAlbedo({ color = 0x6a4a20, planks = 5, size = 128, key } = {}) {
  return _cached(key || `wood:${color}:${planks}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);
    const plankH = size / planks;

    for (let p = 0; p < planks; p++) {
      const y0 = p * plankH;
      // Per-plank color variation
      const plankRgb = jitterColor(baseRgb, 30);

      // Fill plank background
      const img = ctx.createImageData(size, plankH);
      const data = img.data;
      for (let y = 0; y < plankH; y++) {
        for (let x = 0; x < size; x++) {
          // Woodgrain swirl pattern — long lines along x with small variation
          const swirl = fbm2(x / 40 + p * 7, y / 4 + p * 13, 4);
          const grain = noise2(x / 1.5, y / 3 + p * 11);
          const t = swirl * 0.7 + grain * 0.3;
          const dark = shade(plankRgb, -0.25);
          const light = shade(plankRgb, 0.18);
          const r = dark.r + (light.r - dark.r) * t;
          const g = dark.g + (light.g - dark.g) * t;
          const b = dark.b + (light.b - dark.b) * t;
          const i = (y * size + x) * 4;
          data[i]     = clamp(r, 0, 255);
          data[i + 1] = clamp(g, 0, 255);
          data[i + 2] = clamp(b, 0, 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, y0);

      // Plank seam — dark line at bottom
      const seam = shade(baseRgb, -0.7);
      ctx.fillStyle = rgbStr(seam.r, seam.g, seam.b, 0.95);
      ctx.fillRect(0, y0 + plankH - 1, size, 2);

      // Knots per plank
      if (Math.random() > 0.5) {
        const cx = Math.random() * size;
        const cy = y0 + 4 + Math.random() * (plankH - 8);
        const r = 3 + Math.random() * 6;
        const dark = shade(plankRgb, -0.5);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, rgbStr(dark.r * 0.4, dark.g * 0.4, dark.b * 0.4, 1));
        grad.addColorStop(0.7, rgbStr(dark.r, dark.g, dark.b, 0.7));
        grad.addColorStop(1, rgbStr(dark.r, dark.g, dark.b, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// STONE — weathered, mottled
// ════════════════════════════════════════════════════════════
export function makeStoneAlbedo({ color = 0x707070, size = 128, key } = {}) {
  return _cached(key || `stone:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2(x / 24, y / 24, 5);
        const fine = fbm2(x / 4, y / 4, 3);
        const t = clamp(n * 0.65 + fine * 0.35, 0, 1);
        const dark = shade(baseRgb, -0.25);
        const light = shade(baseRgb, 0.2);
        const r = dark.r + (light.r - dark.r) * t;
        const g = dark.g + (light.g - dark.g) * t;
        const b = dark.b + (light.b - dark.b) * t;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Cracks
    const cracks = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < cracks; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      const dark = shade(baseRgb, -0.55);
      ctx.strokeStyle = rgbStr(dark.r, dark.g, dark.b, 0.6);
      ctx.lineWidth = 0.5 + Math.random() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 12 + ((Math.random() * 12) | 0);
      for (let s = 0; s < steps; s++) {
        x += (Math.random() - 0.5) * 12;
        y += (Math.random() - 0.5) * 12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Dark moss/dirt patches
    for (let i = 0; i < 8; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 8 + Math.random() * 18;
      const moss = { r: 60, g: 70, b: 40 };
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgbStr(moss.r, moss.g, moss.b, 0.35));
      grad.addColorStop(1, rgbStr(moss.r, moss.g, moss.b, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// METAL — dirty/painted
// ════════════════════════════════════════════════════════════
export function makeMetalAlbedo({ color = 0x4a4a4a, weathered = true, size = 128, key } = {}) {
  return _cached(key || `metal:${color}:${weathered}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2(x / 16, y / 16, 4);
        const t = n * 0.4 + 0.4;
        const dark = shade(baseRgb, -0.15);
        const light = shade(baseRgb, 0.12);
        const r = dark.r + (light.r - dark.r) * t;
        const g = dark.g + (light.g - dark.g) * t;
        const b = dark.b + (light.b - dark.b) * t;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    if (weathered) {
      // Rust streaks (vertical)
      const rustCount = 12 + ((Math.random() * 10) | 0);
      for (let i = 0; i < rustCount; i++) {
        const x = Math.random() * size;
        const y0 = Math.random() * size * 0.3;
        const len = 20 + Math.random() * 80;
        const w = 1 + Math.random() * 3;
        const grad = ctx.createLinearGradient(x, y0, x, y0 + len);
        grad.addColorStop(0, 'rgba(110, 50, 20, 0.7)');
        grad.addColorStop(0.4, 'rgba(140, 70, 30, 0.5)');
        grad.addColorStop(1, 'rgba(80, 40, 15, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - w / 2, y0, w, len);
      }
      // Dirt smudges
      for (let i = 0; i < 6; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        const r = 12 + Math.random() * 30;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(30, 25, 15, 0.4)');
        grad.addColorStop(1, 'rgba(30, 25, 15, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Scratches
      for (let i = 0; i < 30; i++) {
        const x0 = Math.random() * size;
        const y0 = Math.random() * size;
        const ang = Math.random() * Math.PI * 2;
        const len = 4 + Math.random() * 12;
        const light = shade(baseRgb, 0.3);
        ctx.strokeStyle = rgbStr(light.r, light.g, light.b, 0.5);
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
        ctx.stroke();
      }
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// FABRIC — canvas/burlap weave
// ════════════════════════════════════════════════════════════
export function makeFabricAlbedo({ color = 0x5f6a56, size = 128, key } = {}) {
  return _cached(key || `fabric:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    const period = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Weave: sine-like crossing pattern
        const wx = Math.sin((x / period) * Math.PI) * 0.5 + 0.5;
        const wy = Math.sin((y / period) * Math.PI) * 0.5 + 0.5;
        // Alternate over/under
        const cellX = ((x / period) | 0) & 1;
        const cellY = ((y / period) | 0) & 1;
        const over = cellX ^ cellY;
        const t = over ? wx * 0.7 + 0.15 : wy * 0.7 + 0.15;
        // Light noise to break perfection
        const n = noise2(x / 3, y / 3) * 0.15;
        const final = clamp(t + n - 0.075, 0, 1);
        const dark = shade(baseRgb, -0.3);
        const light = shade(baseRgb, 0.15);
        const r = dark.r + (light.r - dark.r) * final;
        const g = dark.g + (light.g - dark.g) * final;
        const b = dark.b + (light.b - dark.b) * final;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Faint dirt spots
    for (let i = 0; i < 4; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 12 + Math.random() * 30;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(40, 30, 15, 0.25)');
      grad.addColorStop(1, 'rgba(40, 30, 15, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// SANDBAG — burlap weave + smudges + sun-bleach
// ════════════════════════════════════════════════════════════
export function makeSandbagAlbedo({ color = 0x8a7a40, size = 128, key } = {}) {
  return _cached(key || `sandbag:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    const period = 5;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Tight burlap cross-hatch
        const wx = Math.sin((x / period) * Math.PI) * 0.5 + 0.5;
        const wy = Math.sin((y / period) * Math.PI) * 0.5 + 0.5;
        const cellX = ((x / period) | 0) & 1;
        const cellY = ((y / period) | 0) & 1;
        const over = cellX ^ cellY;
        const t = over ? wx * 0.65 + 0.2 : wy * 0.65 + 0.2;
        const fiberNoise = (noise2(x / 1.2, y / 1.2) - 0.5) * 0.25;
        const final = clamp(t + fiberNoise, 0, 1);
        const dark = shade(baseRgb, -0.35);
        const light = shade(baseRgb, 0.2);
        const r = dark.r + (light.r - dark.r) * final;
        const g = dark.g + (light.g - dark.g) * final;
        const b = dark.b + (light.b - dark.b) * final;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Mud/dirt smudges
    for (let i = 0; i < 6; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 14 + Math.random() * 32;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(50, 35, 18, 0.5)');
      grad.addColorStop(1, 'rgba(50, 35, 18, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sun-bleached patches (lighter)
    for (let i = 0; i < 4; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 20 + Math.random() * 40;
      const light = shade(baseRgb, 0.3);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgbStr(light.r, light.g, light.b, 0.35));
      grad.addColorStop(1, rgbStr(light.r, light.g, light.b, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// CORRUGATED METAL — vertical waves + rust
// ════════════════════════════════════════════════════════════
export function makeCorrugatedMetalAlbedo({ color = 0x3a3520, size = 128, key } = {}) {
  return _cached(key || `corrugated:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    const wavelength = 16;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Vertical sine wave — bright crest, dark trough
        const w = Math.sin((x / wavelength) * Math.PI * 2) * 0.5 + 0.5;
        const t = w * 0.85 + 0.075;
        // Long-range noise for paint variation
        const n = fbm2(x / 24, y / 24, 3) * 0.2;
        const final = clamp(t + n - 0.1, 0, 1);
        const dark = shade(baseRgb, -0.4);
        const light = shade(baseRgb, 0.25);
        const r = dark.r + (light.r - dark.r) * final;
        const g = dark.g + (light.g - dark.g) * final;
        const b = dark.b + (light.b - dark.b) * final;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Rust streaks running vertically (down)
    const rustCount = 18;
    for (let i = 0; i < rustCount; i++) {
      const x = Math.random() * size;
      const y0 = Math.random() * size * 0.4;
      const len = 40 + Math.random() * 120;
      const w = 0.8 + Math.random() * 2.5;
      const grad = ctx.createLinearGradient(x, y0, x, y0 + len);
      grad.addColorStop(0, 'rgba(120, 55, 22, 0.75)');
      grad.addColorStop(0.5, 'rgba(150, 80, 35, 0.55)');
      grad.addColorStop(1, 'rgba(60, 30, 10, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - w / 2, y0, w, len);
    }

    // Dirt patches
    for (let i = 0; i < 5; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 14 + Math.random() * 28;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(20, 18, 10, 0.45)');
      grad.addColorStop(1, 'rgba(20, 18, 10, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// MUD — wet, glossy, organic
// ════════════════════════════════════════════════════════════
export function makeMudAlbedo({ color = 0x5f4e3a, size = 256, key } = {}) {
  return _cached(key || `mud:${color}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    const baseRgb = hexToRgb(color);

    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2(x / 28, y / 28, 5);
        const fine = fbm2(x / 6, y / 6, 3);
        const t = clamp(n * 0.7 + fine * 0.3, 0, 1);
        const dark = shade(baseRgb, -0.35);
        const light = shade(baseRgb, 0.15);
        const r = dark.r + (light.r - dark.r) * t;
        const g = dark.g + (light.g - dark.g) * t;
        const b = dark.b + (light.b - dark.b) * t;
        const i = (y * size + x) * 4;
        data[i]     = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Wet glossy puddle highlights — small lighter spots
    for (let i = 0; i < 14; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const r = 8 + Math.random() * 22;
      const light = shade(baseRgb, 0.35);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgbStr(light.r, light.g, light.b, 0.5));
      grad.addColorStop(1, rgbStr(light.r, light.g, light.b, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cracks (dried mud)
    for (let i = 0; i < 5; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      const dark = shade(baseRgb, -0.55);
      ctx.strokeStyle = rgbStr(dark.r, dark.g, dark.b, 0.5);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 10 + ((Math.random() * 10) | 0);
      for (let s = 0; s < steps; s++) {
        x += (Math.random() - 0.5) * 16;
        y += (Math.random() - 0.5) * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    return _toTexture(canvas, { srgb: true });
  });
}

// ════════════════════════════════════════════════════════════
// NORMAL MAP from canvas (Sobel from luminance)
// ════════════════════════════════════════════════════════════
export function makeNormalFromCanvas(srcCanvas, { strength = 1.0, key } = {}) {
  return _cached(key, () => {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const srcCtx = _ctx(srcCanvas);
    const srcImg = srcCtx.getImageData(0, 0, w, h);
    const sd = srcImg.data;

    // Pre-compute luminance heightmap
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        heights[y * w + x] = (0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]) / 255;
      }
    }

    const dst = document.createElement('canvas');
    dst.width = w;
    dst.height = h;
    const dctx = _ctx(dst);
    const dImg = dctx.createImageData(w, h);
    const dd = dImg.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Wrap (tileable)
        const xm = (x - 1 + w) % w;
        const xp = (x + 1) % w;
        const ym = (y - 1 + h) % h;
        const yp = (y + 1) % h;

        // Sobel operator on luminance
        const tl = heights[ym * w + xm];
        const tc = heights[ym * w + x];
        const tr = heights[ym * w + xp];
        const ml = heights[y * w + xm];
        const mr = heights[y * w + xp];
        const bl = heights[yp * w + xm];
        const bc = heights[yp * w + x];
        const br = heights[yp * w + xp];

        const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);

        // Build normal vector
        let nx = -dx * strength;
        let ny = -dy * strength;
        let nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;

        const i = (y * w + x) * 4;
        dd[i]     = clamp((nx * 0.5 + 0.5) * 255, 0, 255);
        dd[i + 1] = clamp((ny * 0.5 + 0.5) * 255, 0, 255);
        dd[i + 2] = clamp((nz * 0.5 + 0.5) * 255, 0, 255);
        dd[i + 3] = 255;
      }
    }
    dctx.putImageData(dImg, 0, 0);
    return _toTexture(dst, { srgb: false });
  });
}

// ════════════════════════════════════════════════════════════
// NOISE NORMAL — standalone procedural
// ════════════════════════════════════════════════════════════
export function makeNoiseNormal({ scale = 4, strength = 1.0, size = 128, key } = {}) {
  return _cached(key || `noiseNormal:${scale}:${strength}:${size}`, () => {
    // Build a luminance heightmap canvas, then sobel
    const src = _newCanvas(size);
    const ctx = _ctx(src);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2(x / scale, y / scale, 5);
        const v = clamp(n * 255, 0, 255);
        const i = (y * size + x) * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Reuse Sobel logic inline (don't double-cache)
    const w = size, h = size;
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        heights[y * w + x] = d[(y * w + x) * 4] / 255;
      }
    }
    const dst = _newCanvas(size);
    const dctx = _ctx(dst);
    const dImg = dctx.createImageData(w, h);
    const dd = dImg.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w;
        const xp = (x + 1) % w;
        const ym = (y - 1 + h) % h;
        const yp = (y + 1) % h;
        const tl = heights[ym * w + xm], tc = heights[ym * w + x], tr = heights[ym * w + xp];
        const ml = heights[y * w + xm],  mr = heights[y * w + xp];
        const bl = heights[yp * w + xm], bc = heights[yp * w + x], br = heights[yp * w + xp];
        const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        let nx = -dx * strength, ny = -dy * strength, nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (y * w + x) * 4;
        dd[i]     = clamp((nx * 0.5 + 0.5) * 255, 0, 255);
        dd[i + 1] = clamp((ny * 0.5 + 0.5) * 255, 0, 255);
        dd[i + 2] = clamp((nz * 0.5 + 0.5) * 255, 0, 255);
        dd[i + 3] = 255;
      }
    }
    dctx.putImageData(dImg, 0, 0);
    return _toTexture(dst, { srgb: false });
  });
}

// ════════════════════════════════════════════════════════════
// LEAF CUTOUT — single leaf with alpha
// ════════════════════════════════════════════════════════════
function _drawOvalLeaf(ctx, cx, cy, w, h, color, ang = 0) {
  const rgb = typeof color === 'number' ? hexToRgb(color) : color;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  // Leaf body — pointed oval via bezier
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  const dark = shade(rgb, -0.25);
  const light = shade(rgb, 0.15);
  grad.addColorStop(0, rgbStr(dark.r, dark.g, dark.b, 1));
  grad.addColorStop(0.5, rgbStr(light.r, light.g, light.b, 1));
  grad.addColorStop(1, rgbStr(dark.r, dark.g, dark.b, 1));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.bezierCurveTo(w / 2, -h / 4, w / 2, h / 4, 0, h / 2);
  ctx.bezierCurveTo(-w / 2, h / 4, -w / 2, -h / 4, 0, -h / 2);
  ctx.closePath();
  ctx.fill();

  // Central vein
  const dark2 = shade(rgb, -0.45);
  ctx.strokeStyle = rgbStr(dark2.r, dark2.g, dark2.b, 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, h / 2);
  ctx.stroke();

  // Side veins
  ctx.strokeStyle = rgbStr(dark2.r, dark2.g, dark2.b, 0.4);
  ctx.lineWidth = 0.6;
  const veinCount = 5;
  for (let v = 1; v < veinCount; v++) {
    const ty = -h / 2 + (v / veinCount) * h;
    const spread = w * 0.4 * Math.sin((v / veinCount) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(spread, ty + h * 0.04);
    ctx.moveTo(0, ty);
    ctx.lineTo(-spread, ty + h * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

function _drawFrond(ctx, cx, cy, len, color) {
  const rgb = typeof color === 'number' ? hexToRgb(color) : color;
  ctx.save();
  ctx.translate(cx, cy);
  // Curve the frond — slight S-shape
  const segments = 14;
  const dark = shade(rgb, -0.35);
  const light = shade(rgb, 0.1);
  // Central rachis
  ctx.strokeStyle = rgbStr(dark.r, dark.g, dark.b, 1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, len / 2);
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const y = len / 2 - t * len;
    const x = Math.sin(t * Math.PI * 0.6) * len * 0.06;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Leaflets — alternating left/right
  for (let s = 1; s < segments; s++) {
    const t = s / segments;
    const y = len / 2 - t * len;
    const x = Math.sin(t * Math.PI * 0.6) * len * 0.06;
    // Leaflet length tapers tip & base, max in middle
    const ll = len * 0.22 * Math.sin(t * Math.PI);
    const tilt = -0.55; // leaflets angle upward toward tip
    for (const side of [-1, 1]) {
      const ang = side * (Math.PI / 2) + tilt;
      const lx = x + Math.cos(ang) * ll;
      const ly = y + Math.sin(ang) * ll;
      // Thin tapered leaflet drawn as a path
      const grad = ctx.createLinearGradient(x, y, lx, ly);
      grad.addColorStop(0, rgbStr(dark.r, dark.g, dark.b, 1));
      grad.addColorStop(1, rgbStr(light.r, light.g, light.b, 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      const perp = ang + Math.PI / 2;
      const wPerp = ll * 0.12;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(perp) * wPerp * 0.4, y + Math.sin(perp) * wPerp * 0.4);
      ctx.lineTo(lx, ly);
      ctx.lineTo(x - Math.cos(perp) * wPerp * 0.4, y - Math.sin(perp) * wPerp * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function _drawFern(ctx, cx, cy, len, color) {
  const rgb = typeof color === 'number' ? hexToRgb(color) : color;
  ctx.save();
  ctx.translate(cx, cy);
  const dark = shade(rgb, -0.35);
  const light = shade(rgb, 0.1);
  // Stem
  ctx.strokeStyle = rgbStr(dark.r, dark.g, dark.b, 1);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, len / 2);
  ctx.lineTo(0, -len / 2);
  ctx.stroke();
  // Fronds (small ovals branching off)
  const branches = 12;
  for (let s = 1; s < branches; s++) {
    const t = s / branches;
    const y = len / 2 - t * len;
    const ll = len * 0.28 * Math.sin(t * Math.PI);
    for (const side of [-1, 1]) {
      const ang = side * (Math.PI / 2) - 0.4;
      const lx = Math.cos(ang) * ll;
      const ly = y + Math.sin(ang) * ll;
      // Mini oval leaflet with sub-serrations
      const grad = ctx.createLinearGradient(0, y, lx, ly);
      grad.addColorStop(0, rgbStr(dark.r, dark.g, dark.b, 1));
      grad.addColorStop(1, rgbStr(light.r, light.g, light.b, 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      const segs = 6;
      for (let i = 0; i <= segs; i++) {
        const it = i / segs;
        const px = lx * it;
        const py = y + (ly - y) * it;
        const rad = ll * 0.08 * Math.sin(it * Math.PI);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.arc(px, py, rad, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

function _drawBananaLeaf(ctx, cx, cy, len, color) {
  const rgb = typeof color === 'number' ? hexToRgb(color) : color;
  ctx.save();
  ctx.translate(cx, cy);
  const w = len * 0.5;
  const h = len;

  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  const dark = shade(rgb, -0.3);
  const light = shade(rgb, 0.2);
  grad.addColorStop(0, rgbStr(dark.r, dark.g, dark.b, 1));
  grad.addColorStop(0.5, rgbStr(light.r, light.g, light.b, 1));
  grad.addColorStop(1, rgbStr(dark.r, dark.g, dark.b, 1));
  ctx.fillStyle = grad;
  // Wide long oval
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.bezierCurveTo(w * 0.7, -h * 0.3, w * 0.7, h * 0.3, 0, h / 2);
  ctx.bezierCurveTo(-w * 0.7, h * 0.3, -w * 0.7, -h * 0.3, 0, -h / 2);
  ctx.closePath();
  ctx.fill();

  // Central vein
  const dark2 = shade(rgb, -0.5);
  ctx.strokeStyle = rgbStr(dark2.r, dark2.g, dark2.b, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, h / 2);
  ctx.stroke();

  // Parallel side veins
  ctx.strokeStyle = rgbStr(dark2.r, dark2.g, dark2.b, 0.5);
  ctx.lineWidth = 0.6;
  const veinCount = 14;
  for (let v = 1; v < veinCount; v++) {
    const ty = -h / 2 + (v / veinCount) * h;
    const spread = w * 0.55 * Math.sin((v / veinCount) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(spread, ty + h * 0.03);
    ctx.moveTo(0, ty);
    ctx.lineTo(-spread, ty + h * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

export function makeLeafCutout({ color = 0x2a6b20, shape = 'oval', size = 96, key } = {}) {
  return _cached(key || `leaf:${color}:${shape}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    if (shape === 'frond') {
      _drawFrond(ctx, cx, cy, size * 0.92, color);
    } else if (shape === 'fern') {
      _drawFern(ctx, cx, cy, size * 0.9, color);
    } else if (shape === 'banana') {
      _drawBananaLeaf(ctx, cx, cy, size * 0.92, color);
    } else {
      // oval
      _drawOvalLeaf(ctx, cx, cy, size * 0.6, size * 0.92, color);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

// ════════════════════════════════════════════════════════════
// FOLIAGE BILLBOARD — clustered leaves for canopy LOD
// ════════════════════════════════════════════════════════════
export function makeFoliageBillboard({ color = 0x2a6b20, layers = 5, size = 128, key } = {}) {
  return _cached(key || `foliage:${color}:${layers}:${size}`, () => {
    const canvas = _newCanvas(size);
    const ctx = _ctx(canvas);
    ctx.clearRect(0, 0, size, size);
    const baseRgb = hexToRgb(color);

    // Build cluster — many overlapping leaf shapes, varied size/orientation
    const totalLeaves = layers * 6;
    for (let i = 0; i < totalLeaves; i++) {
      // Position biased toward center (gaussian-ish)
      const r = (Math.random() ** 0.7) * size * 0.45;
      const ang = Math.random() * Math.PI * 2;
      const cx = size / 2 + Math.cos(ang) * r;
      const cy = size / 2 + Math.sin(ang) * r;
      const leafW = size * (0.13 + Math.random() * 0.12);
      const leafH = size * (0.18 + Math.random() * 0.18);
      const rot = Math.random() * Math.PI * 2;
      // Color variation — vary brightness per leaf for depth
      const tint = jitterColor(baseRgb, 60);
      const shaded = shade(tint, (Math.random() - 0.5) * 0.3);
      _drawOvalLeaf(ctx, cx, cy, leafW, leafH, shaded, rot);
    }

    // Slight global darkening at edges via radial gradient (helps blend)
    const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

// ════════════════════════════════════════════════════════════
// Roughness map from canvas — luminance to roughness (inverted)
// ════════════════════════════════════════════════════════════
function _roughnessFromCanvas(srcCanvas, { contrast = 1.0, base = 0.7, key } = {}) {
  return _cached(key, () => {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const sctx = _ctx(srcCanvas);
    const sd = sctx.getImageData(0, 0, w, h).data;
    const dst = document.createElement('canvas');
    dst.width = w; dst.height = h;
    const dctx = _ctx(dst);
    const dImg = dctx.createImageData(w, h);
    const dd = dImg.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = (0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]) / 255;
        // Brighter areas = smoother (less rough); darker = rougher
        let r = base + (lum - 0.5) * contrast * -1;
        r = clamp(r, 0, 1);
        const v = r * 255;
        dd[i] = v; dd[i + 1] = v; dd[i + 2] = v; dd[i + 3] = 255;
      }
    }
    dctx.putImageData(dImg, 0, 0);
    return _toTexture(dst, { srgb: false });
  });
}

// ════════════════════════════════════════════════════════════
// Material builders — one-stop PBR
// ════════════════════════════════════════════════════════════
function _setRepeat(tex, scale) {
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale, scale);
  t.anisotropy = 8;
  t.colorSpace = tex.colorSpace;
  t.needsUpdate = true;
  return t;
}

export function makeBarkMaterial({ color = 0x4a3018, scale = 1.0 } = {}) {
  const albedo = makeBarkAlbedo({ color, key: `bark:${color}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 1.5, key: `bark-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.5, base: 0.85, key: `bark-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.95,
    metalness: 0.0,
  });
}

export function makeThatchMaterial({ color = 0x8a6a3a, scale = 1.0 } = {}) {
  const albedo = makeThatchAlbedo({ color, key: `thatch:${color}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 1.8, key: `thatch-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.6, base: 0.85, key: `thatch-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.95,
    metalness: 0.0,
  });
}

export function makeWoodPlankMaterial({ color = 0x6a4a20, scale = 1.0 } = {}) {
  const albedo = makeWoodPlankAlbedo({ color, key: `wood:${color}:5:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 1.4, key: `wood-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.45, base: 0.8, key: `wood-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.85,
    metalness: 0.0,
  });
}

export function makeStoneMaterial({ color = 0x707070, scale = 1.0 } = {}) {
  const albedo = makeStoneAlbedo({ color, key: `stone:${color}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 1.2, key: `stone-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.4, base: 0.85, key: `stone-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.92,
    metalness: 0.0,
  });
}

export function makeMetalMaterial({ color = 0x4a4a4a, weathered = true, scale = 1.0 } = {}) {
  const albedo = makeMetalAlbedo({ color, weathered, key: `metal:${color}:${weathered}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 0.9, key: `metal-n:${color}:${weathered}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.6, base: 0.55, key: `metal-r:${color}:${weathered}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.6,
    metalness: weathered ? 0.4 : 0.85,
  });
}

export function makeFabricMaterial({ color = 0x5f6a56, scale = 1.0 } = {}) {
  const albedo = makeFabricAlbedo({ color, key: `fabric:${color}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 1.8, key: `fabric-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.4, base: 0.9, key: `fabric-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.95,
    metalness: 0.0,
  });
}

export function makeSandbagMaterial({ color = 0x8a7a40, scale = 1.0 } = {}) {
  const albedo = makeSandbagAlbedo({ color, key: `sandbag:${color}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 2.0, key: `sandbag-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.5, base: 0.92, key: `sandbag-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.98,
    metalness: 0.0,
  });
}

export function makeCorrugatedMetalMaterial({ color = 0x3a3520, scale = 1.0 } = {}) {
  const albedo = makeCorrugatedMetalAlbedo({ color, key: `corrugated:${color}:256` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 2.5, key: `corrugated-n:${color}:256` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.55, base: 0.7, key: `corrugated-r:${color}:256` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.7,
    metalness: 0.5,
  });
}

export function makeMudMaterial({ color = 0x5f4e3a, scale = 1.0 } = {}) {
  const albedo = makeMudAlbedo({ color, key: `mud:${color}:512` });
  const normal = makeNormalFromCanvas(albedo.image, { strength: 1.3, key: `mud-n:${color}:512` });
  const rough  = _roughnessFromCanvas(albedo.image, { contrast: 0.45, base: 0.6, key: `mud-r:${color}:512` });
  return new THREE.MeshStandardMaterial({
    map: scale === 1 ? albedo : _setRepeat(albedo, scale),
    normalMap: scale === 1 ? normal : _setRepeat(normal, scale),
    roughnessMap: scale === 1 ? rough : _setRepeat(rough, scale),
    roughness: 0.6,
    metalness: 0.0,
  });
}
