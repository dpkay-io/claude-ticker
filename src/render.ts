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

export function renderStatus(data: JsonObj): string {
  const cfg   = loadConfig();
  const parts: string[] = [];

  for (const field of cfg.fields) {
    const def = FIELD_REGISTRY[field];
    if (!def) continue;
    const raw  = def.extract(data);
    const pct  = def.percentValue?.(raw) ?? null;
    const col  = resolveColor(field, pct, cfg);
    const text = def.render(raw, col, { timeFormat: cfg.timeFormat, dirColors: cfg.dirColors, dirNames: cfg.dirNames });
    if (text) parts.push(text);
  }

  return parts.join(cfg.separator);
}

export async function render(): Promise<void> {
  if (process.stdin.isTTY) {
    console.log('claude-ticker: run `claude-ticker --help` for usage.');
    return;
  }
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk as string;
  let data: JsonObj;
  try { data = JSON.parse(raw) as JsonObj; } catch { process.exit(0); }
  process.stdout.write(renderStatus(data));
}
