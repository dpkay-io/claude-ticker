import { homedir, tmpdir } from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execSync } from 'child_process';
import type { ColorName, TimeFormat } from './types.js';
import { RESET, DIM, COLOR_CODES, colorToFgCode, colorToBgCode } from './types.js';

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

const SECONDS_PER_MINUTE = 60;
const TOKENS_PER_K = 1_000;
const TOKENS_PER_M = 1_000_000;
const PERCENT = 100;

/** 950 → "950", 9_500 → "9.5k", 79_168 → "79k", 1_000_000 → "1M", 1_250_000 → "1.3M". */
export function fmtTokens(n: number): string {
  const scaled = (value: number, unit: string) =>
    (value < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value))) + unit;
  if (n >= TOKENS_PER_M || Math.round(n / TOKENS_PER_K) >= TOKENS_PER_K) return scaled(n / TOKENS_PER_M, 'M');
  if (n >= TOKENS_PER_K) return scaled(n / TOKENS_PER_K, 'k');
  return String(n);
}

/** Coarse countdown for glanceable display: "52m" above a minute, "45s" below. */
function fmtCountdown(seconds: number): string {
  return seconds >= SECONDS_PER_MINUTE
    ? `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`
    : `${Math.max(0, Math.floor(seconds))}s`;
}

const TTL_UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };

/** Parses Claude Code's prompt-cache TTL ("5m", "1h") into seconds. */
export function parseTtlSeconds(ttl: unknown): number | null {
  const m = typeof ttl === 'string' ? ttl.match(/^(\d+)([smhd])$/) : null;
  return m ? parseInt(m[1], 10) * TTL_UNIT_SECONDS[m[2]] : null;
}

function nowSeconds(): number {
  return Date.now() / 1000;
}

const SAFE_URL = /^https?:\/\/[^\s\x00-\x1f\x7f]+$/;

