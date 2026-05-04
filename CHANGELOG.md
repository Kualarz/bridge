# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Kualarz/bridge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Kualarz/bridge/releases/tag/v0.1.0
