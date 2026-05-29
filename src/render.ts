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

function stateCachePath(sessionId: string): string {
  return join(tmpdir(), `claude-ticker-state-${sessionId}.json`);
}

function readStateCache(sessionId: string, ttlMs: number): JsonObj | null {
  try {
    const { data, ts } = JSON.parse(readFileSync(stateCachePath(sessionId), 'utf8')) as { data: JsonObj; ts: number };
    if (Date.now() - ts < ttlMs) return data;
  } catch { /* miss */ }
  return null;
}

function writeStateCache(sessionId: string, data: JsonObj): void {
  try { writeFileSync(stateCachePath(sessionId), JSON.stringify({ data, ts: Date.now() }), 'utf8'); } catch { /* ignore */ }
}

export function deepMerge(cached: JsonObj, current: JsonObj): JsonObj {
  const result = { ...cached };
  for (const [key, value] of Object.entries(current)) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = { ...(result[key] as JsonObj), ...(value as JsonObj) };
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function renderStatus(data: JsonObj, cfg?: Config): string {
  const c = cfg ?? loadConfig();
  const parts: string[] = [];

  for (const field of c.fields) {
    const def = FIELD_REGISTRY[field];
    if (!def) continue;
    const raw  = def.extract(data);
    const pct  = def.percentValue?.(raw) ?? null;
    const col  = resolveColor(field, pct, c);
    const text = def.render(raw, col, { timeFormat: c.timeFormat, dirColors: c.dirColors, dirNames: c.dirNames });
    if (text) parts.push(text);
  }

  return parts.join(c.separator);
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
  const cached = readStateCache(sessionId, cfg.staleTTL * 1000);
  const merged = cached ? deepMerge(cached, data) : data;
  writeStateCache(sessionId, merged);

  process.stdout.write(renderStatus(merged, cfg));
}
