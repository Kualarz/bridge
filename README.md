# Bridge

[![CI](https://github.com/Kualarz/bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/Kualarz/bridge/actions/workflows/ci.yml)

> Hand off tasks from Claude.ai chat to Claude Code, automatically.

Claude.ai chat is great for thinking and planning. Claude Code is great for executing — editing files, running tests, applying fixes. The trouble is the seam between them: every time you finish a chat conversation and want Code to do the work, you copy-paste decisions, reformat them into instructions, lose nuance, and re-explain context the chat already understood. The handoff is tedious enough that people just stop doing it.

Bridge fixes that. Chat sends a structured *brief* — what was decided, the acceptance criteria, the files likely touched, the options that were rejected and why — through an MCP tool call. Code picks the brief up at session start, reads it, does the work, and reports back through another MCP tool call. The whole loop is automatic once you set it up: no copy-pasting, no reformatting, no lost context.

## How it works

Bridge is a tiny local daemon that exposes five MCP tools and stores everything as plain markdown files in a folder you choose. There is no database, no cloud service, no opaque state — just files you can read with any text editor.

```
┌──────────────┐                                          ┌──────────────────┐
│ Claude chat  │                                          │  Claude Code     │
│ (web/Desktop)│                                          │  (CLI session)   │
└──────┬───────┘                                          └────────┬─────────┘
       │ bridge_send_brief                                         │
       ▼                                                           │
┌──────────────────────────────────────────────────────────────────┴───────┐
│                            bridge daemon                                 │
│                          (localhost:7777)                                │
└──────┬───────────────────────────────────────────────────────────────┬───┘
       │ writes                                                writes  │
       ▼                                                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│   <BRIDGE_DATA_DIR>/<project>/                                           │
│   ├── inbox/    pending briefs (chat → Code)                             │
│   ├── results/  results from Code                                        │
│   └── done/     processed briefs, kept as history                        │
└──────────────────────────────────────────────────────────────────────────┘
                  ▲                                  ▲
                  │ bridge_read_brief                │ bridge_review
                  │ bridge_save_result               │
                  └──────── Claude Code ────────  Claude chat ────────────
```

Chat calls `bridge_send_brief` to drop a markdown file into `inbox/`. Code calls `bridge_list_pending` at session start, sees what's waiting, and reads the brief with `bridge_read_brief`. After doing the work, Code calls `bridge_save_result`, which writes a result file to `results/` and atomically moves the brief from `inbox/` to `done/`. Chat can then call `bridge_review` to read both the result summary and the actual files Code modified.

## Requirements

- **Node.js 20 or newer** (tested on 20 and 22).
- **npm** (bundled with Node).
- **A Tailscale account** (the free tier works for personal use).
- **Windows 10 or 11.** Mac and Linux are not yet officially supported, but contributions are very welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

> **Why Tailscale?** Bridge runs as a local HTTP daemon on `localhost:7777`. For the chat-to-Code workflow, both Claude.ai (web/mobile) and Claude Desktop need a public HTTPS endpoint to reach the daemon — they cannot connect to your machine's localhost directly. Tailscale Funnel gives you a stable HTTPS URL routed to your PC. **If you only use Claude Code locally on the same machine, you can run bridge in stdio mode and skip Tailscale entirely** — see the [Local-only mode](#local-only-mode-no-tailscale) footnote at the bottom.

## Quick start

New to npm or terminals? See [INSTALL.md](./INSTALL.md) for a step-by-step walkthrough that assumes nothing.

1. **Clone the repo.**

   ```bash
   git clone https://github.com/Kualarz/bridge.git
   cd bridge
   ```

2. **Install dependencies.**

   ```bash
   npm install
   ```

3. **Copy the env template.**

   ```bash
   cp .env.example .env
   ```

   You don't need to edit `.env` — every value has a sensible default. Open it if you want to point bridge at a cloud-synced folder for cross-device access (see [Storage choice](#storage-choice) below).

4. **Build the TypeScript.**

   ```bash
   npm run build
   ```

5. **Start the daemon.**

   ```bash
   npm start
   ```

   You should see:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     bridge — daemon online
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Root:       C:\Users\YourName\Documents\bridge
     Port:       7777
     MCP:        http://localhost:7777/mcp
     Health:     http://localhost:7777/health
     Storage:    C:\Users\YourName\Bridge
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Press Ctrl+C to stop.
   ```

6. **Verify it's working.** Open http://localhost:7777/health in a browser. You should see JSON like:

   ```json
   { "status": "ok", "project_root": "...", "data_dir": "...", "pid": 12345 }
   ```

That's the daemon. To use it from chat or Code, see [Connecting Claude clients](#connecting-claude-clients) below.

## Configuration

Bridge reads its configuration from environment variables. All have defaults — you can run with an empty `.env`. The authoritative source is [`src/config.ts`](./src/config.ts).

| Variable               | Default                                | Purpose                                                                                                              |
|------------------------|----------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `BRIDGE_DATA_DIR`      | `~/Bridge` (`%USERPROFILE%\Bridge`)    | Where briefs and results are stored. Point at a cloud-synced folder for multi-device sync.                          |
| `BRIDGE_PORT`          | `7777`                                 | TCP port the HTTP daemon listens on.                                                                                |
| `BRIDGE_PROJECT_ROOT`  | `process.cwd()`                        | Project root used by `bridge_review` when reading files. Mainly relevant for the stdio entrypoint.                  |
| `BRIDGE_PROJECT_PATHS` | `{}` (empty JSON object)               | Map of project name → absolute path. Lets `bridge_review` find files for projects other than the daemon's cwd.      |
| `LOG_LEVEL`            | `info`                                 | One of `error`, `warn`, `info`, `debug`.                                                                            |

> **Deprecated:** `BRIDGE_DRIVE_DIR` is the old name for `BRIDGE_DATA_DIR`. It still works, but emits a one-time deprecation warning to stderr. Please rename it in your `.env`.

### Storage choice

Bridge writes plain markdown files to whatever folder `BRIDGE_DATA_DIR` points at. The default is a local folder in your home directory — works out of the box, single-device only.

For multi-device access (e.g. plan briefs from chat on your phone, run Code on your PC), point `BRIDGE_DATA_DIR` at a cloud-synced folder. Google Drive, Dropbox, OneDrive, and iCloud all work. Bridge doesn't talk to those services directly — it just reads and writes files, and your cloud sync client handles propagation.

```bash
# Local-only (default — no setup needed)
# BRIDGE_DATA_DIR=C:\Users\YourName\Bridge

# Multi-device via Google Drive
# BRIDGE_DATA_DIR=G:\My Drive\bridge

# Multi-device via OneDrive
# BRIDGE_DATA_DIR=C:\Users\YourName\OneDrive\bridge
```

A complete `.env` for a typical multi-device setup looks like:

```bash
# Storage on Google Drive so chat (phone, web) and Code (PC) share the same folder
BRIDGE_DATA_DIR=G:\My Drive\bridge

# Two projects that bridge_review will read files for
BRIDGE_PROJECT_PATHS={"bridge":"C:\\Users\\YourName\\Documents\\bridge","my-app":"C:\\Users\\YourName\\Documents\\my-app"}

# Defaults for the rest
BRIDGE_PORT=7777
LOG_LEVEL=info
```

The first time bridge writes to a project, it auto-creates `<project>/inbox/`, `<project>/results/`, and `<project>/done/` under your `BRIDGE_DATA_DIR`. You don't need to pre-create any folders.

## Connecting Claude clients

Bridge speaks the Model Context Protocol over two transports: **HTTP** (the daemon) and **stdio** (for clients that spawn a child process). Different Claude clients prefer different transports.

### Claude Code (CLI)

Two options. Pick whichever fits your setup.

**Option A — local stdio (no Tailscale needed if Code runs on the same PC as bridge).**

Add a `bridge` entry to your Claude Code MCP config. The config lives at `~/.claude/claude.json` (Windows: `%USERPROFILE%\.claude\claude.json`).

```jsonc
{
  "mcpServers": {
    "bridge": {
      "command": "npm",
      "args": ["run", "bridge:stdio"],
      "cwd": "C:\\Users\\YourName\\Documents\\bridge",
      "env": {
        "BRIDGE_PROJECT_ROOT": "C:\\Users\\YourName\\Documents\\YourProject"
      }
    }
  }
}
```

`BRIDGE_PROJECT_ROOT` tells bridge which project's files `bridge_review` should read. Set it to the project you're working on, not the bridge repo itself.

**Option B — remote HTTP (Code on a different machine from bridge).**

Point Code at the Tailscale Funnel URL:

```jsonc
{
  "mcpServers": {
    "bridge": {
      "url": "https://YOUR-DEVICE.YOUR-TAILNET.ts.net/mcp"
    }
  }
}
```

See [Tailscale Funnel setup](#tailscale-funnel-setup) below for how to obtain that URL.

### Claude Desktop

Modern Claude Desktop builds (the "Nest-3p" generation) removed local-stdio MCP support. The only way to connect Desktop to bridge is via an HTTPS endpoint over Tailscale Funnel.

1. In Desktop, open **Settings → Developer → Edit Config**, or **Settings → MCP Servers**, depending on your Desktop version.
2. Add a new MCP server pointing at your Tailscale Funnel URL with `/mcp` appended:

   ```
   https://YOUR-DEVICE.YOUR-TAILNET.ts.net/mcp
   ```

3. Restart Desktop. The five bridge tools should appear in the MCP tools list at the start of any new conversation.

### Claude.ai (web and mobile)

The cloud-hosted version always needs a public HTTPS endpoint.

1. Go to **Settings → Connectors** in claude.ai.
2. Click **Add custom connector**.
3. Paste your Tailscale Funnel URL with `/mcp` appended:

   ```
   https://YOUR-DEVICE.YOUR-TAILNET.ts.net/mcp
   ```

4. Save. The connector becomes available in any new chat.

## Tailscale Funnel setup

Tailscale Funnel exposes a service running on your tailnet at a public HTTPS URL with no port forwarding, no DNS setup, and no certificate management. This is how Claude.ai and Claude Desktop reach the bridge daemon running on your PC.

1. **Create a Tailscale account.** Sign up at [tailscale.com](https://tailscale.com). The free tier is plenty for personal use.

2. **Install Tailscale on your PC** and log in. Confirm the machine appears in your tailnet at [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines).

3. **Enable Funnel on your tailnet.** In the admin console: **Settings → Feature previews → Funnel → Enable**. Then update your tailnet ACLs to grant your device the `funnel` capability:

   ```jsonc
   "nodeAttrs": [
     {
       "target": ["YOUR-DEVICE-NAME"],
       "attr":   ["funnel"]
     }
   ]
   ```

4. **Expose the bridge daemon.** With bridge running on port 7777:

   ```bash
   tailscale funnel 7777
   ```

   Tailscale prints the public URL — something like `https://YOUR-DEVICE.YOUR-TAILNET.ts.net`. The funnel persists across reboots once configured.

5. **Verify reachability.** Open `https://YOUR-DEVICE.YOUR-TAILNET.ts.net/health` in a browser. You should see the same JSON as `localhost:7777/health` — including `status: ok` and the daemon's PID.

6. **Use this URL** when configuring Claude.ai and Claude Desktop connectors above.

> Tailscale Funnel is rate-limited and intended for personal use, not production traffic. Tailscale's [Funnel docs](https://tailscale.com/kb/1223/funnel) cover ACLs, port options, and access controls in more detail.

You can confirm the funnel is wired up correctly with:

```bash
tailscale funnel status
```

Expected output:

```
# Funnel on:
#     - https://YOUR-DEVICE.YOUR-TAILNET.ts.net

https://YOUR-DEVICE.YOUR-TAILNET.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:7777
```

If the proxy line is missing, run `tailscale funnel 7777` again. If the URL is missing entirely, the ACL grant didn't take effect — re-check step 3.

## Installing the bridge skill

Bridge ships a Claude Code *skill* at [`claude-skill/bridge/SKILL.md`](./claude-skill/bridge/SKILL.md). Skills are short instruction files that tell Claude Code how to use a tool automatically — without the skill, Code can call bridge tools but won't take initiative (it'll wait for you to say "check the bridge inbox" every session). With the skill installed, Code calls `bridge_list_pending` at session start, reports what's waiting, and processes briefs on your go-ahead.

To install:

1. **Locate your Claude Code skills directory.**
   - Linux/Mac: `~/.claude/skills/`
   - Windows: `%USERPROFILE%\.claude\skills\`

2. **Copy the skill folder** from this repo into that directory:

   ```bash
   # Windows (from the bridge repo root)
   xcopy /E /I claude-skill\bridge "%USERPROFILE%\.claude\skills\bridge"
   ```

   The end state should be `~/.claude/skills/bridge/SKILL.md` containing the file's content. The folder name `bridge` matters — the skill identifies itself by directory name.

3. **Restart Claude Code.** The skill is now active for any project that uses bridge.

To confirm the skill is loaded, start a Claude Code session in any project and ask "what skills do you have?" — you should see `bridge` in the list. The first time you use bridge in a project, Code will call `bridge_list_pending` automatically and report what's waiting.

## Troubleshooting

### Schema cache mismatch after updating bridge

**Symptom:** `bridge_save_result` fails with a JSON Schema error mentioning `files_changed`, even though your client is sending a valid array.

**Cause:** Your Claude client (chat or Desktop) cached the MCP tool schema at session start. If you updated bridge mid-session, the client still thinks the old schema applies.

**Fix:** Start a fresh chat or restart Claude Desktop. The cache lives per-session.

### Cloudflare references in old docs

**Symptom:** You saw references to `cloudflared` or Cloudflare tunnels in earlier versions of this project, in old issues, or in external mentions.

**Cause:** An early build of bridge tried Cloudflare Tunnel as the public-endpoint transport before settling on Tailscale Funnel.

**Fix:** Ignore those references. Cloudflare is no longer involved. The current architecture is Tailscale-only.

### `bridge_review` says "no result found" but you definitely saved one

**Symptom:** You ran `bridge_save_result` successfully, but `bridge_review` for the same task ID returns `No result found`.

**Cause:** Most likely the `project` argument differs between the brief and the review call. Project names are case-sensitive and must match the folder name on disk exactly.

**Fix:** List the contents of `<BRIDGE_DATA_DIR>/<your-project>/results/` and confirm the folder name. Re-run `bridge_review` with the exact spelling.

### "McpServer can only be connected to one transport" error

**Symptom:** Connecting a second client (e.g. Desktop) after Code is already connected throws this error.

**Cause:** The `McpServer` SDK class only supports one transport per instance.

**Fix:** Bridge handles this by creating a fresh server instance per session in [`src/index.ts`](./src/index.ts). If you see this error, you're running an older build — run `npm run build` and restart the daemon.

### Port 7777 already in use

**Symptom:** `npm start` exits immediately or crashes with `EADDRINUSE`.

**Cause:** Another process (an orphan bridge instance, another local service, or a previous shell that you forgot about) is bound to port 7777.

**Fix on Windows:**
```powershell
# Find the PID
netstat -ano | findstr :7777
# Kill it (replace 12345 with the PID from above)
Stop-Process -Id 12345 -Force
```
Then run `npm start` again. If you'd rather change ports, set `BRIDGE_PORT=7778` (or any free port) in your `.env`.

### `.env` values aren't being picked up

**Symptom:** You set `BRIDGE_DATA_DIR` in `.env` but the daemon's banner shows the default path instead.

**Cause:** Either bridge wasn't started from the project root (so `.env` wasn't found), or the file is named wrong (e.g. `env.txt`, `.env.example`, `.ENV`).

**Fix:** Confirm `.env` exists in the bridge project root with that exact filename. Run `npm start` from that directory, not from a subfolder. If you're using `npm run bridge:stdio` from Claude Desktop's MCP config, also set `cwd` in the config to the bridge repo root, otherwise `.env` won't be found.

### Claude.ai connector can't reach the bridge URL

**Symptom:** Adding the Tailscale Funnel URL as a custom connector in Claude.ai fails with "couldn't connect to MCP server".

**Cause:** Either Funnel isn't enabled on your tailnet, the daemon isn't running, or the URL has a typo.

**Fix:** Visit `https://YOUR-DEVICE.YOUR-TAILNET.ts.net/health` in a browser. If that doesn't return JSON, the public endpoint isn't reachable, and the connector won't work either. Confirm `tailscale funnel status` shows port 7777 mapped, and `npm start` is running.

## FAQ

**Q: Do I need Tailscale if I only use Claude Code on my own PC?**

A: No. Use stdio mode (`npm run bridge:stdio`) and skip the Tailscale section. See [Local-only mode](#local-only-mode-no-tailscale) at the bottom.

**Q: Does bridge store anything in the cloud?**

A: No. Bridge writes plain markdown files to a folder you choose. If you point `BRIDGE_DATA_DIR` at a Google Drive folder, your files sync to Drive — but that's the Drive client doing it, not bridge.

**Q: Can I use bridge with multiple Claude clients at once (chat + Desktop + Code)?**

A: Yes. The HTTP daemon supports multiple concurrent MCP sessions; each client gets its own session ID, and bridge spins up a fresh server instance per session.

**Q: Is bridge safe to expose via Tailscale Funnel?**

A: Tailscale Funnel exposes whatever you point it at to the public internet. Bridge has no authentication of its own — anyone who knows your Funnel URL can call the MCP tools. In practice the URL is unguessable (it's tied to your tailnet name), but you should still treat the Funnel URL as a secret and not paste it into public places. If you want stricter access control, run bridge in [Local-only mode](#local-only-mode-no-tailscale) instead.

**Q: What happens if bridge crashes mid-task?**

A: Briefs and results are written to disk before any tool call returns success. A crash mid-write is the only failure mode that loses data, and it's very rare because each write is a single small markdown file. If `bridge_save_result` returns success, the result is durable. If it doesn't return at all, retry the call — bridge auto-disambiguates filenames so duplicate retries don't overwrite earlier results.

**Q: Can I read or edit the brief and result markdown files directly?**

A: Yes — that's the point. The files are plain markdown with YAML frontmatter, and bridge re-reads them on every tool call. If you want to manually edit a brief in your editor before Code processes it, do it. Don't edit files in `done/` though — those are historical records.

## Roadmap

These are directions, not promises:

- **Mac and Linux support.** Currently Windows-focused; cross-platform contributions are the highest-value area — see [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Brief and result archival.** Auto-clean old `done/` and `results/` files after a configurable retention period.
- **Per-project skill auto-install.** Make `npm start` notice when it's running in a project that doesn't have the bridge skill installed and prompt to install it.

## Contributing

Bridge is open to contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow. The codebase has 31 tests covering the core surface — please add tests for any new behavior. **Cross-platform support (Mac, Linux) is the highest-value contribution area right now.**

## License

MIT — see [LICENSE](./LICENSE).

---

### Local-only mode (no Tailscale)

If you only use Claude Code on the same machine as bridge, you can skip Tailscale entirely. Run `npm run bridge:stdio` and configure Claude Code to spawn it directly via the stdio transport (see [Option A](#claude-code-cli) under the Code connection guide above). You lose cross-device chat-to-code handoff, but everything else works. This is the leanest setup for solo developers — no public endpoint, no ACLs, no funnel.
