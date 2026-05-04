import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as markdownStorage from '../db/markdown-storage.js';
import {
  BriefPayload,
  ResultPayload,
  EntryRow,
} from '../db/schema.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a project-relative path safely. Refuses paths that escape the project.
 */
function safeResolve(projectRoot: string, relPath: string): string {
  const resolved = path.resolve(projectRoot, relPath);
  if (!resolved.startsWith(path.resolve(projectRoot))) {
    throw new Error(`Path "${relPath}" escapes the project root`);
  }
  return resolved;
}

/**
 * Format a result entry for display.
 */
function formatResult(row: EntryRow): string {
  const p = markdownStorage.parsePayload<ResultPayload>(row);
  const ts = row.created_at;
  return `[${ts}] Status: ${p.status}\nSummary: ${p.diff_summary || 'N/A'}\nFiles changed: ${(p.files_changed ?? []).join(', ') || 'none'}`;
}

// ─── Server factory ──────────────────────────────────────────────────────────

export interface StorageConfig {
  dataDir: string;
  projectName: string;
}

export interface BridgeMcpContext {
  storageConfig: StorageConfig;
  projectRoot: string;
  projectPaths?: Record<string, string>;
}

/**
 * Build an MCP server instance with all bridge tools registered.
 */
export function createBridgeMcpServer(ctx: BridgeMcpContext): McpServer {
  const server = new McpServer({
    name: 'bridge',
    version: '0.1.0',
  });

  // ── Tool: bridge_send_brief ────────────────────────────────────────────────
  server.registerTool(
    'bridge_send_brief',
    {
      title: 'Send a brief to Claude Code',
      description:
        'Send a structured task brief to Claude Code. Use this after you and the user have agreed on what to build. ' +
        'Include the full conversation context so Code understands not just what to do, but why and what was rejected.',
      inputSchema: {
        project: z.string().describe('Project name (required)'),
        task_id: z.string().describe('A short kebab-case identifier, e.g. "fix-spawn-timeout" or "feat-voice-no-cutoff"'),
        title: z.string().describe('A one-line human-readable title for the brief'),
        decision_summary: z.string().describe('What was decided, in 1-3 sentences'),
        conversation_excerpt: z.string().optional().describe('The relevant chunk of the chat conversation that led to this decision'),
        files_likely_touched: z.array(z.string()).optional().describe('File paths Code is likely to modify'),
        acceptance_criteria: z.array(z.string()).optional().describe('How to know the task is done'),
        rejected_options: z.array(z.string()).optional().describe('Options considered and rejected, with reasons'),
      },
    },
    async (args) => {
      const payload: BriefPayload = {
        title: args.title,
        decision_summary: args.decision_summary,
        conversation_excerpt: args.conversation_excerpt,
        files_likely_touched: args.files_likely_touched,
        acceptance_criteria: args.acceptance_criteria,
        rejected_options: args.rejected_options,
      };
      const config: StorageConfig = {
        dataDir: ctx.storageConfig.dataDir,
        projectName: args.project,
      };
      const id = markdownStorage.appendBrief(config, args.task_id, payload);
      return {
        content: [
          {
            type: 'text',
            text: `Brief sent (id=${id}, task=${args.task_id}, project=${args.project}). Code will see it on next session start.`,
          },
        ],
      };
    },
  );

  // ── Tool: bridge_read_brief ───────────────────────────────────────────────
  server.registerTool(
    'bridge_read_brief',
    {
      title: 'Read a pending brief from the inbox',
      description:
        'Read a pending brief by task_id. Returns the full brief including title, decision_summary, ' +
        'acceptance_criteria, files_likely_touched, conversation_excerpt, and rejected_options. ' +
        'Only returns briefs with status=pending. Use this before starting work to understand what needs to be done.',
      inputSchema: {
        project: z.string().describe('Project name (required)'),
        task_id: z.string().describe('Task ID of the brief to read (required)'),
      },
    },
    async (args) => {
      const config: StorageConfig = {
        dataDir: ctx.storageConfig.dataDir,
        projectName: args.project,
      };
      const rows = markdownStorage.getEntriesForTask(config, args.task_id);

      // Filter to only pending briefs
      const briefRow = rows.find(r => r.type === 'brief' && r.status === 'pending');

      if (!briefRow) {
        return {
          content: [{ type: 'text', text: `No pending brief found for task_id="${args.task_id}".` }],
        };
      }

      const brief = markdownStorage.parsePayload<BriefPayload>(briefRow);
      const text =
        `# ${brief.title}\n\n` +
        `## What we decided\n${brief.decision_summary}\n\n` +
        `## Acceptance criteria\n${(brief.acceptance_criteria ?? []).map(c => `- ${c}`).join('\n') || 'None.'}\n\n` +
        `## Files likely touched\n${(brief.files_likely_touched ?? []).map(f => `- ${f}`).join('\n') || 'None.'}\n\n` +
        `## Rejected options\n${(brief.rejected_options ?? []).map(o => `- ${o}`).join('\n') || 'None.'}\n\n` +
        `## Conversation excerpt\n${brief.conversation_excerpt || 'None.'}`;

      return { content: [{ type: 'text', text }] };
    },
  );

  // ── Tool: bridge_list_pending ──────────────────────────────────────────────
  server.registerTool(
    'bridge_list_pending',
    {
      title: 'List all pending briefs in the project inbox',
      description:
        'List all pending briefs in the project inbox. Returns task_id, title, and created date for each. ' +
        'Call this at the start of a session to discover work that has been handed off but not yet processed.',
      inputSchema: {
        project: z.string().describe('Project name (required)'),
      },
    },
    async (args) => {
      const config: StorageConfig = {
        dataDir: ctx.storageConfig.dataDir,
        projectName: args.project,
      };
      const pending = markdownStorage.listPendingBriefs(config);

      if (pending.length === 0) {
        return {
          content: [{ type: 'text', text: `No pending briefs in project ${args.project}.` }],
        };
      }

      const lines = pending.map(
        (b, i) =>
          `${i + 1}. task_id: ${b.task_id}\n   title: ${b.title}\n   created: ${b.created}`,
      );
      const text = `Pending briefs in project ${args.project} (${pending.length}):\n\n${lines.join('\n\n')}`;

      return { content: [{ type: 'text', text }] };
    },
  );

  // ── Tool: bridge_review ────────────────────────────────────────────────────
  server.registerTool(
    'bridge_review',
    {
      title: 'Review a completed task with its results and modified files',
      description:
        'After a task is completed, pass the task_id to review the result and read all modified files. ' +
        'Automatically fetches the result entry, reads all files in files_changed, and returns both. ' +
        'Optionally specify extra_files to read additional files beyond what was recorded in files_changed.',
      inputSchema: {
        project: z.string().describe('Project name (required)'),
        task_id: z.string().describe('Task ID to review (required)'),
        extra_files: z.array(z.string()).optional().describe('Additional project-relative file paths to read (optional)'),
      },
    },
    async (args) => {
      const config: StorageConfig = {
        dataDir: ctx.storageConfig.dataDir,
        projectName: args.project,
      };

      // Look up project root
      let projectRoot = ctx.projectRoot;
      if (ctx.projectPaths && args.project in ctx.projectPaths) {
        projectRoot = ctx.projectPaths[args.project];
      }

      // Fetch result entry for this task
      const rows = markdownStorage.getEntriesForTask(config, args.task_id);
      const resultRow = rows.find(r => r.type === 'result');

      if (!resultRow) {
        return {
          content: [{ type: 'text', text: `No result found for task_id="${args.task_id}"` }],
        };
      }

      const result = markdownStorage.parsePayload<ResultPayload>(resultRow);

      // Build list of files to read
      const filesToRead = [...(result.files_changed ?? [])];
      if (args.extra_files) {
        filesToRead.push(...args.extra_files);
      }

      // Read all files
      const blocks: { type: 'text'; text: string }[] = [];

      // Add result summary first
      blocks.push({
        type: 'text',
        text: `## Result Summary\n\n${formatResult(resultRow)}`,
      });

      // Add file contents
      for (const relPath of filesToRead) {
        try {
          const absPath = safeResolve(projectRoot, relPath);
          const stat = fs.statSync(absPath);
          if (!stat.isFile()) {
            blocks.push({ type: 'text', text: `\n--- ${relPath} ---\n[not a file]` });
            continue;
          }
          if (stat.size > 500_000) {
            blocks.push({ type: 'text', text: `\n--- ${relPath} ---\n[file too large: ${stat.size} bytes]` });
            continue;
          }
          const content = fs.readFileSync(absPath, 'utf-8');
          blocks.push({ type: 'text', text: `\n--- ${relPath} ---\n${content}` });
        } catch (err) {
          blocks.push({ type: 'text', text: `\n--- ${relPath} ---\n[error: ${(err as Error).message}]` });
        }
      }

      return { content: blocks };
    },
  );

  // ─── bridge_save_result ──────────────────────────────────────────────────────
  const SaveResultSchema = z.object({
    project: z.string().describe('Project name (required)'),
    task_id: z.string().describe('Task ID matching the original brief (required)'),
    status: z.enum(['done', 'partial', 'blocked']).describe("Status: 'done' (complete), 'partial' (incomplete), or 'blocked' (stuck)"),
    summary: z.string().describe('Summary of what was done or why it is blocked (required)'),
    files_changed: z.array(z.string()).optional().describe('Files that were changed (required when status is "done")'),
    issues_hit: z.string().optional().describe('Any issues or blockers encountered'),
    notes_for_user: z.string().optional().describe('Additional notes for the user'),
  });

  server.registerTool(
    'bridge_save_result',
    {
      title: 'Save a result for a completed brief',
      description:
        'Write a result file to the results folder and move the brief from inbox to done. ' +
        'Call this automatically after completing each brief without waiting to be asked. ' +
        'When status is "done", files_changed is required.',
      inputSchema: SaveResultSchema,
    },
    async (args) => {
      const validated = SaveResultSchema.parse(args);
      const files_changed = validated.files_changed;

      if (validated.status === 'done' && (!files_changed || files_changed.length === 0)) {
        throw new Error("files_changed is required and must not be empty when status is 'done'");
      }

      const config: StorageConfig = {
        dataDir: ctx.storageConfig.dataDir,
        projectName: validated.project,
      };

      const payload: ResultPayload = {
        status: validated.status,
        files_changed,
        diff_summary: validated.summary,
        error: validated.issues_hit,
        notes: validated.notes_for_user ? [validated.notes_for_user] : undefined,
      };

      markdownStorage.appendResult(config, validated.task_id, payload);

      return {
        content: [
          {
            type: 'text',
            text:
              `Result saved for ${validated.task_id} (status: ${validated.status})\n` +
              `Brief moved from inbox to done.\n` +
              `Project: ${validated.project}`,
          },
        ],
      };
    },
  );

  return server;
}
