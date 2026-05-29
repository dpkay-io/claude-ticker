import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
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

import { FIELD_REGISTRY, ALL_FIELDS, DEFAULT_CONFIG } from '../fields.js';
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
    expect(f.extract({ cwd: '/my/repo' })).toBe('fast-branch');
    expect(execSync).not.toHaveBeenCalled();
  });

  test('extract: zero-spawn fast-path traverses up directories', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const sp = String(p).replace(/\\/g, '/');
      return sp === '/my/repo/.git/HEAD';
    });
    vi.mocked(readFileSync).mockReturnValue('ref: refs/heads/deep-branch\n');
    expect(f.extract({ cwd: '/my/repo/src/components' })).toBe('deep-branch');
    expect(execSync).not.toHaveBeenCalled();
  });

  test('extract: returns branch name from git', () => {
    vi.mocked(execSync).mockReturnValue('main\n');
    expect(f.extract({})).toBe('main');
  });

  test('extract: returns undefined when not a git repo', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not a git repo'); });
    expect(f.extract({})).toBeUndefined();
  });

  test('extract: returns undefined on detached HEAD (empty output)', () => {
    vi.mocked(execSync).mockReturnValue('');
    expect(f.extract({})).toBeUndefined();
  });

  test('extract: trims trailing newline', () => {
    vi.mocked(execSync).mockReturnValue('feat/my-feature\n');
    expect(f.extract({})).toBe('feat/my-feature');
  });

  test('extract: returns cached branch within TTL without calling git', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ branch: 'cached-branch', ts: Date.now() }),
    );
    expect(f.extract({ session_id: 'sess1' })).toBe('cached-branch');
    expect(execSync).not.toHaveBeenCalled();
  });

  test('extract: caches undefined (non-repo) within TTL', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ branch: undefined, ts: Date.now() }),
    );
    expect(f.extract({ session_id: 'sess2' })).toBeUndefined();
    expect(execSync).not.toHaveBeenCalled();
  });

  test('extract: refreshes after TTL expires', () => {
    vi.mocked(execSync).mockReturnValue('new-branch\n');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ branch: 'old-branch', ts: Date.now() - 20_000 }),
    );
    expect(f.extract({ session_id: 'sess3' })).toBe('new-branch');
    expect(execSync).toHaveBeenCalled();
  });

  test('percentValue is null', () => {
    expect(f.percentValue).toBeNull();
  });

  test('render: displays branch name directly', () => {
    const result = f.render('main', NO_COLOR, OPTS);
    expect(stripAnsi(result!)).toBe('main');
  });

  test('render: applies color', () => {
    const col = COLOR_CODES.cyan;
    const result = f.render('feat/new-ui', col, OPTS);
    expect(result).toBe(col + 'feat/new-ui' + RESET);
  });

  test('render: returns null for non-strings', () => {
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
