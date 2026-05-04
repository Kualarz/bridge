/**
 * Bridge stdio entrypoint — for Claude Desktop's local MCP config.
 *
 * Unlike src/index.ts (which runs as a long-lived HTTP daemon),
 * this entrypoint is spawned as a child process by Claude Desktop.
 * It talks to Desktop over stdin/stdout using the MCP stdio transport.
 *
 * The project root is determined by the BRIDGE_PROJECT_ROOT env var,
 * which Claude Desktop sets via the "env" section in its MCP config.
 * If unset, falls back to process.cwd().
 *
 * IMPORTANT: never write to console.log here — stdout is the MCP transport.
 * Use console.error for any diagnostic logging.
 */

import * as path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridgeMcpServer } from './mcp/server.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { dataDir: DATA_DIR, projectRoot: PROJECT_ROOT, projectPaths: PROJECT_PATHS } = config;
const PROJECT_NAME = path.basename(PROJECT_ROOT);

console.error(`[bridge:stdio] project=${PROJECT_NAME} data=${DATA_DIR} pid=${process.pid}`);

const mcpServer = createBridgeMcpServer({
  storageConfig: {
    dataDir: DATA_DIR,
    projectName: PROJECT_NAME,
  },
  projectRoot: PROJECT_ROOT,
  projectPaths: PROJECT_PATHS,
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('[bridge:stdio] connected to Claude Desktop');
}

async function shutdown(reason: string): Promise<void> {
  console.error(`[bridge:stdio] shutting down (${reason})`);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('sigint'));
process.on('SIGTERM', () => void shutdown('sigterm'));
process.on('disconnect', () => void shutdown('disconnect'));

main().catch((err) => {
  console.error('[bridge:stdio] fatal:', err);
  process.exit(1);
});