/** Wraps text in an OSC 8 terminal hyperlink. Unsafe or missing URLs return the text unchanged. */
export function hyperlink(url: string | undefined, text: string): string {
  if (!url || !SAFE_URL.test(url)) return text;
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

function styled(col: string, text: string): string {
  return col ? col + text + RESET : text;
}

function styledBg(color: string, text: string): string {
  const codes = colorToBgCode(color);
  if (codes) return `${codes.bg}${codes.fg}${text}${RESET}`;
  return styled(colorToFgCode(color), text);
}

function normalizePath(p: string, home: string): string {
  const expanded = p.startsWith('~') ? home + p.slice(1) : p;
  const s = expanded.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

function findDirColor(raw: string, dirColors: Record<string, ColorName>): string | null {
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

/** Renders a directory with its dir-name alias and dir-color background, else `~`-shortened. */
function renderPath(val: string, col: string, opts: RenderOpts): string {
  const dirColor = findDirColor(val, opts.dirColors);
  const display = aliasedPath(val, opts) ?? homeRelativePath(val);
  return dirColor ? styledBg(dirColor, display) : styled(col, display);
}

function aliasedPath(val: string, opts: RenderOpts): string | null {
  const nameMatch = findDirName(val, opts.dirNames);
  if (!nameMatch) return null;
  return nameMatch.long && nameMatch.remainder
    ? `${nameMatch.name}/${nameMatch.remainder}`
    : nameMatch.name;
}

function homeRelativePath(val: string): string {
  const home = homedir();
  const match = process.platform === 'win32'
    ? val.toLowerCase().startsWith(home.toLowerCase())
    : val.startsWith(home);
  return (match ? '~' + val.slice(home.length) : val).replace(/\\/g, '/');
}

function currentDir(data: JsonObj): string | undefined {
  return str(obj(data.workspace)?.current_dir) ?? str(data.cwd);
}

export interface FieldDef {
  label: string;
  defaultColor: ColorName;
  extract: (data: JsonObj) => unknown;
  percentValue: ((raw: unknown) => number | null) | null;
  render: (raw: unknown, color: string, opts: RenderOpts) => string | null;
  /** Layout marker: starts a new status line instead of rendering text. */
  lineBreak?: true;
}

function rateLimitField(
  windowKey: string,
  label: string,
  description: string,
  includeDay: boolean,
  extraSuffix?: (window: JsonObj) => string,
): FieldDef {
  return {
    label: description,
    defaultColor: 'dynamic',
    extract: (data) => obj(obj(data.rate_limits)?.[windowKey]),
    percentValue: (raw) => num(obj(raw)?.used_percentage) ?? null,
    render: (raw, col, opts) => {
      const o = obj(raw);
      if (!o) return null;
      const pct = Math.round(num(o.used_percentage) ?? 0);
      const ts = num(o.resets_at);
      const reset = ts ? DIM + '@' + fmtTime(ts, includeDay, opts.timeFormat) + RESET : '';
      return styled(col, `${label}:${pct}%`) + reset + (extraSuffix?.(o) ?? '');
    },
  };
}

const GIT_BRANCH_TTL_MS = 10_000;
/** Collapses bursts of renders (Claude Code debounces at 300ms) into one `git diff`. */
const GIT_DIFF_TTL_MS = 2_000;
const GIT_HEAD_MAX_DEPTH = 10;
const GIT_REF_PREFIX = 'ref: refs/heads/';
const GITDIR_PREFIX = 'gitdir:';

function readGitBranchCache(sessionId: string): { branch: string | undefined } | null {
  const file = join(tmpdir(), `claude-ticker-git-${sessionId}.json`);
  try {
    const { branch, ts } = JSON.parse(readFileSync(file, 'utf8')) as { branch: string | undefined; ts: number };
    if (Date.now() - ts < GIT_BRANCH_TTL_MS) return { branch };
  } catch { /* miss */ }
  return null;
}

function writeGitBranchCache(sessionId: string, branch: string | undefined): void {
  const file = join(tmpdir(), `claude-ticker-git-${sessionId}.json`);
  try { writeFileSync(file, JSON.stringify({ branch, ts: Date.now() }), 'utf8'); } catch { /* ignore */ }
}

function parseShortStat(output: string): { ins: number; del: number } {
  const ins = output.match(/(\d+) insertion/);
  const del = output.match(/(\d+) deletion/);
  return { ins: ins ? parseInt(ins[1], 10) : 0, del: del ? parseInt(del[1], 10) : 0 };
}

function gitDiffCachePath(sessionId: string): string {
  return join(tmpdir(), `claude-ticker-gitdiff-${sessionId}.json`);
}

type DiffStats = { ins: number; del: number };

/** `stats: null` caches a failed `git diff` too, so a broken repo doesn't spawn git on every render. */
type DiffCacheEntry = { cwd?: string; stats: DiffStats | null; ts: number };

function getCachedGitDiffStats(sessionId: string, cwd?: string): DiffStats | null {
  const file = gitDiffCachePath(sessionId);
  try {
    const hit = JSON.parse(readFileSync(file, 'utf8')) as Partial<DiffCacheEntry>;
    if (hit.cwd === cwd && hit.stats !== undefined && typeof hit.ts === 'number' && Date.now() - hit.ts < GIT_DIFF_TTL_MS) {
      return hit.stats;
    }
  } catch { /* miss */ }
  const stats = getGitDiffStats(cwd);
  const entry: DiffCacheEntry = { cwd, stats, ts: Date.now() };
  try { writeFileSync(file, JSON.stringify(entry), 'utf8'); } catch { /* ignore */ }
  return stats;
}

/**
 * Finds the HEAD file for `cwd` without spawning git. Handles both a normal
 * `.git/` directory and a linked worktree, where `.git` is a file containing
 * `gitdir: <path>`.
 */
function findGitHead(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < GIT_HEAD_MAX_DEPTH; i++) {
    const dotGit = join(dir, '.git');
    const headInDir = join(dotGit, 'HEAD');
    if (existsSync(headInDir)) return headInDir;
    if (existsSync(dotGit)) {
      try {
        const content = readFileSync(dotGit, 'utf8').trim();
        if (content.startsWith(GITDIR_PREFIX)) {
          const head = join(resolve(dir, content.slice(GITDIR_PREFIX.length).trim()), 'HEAD');
          if (existsSync(head)) return head;
        }
      } catch { /* not a gitdir file */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function getGitDiffStats(cwd?: string): DiffStats | null {
  const opts = { encoding: 'utf8' as BufferEncoding, stdio: ['ignore', 'pipe', 'ignore'] as ('ignore' | 'pipe')[], cwd };
  try {
    const out = (execSync('git diff --shortstat HEAD', opts) as string).trim();
    if (!out) return { ins: 0, del: 0 };
    return parseShortStat(out);
  } catch {
    try {
      const unstaged = (execSync('git diff --shortstat', opts) as string).trim();
      const staged = (execSync('git diff --cached --shortstat', opts) as string).trim();
      if (!unstaged && !staged) return { ins: 0, del: 0 };
      const u = parseShortStat(unstaged);
      const s = parseShortStat(staged);
      return { ins: u.ins + s.ins, del: u.del + s.del };
    } catch { return null; }
  }
}

type BadgeColor = 'green' | 'red' | 'yellow' | 'dim';

/** Review-state badges for the `pr` field, keyed by Claude Code's `pr.review_state`. */
const REVIEW_STATE_BADGES: Record<string, { text: string; color: BadgeColor }> = {
  approved:          { text: '✓', color: 'green' },
  changes_requested: { text: '✗', color: 'red' },
  pending:           { text: '•', color: 'yellow' },
  draft:             { text: 'draft', color: 'dim' },
};

const DEFAULT_OUTPUT_STYLE = 'default';

export const FIELD_REGISTRY = {
  dir: {
    label: 'Working directory',
    defaultColor: 'yellow',
    extract: currentDir,
    percentValue: null,
    render: (raw, col, opts) => {
      const val = str(raw);
      return val ? renderPath(val, col, opts) : null;
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

  model_id: {
    label: 'Current model ID',
    defaultColor: 'none',
    extract: (data) => str(obj(data.model)?.id),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val) return null;
      return styled(col, val.replace(/^claude-/, ''));
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

  '5h': rateLimitField('five_hour', '5h', '5-hour rate limit', false),

  '7d': rateLimitField('seven_day', '7d', '7-day rate limit', true),

  spend: rateLimitField('spend_limit', 'spend', 'Gateway spend limit (USD)', true, (o) => {
    const used = num(o.used_usd);
    const limit = num(o.limit_usd);
    return used != null && limit != null ? DIM + ` $${Math.round(used)}/$${Math.round(limit)}` + RESET : '';
  }),

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

  git_branch: {
    label: 'Git branch with diff stats',
    defaultColor: 'cyan',
    extract: (data) => {
      const sessionId = str(data.session_id) ?? 'default';
      const cwd = currentDir(data);
      let branch: string | undefined;

      if (cwd) {
        try {
          const headPath = findGitHead(cwd);
          if (headPath) {
            const head = readFileSync(headPath, 'utf8').trim();
            if (head.startsWith(GIT_REF_PREFIX)) branch = head.slice(GIT_REF_PREFIX.length);
          }
        } catch { /* ignore and fallback */ }
      }

      if (!branch) {
        const hit = readGitBranchCache(sessionId);
        if (hit) {
          branch = hit.branch;
        } else {
          try {
            branch = execSync('git branch --show-current', {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
              // A missing directory (e.g. preview's sample path) would make the spawn fail outright.
              cwd: cwd && existsSync(cwd) ? cwd : undefined,
            }).trim() || undefined;
          } catch {
            branch = undefined;
          }
          writeGitBranchCache(sessionId, branch);
        }
      }

      // Diff stats are only shown next to a branch, so skip `git diff` when there is none.
      const diff = branch ? getCachedGitDiffStats(sessionId, cwd) : null;
      return { branch, ins: diff?.ins ?? 0, del: diff?.del ?? 0 };
    },
    percentValue: null,
    render: (raw, col) => {
      const o = obj(raw);
      const branch = str(o?.branch) ?? str(raw);
      if (!branch) return null;
      const ins = num(o?.ins) ?? 0;
      const del = num(o?.del) ?? 0;
      if (ins === 0 && del === 0) return styled(col, branch);
      const parts = [styled(col, branch)];
      if (ins > 0) parts.push(COLOR_CODES.green + '+' + ins + RESET);
      if (del > 0) parts.push(COLOR_CODES.red + '-' + del + RESET);
      return parts.join(' ');
    },
  },

  worktree: {
    label: 'Git worktree branch',
    defaultColor: 'cyan',
    extract: (data) => str(obj(data.worktree)?.branch) ?? str(obj(data.workspace)?.git_worktree),
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
  tokens: {
    label: 'Context tokens used / window size',
    defaultColor: 'dynamic',
    extract: (data) => obj(data.context_window),
    percentValue: (raw) => {
      const o = obj(raw);
      const pct = num(o?.used_percentage);
      if (pct != null) return pct;
      const used = num(o?.total_input_tokens);
      const size = num(o?.context_window_size);
      return used != null && size ? (used / size) * PERCENT : null;
    },
    render: (raw, col) => {
      const o = obj(raw);
      const used = num(o?.total_input_tokens);
      const size = num(o?.context_window_size);
      if (used == null || !size) return null;
      return styled(col, `${fmtTokens(used)}/${fmtTokens(size)}`);
    },
  },

  cache: {
    label: 'Prompt cache: time until cold, hit ratio',
    defaultColor: 'dynamic',
    extract: (data) => obj(data.prompt_cache),
    percentValue: (raw) => {
      const o = obj(raw);
      if (!o) return null;
      const expiresAt = num(o.expires_at);
      const ttl = parseTtlSeconds(o.ttl);
      if (o.warm !== true || expiresAt == null) return PERCENT;
      const remaining = expiresAt - nowSeconds();
      if (remaining <= 0) return PERCENT;
      return ttl ? Math.min(PERCENT, Math.max(0, (1 - remaining / ttl) * PERCENT)) : null;
    },
    render: (raw, col) => {
      const o = obj(raw);
      if (!o || o.caching_observed !== true) return null;
      const expiresAt = num(o.expires_at);
      const remaining = expiresAt == null ? 0 : expiresAt - nowSeconds();
      const warm = o.warm === true && remaining > 0;
      const hitRatio = num(o.hit_ratio);
      const hit = hitRatio != null ? DIM + ` hit:${Math.round(hitRatio * PERCENT)}%` + RESET : '';
      return styled(col, `cache:${warm ? fmtCountdown(remaining) : 'cold'}`) + hit;
    },
  },

  pr: {
    label: 'Open PR / MR with review state (clickable)',
    defaultColor: 'blue',
    extract: (data) => obj(data.pr),
    percentValue: null,
    render: (raw, col) => {
      const o = obj(raw);
      const n = num(o?.number);
      if (!o || n == null) return null;
      const isMr = o.kind === 'mr';
      const text = styled(col, `${isMr ? 'MR!' : 'PR#'}${n}`);
      const badge = REVIEW_STATE_BADGES[str(o.review_state) ?? ''];
      const state = badge ? ' ' + styled(COLOR_CODES[badge.color], badge.text) : '';
      return hyperlink(str(o.url), text + state);
    },
  },

  fast: {
    label: 'Fast mode on',
    defaultColor: 'yellow',
    extract: (data) => bool(data.fast_mode),
    percentValue: null,
    render: (raw, col) => (raw === true ? styled(col, 'fast') : null),
  },

  over_200k: {
    label: 'Last request exceeded 200k tokens',
    defaultColor: 'yellow',
    extract: (data) => bool(data.exceeds_200k_tokens),
    percentValue: null,
    render: (raw, col) => (raw === true ? styled(col, '>200k') : null),
  },

  style: {
    label: 'Output style (hidden when default)',
    defaultColor: 'dim',
    extract: (data) => str(obj(data.output_style)?.name),
    percentValue: null,
    render: (raw, col) => {
      const val = str(raw);
      if (!val || val.toLowerCase() === DEFAULT_OUTPUT_STYLE) return null;
      return styled(col, `style:${val}`);
    },
  },

  repo: {
    label: 'Repository owner/name from origin',
    defaultColor: 'dim',
    extract: (data) => obj(obj(data.workspace)?.repo),
    percentValue: null,
    render: (raw, col) => {
      const o = obj(raw);
      const owner = str(o?.owner);
      const name = str(o?.name);
      if (!owner || !name) return null;
      return styled(col, `${owner}/${name}`);
    },
  },

  api_time: {
    label: 'Time spent waiting on the API',
    defaultColor: 'none',
    extract: (data) => num(obj(data.cost)?.total_api_duration_ms),
    percentValue: null,
    render: (raw, col) => {
      const v = num(raw);
      if (v == null || v === 0) return null;
      return styled(col, `api:${fmtDuration(v)}`);
    },
  },

  project: {
    label: 'Launch directory (only when cwd moved away)',
    defaultColor: 'dim',
    extract: (data) => {
      const project = str(obj(data.workspace)?.project_dir);
      const current = currentDir(data);
      if (!project || !current) return undefined;
      const home = homedir();
      return normalizePath(project, home) === normalizePath(current, home) ? undefined : project;
    },
    percentValue: null,
    render: (raw, col, opts) => {
      const val = str(raw);
      return val ? styled(col, 'launch:') + renderPath(val, col, opts) : null;
    },
  },

  added_dirs: {
    label: 'Extra directories added with /add-dir',
    defaultColor: 'dim',
    extract: (data) => {
      const dirs = obj(data.workspace)?.added_dirs;
      return Array.isArray(dirs) ? dirs.length : undefined;
    },
    percentValue: null,
    render: (raw, col) => {
      const n = num(raw);
      if (!n) return null;
      return styled(col, `+${n} ${n === 1 ? 'dir' : 'dirs'}`);
    },
  },

  newline: {
    label: 'Line break: fields after it go on the next line',
    defaultColor: 'none',
    extract: () => undefined,
    percentValue: null,
    render: () => null,
    lineBreak: true,
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
  staleTTL: number;
  /** statusLine.refreshInterval in seconds; 0 = event-driven only. */
  refreshInterval: number;
  /** statusLine.padding in characters; 0 = Claude Code default. */
  padding: number;
}

export const DEFAULT_CONFIG: Config = {
  fields:     ['dir', 'git_branch', 'model_id', 'ctx', '5h', '7d'],
  colors:     {},
  thresholds: { warning: 50, critical: 75 },
  separator:  '  ',
  timeFormat: '24h',
  dirColors:  {},
  dirNames:   {},
  staleTTL:   120,
  refreshInterval: 30,
  padding:    0,
};

/** Fields whose color can follow the warning / critical thresholds. */
export const THRESHOLD_FIELDS = ALL_FIELDS.filter((f) => FIELD_REGISTRY[f].percentValue !== null);
