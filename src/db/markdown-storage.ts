import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  BriefPayload,
  ResultPayload,
  EntryRow,
  EntryStatus,
} from './schema.js';

// ─── Markdown storage backend ────────────────────────────────────────────────

export interface StorageConfig {
  dataDir: string; // e.g., a local folder or a synced cloud folder
  projectName: string;
}

/**
 * Get the project storage root.
 */
function getProjectDir(config: StorageConfig): string {
  return path.join(config.dataDir, config.projectName);
}

/**
 * Get folder path for a given type.
 */
export function getFolderPath(config: StorageConfig, folderType: 'inbox' | 'results' | 'done'): string {
  return path.join(getProjectDir(config), folderType);
}

/**
 * Ensure directories exist.
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate filename for a brief or result. If file exists, append -2, -3, etc.
 */
function getUniqueBriefFilename(folderPath: string, dateStr: string, taskId: string): string {
  let filename = `${dateStr}-${taskId}.md`;
  let fullPath = path.join(folderPath, filename);
  let counter = 2;

  while (fs.existsSync(fullPath)) {
    filename = `${dateStr}-${taskId}-${counter}.md`;
    fullPath = path.join(folderPath, filename);
    counter++;
  }

  return filename;
}

/**
 * Generate filename for a result.
 */
function getUniqueResultFilename(folderPath: string, dateStr: string, taskId: string): string {
  let filename = `${dateStr}-${taskId}-result.md`;
  let fullPath = path.join(folderPath, filename);
  let counter = 2;

  while (fs.existsSync(fullPath)) {
    filename = `${dateStr}-${taskId}-result-${counter}.md`;
    fullPath = path.join(folderPath, filename);
    counter++;
  }

  return filename;
}


/**
 * Format date as YYYY-MM-DD.
 */
function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YAML frontmatter from markdown.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: Record<string, string> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    if (key) {
      frontmatter[key.trim()] = valueParts.join(':').trim();
    }
  }
  return frontmatter;
}

/**
 * Extract a markdown section (## Title) from content.
 */
function extractSection(content: string, sectionTitle: string): string {
  // Find the section header
  const headerPattern = new RegExp(`^## ${sectionTitle}$`, 'm');
  const headerMatch = headerPattern.exec(content);
  if (!headerMatch) return 'None.';

  // Extract content from end of header to start of next section or end of string
  const startPos = headerMatch.index + headerMatch[0].length + 1; // +1 for the newline after header
  const restOfContent = content.substring(startPos);

  // Find the next section (blank line followed by ##) or end of string
  const nextSectionPattern = /\n\n##/;
  const nextSectionMatch = nextSectionPattern.exec(restOfContent);

  let endPos: number;
  if (nextSectionMatch) {
    endPos = nextSectionMatch.index;
  } else {
    endPos = restOfContent.length;
  }

  const sectionContent = restOfContent.substring(0, endPos).trim();
  return sectionContent || 'None.';
}

/**
 * Save a brief to markdown in inbox/.
 */
export function appendBrief(
  config: StorageConfig,
  taskId: string,
  payload: BriefPayload,
): number {
  BriefPayload.parse(payload);

  const inboxPath = getFolderPath(config, 'inbox');
  ensureDir(inboxPath);

  const today = formatDate();
  const filename = getUniqueBriefFilename(inboxPath, today, taskId);
  const fullPath = path.join(inboxPath, filename);

  const frontmatter = `---
task_id: ${taskId}
title: ${payload.title}
created: ${formatDate()}
status: pending
---`;

  const sections = [
    `## What we decided\n${payload.decision_summary || 'None.'}`,
    `## Why\n${payload.conversation_excerpt || 'None.'}`,
    `## Files likely touched\n${payload.files_likely_touched?.length ? payload.files_likely_touched.map(f => `- ${f}`).join('\n') : 'None.'}`,
    `## Acceptance criteria\n${payload.acceptance_criteria?.length ? payload.acceptance_criteria.map(c => `- ${c}`).join('\n') : 'None.'}`,
    `## Rejected options\n${payload.rejected_options?.length ? payload.rejected_options.map(o => `- ${o}`).join('\n') : 'None.'}`,
    `## Conversation excerpt\n${payload.conversation_excerpt || 'None.'}`,
  ];

  const content = `${frontmatter}\n\n${sections.join('\n\n')}\n`;
  fs.writeFileSync(fullPath, content);

  return 1; // Fake ID for compatibility
}

/**
 * Save a result to markdown in results/.
 */
export function appendResult(
  config: StorageConfig,
  taskId: string,
  payload: ResultPayload,
): number {

  const resultsPath = getFolderPath(config, 'results');
  ensureDir(resultsPath);

  const today = formatDate();
  const filename = getUniqueResultFilename(resultsPath, today, taskId);
  const fullPath = path.join(resultsPath, filename);

  const status: EntryStatus =
    payload.status === 'done' ? 'done' :
    payload.status === 'blocked' ? 'blocked' :
    'in_progress';

  const frontmatter = `---
task_id: ${taskId}
brief_file: ${taskId}.md
completed: ${today}
status: ${status}
---`;

  const sections = [
    `## What I did\n${payload.diff_summary || 'None.'}`,
    `## Files changed\n${payload.files_changed?.length ? payload.files_changed.map(f => `- ${f}`).join('\n') : 'None.'}`,
    `## Issues hit\n${payload.error || 'None.'}`,
    `## Notes for the user\n${payload.notes?.length ? payload.notes.join('\n\n') : 'None.'}`,
  ];

  const content = `${frontmatter}\n\n${sections.join('\n\n')}\n`;
  fs.writeFileSync(fullPath, content);

  // Update brief status to move it from inbox to done if marked complete
  updateBriefStatus(config, taskId, status);

  return 1;
}

