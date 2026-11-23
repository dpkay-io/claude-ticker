import { tmpdir } from 'os';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig }  from './config.js';
import type { Config, FieldName, JsonObj } from './fields.js';
import { FIELD_REGISTRY } from './fields.js';
import { COLOR_CODES, colorToFgCode } from './types.js';

function dynamicColor(pct: number, cfg: Config): string {
  if (pct >= cfg.thresholds.critical) return COLOR_CODES.red;
  if (pct >= cfg.thresholds.warning)  return COLOR_CODES.yellow;
  return COLOR_CODES.green;
}

function resolveColor(field: FieldName, pct: number | null, cfg: Config): string {
  const c = cfg.colors[field] ?? FIELD_REGISTRY[field].defaultColor;
  if (c === 'dynamic' && pct !== null) return dynamicColor(pct, cfg);
  return colorToFgCode(c);
}

// ── state cache ──────────────────────────────────────────────────────────────
//
// Claude Code sometimes sends a payload that is missing data it sent a moment
// ago (e.g. `rate_limits` and `prompt_cache` are absent until the first API
// response after a resume). The cache backfills those gaps so the bar doesn't
// flicker. Each key is backfilled only for `staleTTL` after Claude Code last
// actually sent it, so data that has really gone away disappears.

/**
 * Keys whose absence is meaningful, so they are never backfilled:
 * `pr` goes away when the PR merges or closes, `vim` when vim mode is turned off,
 * `agent` / `worktree` when the session leaves them, `effort` when the model
 * doesn't support it.
 */
const NON_STICKY_KEYS = new Set(['pr', 'vim', 'agent', 'worktree', 'effort']);

/** Keys whose sub-objects arrive and expire independently (each rate-limit window). */
const PARTIAL_KEYS = new Set(['rate_limits']);

export type SeenMap = Record<string, number>;
export interface StateCache { data: JsonObj; seen: SeenMap; ts: number }

function isObj(v: unknown): v is JsonObj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function stateCachePath(sessionId: string): string {
  return join(tmpdir(), `claude-ticker-state-${sessionId}.json`);
}

function readStateCache(sessionId: string): StateCache | null {
  try {
    const parsed = JSON.parse(readFileSync(stateCachePath(sessionId), 'utf8')) as Partial<StateCache>;
    if (!isObj(parsed.data) || typeof parsed.ts !== 'number') return null;
    return { data: parsed.data, seen: isObj(parsed.seen) ? parsed.seen as SeenMap : {}, ts: parsed.ts };
  } catch { /* miss */ }
  return null;
}

function writeStateCache(sessionId: string, state: StateCache): void {
  try { writeFileSync(stateCachePath(sessionId), JSON.stringify(state), 'utf8'); } catch { /* ignore */ }
}

/**
 * Merges the cached state into the current payload. The current payload always
 * wins; a key missing from it is taken from the cache only if Claude Code sent
 * it within `ttlMs`. Caches written before per-key tracking count every key as
 * last seen at the cache's own timestamp.
 */
export function mergeState(cache: StateCache | null, current: JsonObj, nowMs: number, ttlMs: number): StateCache {
  const data: JsonObj = { ...current };
  const seen: SeenMap = {};
  const lastSeen = (key: string) => cache?.seen[key] ?? cache?.ts ?? 0;
  const fresh = (key: string) => nowMs - lastSeen(key) < ttlMs;

  for (const key of Object.keys(current)) {
    seen[key] = nowMs;
    if (PARTIAL_KEYS.has(key) && isObj(current[key])) {
      for (const sub of Object.keys(current[key] as JsonObj)) seen[`${key}.${sub}`] = nowMs;
    }
  }

  if (!cache) return { data, seen, ts: nowMs };

  for (const [key, cachedValue] of Object.entries(cache.data)) {
    if (NON_STICKY_KEYS.has(key)) continue;

    if (PARTIAL_KEYS.has(key) && isObj(cachedValue)) {
      const merged: JsonObj = isObj(data[key]) ? { ...(data[key] as JsonObj) } : {};
      for (const [sub, subValue] of Object.entries(cachedValue)) {
        const path = `${key}.${sub}`;
        if (sub in merged || !fresh(path)) continue;
        merged[sub] = subValue;
        seen[path] = lastSeen(path);
      }
      if (Object.keys(merged).length > 0) {
        data[key] = merged;
        seen[key] ??= lastSeen(key);
      }
      continue;
    }

    if (key in data || !fresh(key)) continue;
    data[key] = cachedValue;
    seen[key] = lastSeen(key);
  }

  return { data, seen, ts: nowMs };
}

