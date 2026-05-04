import { z } from 'zod';

// ─── Entry types ─────────────────────────────────────────────────────────────
// Bridge stores two kinds of entries in one append-only log.
// `brief` — Chat sends a task to Code
// `result` — Code reports what it did

export const EntryType = z.enum(['brief', 'result']);
export type EntryType = z.infer<typeof EntryType>;

export const EntrySource = z.enum(['chat', 'code', 'human']);
export type EntrySource = z.infer<typeof EntrySource>;

export const EntryStatus = z.enum(['pending', 'in_progress', 'done', 'blocked', 'cancelled']);
export type EntryStatus = z.infer<typeof EntryStatus>;

// ─── Payload shapes ──────────────────────────────────────────────────────────
// What goes in the `payload` column for each entry type.
// Stored as JSON strings; parsed when read.

export const BriefPayload = z.object({
  title: z.string(),
  decision_summary: z.string(),
  conversation_excerpt: z.string().optional(),
  files_likely_touched: z.array(z.string()).optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  rejected_options: z.array(z.string()).optional(),
});
export type BriefPayload = z.infer<typeof BriefPayload>;

export const ResultPayload = z.object({
  status: z.enum(['done', 'blocked', 'partial']),
  files_changed: z.array(z.string()).optional(),
  diff_summary: z.string().optional(),
  diff: z.string().optional(),
  tests_run: z.string().optional(),
  notes: z.array(z.string()).optional(),
  error: z.string().optional(),
});
export type ResultPayload = z.infer<typeof ResultPayload>;

// ─── DB row shape ────────────────────────────────────────────────────────────

export interface EntryRow {
  id: number;
  task_id: string;
  type: EntryType;
  source: EntrySource;
  status: EntryStatus;
  payload: string; // JSON
  created_at: string;
  updated_at: string;
}

// Note: Database schema and functions have been migrated to markdown-storage.ts