/**
 * Get all entries for a task (reconstruct from files).
 */
export function getEntriesForTask(
  config: StorageConfig,
  taskId: string,
): EntryRow[] {
  const entries: EntryRow[] = [];
  let id = 1;

  // Find brief in inbox/ or done/
  for (const folderType of ['inbox', 'done'] as const) {
    const folderPath = getFolderPath(config, folderType);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (!file.match(new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${taskId}(-\\d+)?\\.md$`))) continue;

      const fullPath = path.join(folderPath, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const fm = parseFrontmatter(content);

      if (fm.task_id === taskId) {
        entries.push({
          id: id++,
          task_id: taskId,
          type: 'brief',
          source: 'chat',
          status: (fm.status as EntryStatus) || 'pending',
          payload: JSON.stringify({
            title: fm.title || '',
            decision_summary: extractSection(content, 'What we decided'),
            conversation_excerpt: extractSection(content, 'Conversation excerpt'),
            files_likely_touched: parseList(extractSection(content, 'Files likely touched')),
            acceptance_criteria: parseList(extractSection(content, 'Acceptance criteria')),
            rejected_options: parseList(extractSection(content, 'Rejected options')),
          }),
          created_at: fm.created ? new Date(`${fm.created}T00:00:00Z`).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // Find result in results/
  const resultsPath = getFolderPath(config, 'results');
  if (fs.existsSync(resultsPath)) {
    const files = fs.readdirSync(resultsPath);
    for (const file of files) {
      if (!file.match(new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${taskId}(-result)?(-\\d+)?\\.md$`))) continue;

      const fullPath = path.join(resultsPath, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const fm = parseFrontmatter(content);

      if (fm.task_id === taskId) {
        entries.push({
          id: id++,
          task_id: taskId,
          type: 'result',
          source: 'code',
          status: (fm.status as EntryStatus) || 'done',
          payload: JSON.stringify({
            status: fm.status || 'done',
            files_changed: parseList(extractSection(content, 'Files changed')),
            diff_summary: extractSection(content, 'What I did'),
            error: extractSection(content, 'Issues hit'),
            notes: extractSection(content, 'Notes for the user').split('\n').filter(Boolean),
          }),
          created_at: fm.completed ? new Date(`${fm.completed}T00:00:00Z`).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  return entries.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}

/**
 * List all pending briefs in the project inbox.
 * Returns task_id, title, created date, and filename for each pending brief.
 * Sorted by created date ASC, then filename ASC.
 * Returns empty array if inbox/ doesn't exist. Skips malformed files silently.
 */
export function listPendingBriefs(
  config: StorageConfig,
): Array<{ task_id: string; title: string; created: string; filename: string }> {
  const inboxPath = getFolderPath(config, 'inbox');
  if (!fs.existsSync(inboxPath)) return [];

  const results: Array<{ task_id: string; title: string; created: string; filename: string }> = [];
  const files = fs.readdirSync(inboxPath);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    try {
      const content = fs.readFileSync(path.join(inboxPath, file), 'utf-8');
      const fm = parseFrontmatter(content);
      if (fm.status !== 'pending') continue;
      if (!fm.task_id) continue;
      results.push({
        task_id: fm.task_id,
        title: fm.title || '',
        created: fm.created || '',
        filename: file,
      });
    } catch {
      // skip malformed files
    }
  }

  return results.sort(
    (a, b) => a.created.localeCompare(b.created) || a.filename.localeCompare(b.filename),
  );
}

/**
 * Update brief status (move from inbox to done if marked done).
 */
export function updateBriefStatus(
  config: StorageConfig,
  taskId: string,
  status: EntryStatus,
): void {
  const inboxPath = getFolderPath(config, 'inbox');
  if (!fs.existsSync(inboxPath)) return;

  const files = fs.readdirSync(inboxPath);
  for (const file of files) {
    const fullPath = path.join(inboxPath, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const fm = parseFrontmatter(content);

    if (fm.task_id === taskId) {
      if (status === 'done' || status === 'cancelled') {
        // Update status and move to done
        const updated = content.replace(/^status: \w+/m, `status: ${status}`);
        const donePath = getFolderPath(config, 'done');
        ensureDir(donePath);
        const newPath = path.join(donePath, file);
        fs.writeFileSync(newPath, updated);
        fs.unlinkSync(fullPath);
      } else {
        // Update status in place
        const updated = content.replace(/^status: \w+/m, `status: ${status}`);
        fs.writeFileSync(fullPath, updated);
      }
      break;
    }
  }
}

/**
 * Parse a payload from markdown EntryRow.
 */
export function parsePayload<T>(row: EntryRow): T {
  return JSON.parse(row.payload) as T;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseList(text: string): string[] {
  if (text === 'None.' || !text) return [];
  return text
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean);
}