/**
 * Drops rate-limit windows whose `resets_at` has passed. Claude Code does the
 * same, so a backfilled window never outlives its reset.
 */
export function pruneExpiredWindows(data: JsonObj, nowSec: number): JsonObj {
  const limits = data.rate_limits;
  if (!isObj(limits)) return data;
  const kept: JsonObj = {};
  for (const [name, window] of Object.entries(limits)) {
    const resetsAt = isObj(window) ? window.resets_at : undefined;
    if (typeof resetsAt === 'number' && resetsAt <= nowSec) continue;
    kept[name] = window;
  }
  const result = { ...data };
  if (Object.keys(kept).length > 0) result.rate_limits = kept;
  else delete result.rate_limits;
  return result;
}

// ── layout ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_SEQUENCE = /\x1b\[[0-9;]*m|\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Printed width of a string: escape sequences (colors, OSC 8 links) take no space. */
export function visibleWidth(s: string): number {
  return [...s.replace(ANSI_SEQUENCE, '')].length;
}

/**
 * Joins one line's parts, dropping trailing parts until the line fits
 * `maxWidth`. Field order is the priority order. The first part is always
 * kept, so Claude Code's own truncation handles a single very long field.
 */
export function fitLine(parts: string[], separator: string, maxWidth: number | null): string {
  if (maxWidth == null) return parts.join(separator);
  const sepWidth = visibleWidth(separator);
  let width = 0;
  let count = 0;
  for (const part of parts) {
    const next = width + (count > 0 ? sepWidth : 0) + visibleWidth(part);
    if (count > 0 && next > maxWidth) break;
    width = next;
    count++;
  }
  return parts.slice(0, count).join(separator);
}

/**
 * Width available to the status line, from the `COLUMNS` value Claude Code sets
 * before running the command, minus the configured padding. `null` when unknown.
 */
export function availableWidth(columns: string | undefined, cfg: Config): number | null {
  const n = columns ? parseInt(columns, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, n - cfg.padding);
}

export function renderStatus(data: JsonObj, cfg?: Config, maxWidth: number | null = null): string {
  const c = cfg ?? loadConfig();
  const opts = { timeFormat: c.timeFormat, dirColors: c.dirColors, dirNames: c.dirNames };
  const lines: string[][] = [[]];

  for (const field of c.fields) {
    const def = FIELD_REGISTRY[field];
    if (!def) continue;
    if ('lineBreak' in def && def.lineBreak) {
      lines.push([]);
      continue;
    }
    const raw  = def.extract(data);
    const pct  = def.percentValue?.(raw) ?? null;
    const col  = resolveColor(field, pct, c);
    const text = def.render(raw, col, opts);
    if (text) lines[lines.length - 1].push(text);
  }

  return lines
    .filter((parts) => parts.length > 0)
    .map((parts) => fitLine(parts, c.separator, maxWidth))
    .join('\n');
}

export async function render(): Promise<void> {
  if (process.stdin.isTTY) {
    console.log('claude-ticker is a status bar hook for Claude CLI.\n');
    console.log('Previewing your current configuration:');
    const { preview } = await import('./commands.js');
    preview();
    console.log('\nRun `claude-ticker --help` for full usage and commands.');
    return;
  }
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk as string;
  let data: JsonObj;
  try {
    data = JSON.parse(raw) as JsonObj;
  } catch {
    process.stdout.write('\x1b[2m\x1b[91m[claude-ticker: parse error]\x1b[0m\n');
    return;
  }

  const cfg = loadConfig();
  const sessionId = (typeof data.session_id === 'string' ? data.session_id : null) ?? 'default';
  const nowMs = Date.now();
  const state = mergeState(readStateCache(sessionId), data, nowMs, cfg.staleTTL * 1000);
  writeStateCache(sessionId, state);

  const view = pruneExpiredWindows(state.data, nowMs / 1000);
  process.stdout.write(renderStatus(view, cfg, availableWidth(process.env.COLUMNS, cfg)));
}
