import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  CONFIG_PATH: '/home/testuser/.claude/claude-ticker.json',
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('no file'); }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

import { readFileSync, writeFileSync } from 'fs';
import { renderStatus, render, mergeState, pruneExpiredWindows, visibleWidth, fitLine, availableWidth } from '../render.js';
import { loadConfig } from '../config.js';
import { DEFAULT_CONFIG, FIELD_REGISTRY } from '../fields.js';
import type { Config } from '../fields.js';
import { COLOR_CODES, RESET } from '../types.js';
import type { ColorName } from '../types.js';

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
});

describe('renderStatus', () => {
  test('renders fields in configured order separated by separator', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model', 'ctx'],
      separator: ' | ',
      colors: {},
    }));
    const data = {
      model: { display_name: 'Claude Sonnet 4.6' },
      context_window: { used_percentage: 10 },
    };
    const result = stripAnsi(renderStatus(data));
    expect(result).toBe('Sonnet 4.6 | ctx:10%');
  });

  test('skips fields not present in FIELD_REGISTRY (no-op)', () => {
    vi.mocked(loadConfig).mockReturnValue({
      ...makeConfig({ fields: ['model'] }),
      fields: ['model', 'nonexistent' as (typeof DEFAULT_CONFIG.fields)[number]],
    });
    const data = { model: { display_name: 'Claude Sonnet 4.6' } };
    const result = stripAnsi(renderStatus(data));
    expect(result).toBe('Sonnet 4.6');
  });

  test('skips fields with null render output', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model', 'ctx', 'cost'],
      separator: '  ',
      colors: {},
    }));
    const data = {
      model: { display_name: 'Claude Sonnet 4.6' },
      context_window: { used_percentage: 20 },
      // cost absent → renders null
    };
    const result = stripAnsi(renderStatus(data));
    expect(result).toBe('Sonnet 4.6  ctx:20%');
  });

  test('returns empty string when all fields render null', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['cost', 'duration'] }));
    const result = renderStatus({});
    expect(result).toBe('');
  });

  test('skips unknown fields gracefully', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model'] as typeof DEFAULT_CONFIG.fields,
      colors: {},
    }));
    const data = { model: { display_name: 'Claude Sonnet 4.6' } };
    const result = stripAnsi(renderStatus(data));
    expect(result).toBe('Sonnet 4.6');
  });
});

describe('dynamic color resolution', () => {
  const ctxConfig = (pct: number, thresholds = { warning: 50, critical: 75 }) => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['ctx'],
      thresholds,
      colors: {},
    }));
    return renderStatus({ context_window: { used_percentage: pct } });
  };

  test('green when below warning threshold', () => {
    const result = ctxConfig(30);
    expect(result).toContain(COLOR_CODES.green);
  });

  test('yellow when at or above warning but below critical', () => {
    const atWarning = ctxConfig(50);
    expect(atWarning).toContain(COLOR_CODES.yellow);

    const between = ctxConfig(60);
    expect(between).toContain(COLOR_CODES.yellow);
  });

  test('red when at or above critical threshold', () => {
    const atCritical = ctxConfig(75);
    expect(atCritical).toContain(COLOR_CODES.red);

    const above = ctxConfig(90);
    expect(above).toContain(COLOR_CODES.red);
  });

  test('custom thresholds are respected', () => {
    const result = ctxConfig(40, { warning: 30, critical: 60 });
    expect(result).toContain(COLOR_CODES.yellow); // 40 >= 30, < 60
  });
});

describe('static color resolution', () => {
  test('applies fixed color from config.colors', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model'],
      colors: { model: 'magenta' },
    }));
    const data = { model: { display_name: 'Claude Sonnet 4.6' } };
    const result = renderStatus(data);
    expect(result).toContain(COLOR_CODES.magenta);
    expect(result).toContain(RESET);
  });

  test('uses field defaultColor when not in config.colors', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['worktree'],
      colors: {},
    }));
    const data = { worktree: { branch: 'main' } };
    const result = renderStatus(data);
    // worktree defaultColor is 'cyan'
    expect(result).toContain(COLOR_CODES.cyan);
  });

  test('unrecognized color name resolves to empty string (no color applied)', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model'],
      colors: { model: 'badcolor' as unknown as ColorName },
    }));
    const data = { model: { display_name: 'Claude Sonnet 4.6' } };
    const result = renderStatus(data);
    expect(result).toBe('Sonnet 4.6');
  });

  test('none color produces no ANSI codes', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model'],
      colors: { model: 'none' },
    }));
    const data = { model: { display_name: 'Claude Sonnet 4.6' } };
    const result = renderStatus(data);
    expect(result).toBe('Sonnet 4.6');
  });
});

