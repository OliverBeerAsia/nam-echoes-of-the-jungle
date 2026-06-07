#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const options = parseArgs(process.argv.slice(2));
const reportPath = options.positionals[0] ?? 'godot/reports/acceptance/latest.json';
const targetsPath = options.positionals[1] ?? 'godot/data/benchmark/acceptance_targets.json';
const zonesRoot = 'godot/data/zones';

function parseArgs(args) {
  const parsed = {
    positionals: [],
    requireCaptures: false,
    strict: false,
  };

  for (const arg of args) {
    if (arg === '--require-captures') {
      parsed.requireCaptures = true;
      continue;
    }
    if (arg === '--strict') {
      parsed.strict = true;
      parsed.requireCaptures = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/validate-acceptance-report.mjs [reportPath] [targetsPath] [--require-captures] [--strict]');
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    parsed.positionals.push(arg);
  }

  return parsed;
}

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to load JSON at ${filePath}: ${error.message}`);
  }
}

function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function readFiniteNumber(source, key, label, failures) {
  const value = Number(source?.[key]);
  if (!Number.isFinite(value)) {
    failures.push(`${label}.${key} must be numeric.`);
    return 0;
  }
  return value;
}

function validateCapturePath(capture, preset, zoneId, failures) {
  if (!capture || typeof capture !== 'object') {
    failures.push(`Preset ${preset}, zone ${zoneId} has malformed capture entry.`);
    return;
  }

  if (capture.captured !== true) return;
  if (typeof capture.path !== 'string' || capture.path.length === 0) {
    failures.push(`Preset ${preset}, zone ${zoneId} captured screenshot missing path.`);
    return;
  }

  const localPath = capture.path.startsWith('res://')
    ? path.join('godot', capture.path.slice('res://'.length))
    : capture.path;

  if (!fs.existsSync(localPath)) {
    failures.push(`Preset ${preset}, zone ${zoneId} captured screenshot file not found: ${localPath}`);
  }
}

const report = loadJson(reportPath);
const targets = loadJson(targetsPath);

const requiredZones = Array.isArray(targets.required_zone_ids) ? targets.required_zone_ids : [];
const requiredDefKeys = Array.isArray(targets.required_zone_definition_keys)
  ? targets.required_zone_definition_keys
  : [];
const presetTargets = typeof targets.preset_targets === 'object' && targets.preset_targets !== null
  ? targets.preset_targets
  : {};

const failures = [];
const warnings = [];

if (typeof report.generated_at !== 'string' || report.generated_at.length === 0) {
  failures.push('Report missing `generated_at` timestamp.');
}
if (!Number.isFinite(Number(report.duration_ms)) || Number(report.duration_ms) <= 0) {
  warnings.push('Report missing positive `duration_ms`.');
}
if (!report.presets || typeof report.presets !== 'object') {
  failures.push('Report missing `presets` object.');
}
if (requiredZones.length === 0) {
  failures.push('Targets missing `required_zone_ids`.');
}
if (Object.keys(presetTargets).length === 0) {
  failures.push('Targets missing `preset_targets`.');
}

for (const zoneId of requiredZones) {
  const zoneDefPath = path.join(zonesRoot, zoneId, 'zone_definition.json');
  if (!fs.existsSync(zoneDefPath)) {
    failures.push(`Missing zone definition file: ${zoneDefPath}`);
    continue;
  }

  const zoneDef = loadJson(zoneDefPath);
  for (const key of requiredDefKeys) {
    if (!hasKey(zoneDef, key)) {
      failures.push(`Zone ${zoneId} missing required key: ${key}`);
    }
  }
}

for (const [preset, target] of Object.entries(presetTargets)) {
  const presetReport = report.presets?.[preset];
  if (!presetReport || typeof presetReport !== 'object') {
    failures.push(`Report missing preset block: ${preset}`);
    continue;
  }

  for (const zoneId of requiredZones) {
    const zoneResult = presetReport?.[zoneId];
    if (!zoneResult || typeof zoneResult !== 'object') {
      failures.push(`Preset ${preset} missing zone result for ${zoneId}`);
      continue;
    }

    if (zoneResult.error) {
      failures.push(`Preset ${preset}, zone ${zoneId} has error: ${zoneResult.error}`);
      continue;
    }

    const summary = zoneResult.summary ?? {};
    const sceneStats = zoneResult.scene_stats ?? {};

    const metricLabel = `Preset ${preset}, zone ${zoneId}`;
    const avgFps = readFiniteNumber(summary, 'avg_fps', `${metricLabel} summary`, failures);
    const minFps = readFiniteNumber(summary, 'min_fps', `${metricLabel} summary`, failures);
    const lights = readFiniteNumber(sceneStats, 'lights', `${metricLabel} scene_stats`, failures);
    const meshInstances = readFiniteNumber(sceneStats, 'mesh_instances', `${metricLabel} scene_stats`, failures);

    if (avgFps < Number(target.min_avg_fps ?? 0)) {
      failures.push(
        `Preset ${preset}, zone ${zoneId} avg FPS ${formatNumber(avgFps)} < target ${formatNumber(Number(target.min_avg_fps ?? 0))}`
      );
    }
    if (minFps < Number(target.min_min_fps ?? 0)) {
      failures.push(
        `Preset ${preset}, zone ${zoneId} min FPS ${formatNumber(minFps)} < target ${formatNumber(Number(target.min_min_fps ?? 0))}`
      );
    }
    if (lights > Number(target.max_lights ?? Number.MAX_SAFE_INTEGER)) {
      failures.push(
        `Preset ${preset}, zone ${zoneId} lights ${lights} > max ${Number(target.max_lights)}`
      );
    }
    if (meshInstances > Number(target.max_mesh_instances ?? Number.MAX_SAFE_INTEGER)) {
      failures.push(
        `Preset ${preset}, zone ${zoneId} mesh instances ${meshInstances} > max ${Number(target.max_mesh_instances)}`
      );
    }

    const cameraSamples = Array.isArray(zoneResult.camera_samples) ? zoneResult.camera_samples : [];
    if (cameraSamples.length === 0) {
      failures.push(`Preset ${preset}, zone ${zoneId} missing camera_samples.`);
    }
    for (const sample of cameraSamples) {
      const sampleLabel = `Preset ${preset}, zone ${zoneId}, camera ${sample?.camera_index ?? '?'}`;
      const frames = readFiniteNumber(sample, 'frames', sampleLabel, failures);
      readFiniteNumber(sample, 'avg_fps', sampleLabel, failures);
      readFiniteNumber(sample, 'min_fps', sampleLabel, failures);
      readFiniteNumber(sample, 'max_fps', sampleLabel, failures);
      if (frames <= 0) {
        failures.push(`${sampleLabel} frames must be > 0.`);
      }
    }

    if (zoneResult.sweep && typeof zoneResult.sweep === 'object') {
      const sweepFrames = readFiniteNumber(zoneResult.sweep, 'frames', `${metricLabel} sweep`, failures);
      readFiniteNumber(zoneResult.sweep, 'avg_fps', `${metricLabel} sweep`, failures);
      readFiniteNumber(zoneResult.sweep, 'min_fps', `${metricLabel} sweep`, failures);
      readFiniteNumber(zoneResult.sweep, 'max_fps', `${metricLabel} sweep`, failures);
      if (sweepFrames <= 0) {
        failures.push(`${metricLabel} sweep frames must be > 0.`);
      }
    }

    const captures = Array.isArray(zoneResult.captures) ? zoneResult.captures : [];
    const capturedCount = captures.filter((entry) => entry && entry.captured === true).length;
    if (captures.length === 0) {
      const message = `Preset ${preset}, zone ${zoneId} has no capture entries.`;
      if (options.requireCaptures) failures.push(message);
      else warnings.push(message);
    } else if (capturedCount === 0) {
      const message = `Preset ${preset}, zone ${zoneId} has no captured screenshots (likely headless run).`;
      if (options.requireCaptures) failures.push(message);
      else warnings.push(message);
    }

    for (const capture of captures) {
      validateCapturePath(capture, preset, zoneId, failures);
    }
  }
}

if (warnings.length > 0) {
  console.log('Acceptance warnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('Acceptance validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Acceptance validation passed for ${requiredZones.length} zones.`);
