# Contributing to Bridge

## Welcome

Thanks for considering a contribution. Bridge is in early days — feedback on architecture, naming, ergonomics, and missing capabilities is just as valuable as code. If you're not sure whether an idea fits, open a discussion or a draft issue and we'll figure it out together.

## Development setup

If you've never set up a Node project on Windows, see [INSTALL.md](./INSTALL.md) for the full walkthrough.

```bash
git clone https://github.com/Kualarz/bridge.git
cd bridge
npm install
npm run build
npm test
```

- `npm test` runs the vitest suite (31 tests at the time of writing) using the SDK's `InMemoryTransport` — no real HTTP, no real stdio, just direct in-process MCP calls.
- `npm run typecheck` runs `tsc --noEmit` and must come back clean.
- Both `npm test` and `npm run typecheck` must pass before opening a pull request. CI runs them on every PR; if your local run is green, CI almost certainly will be too.

To run the daemon during development:

```bash
npm run bridge      # tsx-powered, HTTP daemon on localhost:7777
npm run bridge:stdio  # tsx-powered, stdio entrypoint for Claude Desktop
```

Both scripts run TypeScript directly via `tsx` — no rebuild needed between edits.

## Project structure

```
bridge/
├── src/
│   ├── config.ts                  # Env loading: single source of truth for all BRIDGE_* vars
│   ├── index.ts                   # HTTP daemon (Express + MCP Streamable HTTP transport)
│   ├── mcp-stdio.ts               # Stdio entrypoint (spawned by Claude Desktop)
│   ├── mcp/
│   │   └── server.ts              # MCP tool registration: send_brief, list_pending, read_brief, save_result, review
│   └── db/
│       ├── markdown-storage.ts    # File I/O over markdown with YAML frontmatter
│       └── schema.ts              # Zod payload definitions
├── tests/
│   ├── config.test.ts             # Env loading + deprecation shim
│   ├── db.test.ts                 # Storage layer
│   └── mcp.test.ts                # End-to-end MCP tool calls via InMemoryTransport
├── claude-skill/
│   └── bridge/
│       └── SKILL.md               # The bundled Claude Code skill (install to ~/.claude/skills/bridge/)
├── README.md
├── CONTRIBUTING.md  (this file)
├── CHANGELOG.md
├── LICENSE
├── .env.example                   # Documents every env var bridge reads
├── package.json
└── tsconfig.json
```

## How to add a new MCP tool

1. **Register the tool in `src/mcp/server.ts`** using `server.registerTool(name, { title, description, inputSchema }, handler)`. Use the existing tools as templates — keep descriptions tight and action-oriented because they're what the LLM sees.
2. **Add a storage helper to `src/db/markdown-storage.ts`** if the tool needs new file I/O. Storage helpers are pure functions over `StorageConfig` — no MCP dependencies, no shared state.
3. **Add a test in `tests/mcp.test.ts`** that calls the tool through the in-memory MCP client. The setup at the top of the file gives you a working `client` with all bridge tools registered against a temp directory.
4. **Update `claude-skill/bridge/SKILL.md`** if the tool changes the agent workflow — e.g. add a session-start step, document a new failure mode, etc. The skill is the contract between bridge and Claude Code; if the workflow changes, the skill must too.
5. **Update the README's tool reference** if it has one. The README's tool table should match the actual MCP surface.

## Cross-platform support (highest-value area)

Bridge v1 is Windows-only by scope, not by intent. The codebase has a few Windows-shaped assumptions that need to be audited and updated for Mac and Linux to work cleanly. **This is the contribution area I most want help with.**

Known Windows-shaped assumptions:

- `path.join` is used in most places (good), but the README's example values use Windows path syntax (`C:\Users\YourName\...`). A cross-platform README would show platform-conditional examples or use `~` in a way that works in both shells.
- The skill install path described in the README uses Windows conventions (`%USERPROFILE%\.claude\skills\`). Mac/Linux equivalents should be added.
- `src/config.ts` defaults `BRIDGE_DATA_DIR` to `path.join(os.homedir(), 'Bridge')` on every platform, which works but isn't idiomatic — Linux users typically expect `$XDG_DATA_HOME/bridge` or `~/.local/share/bridge`; Mac users typically expect `~/Library/Application Support/bridge`.

A contributor who wants to add Mac/Linux support should:

1. Audit `src/` for `path.join` misuse vs literal `\` separators (run `git grep '\\\\\\\\'` and `git grep '\\\\'`).
2. Update `src/config.ts` to pick a platform-appropriate per-user data directory:
   - Linux: `process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')` joined with `bridge`.
   - Mac: `path.join(os.homedir(), 'Library', 'Application Support', 'bridge')`.
   - Windows: keep the current `path.join(os.homedir(), 'Bridge')` default.
3. Update the README's install instructions with platform-specific commands.
4. Update `.github/workflows/ci.yml` to add `ubuntu-latest` and `macos-latest` runners to the matrix (currently `ubuntu-latest` only, which catches Linux portability bugs even though we target Windows).
5. Add tests for any new platform-detection logic.

If any of those steps surface a real bug, that's exactly the bug we want to catch — file an issue with the platform and stack trace before patching.

## Pull request checklist

Before opening a PR, please confirm:

- [ ] `npm test` passes locally.
- [ ] `npm run typecheck` passes locally.
- [ ] You added or updated tests for any new behavior.
- [ ] You haven't committed personal paths, credentials, or your own `.env`.
- [ ] You added an entry under `## [Unreleased]` in `CHANGELOG.md` describing the change.
- [ ] If the change affects the public surface (MCP tools, config vars, install steps), the README is updated to match.