describe('separator', () => {
  test('uses configured separator', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model', 'version'],
      separator: ' :: ',
      colors: { model: 'none', version: 'none' },
    }));
    const data = {
      model: { display_name: 'Claude Sonnet 4.6' },
      version: '1.0.0',
    };
    const result = renderStatus(data);
    expect(result).toBe('Sonnet 4.6 :: v1.0.0');
  });
});

describe('renderStatus with all default fields', () => {
  test('renders complete status with all default fields populated', () => {
    const now = Math.floor(Date.now() / 1000);
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['dir', 'worktree', 'model', 'ctx', '5h', '7d'],
      separator: '  ',
      colors: {},
      thresholds: { warning: 50, critical: 75 },
      timeFormat: '24h',
      dirColors: {},
    }));

    const data = {
      workspace: { current_dir: '/home/testuser/projects/app' },
      worktree: { branch: 'main' },
      model: { display_name: 'Claude Sonnet 4.6' },
      context_window: { used_percentage: 10 },
      rate_limits: {
        five_hour: { used_percentage: 8, resets_at: now + 3600 },
        seven_day: { used_percentage: 55, resets_at: now + 86400 * 3 },
      },
    };

    const result = stripAnsi(renderStatus(data));
    expect(result).toContain('~/projects/app');
    expect(result).toContain('wt:main');
    expect(result).toContain('Sonnet 4.6');
    expect(result).toContain('ctx:10%');
    expect(result).toContain('5h:8%');
    expect(result).toContain('7d:55%');
  });
});

// ── render() — stdin-based entry point ───────────────────────────────────────

function makePipedStdin(data: string): NodeJS.ReadStream {
  const stream = Readable.from([data]) as unknown as NodeJS.ReadStream;
  (stream as unknown as Record<string, unknown>).isTTY = false;
  (stream as unknown as { setEncoding: (enc: string) => void }).setEncoding = () => {};
  return stream;
}

