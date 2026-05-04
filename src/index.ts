import express from 'express';
import { randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createBridgeMcpServer } from './mcp/server.js';
import { loadConfig } from './config.js';

loadDotenv();

// ─── Config ──────────────────────────────────────────────────────────────────

const config = loadConfig();
const { port: PORT, logLevel: LOG_LEVEL, projectRoot: PROJECT_ROOT, dataDir: DATA_DIR, projectPaths: PROJECT_PATHS } = config;

// ─── MCP server factory ──────────────────────────────────────────────────────
// McpServer only supports one transport at a time, so we create a fresh
// instance per session instead of sharing a singleton.

function buildMcpServer() {
  return createBridgeMcpServer({
    storageConfig: {
      dataDir: DATA_DIR,
      projectName: '', // Will be provided per-request
    },
    projectRoot: PROJECT_ROOT,
    projectPaths: PROJECT_PATHS,
  });
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check (also useful for "is the daemon running" checks)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    project_root: PROJECT_ROOT,
    data_dir: DATA_DIR,
    pid: process.pid,
  });
});

// ─── MCP endpoint (Streamable HTTP transport) ────────────────────────────────
//
// The MCP SDK creates a transport per-session. Sessions are tracked by
// the `mcp-session-id` header. The first POST without a session ID creates
// a new session; subsequent requests must include the ID.

const transports = new Map<string, StreamableHTTPServerTransport>();

app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    // New session
    const newSessionId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid) => {
        transports.set(sid, transport!);
        if (LOG_LEVEL !== 'error') {
          console.log(`[bridge] mcp session opened: ${sid}`);
        }
      },
    });
    transport.onclose = () => {
      const sid = transport!.sessionId;
      if (sid) {
        transports.delete(sid);
        if (LOG_LEVEL !== 'error') {
          console.log(`[bridge] mcp session closed: ${sid}`);
        }
      }
    };
    // Fresh server per session — McpServer can only be connected to one transport.
    const sessionServer = buildMcpServer();
    await sessionServer.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// ─── Start server ────────────────────────────────────────────────────────────

const httpServer = app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  bridge — daemon online`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Root:       ${PROJECT_ROOT}`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  MCP:        http://localhost:${PORT}/mcp`);
  console.log(`  Health:     http://localhost:${PORT}/health`);
  console.log(`  Storage:    ${DATA_DIR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Press Ctrl+C to stop.');
  console.log('');
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(reason: string): Promise<void> {
  console.log(`\n[bridge] shutting down (${reason})...`);
  httpServer.close();
  for (const [sid, t] of transports) {
    try {
      await t.close();
    } catch {
      /* ignore */
    }
    transports.delete(sid);
  }
  console.log('[bridge] goodbye');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('sigint'));
process.on('SIGTERM', () => void shutdown('sigterm'));