# Bridge — Phase 1 Pre-OSS Audit

**Date:** 2026-05-03
**Scope:** Read-only audit of the bridge repo, intended to drive Phase 2 cleanup briefs.
**Author:** Claude Code (Sonnet 4.6)

---

## 1. REPOSITORY OVERVIEW

```
bridge/
├── .claude/                          settings.local.json with stale tool permissions — needs cleanup
├── .env.example                      env var reference — mentions removed bridge_read_files
├── .gitignore                        ignores standard things — has stale SQLite comment
├── BRIDGE_SETUP.md                   setup guide — heavily Cloudflare-centric, stale
├── README.md                         project README — current, accurate to 4-tool surface
├── dist/                             tsc build output — committed/uncleaned, includes dead modules
├── node_modules/                     dependencies — excluded
├── package-lock.json                 npm lockfile — current
├── package.json                      manifest — has cloudflared `tunnel` script, no LICENSE file, MIT declared
├── scripts/
│   └── test-stdio.ts                 LEGACY — 144-line stdio test, hardcodes old 5-tool list, references SQLite paths
├── src/
│   ├── code/                         empty placeholder dir (hook.sh, skill.md both 0 bytes) — LEGACY
│   ├── dashboard/                    empty placeholder dir (server.ts 0 bytes, public/index.html 0 bytes) — LEGACY
│   ├── db/
│   │   ├── markdown-storage.ts       347 lines — current storage backend
│   │   ├── queries.ts                3-line tombstone comment ("replaced by markdown-storage.ts") — LEGACY
│   │   └── schema.ts                 55 lines — current Zod payload definitions
│   ├── index.ts                      138 lines — HTTP daemon entrypoint, current
│   ├── mcp/
│   │   └── server.ts                 290 lines — registers the 4 MCP tools, current
│   └── mcp-stdio.ts                  67 lines — stdio entrypoint, current but duplicates env-loading from index.ts
├── start-tunnel.ps1                  PowerShell wrapper for cloudflared — LEGACY (Tailscale is the actual transport)
├── tests/
│   ├── db.test.ts                    140 lines — 7 tests, covers markdown-storage CRUD
│   └── mcp.test.ts                   199 lines — 9 tests, covers all 4 MCP tools
└── tsconfig.json                     TS config — current
```

**Top-level classification:**

| Path | Status |
|------|--------|
| README.md | CURRENT |
| BRIDGE_SETUP.md | LEGACY (Cloudflare-centric, needs Tailscale rewrite) |
| package.json | CURRENT (with stale `tunnel` script and missing OSS metadata) |
| .env.example | CURRENT (with one stale tool name) |
| .gitignore | CURRENT (with one stale SQLite comment) |
| .claude/ | CURRENT — internal Claude Code config; settings.local.json has stale entries |
| dist/ | LEGACY — should be in .gitignore (already is, but committed) |
| scripts/ | LEGACY — only file references removed era |
| src/code/, src/dashboard/ | LEGACY — empty scaffolding, never implemented |
| src/db/queries.ts | LEGACY — tombstone comment |
| src/db/markdown-storage.ts | CURRENT |
| src/db/schema.ts | CURRENT |
| src/index.ts | CURRENT |
| src/mcp/ | CURRENT |
| src/mcp-stdio.ts | CURRENT |
| start-tunnel.ps1 | LEGACY |
| tests/ | CURRENT |
| tsconfig.json | CURRENT |

---

## 2. ARCHITECTURE SUMMARY

Bridge is a small Model Context Protocol (MCP) server that lets a person plan tasks in **Claude.ai chat** (or Claude Desktop) and hand them off to **Claude Code** running on the same machine. The two clients communicate not by talking to each other directly, but by reading and writing markdown files in a shared folder — by default, a Google Drive folder so multiple devices can see the same task history, but any local directory works.

The lifecycle of a single task is: **Chat writes a brief → Code reads the brief → Code does the work → Code writes a result → Chat reviews the result.** Each step is one MCP tool call, and bridge owns the file layout that makes the handoff coherent (`{drive}/{project}/inbox/`, `results/`, `done/`).

