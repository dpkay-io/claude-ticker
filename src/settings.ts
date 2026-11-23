import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join }    from 'path';
import { homedir } from 'os';
import type { Config } from './fields.js';

export const CLAUDE_DIR    = join(homedir(), '.claude');
export const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
export const BACKUP_PATH   = join(CLAUDE_DIR, 'settings.json.bak');
export const COMMAND       = 'claude-ticker';

export type JsonObj = Record<string, unknown>;

/** The field whose presence makes Claude Code's own `-- INSERT --` indicator redundant. */
const VIM_FIELD = 'vim';

export const MANAGED_KEYS = ['refreshInterval', 'padding', 'hideVimModeIndicator'] as const;
export type ManagedKey = typeof MANAGED_KEYS[number];

/**
 * statusLine options claude-ticker manages, derived from its config.
 * A value of `undefined` means "leave the key out".
 */
function managedOptions(cfg: Config): Record<ManagedKey, unknown> {
  return {
    refreshInterval:      cfg.refreshInterval > 0 ? cfg.refreshInterval : undefined,
    padding:              cfg.padding > 0 ? cfg.padding : undefined,
    hideVimModeIndicator: cfg.fields.includes(VIM_FIELD as Config['fields'][number]) ? true : undefined,
  };
}

export type SyncMode =
  /** Config is the source of truth: set, change or remove every managed key. */
  | 'overwrite'
  /** Only add managed keys that are missing; never change what the user already has. */
  | 'fill';

/**
 * Builds the claude-ticker statusLine, keeping any keys it doesn't manage.
 * `keys` limits which managed options are applied, so a command only changes
 * the option it is about and never resets one the user set by hand.
 */
export function buildStatusLine(
  cfg: Config,
  existing: JsonObj = {},
  mode: SyncMode = 'overwrite',
  keys: readonly ManagedKey[] = MANAGED_KEYS,
): JsonObj {
  const result: JsonObj = { ...existing, type: 'command', command: COMMAND };
  const options = managedOptions(cfg);
  for (const key of keys) {
    const value = options[key];
    if (mode === 'fill' && key in existing) continue;
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}

export function isOurStatusLine(statusLine: unknown): boolean {
  return !!statusLine && typeof statusLine === 'object' && (statusLine as JsonObj).command === COMMAND;
}

export type ReadResult =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'ok'; settings: JsonObj };

export function readSettings(): ReadResult {
  if (!existsSync(SETTINGS_PATH)) return { kind: 'missing' };
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' };
    return { kind: 'ok', settings: parsed as JsonObj };
  } catch {
    return { kind: 'invalid' };
  }
}

export function writeSettings(settings: JsonObj): void {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

export type SyncResult = 'updated' | 'unchanged' | 'not-ours' | 'missing' | 'invalid';

/**
 * Re-applies claude-ticker's statusLine options to settings.json, but only when
 * the statusLine already points at claude-ticker. Never takes over another tool's
 * status line and never creates settings.json.
 */
export function syncStatusLine(
  cfg: Config,
  mode: SyncMode = 'overwrite',
  keys: readonly ManagedKey[] = MANAGED_KEYS,
): SyncResult {
  const read = readSettings();
  if (read.kind !== 'ok') return read.kind;
  const current = read.settings.statusLine;
  if (!isOurStatusLine(current)) return 'not-ours';
  const next = buildStatusLine(cfg, current as JsonObj, mode, keys);
  if (JSON.stringify(next) === JSON.stringify(current)) return 'unchanged';
  writeSettings({ ...read.settings, statusLine: next });
  return 'updated';
}

/** claude-ticker's statusLine from settings.json, or null if absent or another tool's. */
export function ourStatusLine(): JsonObj | null {
  const read = readSettings();
  if (read.kind !== 'ok' || !isOurStatusLine(read.settings.statusLine)) return null;
  return read.settings.statusLine as JsonObj;
}
