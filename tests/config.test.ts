import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig, platformDataDir, _resetDeprecationWarnedForTests } from '../src/config.js';

const ALL_KEYS = [
  'BRIDGE_DATA_DIR',
  'BRIDGE_DRIVE_DIR',
  'BRIDGE_PORT',
  'BRIDGE_PROJECT_ROOT',
  'BRIDGE_PROJECT_PATHS',
  'LOG_LEVEL',
] as const;

describe('config', () => {
  let snapshot: Record<string, string | undefined>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Snapshot then clear all bridge env vars so tests start from a clean slate.
    snapshot = {};
    for (const key of ALL_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
    _resetDeprecationWarnedForTests();
    // Capture stderr to verify warnings without polluting test output.
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of ALL_KEYS) {
      if (snapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = snapshot[key];
      }
    }
    stderrSpy.mockRestore();
  });

  it('returns defaults when no env vars are set', () => {
    const cfg = loadConfig();
    expect(cfg.dataDir).toBe(platformDataDir());
    expect(cfg.port).toBe(7777);
    expect(cfg.projectRoot).toBe(process.cwd());
    expect(cfg.projectPaths).toEqual({});
    expect(cfg.logLevel).toBe('info');
    // No deprecation warning when nothing is set.
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('BRIDGE_DATA_DIR overrides the default', () => {
    process.env.BRIDGE_DATA_DIR = '/custom/data/dir';
    const cfg = loadConfig();
    expect(cfg.dataDir).toBe('/custom/data/dir');
    // No deprecation warning — user is on the new name.
    const calls = stderrSpy.mock.calls.map(c => c.join(' '));
    expect(calls.find(c => c.includes('deprecated'))).toBeUndefined();
  });

  it('BRIDGE_DRIVE_DIR (deprecated) is read as fallback and emits a deprecation warning', () => {
    process.env.BRIDGE_DRIVE_DIR = '/legacy/drive/dir';
    const cfg = loadConfig();
    expect(cfg.dataDir).toBe('/legacy/drive/dir');
    // Warning fired once.
    const calls = stderrSpy.mock.calls.map(c => c.join(' '));
    expect(calls.find(c => c.includes('BRIDGE_DRIVE_DIR is deprecated'))).toBeDefined();
  });

  it('BRIDGE_DATA_DIR takes precedence over BRIDGE_DRIVE_DIR (no warning)', () => {
    process.env.BRIDGE_DATA_DIR = '/new/dir';
    process.env.BRIDGE_DRIVE_DIR = '/old/dir';
    const cfg = loadConfig();
    expect(cfg.dataDir).toBe('/new/dir');
    // No deprecation warning — user has migrated, the legacy var is just sitting there.
    const calls = stderrSpy.mock.calls.map(c => c.join(' '));
    expect(calls.find(c => c.includes('deprecated'))).toBeUndefined();
  });

  it('malformed BRIDGE_PROJECT_PATHS JSON falls back to {} without throwing', () => {
    process.env.BRIDGE_PROJECT_PATHS = 'not-valid-json{';
    let cfg: ReturnType<typeof loadConfig> | undefined;
    expect(() => { cfg = loadConfig(); }).not.toThrow();
    expect(cfg!.projectPaths).toEqual({});
    // A warning should have fired.
    const calls = stderrSpy.mock.calls.map(c => c.join(' '));
    expect(calls.find(c => c.includes('BRIDGE_PROJECT_PATHS'))).toBeDefined();
  });

  it('valid BRIDGE_PROJECT_PATHS JSON is parsed correctly', () => {
    process.env.BRIDGE_PROJECT_PATHS = '{"foo":"/abs/foo","bar":"/abs/bar"}';
    const cfg = loadConfig();
    expect(cfg.projectPaths).toEqual({ foo: '/abs/foo', bar: '/abs/bar' });
  });
});

describe('platformDataDir', () => {
  it('returns ~/Library/Application Support/bridge on darwin', () => {
    expect(platformDataDir('darwin', '/Users/alice')).toBe(
      '/Users/alice/Library/Application Support/bridge',
    );
  });

  it('returns ~/Bridge on win32', () => {
    expect(platformDataDir('win32', 'C:\\Users\\alice')).toBe(
      path.join('C:\\Users\\alice', 'Bridge'),
    );
  });

  it('uses XDG_DATA_HOME when set on linux', () => {
    expect(platformDataDir('linux', '/home/alice', '/custom/xdg')).toBe(
      '/custom/xdg/bridge',
    );
  });

  it('falls back to ~/.local/share/bridge on linux when XDG_DATA_HOME is unset', () => {
    expect(platformDataDir('linux', '/home/alice', undefined)).toBe(
      '/home/alice/.local/share/bridge',
    );
  });
});
