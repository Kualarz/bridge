# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-17

### Added
- macOS and Linux support: `src/config.ts` now picks a platform-appropriate data directory — `~/Library/Application Support/bridge` on macOS, `$XDG_DATA_HOME/bridge` (falling back to `~/.local/share/bridge`) on Linux, and `~/Bridge` on Windows.
- Exported `platformDataDir(platform, home, xdgDataHome?)` helper for testable platform detection without process mutation.
- CI matrix now runs on `macos-latest` in addition to `ubuntu-latest` across Node 20 and 22.
- Tests for all three platform branches of `platformDataDir`.

### Changed
- README updated with cross-platform install instructions, Mac and Linux path examples, and platform-specific troubleshooting commands.
- INSTALL.md updated with a macOS step-by-step section (Homebrew → node/git → clone → build → run); Windows section retitled for clarity.
- `.env.example` updated with platform-conditional path examples.

> **Testing note:** macOS has been manually verified. Linux path logic is covered by the new unit tests and the `ubuntu-latest` CI runner, but has not been tested end-to-end on a real Linux machine. If you run into issues on Linux, please open an issue.

## [0.1.0] - 2026-05-04

### Added
- Five MCP tools: `bridge_send_brief`, `bridge_list_pending`, `bridge_read_brief`, `bridge_save_result`, `bridge_review`
- Markdown-file storage backend (inbox/, done/, results/ folders under `BRIDGE_DATA_DIR`)
- YAML frontmatter on all stored entries for structured metadata
- `bridge_review` path traversal protection via `safeResolve`
- `bridge_review` oversized-file guard (500 KB cap) and directory-path detection
- `bridge_review` `extra_files` parameter for reading files beyond `files_changed`
- Stdio entrypoint (`src/mcp-stdio.ts`) for Claude Desktop integration
- HTTP daemon (`src/index.ts`) with per-session MCP server isolation
- `src/config.ts` — single source of truth for all `BRIDGE_*` env vars
- Deprecation shim: `BRIDGE_DRIVE_DIR` → `BRIDGE_DATA_DIR`
- Vitest test suite (31 tests) using `InMemoryTransport` — no real I/O required
- Claude Code skill (`claude-skill/bridge/SKILL.md`) for automated brief pickup
- Cross-platform data directory default (`~/Bridge`)

[0.2.0]: https://github.com/Kualarz/bridge/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Kualarz/bridge/releases/tag/v0.1.0
