import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as markdownStorage from '../src/db/markdown-storage.js';
import type { StorageConfig } from '../src/db/markdown-storage.js';
import type {
  BriefPayload,
  ResultPayload,
} from '../src/db/schema.js';

let tmpDir: string;
let config: StorageConfig;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
  config = {
    dataDir: tmpDir,
    projectName: 'test-project',
  };
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('markdown storage', () => {
  it('appends and retrieves a brief', () => {
    const payload: BriefPayload = {
      title: 'Add timeout to spawn',
      decision_summary: 'Add 30s timeout with one retry to src/tasks/spawn.ts',
      files_likely_touched: ['src/tasks/spawn.ts'],
      acceptance_criteria: ['spawn does not hang past 30s', 'one retry on failure'],
    };

    const id = markdownStorage.appendBrief(config, 'fix-spawn-timeout', payload);
    expect(id).toBeGreaterThan(0);

    const entries = markdownStorage.getEntriesForTask(config, 'fix-spawn-timeout');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('brief');
    expect(entries[0].source).toBe('chat');
    expect(entries[0].status).toBe('pending');

    const parsed = markdownStorage.parsePayload<BriefPayload>(entries[0]);
    expect(parsed.title).toBe('Add timeout to spawn');
    expect(parsed.files_likely_touched).toEqual(['src/tasks/spawn.ts']);
  });

  it('appends and retrieves a result', () => {
    const briefPayload: BriefPayload = {
      title: 'Test',
      decision_summary: 'Test brief',
    };
    markdownStorage.appendBrief(config, 'test-task', briefPayload);

    const resultPayload: ResultPayload = {
      status: 'done',
      files_changed: ['src/main.ts', 'tests/main.test.ts'],
      diff_summary: 'Implemented feature X',
      error: 'None.',
    };
    markdownStorage.appendResult(config, 'test-task', resultPayload);

    const entries = markdownStorage.getEntriesForTask(config, 'test-task');
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('brief');
    expect(entries[1].type).toBe('result');

    const result = markdownStorage.parsePayload<ResultPayload>(entries[1]);
    expect(result.status).toBe('done');
    expect(result.files_changed).toEqual(['src/main.ts', 'tests/main.test.ts']);
  });

  it('rejects malformed brief payloads', () => {
    expect(() => {
      // Missing required `decision_summary` field
      markdownStorage.appendBrief(config, 'bad', { title: 'Bad' } as unknown as BriefPayload);
    }).toThrow();
  });

  it('orders entries chronologically within a task', () => {
    markdownStorage.appendBrief(config, 'task-1', {
      title: 'Task 1',
      decision_summary: 'First',
    });
    markdownStorage.appendResult(config, 'task-1', { status: 'partial', diff_summary: 'WIP' });
    markdownStorage.appendResult(config, 'task-1', { status: 'done', diff_summary: 'Done' });

    const entries = markdownStorage.getEntriesForTask(config, 'task-1');
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe('brief');
    expect(entries[1].type).toBe('result');
    expect(entries[2].type).toBe('result');
  });

  it('creates proper folder structure', () => {
    markdownStorage.appendBrief(config, 'test', {
      title: 'Test',
      decision_summary: 'Test brief',
    });

    const projectRoot = join(config.dataDir, config.projectName);
    const inboxPath = join(projectRoot, 'inbox');
    expect(require('fs').existsSync(inboxPath)).toBe(true);
  });

  it('handles unique filenames for same task_id on same day', () => {
    markdownStorage.appendBrief(config, 'dup-task', {
      title: 'First Brief',
      decision_summary: 'First',
    });
    markdownStorage.appendBrief(config, 'dup-task', {
      title: 'Second Brief',
      decision_summary: 'Second',
    });

    const entries = markdownStorage.getEntriesForTask(config, 'dup-task');
    // Should have created two separate files with -2 suffix
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it('listPendingBriefs returns empty array when inbox does not exist', () => {
    // Fresh tmpDir with no inbox/ created yet
    const result = markdownStorage.listPendingBriefs(config);
    expect(result).toEqual([]);
  });

  it('listPendingBriefs returns only pending briefs (excludes done)', () => {
    // Seed three briefs
    markdownStorage.appendBrief(config, 'still-pending-1', {
      title: 'Still Pending One',
      decision_summary: 'Pending',
    });
    markdownStorage.appendBrief(config, 'still-pending-2', {
      title: 'Still Pending Two',
      decision_summary: 'Pending',
    });
    markdownStorage.appendBrief(config, 'will-be-done', {
      title: 'Will Be Done',
      decision_summary: 'Done',
    });
    // Mark the third as done by saving a result (which auto-moves to done/)
    markdownStorage.appendResult(config, 'will-be-done', {
      status: 'done',
      files_changed: ['x.ts'],
      diff_summary: 'done',
    });

    const result = markdownStorage.listPendingBriefs(config);
    const ids = result.map(b => b.task_id).sort();
    expect(ids).toEqual(['still-pending-1', 'still-pending-2']);
    // Verify the done brief is NOT in the pending list
    expect(ids).not.toContain('will-be-done');
  });

  it('listPendingBriefs sorts by created date ASC', () => {
    // Briefs are created with today's date; sorting falls through to filename which
    // includes the YYYY-MM-DD prefix, so chronological order = alphabetical filename order.
    markdownStorage.appendBrief(config, 'task-c', { title: 'C', decision_summary: 'c' });
    markdownStorage.appendBrief(config, 'task-a', { title: 'A', decision_summary: 'a' });
    markdownStorage.appendBrief(config, 'task-b', { title: 'B', decision_summary: 'b' });

    const result = markdownStorage.listPendingBriefs(config);
    expect(result.length).toBe(3);
    // All three have the same `created` date, so the sort breaks ties on filename ASC,
    // which by construction (YYYY-MM-DD-{task_id}.md) is alphabetical by task_id.
    const ids = result.map(b => b.task_id);
    expect(ids).toEqual(['task-a', 'task-b', 'task-c']);
  });

  it('moves brief to done when result is saved', () => {
    markdownStorage.appendBrief(config, 'move-test', {
      title: 'Move Test',
      decision_summary: 'Test moving brief to done',
    });

    markdownStorage.appendResult(config, 'move-test', {
      status: 'done',
      files_changed: ['src/test.ts'],
      diff_summary: 'Completed',
    });

    const entries = markdownStorage.getEntriesForTask(config, 'move-test');
    const brief = entries.find(e => e.type === 'brief');
    // Brief should be moved to 'done' status after result is appended
    expect(brief?.status).toBe('done');
  });
});