There are exactly **four MCP tools** in the current surface: `bridge_send_brief` (Chat → file in `inbox/`), `bridge_read_brief` (Code reads pending brief), `bridge_save_result` (Code writes to `results/` and atomically moves the brief from `inbox/` to `done/`), and `bridge_review` (Chat reads a result plus the actual file contents that were changed). All four are defined in `src/mcp/server.ts`; their persistence layer is `src/db/markdown-storage.ts`, which is pure file I/O over markdown with YAML frontmatter — no database, no network calls, no external dependencies beyond Node's `fs`.

The server runs as a **long-lived HTTP daemon on `localhost:7777`** (`src/index.ts`, started by `npm run bridge`), exposing `/mcp` for the MCP Streamable-HTTP transport and `/health` for liveness. There is also a **stdio entrypoint** (`src/mcp-stdio.ts`) for environments that prefer to spawn bridge as a subprocess. Remote MCP clients (Claude Desktop, Claude.ai web) reach the local HTTP daemon over the public internet through a **Tailscale Funnel** (`https://jimmy-pc.tail4eb324.ts.net/mcp` in the developer's setup); the Funnel terminates HTTPS and proxies to `127.0.0.1:7777`. An older Cloudflare-tunnel path still litters the docs and `package.json` but is no longer used.

```
┌──────────────────┐            ┌─────────────────────┐         ┌──────────────────┐
│ Claude.ai chat   │ ──MCP/──▶ │ Tailscale Funnel    │ ──HTTP─▶│ bridge daemon    │
│ (Desktop/Web)    │  HTTPS     │ jimmy-pc.tail*.net  │         │ localhost:7777   │
└──────────────────┘            └─────────────────────┘         └────────┬─────────┘
                                                                         │ fs read/write
                                                                         ▼
┌──────────────────┐                                            ┌──────────────────┐
│ Claude Code CLI  │ ──MCP/HTTP────────────────────────────────▶│ Drive folder:    │
│ (local machine)  │   localhost                                │ inbox/, results/,│
└──────────────────┘                                            │ done/ markdown   │
                                                                └──────────────────┘
```

---

## 3. CLOUDFLARE REFERENCES (DEAD CODE)

**User intent:** Remove all Cloudflare references in Phase 2 — the actual transport is Tailscale Funnel.

| File:line | Classification | Snippet |
|-----------|----------------|---------|
| `package.json:13` | DEAD CONFIG | `"tunnel": "cloudflared tunnel --url http://localhost:7777",` |
| `start-tunnel.ps1` (whole file, 11 lines) | DEAD CODE | PowerShell wrapper that runs `cloudflared tunnel --url http://localhost:7777`. References "Cloudflare tunnel" in comments. |
| `BRIDGE_SETUP.md:17` | DEAD DOC | `Claude Desktop's newer "Nest-3p" build doesn't recognize the local claude_desktop_config.json file. Instead, use the **HTTPS tunnel** approach:` (frames whole doc as Cloudflare setup) |
| `BRIDGE_SETUP.md:28-32` | DEAD DOC | "Start the HTTPS tunnel ... `npm run tunnel`" — instructs running cloudflared |
| `BRIDGE_SETUP.md:36-39` | DEAD DOC | Sample output `Your quick Tunnel has been created!` and example URL `https://absolutely-rental-becomes-institutions.trycloudflare.com` |
| `BRIDGE_SETUP.md:43` | DEAD DOC | "set up a [named Cloudflare Tunnel] (requires a Cloudflare account)" |
| `BRIDGE_SETUP.md:50-53` | DEAD DOC | URL example `https://absolutely-rental-becomes-institutions.trycloudflare.com/mcp` |
| `BRIDGE_SETUP.md:81-84` | DEAD DOC | "Tunnel stops or URL changes" troubleshooting — entirely about cloudflared free tunnel volatility |
| `BRIDGE_SETUP.md:92-95` | DEAD DOC | "Can't connect to tunnel" troubleshooting referencing `npm run bridge` and `npm run tunnel` together |
| `BRIDGE_SETUP.md:99-115` | DEAD DOC | "Daily startup" section telling users to run cloudflared in Terminal 2 every time |

**STILL ACTIVE:** None. Tailscale Funnel (already configured, see Section 7) does the job. Nothing in the codebase actually requires Cloudflare.

**Total: 10 distinct dead references** across 3 files. Cleanup is pure deletion + rewriting BRIDGE_SETUP.md to describe Tailscale.

---

## 4. OTHER LEGACY/DEAD REFERENCES

### SQLite / `.bridge/log.db`

| File:line | Classification | Snippet |
|-----------|----------------|---------|
| `.gitignore:12` | STALE COMMENT | `# Bridge data (the SQLite database is per-machine, not shared)` (the gitignore lines below — `*.db`, `*.db-journal`, `data/` — could stay as defensive cover) |
| `BRIDGE_SETUP.md:89` | DEAD DOC | `2. SQLite database isn't corrupted: delete .bridge/log.db and restart` (in troubleshooting) |
| `scripts/test-stdio.ts:11-17` | DEAD CODE | `const BRIDGE_DIR = path.join(PROJECT_ROOT, '.bridge');` and `DB_PATH = path.join(BRIDGE_DIR, 'test-stdio.db');` — script creates and deletes a SQLite test DB that no longer exists |
| `scripts/test-stdio.ts:127-129` | DEAD CODE | More SQLite cleanup at the end of the test |

No `better-sqlite3` references found in `package.json` (already removed in earlier migration).
No references to the obsolete `C:\Users\Kualar\Bridge\` location found in any source or doc.

### Removed tool names

The Phase 1 refactor reduced the surface from 6 tools to 4. Stale references to removed tools:

| File:line | Classification | Snippet |
|-----------|----------------|---------|
| `.env.example:14` | DEAD DOC | `# Used by bridge_read_files to locate the right codebase` (the variable `BRIDGE_PROJECT_PATHS` is still used — by `bridge_review` now — but the comment names the removed tool) |
| `.claude/settings.local.json:6-8` | DEAD CONFIG | Permissions list still allows `mcp__bridge__bridge_status`, `mcp__bridge__bridge_read_files`, `mcp__bridge__bridge_read_results` — none of these tools exist anymore |
| `scripts/test-stdio.ts:62` | DEAD CODE | `const expected = ['bridge_send_brief', 'bridge_save_note', 'bridge_read_results', 'bridge_read_files', 'bridge_status'];` — the entire pass/fail criterion of the test is the OLD 5-tool list. The test would fail against the current server even if the SQLite cleanup worked. |

`bridge_save_note`, `bridge_read_results`, `bridge_read_files`, `bridge_status` — verified absent from current `src/mcp/server.ts`. Only the references above remain.

### Empty scaffolding directories

| Path | Status |
|------|--------|
| `src/code/hook.sh` | empty file (0 bytes), Apr 29 |
| `src/code/skill.md` | empty file (0 bytes), Apr 29 |
| `src/dashboard/server.ts` | empty file (0 bytes), Apr 29 |
| `src/dashboard/public/index.html` | empty file (0 bytes), Apr 29 |
| `src/db/queries.ts` | 3-line tombstone comment, May 2 |

These directories were scaffolded on day-one and never filled in. `tsc` happily compiles them into `dist/dashboard/server.js` (14 bytes) and `dist/db/queries.js`.

### Compiled `dist/` committed to repo

`dist/` is in `.gitignore` but the directory exists in the working tree. Will need explicit removal during the OSS prep so it doesn't ship in the published repo accidentally.

---

## 5. CODE QUALITY CONCERNS

Honest list of things a reviewer would flag. None are bugs; all are style/cleanup.

| Severity | Location | Issue |
|----------|----------|-------|
| medium | `src/index.ts:14-30` and `src/mcp-stdio.ts:22-37` | **Duplicated env-loading.** Both entrypoints redo the same `BRIDGE_DRIVE_DIR` default, the same `BRIDGE_PROJECT_PATHS` JSON parsing, and the same fallback logic. Should live in a shared `src/config.ts`. |
| medium | `src/mcp/server.ts:229` | **Intentional `z.any()` for `files_changed`.** This is a deliberate workaround for clients that cached the old broken schema (the `.refine()` ZodEffects bug). Once a release is out and clients have refreshed, this should revert to `z.array(z.string())`. Until then it's correct but ugly. |
| medium | `src/db/markdown-storage.ts:140` | `appendBrief` runs `BriefPayload.parse(payload)` for input validation but `appendResult` (line 174) does NOT — `ResultPayload.parse` was removed during the schema fix. Asymmetric. Decide one rule: validate at the storage boundary in both, or in neither. |
| low | `src/db/markdown-storage.ts:168, 212` | Both `appendBrief` and `appendResult` `return 1;` as a "fake ID for compatibility." Either rename to `void` returns or actually use the IDs (the call sites in `server.ts` ignore them). |
| low | `src/db/markdown-storage.ts:244, 277` | Magic strings `'pending'` and `'done'` cast to `EntryStatus` via `as`. Should use the `EntryStatus` enum directly. |
| low | `src/db/markdown-storage.ts:107-130` | `extractSection` was rewritten without regex (good), but the function lives next to `parseFrontmatter` (also string parsing). Both are tiny. Consider a single `markdown.ts` helper module. |
| low | `src/index.ts:129` | Bare `catch {}` in shutdown loop. Acceptable here (best-effort transport close), but worth a one-line comment so it doesn't read like accidental swallowing. |
| low | `src/mcp/server.ts:31` | Magic `500_000` byte limit in `bridge_review` file size check — should be a named constant. |
| low | `src/mcp/server.ts` | Single 290-line file holding all four tool registrations. Splitting into `tools/{send_brief,read_brief,save_result,review}.ts` would help future contributors find things, but is overkill for the current 4-tool surface. Defer. |
| low | `src/mcp-stdio.ts:23` | `PROJECT_NAME = path.basename(PROJECT_ROOT)` — works but means stdio sessions can never address other projects. Probably fine for the intended single-project Desktop integration; flag as a known limitation. |
| informational | `src/db/schema.ts:35-36` | `ResultPayload` declares `diff` and `tests_run` fields that are never written or read anywhere in the codebase. Either implement or remove. |
| informational | none | No `TODO` / `FIXME` / `XXX` / `HACK` comments anywhere in `src/` or `tests/`. Clean on that front. |
| informational | none | No `eval`, `Function()`, `child_process.exec`, or shell expansion of user input anywhere in source. |

**Files over 300 lines:** only `src/db/markdown-storage.ts` (347). Reasonable for a self-contained storage layer.
**Functions over 50 lines:** `getEntriesForTask` in `markdown-storage.ts` (~75 lines) is the only one. Could split into `getBriefsForTask` + `getResultsForTask`.

---

## 6. DOCUMENTATION STATE

### README.md (154 lines, current)

**Section-by-section summary:**

1. **Title + tagline** — accurate
2. **Architecture > Storage System** — accurate (markdown on Drive)
3. **Folder Structure** — accurate (inbox/, results/, done/, no notes/)
4. **Markdown Format** — accurate, with YAML example
5. **Configuration > Environment Variables** — documents `BRIDGE_DRIVE_DIR`, `BRIDGE_PROJECT_PATHS`. **MISSING:** `BRIDGE_PORT`, `LOG_LEVEL`, `BRIDGE_PROJECT_ROOT` (used by stdio entrypoint).
6. **Tools** — all 4 tools documented with correct parameters
7. **Testing** — one-line `npm test` instruction
8. **Implementation Details** — status management, collision handling, multi-project
9. **File Locations** — points to the right files

**Missing from README:**
- ❌ Install / quick-start (no "clone, npm install, run this" sequence)
- ❌ How to connect from Claude Desktop / Claude.ai (no mention of MCP client setup; user has to read BRIDGE_SETUP.md, which is itself wrong)
- ❌ Troubleshooting section
- ❌ Project status / maturity statement
- ❌ Contribution / license pointer
- ❌ Screenshots or workflow diagram (nice-to-have)

### Other markdown files

| File | Purpose | State |
|------|---------|-------|
| `BRIDGE_SETUP.md` | Setup guide | LEGACY — built around Cloudflare; mentions SQLite. Needs full Tailscale rewrite, or fold the useful bits into README and delete it. |
| `AUDIT.md` | This file | Phase 1 deliverable — temporary, deleted in Phase 2 once briefs are derived. |

### JSDoc / TSDoc coverage

Rough estimate by inspection of `src/`:
- `src/db/markdown-storage.ts`: every exported function has a one-line JSDoc. Internal helpers also commented. ~95% coverage.
- `src/mcp/server.ts`: `safeResolve` and `formatResult` have JSDoc; the four `registerTool` handlers have rich `description` strings inside the tool definition (visible to Claude clients) but no separate JSDoc on the handlers. Functional.
- `src/index.ts`, `src/mcp-stdio.ts`: section-comment style, no JSDoc on individual funcs. Both files are short enough that this is fine.
- `src/db/schema.ts`: section comments only. The Zod schemas are self-documenting.

Overall coverage on exported surface is good. No method-level docs are missing for anything a contributor would need to reverse-engineer.

---

## 7. CONFIGURATION & SETUP

### Environment variables actually read by the code

| Var | Read in | Default | Documented in README? | Documented in `.env.example`? |
|-----|---------|---------|----------------------|-------------------------------|
| `BRIDGE_PORT` | `src/index.ts:14` | `7777` | ❌ NO | ✅ yes |
| `LOG_LEVEL` | `src/index.ts:15` | `'info'` | ❌ NO | ✅ yes |
| `BRIDGE_DRIVE_DIR` | `src/index.ts:19`, `src/mcp-stdio.ts:26` | Windows: `G:\My Drive\bridge`; other: `~/Bridge` | ✅ yes | ✅ yes (commented) |
| `BRIDGE_PROJECT_PATHS` | `src/index.ts:24`, `src/mcp-stdio.ts:31` | `{}` | ✅ yes | ✅ yes (commented) |
| `BRIDGE_PROJECT_ROOT` | `src/mcp-stdio.ts:22` | `process.cwd()` | ❌ NO | ❌ NO — completely undocumented |

**`BRIDGE_PROJECT_ROOT` is the worst offender** — it's required for the stdio entrypoint to work outside the bridge repo itself but appears nowhere in user-facing docs. The original brief mentions `BRIDGE_DRIVE_ROOT` (note: ROOT, not DIR) — confirmed: that name is NOT used anywhere; the actual var is `BRIDGE_DRIVE_DIR`.

### Hardcoded paths in source

| File:line | Path | Risk |
|-----------|------|------|
| `src/index.ts:20` | `'G:\\My Drive\\bridge'` | Windows-only default. Documented in code comment. Acceptable for v1 (Windows-targeted). |
| `src/mcp-stdio.ts:27` | `'G:\\My Drive\\bridge'` | Same default, duplicated. |

Mac/Linux fallback to `~/Bridge` exists in both. No other hardcoded user-specific paths in source. Personal info (`jimmy-pc.tail4eb324.ts.net`) appears only in `tailscale serve` output, not committed.

---

## 8. TESTS

`npm test` → **16/16 passing** (vitest, ~380ms total).

| File | Tests | Coverage |
|------|-------|----------|
| `tests/db.test.ts` | 7 | `appendBrief`, `appendResult`, payload validation rejection, chronological ordering, folder structure creation, filename collision handling, brief→done auto-move |
| `tests/mcp.test.ts` | 9 | tool list, `bridge_send_brief`, `bridge_read_brief` (pending and non-pending), `bridge_save_result` (`done` requires `files_changed`, accepts arrays, accepts `partial` without `files_changed`), `bridge_review` (existing task, missing task) |

### Coverage gaps

- ❌ `safeResolve` path-traversal escape — never tested directly. Only exercised implicitly when `bridge_review` reads files. Should have a unit test for the "rejects `../escape`" path because it's a security boundary.
- ❌ `bridge_review` with `extra_files` — feature exists, no test.
- ❌ `bridge_review` against a 500_000+ byte file — size-cap branch never exercised.
- ❌ HTTP transport (`src/index.ts`) — tests use `InMemoryTransport`. The per-session `buildMcpServer()` factory I added today is logically correct but not covered by an integration test. Worth a smoke test that POSTs `initialize` against the real Express handler.
- ❌ Stdio entrypoint (`src/mcp-stdio.ts`) — `scripts/test-stdio.ts` was the integration test, but it's broken (Section 4) and shouldn't be revived as-is.
- ❌ Markdown extraction edge cases — what if the brief has no `## What we decided` header? Tests don't cover.

---

## 9. SECURITY & SAFETY

### Secret / token scan

Searched `.env*`, `*.json`, `*.ts`, `*.md` for `api_key`, `secret`, `password`, `token`, `bearer`, `sk_live`, `sk_test`, `ghp_`, plus the personal Tailscale tokens (`tail4eb324`, `jimmy-pc`).

- ✅ **No secrets, API keys, or tokens committed.**
- ✅ `.env` is gitignored; only `.env.example` is tracked, and it has no real values.
- The Tailscale-side hostname (`jimmy-pc.tail4eb324.ts.net`) appears nowhere in committed code — only in this conversation and live `tailscale` output. Safe.

### `.gitignore` coverage

- ✅ `node_modules/`
- ✅ `dist/` (but the directory currently exists in the working tree — see Section 4)
- ✅ `.env`, `.env.local`, `*.key`
- ✅ `*.db`, `*.db-journal`, `data/` (defensive — SQLite is gone but harmless to keep)
- ✅ logs, OS junk (`.DS_Store`, `Thumbs.db`, `desktop.ini`)
- ✅ editor dirs (`.vscode/`, `.idea/`)
- ✅ test/coverage outputs

Solid coverage.

### Path traversal protection

`safeResolve` exists in `src/mcp/server.ts:17-23`:

```ts
function safeResolve(projectRoot: string, relPath: string): string {
  const resolved = path.resolve(projectRoot, relPath);
  if (!resolved.startsWith(path.resolve(projectRoot))) {
    throw new Error(`Path "${relPath}" escapes the project root`);
  }
  return resolved;
}
```

**Used by:** `bridge_review` (line 200) — the **only** tool that reads files from the project filesystem. ✅ Correct, minimal attack surface, no other file-reading tools exist that bypass it.

**Caveat:** the `startsWith` check is fine on Windows because `path.resolve` normalises separators, but on case-insensitive filesystems a case-different prefix could trick it. For the Windows-targeted v1 this is not a real risk; for cross-platform release it should switch to `path.relative` and check for `..`. Flag for future.

### Other safety

- No `eval(...)`, `Function(...)`, `execSync(...)`, `spawn(...)`, or shell-string interpolation anywhere in `src/`. The only `.exec` matches are JS regex `.exec()` calls (false positives). ✅
- `JSON.parse` is called on `BRIDGE_PROJECT_PATHS` env var (line 26 in both entrypoints), wrapped in try/catch. ✅
- `JSON.parse` is called on `validated.files_changed` in `bridge_save_result` (line 250 of `server.ts`), wrapped in try/catch. ✅
- Express `body-parser` capped at 10 MB. ✅
- HTTP server binds to `127.0.0.1` only (line 105 of `index.ts`) — correct, exposure is via Tailscale Funnel, never directly. ✅

---

## 10. MISSING FOR OSS RELEASE

| File / Field | Status | Notes |
|--------------|--------|-------|
| `LICENSE` | ❌ ABSENT | `package.json` declares `"license": "MIT"` but no LICENSE file in repo. Inconsistent — pick one and make it real. |
| `CONTRIBUTING.md` | ❌ ABSENT | Standard for OSS. Even a 30-line "fork, branch, test, PR" stub helps. |
| `CODE_OF_CONDUCT.md` | ❌ ABSENT | Conventional but optional for a small project. |
| `.github/ISSUE_TEMPLATE/` | ❌ ABSENT | Bug report + feature request templates would help triage. |
| `.github/workflows/` | ❌ ABSENT | No CI. Should at minimum have a `ci.yml` that runs `npm install && npm test && npm run typecheck` on push/PR. |
| `CHANGELOG.md` | ❌ ABSENT | Useful for v0.1 → v0.2 traceability; could be auto-generated from git log. |
| `package.json` `description` | ✅ PRESENT | "A local daemon connecting Claude.ai to Claude Code via shared context." Good. |
| `package.json` `repository` | ❌ ABSENT | Should be `{"type":"git","url":"https://github.com/Kualarz/bridge.git"}`. |
| `package.json` `keywords` | ✅ PRESENT | `["claude","mcp","daemon","ai-tools"]`. Adequate. |
| `package.json` `author` | ✅ PRESENT | `"Jimmy"`. Could expand to email/URL but not required. |
| `package.json` `license` | ✅ PRESENT (declared) | But the LICENSE file is missing — inconsistent. |
| `package.json` `bugs` | ❌ ABSENT | Standard for OSS — link to GitHub issues. |
| `package.json` `homepage` | ❌ ABSENT | Link to README on GitHub. |
| `package.json` `engines` | ❌ ABSENT | Should pin a Node version range (e.g. `"node": ">=20"`) — esp. since some deps are recent. |
| `.npmignore` or `files` field | ⚠️ ABSENT | If this gets published to npm, users would download tests, scripts, and dotfiles. Need a `files` allowlist or `.npmignore`. (May not be relevant if distributing via GitHub clone only.) |

---

## 11. RECOMMENDED PHASE 2 BRIEFS

Eight focused cleanup briefs in recommended execution order. Each is small, scoped, and reversible.

### 1. `remove-cloudflare-references` — risk: **low**
Delete `start-tunnel.ps1`, remove the `tunnel` script line from `package.json`, and rewrite `BRIDGE_SETUP.md` to describe the Tailscale Funnel setup instead (or delete it and fold a 20-line "Connecting from Claude Desktop" section into README). Pure deletion + one rewrite. **Motivated by Sections 3, 6.** First because it de-risks every other doc-touching brief.

### 2. `remove-dead-files` — risk: **low**
Delete `src/code/`, `src/dashboard/`, `src/db/queries.ts`, and `scripts/test-stdio.ts` (they're all dead). Confirm `dist/` is gitignored and remove the working-tree copy with `git rm -r --cached dist/`. Update `.gitignore` to drop the obsolete SQLite comment. **Motivated by Sections 1, 4.** Independent of Phase 2.1; can be done in parallel.

### 3. `fix-stale-tool-references` — risk: **low**
Update `.env.example` line 14 to drop the `bridge_read_files` mention (replace with "used by `bridge_review` to locate source files"). Clean `.claude/settings.local.json` of permission entries for removed tools (`bridge_status`, `bridge_read_files`, `bridge_read_results`). **Motivated by Section 4.**

### 4. `consolidate-config-loading` — risk: **medium**
Extract the duplicated `BRIDGE_DRIVE_DIR` / `BRIDGE_PROJECT_PATHS` env-loading block from `src/index.ts` and `src/mcp-stdio.ts` into a shared `src/config.ts`. Document `BRIDGE_PROJECT_ROOT` in README + `.env.example` while you're there. Tests may need a small adjustment if they import the entrypoints. **Motivated by Sections 5, 7.**

### 5. `revert-files_changed-schema` — risk: **medium**
Now that any client connecting to the freshly-restarted server gets the correct JSON Schema, revert `bridge_save_result`'s `files_changed: z.any()` (line 229 of `src/mcp/server.ts`) back to `z.array(z.string()).optional()`. Drop the manual coercion block in the handler. Add a test that confirms an array passes and a string is rejected with a clear error. **Motivated by Section 5.** Important to do *before* the OSS release so external users never see the workaround.

### 6. `add-missing-tests` — risk: **low**
Add unit tests for: `safeResolve` (rejects `../escape`), `bridge_review` with `extra_files`, `bridge_review` with an oversized file (size-cap branch), and an HTTP integration test that exercises the per-session `buildMcpServer()` factory in `index.ts`. Optional: a fast smoke test for the stdio entrypoint that replaces the deleted `scripts/test-stdio.ts`. **Motivated by Section 8.**

### 7. `expand-readme-for-oss` — risk: **low**
Add a Quick Start section (clone → npm install → npm run bridge → connect from Claude Desktop), document `BRIDGE_PORT` / `LOG_LEVEL` / `BRIDGE_PROJECT_ROOT` env vars, add a Troubleshooting section, link to the new CONTRIBUTING.md, declare project status (alpha/beta), note Windows-only target with a "cross-platform contributions welcome" line. **Motivated by Section 6.**

### 8. `add-oss-release-files` — risk: **low**
Create LICENSE (MIT), CONTRIBUTING.md (short stub: fork, branch, test, PR), `.github/workflows/ci.yml` (run `npm install && npm test && npm run typecheck` on push/PR), `CHANGELOG.md` seeded with v0.1 entry, and add `repository`, `bugs`, `homepage`, `engines` fields to `package.json`. Optional: `.github/ISSUE_TEMPLATE/`. **Motivated by Section 10.** Last because the previous briefs land the actual product surface; this brief packages it for the world.

---

**Recommended first brief to execute:** **#1 `remove-cloudflare-references`** — pure deletion, no risk, immediate visible improvement, and it removes the most embarrassing piece of cruft for a project that's about to be public.
