import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { RESET, COLOR_CODES, BG_COLOR_CODES, BG_TEXT_CODES } from '../types.js';

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
}));

import { FIELD_REGISTRY, ALL_FIELDS, DEFAULT_CONFIG, THRESHOLD_FIELDS, fmtTokens, parseTtlSeconds, hyperlink } from '../fields.js';
import { writeFileSync } from 'fs';
import type { RenderOpts, FieldDef } from '../fields.js';

const NO_COLOR = '';
const OPTS: RenderOpts = { timeFormat: '24h', dirColors: {}, dirNames: {} };
const OPTS_12H: RenderOpts = { timeFormat: '12h', dirColors: {}, dirNames: {} };

beforeEach(() => {
  vi.mocked(homedir).mockReturnValue('/home/testuser');
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── ALL_FIELDS / DEFAULT_CONFIG ───────────────────────────────────────────────

describe('ALL_FIELDS', () => {
  test('contains every key in FIELD_REGISTRY', () => {
    const registryKeys = Object.keys(FIELD_REGISTRY);
    expect(ALL_FIELDS).toEqual(registryKeys);
  });

  test('includes all expected fields', () => {
    const expected = [
      'dir', 'model', 'model_id', 'ctx', '5h', '7d', 'cost', 'duration',
      'lines', 'session', 'version', 'effort', 'thinking', 'vim', 'git_branch', 'worktree', 'agent',
    ];
    for (const f of expected) {
      expect(ALL_FIELDS).toContain(f);
    }
  });
});

describe('DEFAULT_CONFIG', () => {
  test('default fields are correct', () => {
    expect(DEFAULT_CONFIG.fields).toEqual(['dir', 'git_branch', 'model_id', 'ctx', '5h', '7d']);
  });

  test('default thresholds are 50/75', () => {
    expect(DEFAULT_CONFIG.thresholds).toEqual({ warning: 50, critical: 75 });
  });

  test('default separator is double space', () => {
    expect(DEFAULT_CONFIG.separator).toBe('  ');
  });

  test('default timeFormat is 24h', () => {
    expect(DEFAULT_CONFIG.timeFormat).toBe('24h');
  });

  test('default colors and dirColors are empty', () => {
    expect(DEFAULT_CONFIG.colors).toEqual({});
    expect(DEFAULT_CONFIG.dirColors).toEqual({});
  });

  test('default staleTTL is 120 seconds', () => {
    expect(DEFAULT_CONFIG.staleTTL).toBe(120);
  });
});

// ── dir ───────────────────────────────────────────────────────────────────────

describe('dir field', () => {
  const f = FIELD_REGISTRY.dir;

  test('extract: reads workspace.current_dir', () => {
    expect(f.extract({ workspace: { current_dir: '/some/path' } })).toBe('/some/path');
  });

  test('extract: falls back to cwd', () => {
    expect(f.extract({ cwd: '/fallback' })).toBe('/fallback');
  });

  test('extract: returns undefined when neither present', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('extract: prefers workspace.current_dir over cwd', () => {
    expect(f.extract({ workspace: { current_dir: '/primary' }, cwd: '/fallback' })).toBe('/primary');
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: replaces home with ~', () => {
    const result = f.render('/home/testuser/projects/myapp', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('~/projects/myapp');
  });

  test('render: leaves non-home path unchanged', () => {
    const result = f.render('/var/log/app', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('/var/log/app');
  });

  test('render: returns null when raw is not a string', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(null, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(42, NO_COLOR, OPTS)).toBeNull();
  });

  test('render: applies ANSI color code', () => {
    const col = COLOR_CODES.yellow;
    const result = f.render('/var/log', col, OPTS);
    expect(result).toBe(col + '/var/log' + RESET);
  });

  test('render: applies dirColor as background', () => {
    const opts: RenderOpts = { timeFormat: '24h', dirColors: { '/home/testuser/projects': 'blue' }, dirNames: {} };
    const result = f.render('/home/testuser/projects/myapp', NO_COLOR, opts);
    expect(result).toContain(BG_COLOR_CODES.blue!);
    expect(result).toContain(BG_TEXT_CODES.blue!);
    expect(result).toContain('~/projects/myapp');
    expect(result).toContain(RESET);
  });

  test('render: dirColor matches exact path', () => {
    const opts: RenderOpts = { timeFormat: '24h', dirColors: { '/home/testuser/projects': 'red' }, dirNames: {} };
    const result = f.render('/home/testuser/projects', NO_COLOR, opts);
    expect(result).toContain(BG_COLOR_CODES.red!);
  });

  test('render: prefers longest matching dirColor', () => {
    const opts: RenderOpts = {
      timeFormat: '24h',
      dirColors: { '/home/testuser': 'red', '/home/testuser/projects': 'green' },
      dirNames: {},
    };
    const result = f.render('/home/testuser/projects/sub', NO_COLOR, opts);
    expect(result).toContain(BG_COLOR_CODES.green!);
    expect(result).not.toContain(BG_COLOR_CODES.red!);
  });

  test('render: shorter match is ignored when longer match already found', () => {
    // Insert longer path first so it becomes `best`, then shorter path is evaluated but skipped
    const opts: RenderOpts = {
      timeFormat: '24h',
      dirColors: { '/home/testuser/projects': 'green', '/home/testuser': 'red' },
      dirNames: {},
    };
    const result = f.render('/home/testuser/projects/sub', NO_COLOR, opts);
    expect(result).toContain(BG_COLOR_CODES.green!);
    expect(result).not.toContain(BG_COLOR_CODES.red!);
  });

  test('render: non-matching dirColors entry is skipped (hits || false branch)', () => {
    // '/home/testuser/work' does NOT match the path — covers the "both conditions false" branch
    const opts: RenderOpts = {
      timeFormat: '24h',
      dirColors: { '/home/testuser/work': 'blue', '/home/testuser/projects': 'green' },
      dirNames: {},
    };
    const result = f.render('/home/testuser/projects/sub', NO_COLOR, opts);
    expect(result).toContain(BG_COLOR_CODES.green!);
    expect(result).not.toContain(BG_COLOR_CODES.blue!);
  });

  test('render: ~ in dirColor path is expanded', () => {
    vi.mocked(homedir).mockReturnValue('/home/testuser');
    const opts: RenderOpts = { timeFormat: '24h', dirColors: { '~/projects': 'cyan' }, dirNames: {} };
    const result = f.render('/home/testuser/projects/app', NO_COLOR, opts);
    expect(result).toContain(BG_COLOR_CODES.cyan!);
  });

  test('render: styledBg falls back to styled when color has no background code', () => {
    // 'dim' is a valid ColorName but not in BG_COLOR_CODES — triggers styledBg false branch
    const opts = { timeFormat: '24h' as const, dirColors: { '/home/testuser': 'dim' }, dirNames: {} } as RenderOpts;
    const result = f.render('/home/testuser/projects', NO_COLOR, opts);
    // Renders with dim ANSI code via styled fallback, no crash
    expect(result).toBeTruthy();
    expect(result).toContain('~/projects');
  });

  test('render: dirName without long', () => {
    const opts: RenderOpts = { timeFormat: '24h', dirColors: {}, dirNames: { '/home/testuser/projects/myapp': { name: 'app' } } };
    const result = f.render('/home/testuser/projects/myapp/sub', NO_COLOR, opts);
    expect(stripAnsi(result!)).toBe('app');
  });

  test('render: dirName with long', () => {
    const opts: RenderOpts = { timeFormat: '24h', dirColors: {}, dirNames: { '/home/testuser/projects/myapp': { name: 'app', long: true } } };
    const result = f.render('/home/testuser/projects/myapp/sub/folder', NO_COLOR, opts);
    expect(stripAnsi(result!)).toBe('app/sub/folder');
  });

  test('render: dirName exact match has no remainder', () => {
    const opts: RenderOpts = { timeFormat: '24h', dirColors: {}, dirNames: { '/home/testuser/projects/myapp': { name: 'app', long: true } } };
    const result = f.render('/home/testuser/projects/myapp', NO_COLOR, opts);
    expect(stripAnsi(result!)).toBe('app');
  });

  test('render: dirName combined with dirColor', () => {
    const opts: RenderOpts = { timeFormat: '24h', dirColors: { '/home/testuser/projects/myapp': 'blue' }, dirNames: { '/home/testuser/projects/myapp': { name: 'app' } } };
    const result = f.render('/home/testuser/projects/myapp/sub', NO_COLOR, opts);
    expect(result).toContain('app');
    expect(result).toContain(BG_COLOR_CODES.blue!);
  });

  test('render: backslashes converted to slashes', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.mocked(homedir).mockReturnValue('C:\\Users\\testuser');
    const result = f.render('C:\\Users\\testuser\\projects', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('~/projects');
  });
});

// ── model ─────────────────────────────────────────────────────────────────────

describe('model field', () => {
  const f: FieldDef = FIELD_REGISTRY.model;

  test('extract: reads model.display_name', () => {
    expect(f.extract({ model: { display_name: 'Claude Sonnet 4.6' } })).toBe('Claude Sonnet 4.6');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
    expect(f.extract({ model: {} })).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: strips "Claude " prefix', () => {
    const result = f.render('Claude Sonnet 4.6', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('Sonnet 4.6');
  });

  test('render: leaves non-Claude name unchanged', () => {
    const result = f.render('GPT-4', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('GPT-4');
  });

  test('render: returns null when raw is not a string', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });

  test('render: applies color', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render('Claude Opus 4.7', col, OPTS);
    expect(result).toBe(col + 'Opus 4.7' + RESET);
  });
});

// ── model_id ──────────────────────────────────────────────────────────────────

describe('model_id field', () => {
  const f: FieldDef = FIELD_REGISTRY.model_id;

  test('extract: reads model.id', () => {
    expect(f.extract({ model: { id: 'claude-sonnet-4-6' } })).toBe('claude-sonnet-4-6');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
    expect(f.extract({ model: {} })).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: strips "claude-" prefix', () => {
    const result = f.render('claude-sonnet-4-6', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('sonnet-4-6');
  });

  test('render: leaves non-claude ID unchanged', () => {
    const result = f.render('gpt-4', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('gpt-4');
  });

  test('render: returns null when raw is not a string', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });

  test('render: applies color', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render('claude-opus-4-7', col, OPTS);
    expect(result).toBe(col + 'opus-4-7' + RESET);
  });
});

// ── ctx ───────────────────────────────────────────────────────────────────────

describe('ctx field', () => {
  const f: FieldDef = FIELD_REGISTRY.ctx;

  test('extract: reads context_window.used_percentage', () => {
    expect(f.extract({ context_window: { used_percentage: 42 } })).toBe(42);
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
    expect(f.extract({ context_window: {} })).toBeUndefined();
  });

  test('percentValue: returns the number', () => {
    expect(f.percentValue!(42)).toBe(42);
    expect(f.percentValue!(0)).toBe(0);
    expect(f.percentValue!(100)).toBe(100);
  });

  test('percentValue: returns null for non-numbers', () => {
    expect(f.percentValue!('42')).toBeNull();
    expect(f.percentValue!(undefined)).toBeNull();
    expect(f.percentValue!(null)).toBeNull();
  });

  test('render: formats as ctx:X%', () => {
    expect(stripAnsi(f.render(42, NO_COLOR, OPTS)!)).toBe('ctx:42%');
  });

  test('render: rounds decimal values', () => {
    expect(stripAnsi(f.render(12.7, NO_COLOR, OPTS)!)).toBe('ctx:13%');
    expect(stripAnsi(f.render(12.4, NO_COLOR, OPTS)!)).toBe('ctx:12%');
  });

  test('render: returns null when raw is not a number', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render('42', NO_COLOR, OPTS)).toBeNull();
  });
});

// ── 5h ───────────────────────────────────────────────────────────────────────

describe('5h field', () => {
  const f: FieldDef = FIELD_REGISTRY['5h'];
  const futureTs = Math.floor(Date.now() / 1000) + 3600;
  const fiveHourObj = { used_percentage: 30, resets_at: futureTs };

  test('extract: reads rate_limits.five_hour', () => {
    expect(f.extract({ rate_limits: { five_hour: fiveHourObj } })).toEqual(fiveHourObj);
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
    expect(f.extract({ rate_limits: {} })).toBeUndefined();
  });

  test('percentValue: extracts used_percentage from object', () => {
    expect(f.percentValue!(fiveHourObj)).toBe(30);
    expect(f.percentValue!({ used_percentage: 0 })).toBe(0);
  });

  test('percentValue: returns null for non-objects', () => {
    expect(f.percentValue!(undefined)).toBeNull();
    expect(f.percentValue!(null)).toBeNull();
    expect(f.percentValue!(42)).toBeNull();
  });

  test('render: formats as 5h:X%', () => {
    const result = stripAnsi(f.render(fiveHourObj, NO_COLOR, OPTS)!);
    expect(result).toMatch(/^5h:30%@\d{2}:\d{2}$/);
  });

  test('render: uses 12h format when specified', () => {
    const result = stripAnsi(f.render(fiveHourObj, NO_COLOR, OPTS_12H)!);
    expect(result).toMatch(/^5h:30%@\d{1,2}:\d{2}(AM|PM)$/);
  });

  describe('12h format edge cases (mocked Date)', () => {
    afterEach(() => vi.restoreAllMocks());

    function mockDateCtor(h: number, m: number, day: number): typeof Date {
      return function MockDate() {
        return { getHours: () => h, getMinutes: () => m, getDay: () => day };
      } as unknown as typeof Date;
    }

    test('midnight hour renders as 12:xxAM', () => {
      vi.spyOn(global, 'Date').mockImplementation(mockDateCtor(0, 5, 1));
      const result = stripAnsi(f.render({ used_percentage: 5, resets_at: 1 }, NO_COLOR, OPTS_12H)!);
      expect(result).toBe('5h:5%@12:05AM');
    });

    test('noon hour renders as 12:xxPM', () => {
      vi.spyOn(global, 'Date').mockImplementation(mockDateCtor(12, 0, 1));
      const result = stripAnsi(f.render({ used_percentage: 5, resets_at: 1 }, NO_COLOR, OPTS_12H)!);
      expect(result).toBe('5h:5%@12:00PM');
    });

    test('AM hour (before noon)', () => {
      vi.spyOn(global, 'Date').mockImplementation(mockDateCtor(9, 30, 1));
      const result = stripAnsi(f.render({ used_percentage: 5, resets_at: 1 }, NO_COLOR, OPTS_12H)!);
      expect(result).toBe('5h:5%@9:30AM');
    });

    test('PM hour (after noon)', () => {
      vi.spyOn(global, 'Date').mockImplementation(mockDateCtor(15, 45, 1));
      const result = stripAnsi(f.render({ used_percentage: 5, resets_at: 1 }, NO_COLOR, OPTS_12H)!);
      expect(result).toBe('5h:5%@3:45PM');
    });
  });

  test('render: no time suffix when resets_at missing', () => {
    const result = stripAnsi(f.render({ used_percentage: 20 }, NO_COLOR, OPTS)!);
    expect(result).toBe('5h:20%');
  });

  test('render: rounds percentage', () => {
    const result = stripAnsi(f.render({ used_percentage: 12.7 }, NO_COLOR, OPTS)!);
    expect(result).toBe('5h:13%');
  });

  test('render: uses 0 when used_percentage is absent', () => {
    const result = stripAnsi(f.render({ resets_at: Math.floor(Date.now() / 1000) + 3600 }, NO_COLOR, OPTS)!);
    expect(result).toMatch(/^5h:0%/);
  });

  test('render: returns null for non-objects', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(null, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── 7d ───────────────────────────────────────────────────────────────────────

describe('7d field', () => {
  const f: FieldDef = FIELD_REGISTRY['7d'];
  const futureTs = Math.floor(Date.now() / 1000) + 86400 * 3;
  const sevenDayObj = { used_percentage: 55, resets_at: futureTs };

  test('extract: reads rate_limits.seven_day', () => {
    expect(f.extract({ rate_limits: { seven_day: sevenDayObj } })).toEqual(sevenDayObj);
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue: extracts used_percentage', () => {
    expect(f.percentValue!(sevenDayObj)).toBe(55);
  });

  test('percentValue: returns null for non-objects', () => {
    expect(f.percentValue!(undefined)).toBeNull();
    expect(f.percentValue!(null)).toBeNull();
    expect(f.percentValue!(42)).toBeNull();
    expect(f.percentValue!('string')).toBeNull();
    expect(f.percentValue!([])).toBeNull();
  });

  test('render: formats as 7d:X% with day+time suffix', () => {
    const result = stripAnsi(f.render(sevenDayObj, NO_COLOR, OPTS)!);
    expect(result).toMatch(/^7d:55%@(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d{2}:\d{2}$/);
  });

  test('render: uses 12h format', () => {
    const result = stripAnsi(f.render(sevenDayObj, NO_COLOR, OPTS_12H)!);
    expect(result).toMatch(/^7d:55%@(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d{1,2}:\d{2}(AM|PM)$/);
  });

  test('render: no time suffix when resets_at missing', () => {
    expect(stripAnsi(f.render({ used_percentage: 40 }, NO_COLOR, OPTS)!)).toBe('7d:40%');
  });

  test('render: uses 0 when used_percentage is absent', () => {
    const result = stripAnsi(f.render({ resets_at: Math.floor(Date.now() / 1000) + 86400 }, NO_COLOR, OPTS)!);
    expect(result).toMatch(/^7d:0%/);
  });

  test('render: returns null for array input', () => {
    expect(f.render([], NO_COLOR, OPTS)).toBeNull();
  });

  test('render: returns null for primitive inputs', () => {
    expect(f.render(42, NO_COLOR, OPTS)).toBeNull();
    expect(f.render('string', NO_COLOR, OPTS)).toBeNull();
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(null, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── cost ─────────────────────────────────────────────────────────────────────

describe('cost field', () => {
  const f: FieldDef = FIELD_REGISTRY.cost;

  test('extract: reads cost.total_cost_usd', () => {
    expect(f.extract({ cost: { total_cost_usd: 0.042 } })).toBe(0.042);
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats as $X with trailing zero trimming', () => {
    expect(stripAnsi(f.render(0.042, NO_COLOR, OPTS)!)).toBe('$0.042');
    expect(stripAnsi(f.render(0.1, NO_COLOR, OPTS)!)).toBe('$0.1');
    expect(stripAnsi(f.render(1.0, NO_COLOR, OPTS)!)).toBe('$1');
    expect(stripAnsi(f.render(0.0001, NO_COLOR, OPTS)!)).toBe('$0.0001');
    expect(stripAnsi(f.render(0.12345, NO_COLOR, OPTS)!)).toBe('$0.1235');
  });

  test('render: returns null for zero', () => {
    expect(f.render(0, NO_COLOR, OPTS)).toBeNull();
  });

  test('render: returns null for non-numbers', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render('0.5', NO_COLOR, OPTS)).toBeNull();
  });
});

// ── duration ─────────────────────────────────────────────────────────────────

describe('duration field', () => {
  const f: FieldDef = FIELD_REGISTRY.duration;

  test('extract: reads cost.total_duration_ms', () => {
    expect(f.extract({ cost: { total_duration_ms: 5000 } })).toBe(5000);
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats seconds', () => {
    expect(stripAnsi(f.render(30000, NO_COLOR, OPTS)!)).toBe('30s');
    expect(stripAnsi(f.render(1000, NO_COLOR, OPTS)!)).toBe('1s');
    expect(stripAnsi(f.render(59000, NO_COLOR, OPTS)!)).toBe('59s');
  });

  test('render: formats minutes', () => {
    expect(stripAnsi(f.render(60000, NO_COLOR, OPTS)!)).toBe('1m');
    expect(stripAnsi(f.render(90000, NO_COLOR, OPTS)!)).toBe('1m30s');
    expect(stripAnsi(f.render(3540000, NO_COLOR, OPTS)!)).toBe('59m');
    expect(stripAnsi(f.render(3599000, NO_COLOR, OPTS)!)).toBe('59m59s');
  });

  test('render: formats hours', () => {
    expect(stripAnsi(f.render(3600000, NO_COLOR, OPTS)!)).toBe('1h');
    expect(stripAnsi(f.render(3720000, NO_COLOR, OPTS)!)).toBe('1h2m');
    expect(stripAnsi(f.render(7261000, NO_COLOR, OPTS)!)).toBe('2h1m');
  });

  test('render: returns null for zero', () => {
    expect(f.render(0, NO_COLOR, OPTS)).toBeNull();
  });

  test('render: returns null for non-numbers', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── lines ─────────────────────────────────────────────────────────────────────

describe('lines field', () => {
  const f: FieldDef = FIELD_REGISTRY.lines;

  test('extract: returns the cost object', () => {
    const cost = { total_lines_added: 42, total_lines_removed: 5 };
    expect(f.extract({ cost })).toEqual(cost);
  });

  test('extract: returns undefined when cost missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats as +X -Y', () => {
    expect(stripAnsi(f.render({ total_lines_added: 42, total_lines_removed: 5 }, NO_COLOR, OPTS)!)).toBe('+42 -5');
  });

  test('render: uses 0 for missing line counts', () => {
    expect(stripAnsi(f.render({ total_lines_added: 10 }, NO_COLOR, OPTS)!)).toBe('+10 -0');
    expect(stripAnsi(f.render({ total_lines_removed: 3 }, NO_COLOR, OPTS)!)).toBe('+0 -3');
  });

  test('render: returns null when both are zero', () => {
    expect(f.render({ total_lines_added: 0, total_lines_removed: 0 }, NO_COLOR, OPTS)).toBeNull();
  });

  test('render: returns null for non-objects', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── session ───────────────────────────────────────────────────────────────────

describe('session field', () => {
  const f: FieldDef = FIELD_REGISTRY.session;

  test('extract: reads session_name', () => {
    expect(f.extract({ session_name: 'my-feature' })).toBe('my-feature');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats as session:X', () => {
    expect(stripAnsi(f.render('my-feature', NO_COLOR, OPTS)!)).toBe('session:my-feature');
  });

  test('render: returns null for non-strings', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(null, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── version ───────────────────────────────────────────────────────────────────

describe('version field', () => {
  const f: FieldDef = FIELD_REGISTRY.version;

  test('extract: reads version', () => {
    expect(f.extract({ version: '1.4.2' })).toBe('1.4.2');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: adds v prefix when missing', () => {
    expect(stripAnsi(f.render('1.4.2', NO_COLOR, OPTS)!)).toBe('v1.4.2');
  });

  test('render: preserves existing v prefix', () => {
    expect(stripAnsi(f.render('v2.0.0', NO_COLOR, OPTS)!)).toBe('v2.0.0');
  });

  test('render: returns null for non-strings', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── effort ────────────────────────────────────────────────────────────────────

describe('effort field', () => {
  const f: FieldDef = FIELD_REGISTRY.effort;

  test('extract: reads effort.level', () => {
    expect(f.extract({ effort: { level: 'high' } })).toBe('high');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
    expect(f.extract({ effort: {} })).toBeUndefined();
  });

  test('percentValue: maps levels to percentages', () => {
    expect(f.percentValue!('low')).toBe(25);
    expect(f.percentValue!('medium')).toBe(63);
    expect(f.percentValue!('high')).toBe(80);
    expect(f.percentValue!('xhigh')).toBe(90);
    expect(f.percentValue!('max')).toBe(100);
  });

  test('percentValue: defaults to 80 for unknown level', () => {
    expect(f.percentValue!('unknown')).toBe(80);
  });

  test('percentValue: returns null for non-strings', () => {
    expect(f.percentValue!(undefined)).toBeNull();
    expect(f.percentValue!(null)).toBeNull();
  });

  test('render: formats as effort:X', () => {
    expect(stripAnsi(f.render('high', NO_COLOR, OPTS)!)).toBe('effort:high');
    expect(stripAnsi(f.render('max', NO_COLOR, OPTS)!)).toBe('effort:max');
  });

  test('render: returns null for non-strings', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── thinking ──────────────────────────────────────────────────────────────────

describe('thinking field', () => {
  const f: FieldDef = FIELD_REGISTRY.thinking;

  test('extract: reads thinking.enabled', () => {
    expect(f.extract({ thinking: { enabled: true } })).toBe(true);
    expect(f.extract({ thinking: { enabled: false } })).toBe(false);
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
    expect(f.extract({ thinking: {} })).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats as thinking:on when true', () => {
    expect(stripAnsi(f.render(true, NO_COLOR, OPTS)!)).toBe('thinking:on');
  });

  test('render: formats as thinking:off when false', () => {
    expect(stripAnsi(f.render(false, NO_COLOR, OPTS)!)).toBe('thinking:off');
  });

  test('render: returns null for non-booleans', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(null, NO_COLOR, OPTS)).toBeNull();
    expect(f.render('true', NO_COLOR, OPTS)).toBeNull();
    expect(f.render(1, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── vim ───────────────────────────────────────────────────────────────────────

describe('vim field', () => {
  const f: FieldDef = FIELD_REGISTRY.vim;

  test('extract: reads vim.mode', () => {
    expect(f.extract({ vim: { mode: 'INSERT' } })).toBe('INSERT');
    expect(f.extract({ vim: { mode: 'NORMAL' } })).toBe('NORMAL');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: returns the mode string directly', () => {
    expect(stripAnsi(f.render('INSERT', NO_COLOR, OPTS)!)).toBe('INSERT');
    expect(stripAnsi(f.render('NORMAL', NO_COLOR, OPTS)!)).toBe('NORMAL');
  });

  test('render: returns null for non-strings', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── git_branch ────────────────────────────────────────────────────────────────

describe('git_branch field', () => {
  const f: FieldDef = FIELD_REGISTRY.git_branch;

  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false); // default: cache miss
  });

  afterEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(existsSync).mockReset();
    vi.mocked(readFileSync).mockReset();
  });

  test('extract: zero-spawn fast-path reads .git/HEAD', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('HEAD'));
    vi.mocked(readFileSync).mockReturnValue('ref: refs/heads/fast-branch\n');
    expect(f.extract({ cwd: '/my/repo' })).toMatchObject({ branch: 'fast-branch' });
    expect(execSync).not.toHaveBeenCalledWith('git branch --show-current', expect.anything());
  });

  test('extract: zero-spawn fast-path traverses up directories', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const sp = String(p).replace(/\\/g, '/');
      return sp === '/my/repo/.git/HEAD';
    });
    vi.mocked(readFileSync).mockReturnValue('ref: refs/heads/deep-branch\n');
    expect(f.extract({ cwd: '/my/repo/src/components' })).toMatchObject({ branch: 'deep-branch' });
    expect(execSync).not.toHaveBeenCalledWith('git branch --show-current', expect.anything());
  });

  test('extract: returns branch name from git', () => {
    vi.mocked(execSync).mockReturnValue('main\n');
    expect(f.extract({})).toMatchObject({ branch: 'main' });
  });

  test('extract: returns undefined branch when not a git repo', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not a git repo'); });
    expect(f.extract({})).toMatchObject({ branch: undefined });
  });

  test('extract: returns undefined branch on detached HEAD (empty output)', () => {
    vi.mocked(execSync).mockReturnValue('');
    expect(f.extract({})).toMatchObject({ branch: undefined });
  });

  test('extract: trims trailing newline', () => {
    vi.mocked(execSync).mockReturnValue('feat/my-feature\n');
    expect(f.extract({})).toMatchObject({ branch: 'feat/my-feature' });
  });

  test('extract: returns cached branch within TTL without calling git branch', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ branch: 'cached-branch', ts: Date.now() }),
    );
    expect(f.extract({ session_id: 'sess1' })).toMatchObject({ branch: 'cached-branch' });
    expect(execSync).not.toHaveBeenCalledWith('git branch --show-current', expect.anything());
  });

  test('extract: caches undefined (non-repo) within TTL', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ branch: undefined, ts: Date.now() }),
    );
    expect(f.extract({ session_id: 'sess2' })).toMatchObject({ branch: undefined });
    expect(execSync).not.toHaveBeenCalledWith('git branch --show-current', expect.anything());
  });

  test('extract: refreshes after TTL expires', () => {
    vi.mocked(execSync).mockReturnValue('new-branch\n');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ branch: 'old-branch', ts: Date.now() - 20_000 }),
    );
    expect(f.extract({ session_id: 'sess3' })).toMatchObject({ branch: 'new-branch' });
    expect(execSync).toHaveBeenCalled();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: displays branch name directly', () => {
    const result = f.render({ branch: 'main', ins: 0, del: 0 }, NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('main');
  });

  test('render: applies color', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render({ branch: 'feat/new-ui', ins: 0, del: 0 }, col, OPTS);
    expect(result).toBe(col + 'feat/new-ui' + RESET);
  });

  test('render: shows green +N for insertions', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render({ branch: 'main', ins: 5, del: 0 }, col, OPTS);
    expect(result).toBe(col + 'main' + RESET + ' ' + COLOR_CODES.green + '+5' + RESET);
  });

  test('render: shows red -N for deletions', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render({ branch: 'main', ins: 0, del: 3 }, col, OPTS);
    expect(result).toBe(col + 'main' + RESET + ' ' + COLOR_CODES.red + '-3' + RESET);
  });

  test('render: shows both green and red for mixed diff', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render({ branch: 'dev', ins: 10, del: 7 }, col, OPTS);
    expect(result).toBe(col + 'dev' + RESET + ' ' + COLOR_CODES.green + '+10' + RESET + ' ' + COLOR_CODES.red + '-7' + RESET);
  });

  test('render: falls back to plain string for backwards compat', () => {
    const result = f.render('main', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('main');
  });

  test('render: returns null for non-strings and no branch', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
    expect(f.render(null, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── worktree ──────────────────────────────────────────────────────────────────

describe('worktree field', () => {
  const f: FieldDef = FIELD_REGISTRY.worktree;

  test('extract: reads worktree.branch', () => {
    expect(f.extract({ worktree: { branch: 'feat/new-ui' } })).toBe('feat/new-ui');
  });

  test('extract: falls back to workspace.git_worktree', () => {
    expect(f.extract({ workspace: { git_worktree: 'my-feature' } })).toBe('my-feature');
  });

  test('extract: worktree.branch takes precedence over workspace.git_worktree', () => {
    expect(f.extract({ worktree: { branch: 'feature-branch' }, workspace: { git_worktree: 'my-feature' } })).toBe('feature-branch');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats as wt:X', () => {
    expect(stripAnsi(f.render('feat/new-ui', NO_COLOR, OPTS)!)).toBe('wt:feat/new-ui');
  });

  test('render: returns null for non-strings', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── agent ─────────────────────────────────────────────────────────────────────

describe('agent field', () => {
  const f: FieldDef = FIELD_REGISTRY.agent;

  test('extract: reads agent.name', () => {
    expect(f.extract({ agent: { name: 'my-agent' } })).toBe('my-agent');
  });

  test('extract: returns undefined when missing', () => {
    expect(f.extract({})).toBeUndefined();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: formats as agent:X', () => {
    expect(stripAnsi(f.render('my-agent', NO_COLOR, OPTS)!)).toBe('agent:my-agent');
  });

  test('render: returns null for non-strings', () => {
    expect(f.render(undefined, NO_COLOR, OPTS)).toBeNull();
  });
});

// ── FieldDef structure ────────────────────────────────────────────────────────

describe('FIELD_REGISTRY structure', () => {
  test('every field has required properties', () => {
    for (const [name, def] of Object.entries(FIELD_REGISTRY)) {
      expect(def, `${name}.label`).toHaveProperty('label');
      expect(def, `${name}.defaultColor`).toHaveProperty('defaultColor');
      expect(def, `${name}.extract`).toHaveProperty('extract');
      expect(def, `${name}.render`).toHaveProperty('render');
      expect(Object.keys(def), `${name} has percentValue key`).toContain('percentValue');
    }
  });

  test('dynamic-color fields have percentValue function', () => {
    const dynamicFields = ['ctx', '5h', '7d', 'effort'];
    for (const name of dynamicFields) {
      const def = FIELD_REGISTRY[name as keyof typeof FIELD_REGISTRY];
      expect(def.defaultColor, `${name}.defaultColor`).toBe('dynamic');
      expect(def.percentValue, `${name}.percentValue`).toBeTypeOf('function');
    }
  });
});

// ── helpers: fmtTokens / parseTtlSeconds / hyperlink ────────────────────────

describe('fmtTokens', () => {
  test.each([
    [0, '0'], [950, '950'], [1_000, '1k'], [9_500, '9.5k'], [79_168, '79k'],
    [999_499, '999k'], [999_999, '1M'], [1_000_000, '1M'], [1_250_000, '1.3M'], [12_000_000, '12M'],
  ])('%d → %s', (n, expected) => {
    expect(fmtTokens(n)).toBe(expected);
  });
});

describe('parseTtlSeconds', () => {
  test.each([['5m', 300], ['1h', 3600], ['30s', 30], ['2d', 172_800], ['1x', null], [undefined, null], [5, null]])(
    '%j → %j', (v, expected) => { expect(parseTtlSeconds(v)).toBe(expected); },
  );
});

describe('hyperlink', () => {
  test('wraps safe https URLs in OSC 8', () => {
    expect(hyperlink('https://github.com/a/b/pull/1', 'PR')).toBe('\x1b]8;;https://github.com/a/b/pull/1\x07PR\x1b]8;;\x07');
  });
  test.each([undefined, '', 'javascript:alert(1)', 'https://x.y/\x07evil', 'https://x y'])('leaves text alone for %j', (url) => {
    expect(hyperlink(url, 'PR')).toBe('PR');
  });
});

describe('THRESHOLD_FIELDS', () => {
  test('is derived from fields that have a percentValue', () => {
    expect(THRESHOLD_FIELDS).toEqual(expect.arrayContaining(['ctx', '5h', '7d', 'effort', 'tokens', 'cache', 'spend']));
    expect(THRESHOLD_FIELDS).not.toContain('dir');
  });
});

// ── new fields ───────────────────────────────────────────────────────────────

const renderField = (name: keyof typeof FIELD_REGISTRY, data: Record<string, unknown>, opts: RenderOpts = OPTS) => {
  const f: FieldDef = FIELD_REGISTRY[name];
  const raw = f.extract(data);
  return { raw, pct: f.percentValue?.(raw) ?? null, text: f.render(raw, NO_COLOR, opts) };
};

describe('tokens field', () => {
  test('renders used/size and uses used_percentage for color', () => {
    const r = renderField('tokens', { context_window: { total_input_tokens: 79_168, context_window_size: 1_000_000, used_percentage: 8 } });
    expect(r.text).toBe('79k/1M');
    expect(r.pct).toBe(8);
  });
  test('falls back to computed percent when used_percentage is null', () => {
    const r = renderField('tokens', { context_window: { total_input_tokens: 50_000, context_window_size: 200_000, used_percentage: null } });
    expect(r.pct).toBe(25);
  });
  test('null without size', () => {
    expect(renderField('tokens', { context_window: { total_input_tokens: 5 } }).text).toBeNull();
    expect(renderField('tokens', {}).text).toBeNull();
  });
});

describe('cache field', () => {
  const NOW_S = 1_800_000_000;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW_S * 1000); });
  afterEach(() => { vi.useRealTimers(); });
  const pc = (o: Record<string, unknown>) => ({ prompt_cache: { caching_observed: true, warm: true, ttl: '1h', ...o } });

  test('warm: minutes left and hit ratio, percent = elapsed share of TTL', () => {
    const r = renderField('cache', pc({ expires_at: NOW_S + 52 * 60 + 30, hit_ratio: 0.914 }));
    expect(stripAnsi(r.text!)).toBe('cache:52m hit:91%');
    expect(r.pct).toBeCloseTo((1 - 3150 / 3600) * 100, 5);
  });
  test('under a minute shows seconds', () => {
    expect(stripAnsi(renderField('cache', pc({ expires_at: NOW_S + 45 })).text!)).toBe('cache:45s');
  });
  test('cold when expires_at passed even if warm flag is stale', () => {
    const r = renderField('cache', pc({ expires_at: NOW_S - 1 }));
    expect(stripAnsi(r.text!)).toBe('cache:cold');
    expect(r.pct).toBe(100);
  });
  test('cold when warm is false or expires_at null', () => {
    expect(stripAnsi(renderField('cache', pc({ warm: false, expires_at: NOW_S + 100 })).text!)).toBe('cache:cold');
    expect(stripAnsi(renderField('cache', pc({ expires_at: null })).text!)).toBe('cache:cold');
  });
  test('hidden when caching never observed or absent', () => {
    expect(renderField('cache', pc({ caching_observed: false })).text).toBeNull();
    expect(renderField('cache', {}).text).toBeNull();
  });
  test('unknown ttl format gives no percent (no dynamic color) while warm', () => {
    expect(renderField('cache', pc({ ttl: 'weird', expires_at: NOW_S + 100 })).pct).toBeNull();
  });
});

describe('pr field', () => {
  const url = 'https://github.com/a/b/pull/12';
  test.each([
    ['approved', 'PR#12 ✓'], ['changes_requested', 'PR#12 ✗'], ['pending', 'PR#12 •'], ['draft', 'PR#12 draft'], [undefined, 'PR#12'],
  ])('review_state %s', (state, expected) => {
    const r = renderField('pr', { pr: { number: 12, url, review_state: state } });
    expect(stripAnsi(r.text!).replace(/\x1b\]8;;[^\x07]*\x07/g, '')).toBe(expected);
    expect(r.text!.startsWith(`\x1b]8;;${url}\x07`)).toBe(true);
  });
  test('GitLab merge request uses MR! prefix', () => {
    const r = renderField('pr', { pr: { number: 3, kind: 'mr', url: 'https://gitlab.com/a/b/-/merge_requests/3' } });
    expect(stripAnsi(r.text!).replace(/\x1b\]8;;[^\x07]*\x07/g, '')).toBe('MR!3');
  });
  test('null without a number', () => {
    expect(renderField('pr', { pr: { url } }).text).toBeNull();
    expect(renderField('pr', {}).text).toBeNull();
  });
});

describe('flag fields', () => {
  test('fast shows only when fast_mode is true', () => {
    expect(renderField('fast', { fast_mode: true }).text).toBe('fast');
    expect(renderField('fast', { fast_mode: false }).text).toBeNull();
  });
  test('over_200k shows only when exceeded', () => {
    expect(renderField('over_200k', { exceeds_200k_tokens: true }).text).toBe('>200k');
    expect(renderField('over_200k', { exceeds_200k_tokens: false }).text).toBeNull();
  });
});

describe('spend field', () => {
  test('percent, reset day/time and USD', () => {
    const resets = new Date(2026, 10, 23, 9, 5).getTime() / 1000;
    const r = renderField('spend', { rate_limits: { spend_limit: { used_percentage: 62.8, resets_at: resets, used_usd: 314.12, limit_usd: 500 } } });
    expect(stripAnsi(r.text!)).toMatch(/^spend:63%@\w{3}09:05 \$314\/\$500$/);
    expect(r.pct).toBe(62.8);
  });
  test('USD suffix omitted when absent', () => {
    expect(stripAnsi(renderField('spend', { rate_limits: { spend_limit: { used_percentage: 120 } } }).text!)).toBe('spend:120%');
  });
});

describe('style / repo / api_time / added_dirs fields', () => {
  test('style hidden for default (any case), shown otherwise', () => {
    expect(renderField('style', { output_style: { name: 'default' } }).text).toBeNull();
    expect(renderField('style', { output_style: { name: 'Default' } }).text).toBeNull();
    expect(renderField('style', { output_style: { name: 'Explanatory' } }).text).toBe('style:Explanatory');
  });
  test('repo owner/name', () => {
    expect(renderField('repo', { workspace: { repo: { host: 'gitlab.com', owner: 'g/sub', name: 'p' } } }).text).toBe('g/sub/p');
    expect(renderField('repo', { workspace: {} }).text).toBeNull();
  });
  test('api_time', () => {
    expect(renderField('api_time', { cost: { total_api_duration_ms: 77_451 } }).text).toBe('api:1m17s');
    expect(renderField('api_time', { cost: { total_api_duration_ms: 0 } }).text).toBeNull();
  });
  test('added_dirs pluralizes and hides when empty', () => {
    expect(renderField('added_dirs', { workspace: { added_dirs: ['/a'] } }).text).toBe('+1 dir');
    expect(renderField('added_dirs', { workspace: { added_dirs: ['/a', '/b'] } }).text).toBe('+2 dirs');
    expect(renderField('added_dirs', { workspace: { added_dirs: [] } }).text).toBeNull();
  });
});

describe('project field', () => {
  test('hidden when cwd is the launch dir (trailing slash ignored)', () => {
    expect(renderField('project', { workspace: { current_dir: '/home/testuser/ws/a', project_dir: '/home/testuser/ws/a/' } }).text).toBeNull();
  });
  test('shown, ~-shortened, when cwd moved away', () => {
    const r = renderField('project', { workspace: { current_dir: '/tmp/x', project_dir: '/home/testuser/ws/a' } });
    expect(stripAnsi(r.text!)).toBe('launch:~/ws/a');
  });
  test('uses dir-name alias', () => {
    const opts = { ...OPTS, dirNames: { '/home/testuser/ws/a': { name: 'app' } } };
    const r = renderField('project', { workspace: { current_dir: '/tmp/x', project_dir: '/home/testuser/ws/a' } }, opts);
    expect(stripAnsi(r.text!)).toBe('launch:app');
  });
});

describe('newline field', () => {
  test('is a line-break marker that renders nothing', () => {
    expect(FIELD_REGISTRY.newline.lineBreak).toBe(true);
    expect(renderField('newline', {}).text).toBeNull();
  });
});

// ── git: linked worktrees and diff cache ─────────────────────────────────────

describe('git_branch: worktree and diff cache', () => {
  afterEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(existsSync).mockReset();
    vi.mocked(readFileSync).mockReset();
  });

  test('reads HEAD through a linked worktree .git file without spawning git branch', () => {
    // resolve() adds the drive letter on Windows, exactly as findGitHead does.
    const dotGitFile = join('/wt/feature', '.git');
    const worktreeHead = join(resolve('/repo/.git/worktrees/feature'), 'HEAD');
    vi.mocked(existsSync).mockImplementation((p) => String(p) === dotGitFile || String(p) === worktreeHead);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p) === dotGitFile) return 'gitdir: /repo/.git/worktrees/feature\n';
      if (String(p) === worktreeHead) return 'ref: refs/heads/feature-x\n';
      throw new Error('ENOENT');
    });
    expect(FIELD_REGISTRY.git_branch.extract({ cwd: '/wt/feature' })).toMatchObject({ branch: 'feature-x' });
    expect(execSync).not.toHaveBeenCalledWith('git branch --show-current', expect.anything());
  });

  test('git branch fallback skips a cwd that does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(execSync).mockReturnValue('main\n');
    FIELD_REGISTRY.git_branch.extract({ cwd: '/gone', session_id: 'fb0' });
    expect(execSync).toHaveBeenCalledWith('git branch --show-current', expect.objectContaining({ cwd: undefined }));
  });

  test('git branch fallback runs in the session cwd', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).replace(/\\/g, '/') === '/some/dir');
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(execSync).mockReturnValue('main\n');
    FIELD_REGISTRY.git_branch.extract({ cwd: '/some/dir', session_id: 'fb' });
    expect(execSync).toHaveBeenCalledWith('git branch --show-current', expect.objectContaining({ cwd: '/some/dir' }));
  });

  test('fresh diff cache for the same cwd skips git diff', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('claude-ticker-gitdiff-')) return JSON.stringify({ cwd: '/r', stats: { ins: 4, del: 2 }, ts: Date.now() });
      throw new Error('ENOENT');
    });
    vi.mocked(execSync).mockReturnValue('main\n');
    expect(FIELD_REGISTRY.git_branch.extract({ cwd: '/r', session_id: 'dc1' })).toMatchObject({ ins: 4, del: 2 });
    expect(execSync).not.toHaveBeenCalledWith('git diff --shortstat HEAD', expect.anything());
  });

  test('diff cache for a different cwd or expired is ignored and rewritten', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('claude-ticker-gitdiff-')) return JSON.stringify({ cwd: '/other', stats: { ins: 4, del: 2 }, ts: Date.now() });
      throw new Error('ENOENT');
    });
    vi.mocked(execSync).mockImplementation((cmd) =>
      String(cmd) === 'git diff --shortstat HEAD' ? ' 1 file changed, 7 insertions(+), 1 deletion(-)' : 'main\n');
    expect(FIELD_REGISTRY.git_branch.extract({ cwd: '/r', session_id: 'dc2' })).toMatchObject({ ins: 7, del: 1 });
    expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('claude-ticker-gitdiff-dc2'), expect.stringContaining('"ins":7'), 'utf8');
  });

  test('a failed git diff is cached, so the next render does not spawn git again', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('claude-ticker-gitdiff-')) return JSON.stringify({ cwd: '/r', stats: null, ts: Date.now() });
      throw new Error('ENOENT');
    });
    vi.mocked(execSync).mockReturnValue('main\n');
    expect(FIELD_REGISTRY.git_branch.extract({ cwd: '/r', session_id: 'dc3' })).toMatchObject({ branch: 'main', ins: 0, del: 0 });
    expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining('git diff'), expect.anything());
  });

  test('resolves a relative gitdir (submodules) against the folder holding .git', () => {
    const dotGitFile = join('/super/sub', '.git');
    const moduleHead = join(resolve('/super/sub', '../.git/modules/sub'), 'HEAD');
    vi.mocked(existsSync).mockImplementation((p) => String(p) === dotGitFile || String(p) === moduleHead);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p) === dotGitFile) return 'gitdir: ../.git/modules/sub\n';
      if (String(p) === moduleHead) return 'ref: refs/heads/sub-main\n';
      throw new Error('ENOENT');
    });
    expect(FIELD_REGISTRY.git_branch.extract({ cwd: '/super/sub', session_id: 'sm' })).toMatchObject({ branch: 'sub-main' });
  });

  test('a failed git diff writes a null cache entry', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd).startsWith('git diff')) throw new Error('not a repo');
      return 'main\n';
    });
    FIELD_REGISTRY.git_branch.extract({ cwd: '/r', session_id: 'dc4' });
    expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('claude-ticker-gitdiff-dc4'), expect.stringContaining('"stats":null'), 'utf8');
  });

  test('no branch means no git diff at all', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(execSync).mockReturnValue('');
    expect(FIELD_REGISTRY.git_branch.extract({ cwd: '/not-a-repo', session_id: 'dc5' })).toMatchObject({ branch: undefined, ins: 0, del: 0 });
    expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining('git diff'), expect.anything());
  });
});