describe('render() stdin entry point', () => {
  let originalStdinDescriptor: PropertyDescriptor | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model'],
      colors: { model: 'none' },
      separator: '  ',
      dirColors: {},
      thresholds: { warning: 50, critical: 75 },
      timeFormat: '24h',
    }));
  });

  afterEach(() => {
    if (originalStdinDescriptor) {
      Object.defineProperty(process, 'stdin', originalStdinDescriptor);
    }
    stdoutSpy.mockRestore();
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test('TTY mode: logs help message and returns without writing stdout', async () => {
    const ttyStream = Object.assign(new Readable({ read() {} }), { isTTY: true });
    Object.defineProperty(process, 'stdin', { value: ttyStream, configurable: true });

    await render();

    expect(consoleSpy).toHaveBeenCalledWith('claude-ticker is a status bar hook for Claude CLI.\n');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  test('piped stdin: parses JSON and writes rendered output', async () => {
    const data = JSON.stringify({ model: { display_name: 'Claude Sonnet 4.6' } });
    Object.defineProperty(process, 'stdin', { value: makePipedStdin(data), configurable: true });

    await render();

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(stripAnsi(stdoutSpy.mock.calls[0][0] as string)).toContain('Sonnet 4.6');
  });

  test('piped stdin: writes error message on invalid JSON', async () => {
    Object.defineProperty(process, 'stdin', {
      value: makePipedStdin('this is not json'),
      configurable: true,
    });

    await render();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith('\x1b[2m\x1b[91m[claude-ticker: parse error]\x1b[0m\n');
  });

  test('piped stdin: concatenates multiple chunks', async () => {
    const chunks = ['{"model":{"display_n', 'ame":"Claude Opus 4.7"}}'];
    const stream = Readable.from(chunks) as unknown as NodeJS.ReadStream;
    (stream as unknown as Record<string, unknown>).isTTY = false;
    (stream as unknown as { setEncoding: (enc: string) => void }).setEncoding = () => {};
    Object.defineProperty(process, 'stdin', { value: stream, configurable: true });

    await render();

    expect(stripAnsi(stdoutSpy.mock.calls[0][0] as string)).toContain('Opus 4.7');
  });
});

// ── mergeState ───────────────────────────────────────────────────────────────

describe('mergeState', () => {
  const NOW = 1_000_000_000;
  const TTL = 120_000;
  const cacheOf = (data: Record<string, unknown>, seen: Record<string, number> = {}, ts = NOW) => ({ data, seen, ts });

  test('without a cache returns current and marks every key seen now', () => {
    const state = mergeState(null, { a: 1, rate_limits: { five_hour: { x: 1 } } }, NOW, TTL);
    expect(state.data).toEqual({ a: 1, rate_limits: { five_hour: { x: 1 } } });
    expect(state.seen).toEqual({ a: NOW, rate_limits: NOW, 'rate_limits.five_hour': NOW });
    expect(state.ts).toBe(NOW);
  });

  test('current keys win over cached keys', () => {
    const state = mergeState(cacheOf({ a: 1, b: 2 }, { a: NOW, b: NOW }), { a: 10 }, NOW + 1, TTL);
    expect(state.data).toEqual({ a: 10, b: 2 });
  });

  test('backfills a missing key seen within the TTL, keeping its original seen time', () => {
    const state = mergeState(cacheOf({ cost: { total_cost_usd: 1 } }, { cost: NOW }), {}, NOW + 60_000, TTL);
    expect(state.data).toEqual({ cost: { total_cost_usd: 1 } });
    expect(state.seen.cost).toBe(NOW);
  });

  test('stops backfilling once the key has been absent for the TTL (does not self-refresh)', () => {
    let state = mergeState(cacheOf({ cost: { total_cost_usd: 1 } }, { cost: NOW }), {}, NOW + 60_000, TTL);
    state = mergeState(state, {}, NOW + 110_000, TTL);
    expect(state.data.cost).toBeDefined();
    state = mergeState(state, {}, NOW + TTL, TTL);
    expect(state.data.cost).toBeUndefined();
  });

  test.each(['pr', 'vim', 'agent', 'worktree', 'effort'])('never backfills %s (its absence is meaningful)', (key) => {
    const state = mergeState(cacheOf({ [key]: { any: 1 } }, { [key]: NOW }), {}, NOW + 1, TTL);
    expect(state.data[key]).toBeUndefined();
  });

  test('backfills a rate-limit window missing from a partial rate_limits object', () => {
    const cached = { rate_limits: { five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } } };
    const state = mergeState(
      cacheOf(cached, { rate_limits: NOW, 'rate_limits.five_hour': NOW, 'rate_limits.seven_day': NOW }),
      { rate_limits: { five_hour: { used_percentage: 35 } } },
      NOW + 1, TTL,
    );
    expect(state.data.rate_limits).toEqual({ five_hour: { used_percentage: 35 }, seven_day: { used_percentage: 55 } });
    expect(state.seen['rate_limits.seven_day']).toBe(NOW);
    expect(state.seen['rate_limits.five_hour']).toBe(NOW + 1);
  });

  test('drops a stale rate-limit window even while the other window keeps arriving', () => {
    const cached = { rate_limits: { five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } } };
    const state = mergeState(
      cacheOf(cached, { rate_limits: NOW + TTL, 'rate_limits.five_hour': NOW, 'rate_limits.seven_day': NOW + TTL }),
      { rate_limits: { seven_day: { used_percentage: 56 } } },
      NOW + TTL + 1, TTL,
    );
    expect(state.data.rate_limits).toEqual({ seven_day: { used_percentage: 56 } });
  });

  test('legacy cache without a seen map treats every key as seen at the cache timestamp', () => {
    const legacy = { data: { cost: { total_cost_usd: 1 } }, seen: {}, ts: NOW };
    expect(mergeState(legacy, {}, NOW + 1, TTL).data.cost).toBeDefined();
    expect(mergeState(legacy, {}, NOW + TTL, TTL).data.cost).toBeUndefined();
  });

  test('replaces arrays and scalars wholesale', () => {
    const state = mergeState(cacheOf({ tags: ['a'], x: { n: 1 } }, { tags: NOW, x: NOW }), { tags: ['c'], x: 's' }, NOW + 1, TTL);
    expect(state.data).toEqual({ tags: ['c'], x: 's' });
  });
});

