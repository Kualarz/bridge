import * as os from 'node:os';
import * as path from 'node:path';

export const ENV_DATA_DIR = 'BRIDGE_DATA_DIR';
export const ENV_DRIVE_DIR_DEPRECATED = 'BRIDGE_DRIVE_DIR';
export const ENV_PORT = 'BRIDGE_PORT';
export const ENV_PROJECT_ROOT = 'BRIDGE_PROJECT_ROOT';
export const ENV_PROJECT_PATHS = 'BRIDGE_PROJECT_PATHS';
export const ENV_LOG_LEVEL = 'LOG_LEVEL';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
const VALID_LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];
const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_PORT = 7777;

export interface BridgeConfig {
  dataDir: string;
  port: number;
  projectRoot: string;
  projectPaths: Record<string, string>;
  logLevel: LogLevel;
}

let deprecationWarned = false;

/**
 * Returns the idiomatic per-user data directory for bridge on the given platform.
 * Accepts explicit arguments so callers can test any platform without monkey-patching globals.
 */
export function platformDataDir(
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
  xdgDataHome: string | undefined = process.env.XDG_DATA_HOME,
): string {
  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'bridge');
    case 'win32':
      return path.join(home, 'Bridge');
    default:
      return path.join(xdgDataHome ?? path.join(home, '.local', 'share'), 'bridge');
  }
}

export function loadConfig(): BridgeConfig {
  return {
    dataDir: resolveDataDir(),
    port: resolvePort(),
    projectRoot: process.env[ENV_PROJECT_ROOT] ?? process.cwd(),
    projectPaths: resolveProjectPaths(),
    logLevel: resolveLogLevel(),
  };
}

function resolveDataDir(): string {
  const dataDirEnv = process.env[ENV_DATA_DIR];
  if (dataDirEnv) return dataDirEnv;

  const driveDirEnv = process.env[ENV_DRIVE_DIR_DEPRECATED];
  if (driveDirEnv) {
    if (!deprecationWarned) {
      console.error(
        `[bridge] ${ENV_DRIVE_DIR_DEPRECATED} is deprecated, please rename to ${ENV_DATA_DIR} in your .env`,
      );
      deprecationWarned = true;
    }
    return driveDirEnv;
  }

  return platformDataDir();
}

function resolvePort(): number {
  const raw = process.env[ENV_PORT];
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    console.error(`[bridge] ${ENV_PORT}="${raw}" is not a valid number, falling back to ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return parsed;
}

function resolveProjectPaths(): Record<string, string> {
  const raw = process.env[ENV_PROJECT_PATHS];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    console.error(`[bridge] ${ENV_PROJECT_PATHS} is not a JSON object, falling back to {}`);
    return {};
  } catch (err) {
    console.error(`[bridge] failed to parse ${ENV_PROJECT_PATHS}:`, (err as Error).message);
    return {};
  }
}

function resolveLogLevel(): LogLevel {
  const raw = process.env[ENV_LOG_LEVEL];
  if (!raw) return DEFAULT_LOG_LEVEL;
  if ((VALID_LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }
  console.error(`[bridge] ${ENV_LOG_LEVEL}="${raw}" is invalid, falling back to ${DEFAULT_LOG_LEVEL}`);
  return DEFAULT_LOG_LEVEL;
}

// Test helper: reset the once-per-process deprecation flag so multiple tests
// can exercise the deprecation path without spawning a new process.
export function _resetDeprecationWarnedForTests(): void {
  deprecationWarned = false;
}
