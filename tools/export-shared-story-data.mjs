#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const sourceModulePath = path.resolve(repoRoot, 'js/config.js');
const sharedOutPath = path.resolve(repoRoot, 'shared/game-data/story.v1.json');
const godotOutPath = path.resolve(repoRoot, 'godot/data/shared/story.v1.json');

const { QUESTS, DIALOGUE } = await import(sourceModulePath);

function sanitizeQuest(quest) {
  return {
    id: String(quest.id),
    title: String(quest.title),
    desc: String(quest.desc),
    objectives: (quest.objectives || []).map((objective) => ({
      id: String(objective.id),
      text: String(objective.text),
      optional: Boolean(objective.optional),
    })),
  };
}

function sanitizeDialogueNode(node) {
  return {
    text: String(node.text || ''),
    choices: (node.choices || []).map((choice) => {
      const out = {
        label: String(choice.label),
      };
      if (Object.prototype.hasOwnProperty.call(choice, 'go')) {
        out.go = choice.go === null ? null : String(choice.go);
      }
      if (Array.isArray(choice.actions) && choice.actions.length > 0) {
        out.actions = choice.actions.map((action) => String(action));
      }
      return out;
    }),
  };
}

function sanitizeDialogue(dialogueDict) {
  return Object.values(dialogueDict).map((tree) => {
    const nodes = {};
    for (const [nodeId, nodeValue] of Object.entries(tree.nodes || {})) {
      nodes[String(nodeId)] = sanitizeDialogueNode(nodeValue);
    }

    return {
      id: String(tree.id),
      name: String(tree.name),
      portrait: String(tree.portrait || ''),
      nodes,
    };
  });
}

const story = {
  schema_version: '1.0.0',
  source: 'js/config.js',
  generated_at: new Date().toISOString(),
  quests: (QUESTS || []).map(sanitizeQuest),
  dialogue: sanitizeDialogue(DIALOGUE || {}),
};

for (const outPath of [sharedOutPath, godotOutPath]) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(story, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
}
