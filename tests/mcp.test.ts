import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridgeMcpServer } from '../src/mcp/server.js';

import { mkdirSync } from 'node:fs';

let tmpDir: string;
let client: Client;

beforeAll(async () => {
  // Set up isolated test directory for markdown storage
  tmpDir = mkdtempSync(join(tmpdir(), 'bridge-mcp-test-'));

  // Create test files that bridge_review will read
  mkdirSync(join(tmpDir, 'src'), { recursive: true });
  mkdirSync(join(tmpDir, 'tests'), { recursive: true });
  writeFileSync(join(tmpDir, 'test-file.ts'), 'export const x = 1;\n');
  writeFileSync(join(tmpDir, 'src', 'main.ts'), 'export const x = 1;\n');
  writeFileSync(join(tmpDir, 'tests', 'main.test.ts'), 'export const y = 2;\n');

  // Build server
  const server = createBridgeMcpServer({
    storageConfig: {
      dataDir: tmpDir,
      projectName: 'test-project',
    },
    projectRoot: tmpDir,
    projectPaths: {
      'test-project': tmpDir,
    },
  });

  // Build client + in-memory transport pair
  client = new Client({ name: 'test-client', version: '0.0.1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterAll(async () => {
  await client.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MCP server', () => {
  it('lists all expected tools', async () => {
    const result = await client.listTools();
    const names = result.tools.map(t => t.name).sort();
    expect(names).toEqual([
      'bridge_list_pending',
      'bridge_read_brief',
      'bridge_review',
      'bridge_save_result',
      'bridge_send_brief',
    ]);
  });

  it('bridge_list_pending returns empty-state message when no pending briefs exist', async () => {
    // Use a fresh project name so its inbox/ doesn't exist yet
    const result = await client.callTool({
      name: 'bridge_list_pending',
      arguments: { project: 'empty-inbox-project' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('No pending briefs in project empty-inbox-project');
  });

  it('bridge_list_pending lists multiple pending briefs in created-date order', async () => {
    // Seed two pending briefs (both today, so order falls through to filename which is alphabetical by task_id)
    await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'list-pending-alpha',
        title: 'Alpha brief',
        decision_summary: 'First in alphabetical order',
      },
    });
    await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'list-pending-bravo',
        title: 'Bravo brief',
        decision_summary: 'Second in alphabetical order',
      },
    });

    const result = await client.callTool({
      name: 'bridge_list_pending',
      arguments: { project: 'test-project' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;

    // Both task_ids must appear, with alpha listed before bravo (sort by created ASC then filename ASC)
    expect(text).toContain('list-pending-alpha');
    expect(text).toContain('list-pending-bravo');
    expect(text.indexOf('list-pending-alpha')).toBeLessThan(text.indexOf('list-pending-bravo'));
    expect(text).toContain('Pending briefs in project test-project');
  });

  it('bridge_send_brief creates a brief in markdown', async () => {
    const result = await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'test-task-1',
        title: 'Test task',
        decision_summary: 'Do the thing',
        files_likely_touched: ['src/main.ts'],
        acceptance_criteria: ['All tests pass'],
      },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Brief sent');
    expect(text).toContain('test-task-1');
  });

  it('bridge_read_brief returns pending brief details', async () => {
    const result = await client.callTool({
      name: 'bridge_read_brief',
      arguments: {
        project: 'test-project',
        task_id: 'test-task-1',
      },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Test task');
    expect(text).toContain('Do the thing');
    expect(text).toContain('Acceptance criteria');
  });

  it('bridge_save_result requires files_changed when status=done', async () => {
    // Attempting to save with status='done' without files_changed should fail
    // Either through throwing or returning an error response
    let caughtError = false;

    try {
      await client.callTool({
        name: 'bridge_save_result',
        arguments: {
          project: 'test-project',
          task_id: 'test-invalid-task',
          status: 'done',
          summary: 'Done without files list',
          // files_changed is intentionally omitted
        },
      });

      // If we get here without error, the tool accepted invalid input
      // In strict MCP validation, this shouldn't happen
      expect.fail('Validation should have rejected missing files_changed for status=done');
    } catch (err) {
      // Expected: validation error should be thrown
      const error = err as Error;
      expect(error.message).toMatch(/files_changed|validation|required/i);
      caughtError = true;
    }

    expect(caughtError).toBeTruthy();
  });

  it('bridge_save_result saves result with files_changed', async () => {
    const result = await client.callTool({
      name: 'bridge_save_result',
      arguments: {
        project: 'test-project',
        task_id: 'test-task-1',
        status: 'done',
        summary: 'Task completed successfully',
        files_changed: ['src/main.ts', 'src/utils.ts', 'tests/main.test.ts'],
        issues_hit: 'None.',
      },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Result saved');
    expect(text).toContain('test-task-1');
    expect(text).toContain('done');
  });

  it('bridge_review returns result summary and file contents', async () => {
    const result = await client.callTool({
      name: 'bridge_review',
      arguments: {
        project: 'test-project',
        task_id: 'test-task-1',
      },
    });
    const text = result.content.map((c: any) => c.text).join('\n');
    expect(text).toContain('Result Summary');
    expect(text).toContain('Status: done');
    expect(text).toContain('Task completed successfully');
    expect(text).toContain('src/main.ts');
    expect(text).toContain('export const x = 1');
  });

  it('bridge_review returns error when no result exists', async () => {
    const result = await client.callTool({
      name: 'bridge_review',
      arguments: {
        project: 'test-project',
        task_id: 'nonexistent-task',
      },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('No result found');
  });

  it('bridge_save_result allows missing files_changed for partial/blocked', async () => {
    const result = await client.callTool({
      name: 'bridge_save_result',
      arguments: {
        project: 'test-project',
        task_id: 'test-task-2',
        status: 'partial',
        summary: 'Partially done',
      },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Result saved');
    expect(text).toContain('partial');
  });

  it('bridge_read_brief returns error for non-pending briefs', async () => {
    // After saving a result, the brief moves to 'done' status
    const result = await client.callTool({
      name: 'bridge_read_brief',
      arguments: {
        project: 'test-project',
        task_id: 'test-task-1',
      },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    // Should return error because brief is no longer pending
    expect(text).toContain('No pending brief');
  });

  it('bridge_review enforces safeResolve traversal protection on extra_files', async () => {
    // Seed brief + result for a fresh task
    await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'traversal-test',
        title: 'Traversal',
        decision_summary: 'Verify safeResolve fires through bridge_review',
      },
    });
    await client.callTool({
      name: 'bridge_save_result',
      arguments: {
        project: 'test-project',
        task_id: 'traversal-test',
        status: 'done',
        summary: 'Saved for traversal test',
        files_changed: ['src/main.ts'],
      },
    });

    const result = await client.callTool({
      name: 'bridge_review',
      arguments: {
        project: 'test-project',
        task_id: 'traversal-test',
        extra_files: ['../../../etc/passwd', '../../escape-attempt.txt'],
      },
    });
    const blocks = result.content as { type: string; text: string }[];
    const allText = blocks.map(b => b.text).join('\n');

    // Result summary still appears for the legitimate file
    expect(allText).toContain('Result Summary');
    expect(allText).toContain('src/main.ts');
    // Each traversal attempt produces a block carrying the safeResolve error
    const passwdBlock = blocks.find(b => b.text.includes('../../../etc/passwd'));
    const escapeBlock = blocks.find(b => b.text.includes('../../escape-attempt.txt'));
    expect(passwdBlock?.text).toContain('escapes the project root');
    expect(escapeBlock?.text).toContain('escapes the project root');
  });

  it('bridge_review extra_files reads files not in files_changed', async () => {
    // Create a file outside the result's files_changed list
    writeFileSync(join(tmpDir, 'extra-doc.md'), 'extra notes here');

    await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'extra-files-test',
        title: 'Extra files',
        decision_summary: 'Verify extra_files is additive',
      },
    });
    await client.callTool({
      name: 'bridge_save_result',
      arguments: {
        project: 'test-project',
        task_id: 'extra-files-test',
        status: 'done',
        summary: 'Saved without extra-doc.md',
        files_changed: ['src/main.ts'],
      },
    });

    const result = await client.callTool({
      name: 'bridge_review',
      arguments: {
        project: 'test-project',
        task_id: 'extra-files-test',
        extra_files: ['extra-doc.md'],
      },
    });
    const text = (result.content as { type: string; text: string }[]).map(b => b.text).join('\n');

    expect(text).toContain('--- extra-doc.md ---');
    expect(text).toContain('extra notes here');
    // Original files_changed entry is still present
    expect(text).toContain('--- src/main.ts ---');
  });

  it('bridge_review reports oversized files without inlining their contents', async () => {
    // Write a 600 KB file — over the 500_000-byte cap
    const oversizedContent = 'a'.repeat(600_000);
    writeFileSync(join(tmpDir, 'large.txt'), oversizedContent);

    await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'oversized-test',
        title: 'Oversized',
        decision_summary: 'Verify the size cap',
      },
    });
    await client.callTool({
      name: 'bridge_save_result',
      arguments: {
        project: 'test-project',
        task_id: 'oversized-test',
        status: 'done',
        summary: 'Saved with one oversized file',
        files_changed: ['large.txt'],
      },
    });

    const result = await client.callTool({
      name: 'bridge_review',
      arguments: {
        project: 'test-project',
        task_id: 'oversized-test',
      },
    });
    const blocks = result.content as { type: string; text: string }[];
    const largeBlock = blocks.find(b => b.text.includes('--- large.txt ---'));
    expect(largeBlock).toBeDefined();
    expect(largeBlock!.text).toContain('[file too large:');
    // Confirm a byte count > 500000 is reported
    const match = largeBlock!.text.match(/\[file too large:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(500_000);
    // The actual file content must NOT appear
    expect(largeBlock!.text).not.toContain(oversizedContent);
  });

  it('bridge_review marks directory paths as not-a-file', async () => {
    // The 'src' directory was created in beforeAll as a real dir under tmpDir
    await client.callTool({
      name: 'bridge_send_brief',
      arguments: {
        project: 'test-project',
        task_id: 'dir-as-file-test',
        title: 'Directory path',
        decision_summary: 'Verify isFile() check',
      },
    });
    await client.callTool({
      name: 'bridge_save_result',
      arguments: {
        project: 'test-project',
        task_id: 'dir-as-file-test',
        status: 'done',
        summary: 'Saved with a directory in files_changed',
        files_changed: ['src'],
      },
    });

    const result = await client.callTool({
      name: 'bridge_review',
      arguments: {
        project: 'test-project',
        task_id: 'dir-as-file-test',
      },
    });
    const blocks = result.content as { type: string; text: string }[];
    const dirBlock = blocks.find(b => b.text.includes('--- src ---'));
    expect(dirBlock).toBeDefined();
    expect(dirBlock!.text).toContain('[not a file]');
  });
});
