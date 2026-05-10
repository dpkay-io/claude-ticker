import { homedir } from 'os';
import type { ColorName, TimeFormat } from './types.js';
import { RESET, DIM, COLOR_CODES, BG_COLOR_CODES, BG_TEXT_CODES, VALID_DIR_COLORS } from './types.js';

export type JsonObj = Record<string, unknown>;
export type DirNameEntry = { name: string; long?: boolean };
export type RenderOpts = { timeFormat: TimeFormat; dirColors: Record<string, ColorName>; dirNames: Record<string, DirNameEntry> };

function obj(v: unknown): JsonObj | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObj) : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtTime(ts: number, includeDay: boolean, fmt: TimeFormat): string {
  const d = new Date(ts * 1000);
  let time: string;
  if (fmt === '12h') {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    time = `${h % 12 || 12}:${m}${h >= 12 ? 'PM' : 'AM'}`;
  } else {
    time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  return (includeDay ? DAYS[(d.getDay() + 6) % 7] : '') + time;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h${remM}m` : `${h}h`;
}

function styled(col: string, text: string): string {
  return col ? col + text + RESET : text;
}

function styledBg(color: ColorName, text: string): string {
  const bg = BG_COLOR_CODES[color];
  const fg = BG_TEXT_CODES[color] ?? '';
  return bg ? `${bg}${fg}${text}${RESET}` : styled(COLOR_CODES[color], text);
}

function normalizePath(p: string, home: string): string {
  const expanded = p.startsWith('~') ? home + p.slice(1) : p;
  const s = expanded.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

function findDirColor(raw: string, dirColors: Record<string, ColorName>): ColorName | null {
  const home = homedir();
  const cur = normalizePath(raw, home);
  let best: { len: number; color: ColorName } | null = null;
  for (const [path, color] of Object.entries(dirColors)) {
    const norm = normalizePath(path, home);
    if (cur === norm || cur.startsWith(norm + '/')) {
      if (!best || norm.length > best.len) best = { len: norm.length, color };
    }
  }
  return best?.color ?? null;
}

function findDirName(raw: string, dirNames: Record<string, DirNameEntry>): { name: string; long: boolean; remainder: string } | null {
  const home = homedir();
  const cur = normalizePath(raw, home);
  let best: { len: number; name: string; long: boolean; remainder: string } | null = null;
  for (const [path, entry] of Object.entries(dirNames)) {
    const norm = normalizePath(path, home);
    if (cur === norm || cur.startsWith(norm + '/')) {
      if (!best || norm.length > best.len) {
        const remainder = cur === norm ? '' : cur.slice(norm.length + 1);
        best = { len: norm.length, name: entry.name, long: entry.long ?? false, remainder };
      }
    }
  }
  return best ? { name: best.name, long: best.long, remainder: best.remainder } : null;
}

export interface FieldDef {
  label: string;
  defaultColor: ColorName;
  extract: (data: JsonObj) => unknown;
  percentValue: ((raw: unknown) => number | null) | null;
  render: (raw: unknown, color: string, opts: RenderOpts) => string | null;
}

export const FIELD_REGISTRY = {
  dir: {
    label: 'Working directory',
    defaultColor: 'yellow',
    extract: (data) => str(obj(data.workspace)?.current_dir) ?? str(data.cwd),
    percentValue: null,
    render: (raw, col, opts) => {
      const val = str(raw);
      if (!val) return null;
      const dirColor = findDirColor(val, opts.dirColors);
      const nameMatch = findDirName(val, opts.dirNames);
      if (nameMatch) {
        const display = nameMatch.long && nameMatch.remainder
          ? `${nameMatch.name}/${nameMatch.remainder}`
          : nameMatch.name;
        return dirColor ? styledBg(dirColor, display) : styled(col, display);
      }
      const home = homedir();
      const match = process.platform === 'win32'
        ? val.toLowerCase().startsWith(home.toLowerCase())
        : val.startsWith(home);
      const rel = (match ? '~' + val.slice(home.length) : val).replace(/\\/g, '/');
      return dirColor ? styledBg(dirColor, rel) : styled(col, rel);
    },
  },

  model: {
    label: 'Current model',
    defaultColor: 'none',
    extract: (data) => str(obj(data.model)?.display_name),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, val.replace(/^Claude /, ''));
    },
  },

  ctx: {
    label: 'Context window usage %',
    defaultColor: 'dynamic',
    extract: (data) => num(obj(data.context_window)?.used_percentage),
    percentValue: (raw) => (typeof raw === 'number' ? raw : null),
    render: (raw, col) => {
      const val = num(raw);
      if (val == null) return null;
      return styled(col, `ctx:${Math.round(val)}%`);
    },
  },

  '5h': {
    label: '5-hour rate limit',
    defaultColor: 'dynamic',
    extract: (data) => obj(obj(data.rate_limits)?.five_hour),
    percentValue: (raw) => num(obj(raw)?.used_percentage) ?? null,
    render: (raw, col, opts) => {
      const o = obj(raw);
      if (!o) return null;
      const i = Math.round(num(o.used_percentage) ?? 0);
      const ts = num(o.resets_at);
      const suffix = ts ? DIM + '@' + fmtTime(ts, false, opts.timeFormat) + RESET : '';
      return styled(col, `5h:${i}%`) + suffix;
    },
  },

  '7d': {
    label: '7-day rate limit',
    defaultColor: 'dynamic',
    extract: (data) => obj(obj(data.rate_limits)?.seven_day),
    percentValue: (raw) => num(obj(raw)?.used_percentage) ?? null,
    render: (raw, col, opts) => {
      const o = obj(raw);
      if (!o) return null;
      const i = Math.round(num(o.used_percentage) ?? 0);
      const ts = num(o.resets_at);
      const suffix = ts ? DIM + '@' + fmtTime(ts, true, opts.timeFormat) + RESET : '';
      return styled(col, `7d:${i}%`) + suffix;
    },
  },

  cost: {
    label: 'Session cost (USD)',
    defaultColor: 'none',
    extract: (data) => num(obj(data.cost)?.total_cost_usd),
    percentValue: null,
    render: (raw, col) => {
      const v = num(raw);
      if (v == null || v === 0) return null;
      const s = '$' + v.toFixed(4).replace(/\.?0+$/, '');
      return styled(col, s);
    },
  },

  duration: {
    label: 'Session wall time',
    defaultColor: 'none',
    extract: (data) => num(obj(data.cost)?.total_duration_ms),
    percentValue: null,
    render: (raw, col) => {
      const v = num(raw);
      if (v == null || v === 0) return null;
      return styled(col, fmtDuration(v));
    },
  },

  lines: {
    label: 'Lines added / removed',
    defaultColor: 'none',
    extract: (data) => obj(data.cost),
    percentValue: null,
    render: (raw, col) => {
      const o = obj(raw);
      if (!o) return null;
      const added   = num(o.total_lines_added)   ?? 0;
      const removed = num(o.total_lines_removed) ?? 0;
      if (added === 0 && removed === 0) return null;
      return styled(col, `+${added} -${removed}`);
    },
  },

  session: {
    label: 'Session name',
    defaultColor: 'dim',
    extract: (data) => str(data.session_name),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, `session:${val}`);
    },
  },

  version: {
    label: 'Claude Code version',
    defaultColor: 'dim',
    extract: (data) => str(data.version),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, val.startsWith('v') ? val : `v${val}`);
    },
  },

  effort: {
    label: 'Reasoning effort level',
    defaultColor: 'dynamic',
    extract: (data) => str(obj(data.effort)?.level),
    percentValue: (raw) => {
      const level = str(raw);
      if (!level) return null;
      const map: Record<string, number> = { low: 25, medium: 63, high: 80, xhigh: 90, max: 100 };
      return map[level] ?? 80;
    },
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, `effort:${val}`);
    },
  },

  thinking: {
    label: 'Extended thinking enabled',
    defaultColor: 'none',
    extract: (data) => bool(obj(data.thinking)?.enabled),
    percentValue: null,
    render: (raw, col) => {
      if (typeof raw !== 'boolean') return null;
      return styled(col, `thinking:${raw ? 'on' : 'off'}`);
    },
  },

  vim: {
    label: 'Vim mode',
    defaultColor: 'none',
    extract: (data) => str(obj(data.vim)?.mode),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, val);
    },
  },

  worktree: {
    label: 'Git worktree branch',
    defaultColor: 'cyan',
    extract: (data) => str(obj(data.worktree)?.branch),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, `wt:${val}`);
    },
  },

  agent: {
    label: 'Agent name',
    defaultColor: 'magenta',
    extract: (data) => str(obj(data.agent)?.name),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, `agent:${val}`);
    },
  },
} satisfies Record<string, FieldDef>;

export type FieldName = keyof typeof FIELD_REGISTRY;
export const ALL_FIELDS = Object.keys(FIELD_REGISTRY) as FieldName[];

export interface Config {
  fields: FieldName[];
  colors: Partial<Record<FieldName, ColorName>>;
  thresholds: { warning: number; critical: number };
  separator: string;
  timeFormat: TimeFormat;
  dirColors: Record<string, ColorName>;
  dirNames: Record<string, DirNameEntry>;
}

export const DEFAULT_CONFIG: Config = {
  fields:     ['dir', 'worktree', 'model', 'ctx', '5h', '7d'],
  colors:     {},
  thresholds: { warning: 50, critical: 75 },
  separator:  '  ',
  timeFormat: '24h',
  dirColors:  {},
  dirNames:   {},
};
