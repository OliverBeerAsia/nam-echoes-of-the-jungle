#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sharedPath = path.resolve(repoRoot, 'shared/game-data/story.v1.json');
const godotPath = path.resolve(repoRoot, 'godot/data/shared/story.v1.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse ${filePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateStory(story, label) {
  assert(story && typeof story === 'object', `${label}: root must be an object`);
  assert(story.schema_version === '1.0.0', `${label}: schema_version must be 1.0.0`);
  assert(typeof story.source === 'string' && story.source.length > 0, `${label}: source is required`);
  assert(typeof story.generated_at === 'string' && story.generated_at.length > 0, `${label}: generated_at is required`);
  assert(Array.isArray(story.quests) && story.quests.length > 0, `${label}: quests must be a non-empty array`);
  assert(Array.isArray(story.dialogue), `${label}: dialogue must be an array`);

  const questIds = new Set();
  for (const quest of story.quests) {
    assert(typeof quest.id === 'string' && quest.id.length > 0, `${label}: quest.id is required`);
    assert(!questIds.has(quest.id), `${label}: duplicate quest id ${quest.id}`);
    questIds.add(quest.id);
    assert(typeof quest.title === 'string' && quest.title.length > 0, `${label}: quest ${quest.id} missing title`);
    assert(typeof quest.desc === 'string' && quest.desc.length > 0, `${label}: quest ${quest.id} missing desc`);
    assert(Array.isArray(quest.objectives) && quest.objectives.length > 0, `${label}: quest ${quest.id} requires objectives`);

    const objIds = new Set();
    for (const objective of quest.objectives) {
      assert(typeof objective.id === 'string' && objective.id.length > 0, `${label}: quest ${quest.id} objective id missing`);
      assert(!objIds.has(objective.id), `${label}: quest ${quest.id} duplicate objective id ${objective.id}`);
      objIds.add(objective.id);
      assert(typeof objective.text === 'string' && objective.text.length > 0, `${label}: quest ${quest.id} objective ${objective.id} missing text`);
      assert(typeof objective.optional === 'boolean', `${label}: quest ${quest.id} objective ${objective.id} optional must be boolean`);
    }
  }

  const dialogueIds = new Set();
  for (const tree of story.dialogue) {
    assert(typeof tree.id === 'string' && tree.id.length > 0, `${label}: dialogue tree id missing`);
    assert(!dialogueIds.has(tree.id), `${label}: duplicate dialogue tree id ${tree.id}`);
    dialogueIds.add(tree.id);
    assert(typeof tree.name === 'string' && tree.name.length > 0, `${label}: dialogue tree ${tree.id} missing name`);
    assert(typeof tree.nodes === 'object' && tree.nodes && Object.keys(tree.nodes).length > 0, `${label}: dialogue tree ${tree.id} requires nodes`);
    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      assert(typeof node.text === 'string' && node.text.length > 0, `${label}: ${tree.id}.${nodeId} missing text`);
      assert(Array.isArray(node.choices), `${label}: ${tree.id}.${nodeId} choices must be array`);
      for (const choice of node.choices) {
        assert(typeof choice.label === 'string' && choice.label.length > 0, `${label}: ${tree.id}.${nodeId} choice label missing`);
      }
    }
  }
}

const shared = readJson(sharedPath);
const godot = readJson(godotPath);

validateStory(shared, 'shared/story.v1.json');
validateStory(godot, 'godot/data/shared/story.v1.json');

const sharedCopy = JSON.parse(JSON.stringify(shared));
const godotCopy = JSON.parse(JSON.stringify(godot));

delete sharedCopy.generated_at;
delete godotCopy.generated_at;

assert(
  JSON.stringify(sharedCopy) === JSON.stringify(godotCopy),
  'Shared story and Godot mirror are out of sync. Run `node tools/export-shared-story-data.mjs`.'
);

console.log(`Shared story contract valid (${shared.quests.length} quests, ${shared.dialogue.length} dialogue trees).`);
