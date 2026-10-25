'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MemoryStore } = require('../bin/memory');
const { recordEvidence } = require('../src/memory/evidence');
const { executeTool } = require('../bin/executor');

function freshStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-evidence-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new MemoryStore(dir);
}

const trace = {
  prompt: 'Repair authentication',
  steps: [{ type: 'tool_call', name: 'patch', args: { path: 'auth.js' }, result: 'Updated auth.js' }],
};

test('recordEvidence persists searchable evidence with the local positional API', t => {
  const store = freshStore(t);
  recordEvidence(store, trace);
  const loaded = new MemoryStore(store.rootDir).loadForTask('authentication');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].type, 'context');
  assert.equal(loaded[0].title, 'Repair authentication');
  assert.match(loaded[0].content, /auth\.js/);
  assert.ok(loaded[0].tags.includes('evidence'));
});

test('recordEvidence retains support for the object API', t => {
  const store = freshStore(t);
  const objectStore = {
    remember(entry) {
      return store.remember(entry.type, entry.title, entry.content, { tags: entry.tags });
    },
  };
  recordEvidence(objectStore, trace);
  const loaded = new MemoryStore(store.rootDir).loadForTask('authentication');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].title, 'Repair authentication');
});

test('memory_load tolerates a saved entry without a string title and returns valid matches', async t => {
  const store = freshStore(t);
  store.remember({ type: 'context', title: 'Old evidence', content: 'authentication' });
  store.remember('decision', 'Authentication policy', 'Use tokens');
  const reloaded = new MemoryStore(store.rootDir);
  const result = await executeTool('memory_load', { task: 'authentication' }, { memoryStore: reloaded });
  assert.match(result.result, /Authentication policy/);
  assert.equal(result.error, undefined);
});
