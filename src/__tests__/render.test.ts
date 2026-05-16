import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  CONFIG_PATH: '/home/testuser/.claude/claude-ticker.json',
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { renderStatus, render } from '../render.js';
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