// ── pruneExpiredWindows ──────────────────────────────────────────────────────

describe('pruneExpiredWindows', () => {
  test('drops windows whose resets_at has passed, keeps the rest', () => {
    const data = { rate_limits: { five_hour: { resets_at: 100 }, seven_day: { resets_at: 300 } }, other: 1 };
    expect(pruneExpiredWindows(data, 200)).toEqual({ rate_limits: { seven_day: { resets_at: 300 } }, other: 1 });
  });

  test('removes rate_limits entirely when every window expired', () => {
    expect(pruneExpiredWindows({ rate_limits: { five_hour: { resets_at: 100 } } }, 100)).toEqual({});
  });

  test('keeps windows without a resets_at', () => {
    const data = { rate_limits: { spend_limit: { used_percentage: 10 } } };
    expect(pruneExpiredWindows(data, 1e12)).toEqual(data);
  });

  test('returns data unchanged when there are no rate limits', () => {
    const data = { a: 1 };
    expect(pruneExpiredWindows(data, 0)).toBe(data);
  });
});

// ── layout ───────────────────────────────────────────────────────────────────

describe('visibleWidth', () => {
  test('ignores SGR color codes and OSC 8 hyperlinks', () => {
    const s = `${COLOR_CODES.red}ab${RESET}\x1b]8;;https://x.y\x07cd\x1b]8;;\x07`;
    expect(visibleWidth(s)).toBe(4);
  });

  test('counts code points, not UTF-16 units', () => {
    expect(visibleWidth('✓•')).toBe(2);
  });
});

describe('fitLine', () => {
  test('joins all parts when width is unknown', () => {
    expect(fitLine(['aa', 'bb'], '  ', null)).toBe('aa  bb');
  });

  test('drops trailing parts that would overflow', () => {
    expect(fitLine(['aaaa', 'bbbb', 'cccc'], '  ', 10)).toBe('aaaa  bbbb');
    expect(fitLine(['aaaa', 'bbbb', 'cccc'], '  ', 9)).toBe('aaaa');
  });

  test('always keeps the first part', () => {
    expect(fitLine(['a-very-long-part', 'b'], ' ', 3)).toBe('a-very-long-part');
  });
});

describe('availableWidth', () => {
  const cfg = makeConfig({ padding: 2 });
  test('subtracts padding from COLUMNS', () => {
    expect(availableWidth('80', cfg)).toBe(78);
  });
  test.each([undefined, '', 'abc', '0', '-5'])('returns null for unusable COLUMNS %j', (v) => {
    expect(availableWidth(v, cfg)).toBeNull();
  });
});

describe('renderStatus layout', () => {
  test('newline field splits output into lines and empty lines are dropped', () => {
    const cfg = makeConfig({ fields: ['model', 'newline', 'cost', 'newline', 'ctx'], separator: ' ', colors: {} });
    const out = stripAnsi(renderStatus({ model: { display_name: 'Claude Opus 5.5' }, context_window: { used_percentage: 9 } }, cfg));
    expect(out).toBe('Opus 5.5\nctx:9%');
  });

  test('fits each line to the width independently', () => {
    const cfg = makeConfig({ fields: ['model', 'ctx', 'newline', 'version', 'session'], separator: ' ', colors: {} });
    const data = { model: { display_name: 'Claude Opus 5.5' }, context_window: { used_percentage: 9 }, version: '2.1.330', session_name: 'abc' };
    expect(stripAnsi(renderStatus(data, cfg, 10))).toBe('Opus 5.5\nv2.1.330');
  });
});

// ── state caching in render() ────────────────────────────────────────────────

