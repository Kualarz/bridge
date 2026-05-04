---

name: bridge

description: Use this skill whenever you start work in a project that uses the bridge MCP server — a handoff system between Claude.ai chat (where the user plans tasks) and Claude Code (where the work gets done). Briefs are written by chat into the project inbox; you read them, do the work, and write results back. Trigger this skill at the start of any session in a bridge-enabled project, when the user asks "any new briefs?" / "what's in the inbox?" / "check the bridge", or any time the user mentions checking for handed-off work.

---

# Bridge Skill — Automated Handoff Between Chat and Code

You are the Claude Code side of a "bridge" system. The user plans tasks in Claude.ai chat, chat writes briefs into the project's bridge folder via MCP tools, and you pick them up, do the work, and report results back via the same MCP interface.

## Session Start: Check for Pending Briefs

At the beginning of every session in a bridge-enabled project, **call `bridge_list_pending` automatically** to discover work that has been handed off:

```
bridge_list_pending(project: '{current-project}')
```

Report what's waiting (task_ids, titles, created dates). If the list is non-empty, ask the user which one to process — do not auto-execute. If the list is empty, say nothing — don't announce empty inboxes every session.

**Do not auto-execute briefs.** Even when the inbox has clear, unambiguous work, wait for the user to say "do brief X" or "process the inbox" before starting.

## Processing a Brief: The Workflow

When the user asks you to process a brief:

### 1. Read the Brief (`bridge_read_brief`)
```
bridge_read_brief(project: '{current-project}', task_id: '{the-task-id}')
```

This retrieves the full brief: What we decided, Acceptance criteria, Files likely touched, Rejected options, etc.

**Important:** Read the Rejected options section carefully. Those are options the user already considered and explicitly rejected — do not propose them again.

### 2. Do the Work
Execute the brief. Make changes to the codebase, run tests, debug as needed. The brief specifies what success looks like via acceptance criteria — meet all of them.

### 3. Write the Result (`bridge_save_result`)
**Immediately after completing the brief** (or if you get stuck), call:

```
bridge_save_result(
  project: '{current-project}',
  task_id: '{the-task-id}',
  status: 'done' | 'partial' | 'blocked',
  summary: 'What was done (or why you are blocked)',
  files_changed: ['src/file1.ts', 'src/file2.ts'],
  issues_hit: 'Any problems encountered (or "None.")',
  notes_for_user: 'Extra context for the user (optional)'
)
```

**Status values:**
- `'done'` — Brief is complete, all acceptance criteria met. `files_changed` is required.
- `'partial'` — Some work done but incomplete, acceptance criteria partially met, or you are uncertain.
- `'blocked'` — You cannot proceed without user input or clarification.

**CRITICAL:** Do NOT manually write result files using the `Write` tool. Always use `bridge_save_result`. The MCP tool call auto-approves silently under the user's `mcp__bridge__*` permission rule, but `Write` triggers a permission prompt every time.

### 4. Brief Movement (Automatic)
When you call `bridge_save_result`, the system automatically writes your result to `results/` and moves the processed brief from `inbox/` to `done/`. You do not move briefs yourself.

## Hard Rules

- **NEVER use the `Write` filesystem tool for result files.** Always use `bridge_save_result`.
- **NEVER write to `inbox/`.** Only chat writes there.
- **NEVER modify or delete files in `done/`.** Those are historical records.
- **If a brief is ambiguous,** ask the user before doing the work. A brief is a starting point, not a sealed contract.
- **If you finish but feel uncertain,** mark `status: 'partial'` and explain what's uncertain in `notes_for_user`.

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `bridge_send_brief` | Chat sends a new brief to Code. |
| `bridge_list_pending` | Code lists every pending brief in the project inbox. |
| `bridge_read_brief` | Code reads a specific pending brief by task_id. |
| `bridge_save_result` | Code saves a result; brief auto-moves from inbox to done. |
| `bridge_review` | Chat reviews a completed task and reads the files Code modified. |

You do NOT read files directly from the bridge folders, you do NOT construct file paths, you do NOT parse YAML frontmatter by hand. The MCP tools handle all of that. Code's job is to call `bridge_list_pending` and `bridge_read_brief` to see what's waiting, do the work in the codebase, and call `bridge_save_result` when finished. Chat owns the planning side (`bridge_send_brief`) and the review side (`bridge_review`).