describe('state caching', () => {
  let originalStdinDescriptor: PropertyDescriptor | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('no file'); });
    vi.mocked(writeFileSync).mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalStdinDescriptor) {
      Object.defineProperty(process, 'stdin', originalStdinDescriptor);
    }
    stdoutSpy.mockRestore();
  });

  function pipeData(data: Record<string, unknown>): void {
    const stream = Readable.from([JSON.stringify(data)]) as unknown as NodeJS.ReadStream;
    (stream as unknown as Record<string, unknown>).isTTY = false;
    (stream as unknown as { setEncoding: (enc: string) => void }).setEncoding = () => {};
    Object.defineProperty(process, 'stdin', { value: stream, configurable: true });
  }

  test('writes state cache after rendering', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['ctx'], colors: {} }));
    pipeData({ context_window: { used_percentage: 42 }, session_id: 'test-sess' });

    await render();

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('claude-ticker-state-test-sess'),
      expect.stringContaining('"used_percentage":42'),
      'utf8',
    );
  });

  test('merges cached state into current when cache is fresh', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['ctx', '5h'],
      colors: {},
      staleTTL: 120,
    }));

    const cachedData = {
      context_window: { used_percentage: 40 },
      rate_limits: { five_hour: { used_percentage: 30, resets_at: 9999999999 } },
      session_id: 's1',
    };
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ data: cachedData, ts: Date.now() }),
    );

    pipeData({ context_window: { used_percentage: 55 }, session_id: 's1' });

    await render();

    const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toContain('ctx:55%');
    expect(output).toContain('5h:30%');
  });

  test('ignores expired cache', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['ctx', '5h'],
      colors: {},
      staleTTL: 120,
    }));

    const cachedData = {
      context_window: { used_percentage: 40 },
      rate_limits: { five_hour: { used_percentage: 30, resets_at: 9999999999 } },
    };
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ data: cachedData, ts: Date.now() - 200_000 }),
    );

    pipeData({ context_window: { used_percentage: 55 }, session_id: 's2' });

    await render();

    const output = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
    expect(output).toContain('ctx:55%');
    expect(output).not.toContain('5h');
  });

  test('uses "default" session_id when none provided', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['model'], colors: { model: 'none' } }));
    pipeData({ model: { display_name: 'Claude Opus 4.7' } });

    await render();

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('claude-ticker-state-default'),
      expect.any(String),
      'utf8',
    );
  });
});

// ── render() end to end: stale data and width ────────────────────────────────

describe('render() with Claude Code dropping data', () => {
  let originalStdinDescriptor: PropertyDescriptor | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  const originalColumns = process.env.COLUMNS;

  beforeEach(() => {
    originalStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    delete process.env.COLUMNS;
  });

  afterEach(() => {
    if (originalStdinDescriptor) Object.defineProperty(process, 'stdin', originalStdinDescriptor);
    stdoutSpy.mockRestore();
    if (originalColumns === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = originalColumns;
  });

  function pipe(data: Record<string, unknown>): void {
    const stream = Readable.from([JSON.stringify(data)]) as unknown as NodeJS.ReadStream;
    (stream as unknown as Record<string, unknown>).isTTY = false;
    (stream as unknown as { setEncoding: (enc: string) => void }).setEncoding = () => {};
    Object.defineProperty(process, 'stdin', { value: stream, configurable: true });
  }

  test('a rate-limit window past its reset is not shown even if cached', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['ctx', '5h'], colors: {}, staleTTL: 120 }));
    const past = Math.floor(Date.now() / 1000) - 1;
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      data: { rate_limits: { five_hour: { used_percentage: 88, resets_at: past } } },
      seen: { rate_limits: Date.now(), 'rate_limits.five_hour': Date.now() },
      ts: Date.now(),
    }));
    pipe({ session_id: 'drop1', context_window: { used_percentage: 5 } });
    await render();
    const out = stripAnsi(stdoutSpy.mock.calls[0][0] as string);
    expect(out).toBe('ctx:5%');
  });

  test('a cached PR is not shown once Claude Code stops sending it', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['ctx', 'pr'], colors: {}, staleTTL: 120 }));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      data: { pr: { number: 7, url: 'https://github.com/a/b/pull/7' } }, seen: { pr: Date.now() }, ts: Date.now(),
    }));
    pipe({ session_id: 'drop2', context_window: { used_percentage: 5 } });
    await render();
    expect(stripAnsi(stdoutSpy.mock.calls[0][0] as string)).toBe('ctx:5%');
  });

  test('uses COLUMNS minus padding to drop overflowing trailing fields', async () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['ctx', 'version'], colors: {}, separator: ' ', padding: 0 }));
    process.env.COLUMNS = '8';
    pipe({ session_id: 'w1', context_window: { used_percentage: 5 }, version: '2.1.330' });
    await render();
    expect(stripAnsi(stdoutSpy.mock.calls[0][0] as string)).toBe('ctx:5%');
  });
});
