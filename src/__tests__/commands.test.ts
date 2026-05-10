import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  CONFIG_PATH: '/home/testuser/.claude/claude-ticker.json',
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import {
  handleFields,
  handleColor,
  handleDirColor,
  handleSeparator,
  handleTime,
  handleConfigCmd,
  preview,
} from '../commands.js';
import { loadConfig, saveConfig } from '../config.js';
import { DEFAULT_CONFIG, ALL_FIELDS } from '../fields.js';
import type { Config } from '../fields.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    colors: { ...DEFAULT_CONFIG.colors },
    thresholds: { ...DEFAULT_CONFIG.thresholds },
    dirColors: { ...DEFAULT_CONFIG.dirColors },
    dirNames: { ...DEFAULT_CONFIG.dirNames },
    fields: [...DEFAULT_CONFIG.fields],
    ...overrides,
  };
}

let mockExit: ReturnType<typeof vi.spyOn>;
let mockConsoleLog: ReturnType<typeof vi.spyOn>;
let mockConsoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadConfig).mockReturnValue(makeConfig());
  mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── handleFields ──────────────────────────────────────────────────────────────

describe('handleFields', () => {
  describe('list (default)', () => {
    test('prints header with no args', () => {
      handleFields([]);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Field'));
    });

    test('prints header with "list" subcommand', () => {
      handleFields(['list']);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Field'));
    });

    test('shows visible and hidden fields', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['dir', 'model'] }));
      handleFields(['list']);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      const dirLine = calls.find(l => l.startsWith('dir'));
      const ctxLine = calls.find(l => l.startsWith('ctx'));
      expect(dirLine).toContain('yes');
      expect(ctxLine).toContain('no');
    });

    test('prints usage hint', () => {
      handleFields([]);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some(l => l.includes('show|hide|order'))).toBe(true);
    });
  });

  describe('show', () => {
    test('adds field to config and saves', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['dir'] }));
      handleFields(['show', 'model']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({ fields: expect.arrayContaining(['dir', 'model']) }),
      );
    });

    test('does not duplicate already-visible field', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['dir', 'model'] }));
      handleFields(['show', 'model']);
      expect(vi.mocked(saveConfig)).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('already visible'));
    });

    test('dies on unknown field', () => {
      expect(() => handleFields(['show', 'nonexistent'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown field'));
    });

    test('dies when field argument is missing', () => {
      expect(() => handleFields(['show'])).toThrow('process.exit');
    });
  });

  describe('hide', () => {
    test('removes field from config and saves', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['dir', 'model', 'ctx'] }));
      handleFields(['hide', 'model']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({ fields: expect.not.arrayContaining(['model']) }),
      );
    });

    test('saves even when field not currently visible', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ fields: ['dir'] }));
      handleFields(['hide', 'model']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalled();
    });

    test('dies on unknown field', () => {
      expect(() => handleFields(['hide', 'nonexistent'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown field'));
    });

    test('dies when field argument is missing', () => {
      expect(() => handleFields(['hide'])).toThrow('process.exit');
    });
  });

  describe('order', () => {
    test('sets fields to the given ordered list', () => {
      handleFields(['order', 'ctx', 'model', 'dir']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({ fields: ['ctx', 'model', 'dir'] }),
      );
    });

    test('dies when no fields provided', () => {
      expect(() => handleFields(['order'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });

    test('dies on unknown fields', () => {
      expect(() => handleFields(['order', 'dir', 'unknown'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown fields'));
    });
  });

  describe('unknown subcommand', () => {
    test('dies with error message', () => {
      expect(() => handleFields(['bogus'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
    });
  });
});

// ── handleColor ───────────────────────────────────────────────────────────────

describe('handleColor', () => {
  describe('list (default)', () => {
    test('prints header with no args', () => {
      handleColor([]);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Field'));
    });

    test('prints header with "list" subcommand', () => {
      handleColor(['list']);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Field'));
    });

    test('shows valid colors list', () => {
      handleColor(['list']);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some(l => l.includes('Valid colors'))).toBe(true);
    });

    test('shows threshold notes for dynamic fields', () => {
      handleColor(['list']);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      // dynamic fields show threshold details
      expect(calls.some(l => l.includes('green') || l.includes('yellow') || l.includes('red'))).toBe(true);
    });

    test('shows config-overridden color with "config" source', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ colors: { model: 'blue' } }));
      handleColor(['list']);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      const modelLine = calls.find(l => l.startsWith('model'));
      expect(modelLine).toContain('config');
    });

    test('shows default source for non-overridden fields', () => {
      handleColor(['list']);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      const modelLine = calls.find(l => l.startsWith('model'));
      expect(modelLine).toContain('default');
    });
  });

  describe('set', () => {
    test('saves color for field', () => {
      handleColor(['set', 'model', 'blue']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({ colors: expect.objectContaining({ model: 'blue' }) }),
      );
    });

    test('dies on unknown field', () => {
      expect(() => handleColor(['set', 'nonexistent', 'blue'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown field'));
    });

    test('dies on unknown color', () => {
      expect(() => handleColor(['set', 'model', 'purple'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown color'));
    });

    test('dies when field argument missing', () => {
      expect(() => handleColor(['set'])).toThrow('process.exit');
    });
  });

  describe('reset', () => {
    test('removes color override for field', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ colors: { model: 'blue' } }));
      handleColor(['reset', 'model']);
      const saved = vi.mocked(saveConfig).mock.calls[0][0];
      expect(saved.colors.model).toBeUndefined();
    });

    test('dies on unknown field', () => {
      expect(() => handleColor(['reset', 'nonexistent'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown field'));
    });

    test('dies when field argument missing', () => {
      expect(() => handleColor(['reset'])).toThrow('process.exit');
    });
  });

  describe('thresholds', () => {
    test('saves warning and critical thresholds', () => {
      handleColor(['thresholds', '40', '70']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({ thresholds: { warning: 40, critical: 70 } }),
      );
    });

    test('dies on non-numeric values', () => {
      expect(() => handleColor(['thresholds', 'abc', '70'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });

    test('dies when warning >= critical', () => {
      expect(() => handleColor(['thresholds', '75', '50'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });

    test('dies when critical > 100', () => {
      expect(() => handleColor(['thresholds', '50', '101'])).toThrow('process.exit');
    });

    test('dies when warning < 0', () => {
      expect(() => handleColor(['thresholds', '-1', '75'])).toThrow('process.exit');
    });

    test('dies when thresholds missing', () => {
      expect(() => handleColor(['thresholds'])).toThrow('process.exit');
    });
  });

  describe('unknown subcommand', () => {
    test('dies with error message', () => {
      expect(() => handleColor(['bogus'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
    });
  });
});

// ── handleDirColor ────────────────────────────────────────────────────────────

describe('handleDirColor', () => {
  describe('list (default)', () => {
    test('prints no-entries message when dirColors is empty', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({ dirColors: {} }));
      handleDirColor([]);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No directory colors'));
    });

    test('shows entries when dirColors has items', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({
        dirColors: { '/home/testuser/work': 'blue' },
      }));
      handleDirColor(['list']);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some(l => l.includes('/home/testuser/work'))).toBe(true);
      expect(calls.some(l => l.includes('blue'))).toBe(true);
    });

    test('prints valid colors list', () => {
      handleDirColor([]);
      const calls: string[] = mockConsoleLog.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some(l => l.includes('Valid colors'))).toBe(true);
    });
  });

  describe('set', () => {
    test('saves path-color mapping', () => {
      handleDirColor(['set', '/home/testuser/work', 'green']);
      expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
        expect.objectContaining({
          dirColors: expect.objectContaining({ '/home/testuser/work': 'green' }),
        }),
      );
    });

    test('dies on unknown color', () => {
      expect(() => handleDirColor(['set', '/some/path', 'purple'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown color'));
    });

    test('dies when path or color missing', () => {
      expect(() => handleDirColor(['set', '/some/path'])).toThrow('process.exit');
      expect(() => handleDirColor(['set'])).toThrow('process.exit');
    });

    test('rejects dim/dynamic/none as dir colors', () => {
      expect(() => handleDirColor(['set', '/path', 'dim'])).toThrow('process.exit');
      expect(() => handleDirColor(['set', '/path', 'dynamic'])).toThrow('process.exit');
      expect(() => handleDirColor(['set', '/path', 'none'])).toThrow('process.exit');
    });
  });

  describe('reset', () => {
    test('removes path from dirColors', () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig({
        dirColors: { '/home/testuser/work': 'blue' },
      }));
      handleDirColor(['reset', '/home/testuser/work']);
      const saved = vi.mocked(saveConfig).mock.calls[0][0];
      expect(saved.dirColors['/home/testuser/work']).toBeUndefined();
    });

    test('dies when path is missing', () => {
      expect(() => handleDirColor(['reset'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('unknown subcommand', () => {
    test('dies with error message', () => {
      expect(() => handleDirColor(['bogus'])).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
    });
  });
});

// ── handleSeparator ───────────────────────────────────────────────────────────

describe('handleSeparator', () => {
  test('prints current separator when no args', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ separator: ' | ' }));
    handleSeparator([]);
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('" | "'));
  });

  test('saves new separator', () => {
    handleSeparator([' :: ']);
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ separator: ' :: ' }),
    );
  });

  test('joins multiple args with space', () => {
    handleSeparator(['foo', 'bar']);
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ separator: 'foo bar' }),
    );
  });

  test('allows setting separator to empty string', () => {
    handleSeparator(['']);
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ separator: '' }),
    );
  });
});

// ── handleTime ────────────────────────────────────────────────────────────────

describe('handleTime', () => {
  test('sets timeFormat to 12h', () => {
    handleTime(['12h']);
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ timeFormat: '12h' }),
    );
  });

  test('sets timeFormat to 24h', () => {
    handleTime(['24h']);
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ timeFormat: '24h' }),
    );
  });

  test('dies on invalid format', () => {
    expect(() => handleTime(['48h'])).toThrow('process.exit');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  test('dies when no argument provided', () => {
    expect(() => handleTime([])).toThrow('process.exit');
  });
});

// ── handleConfigCmd ───────────────────────────────────────────────────────────

describe('handleConfigCmd', () => {
  test('prints full JSON config with no args', () => {
    const cfg = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(cfg);
    handleConfigCmd([]);
    expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(cfg, null, 2));
  });

  test('prints full JSON config with "show"', () => {
    const cfg = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(cfg);
    handleConfigCmd(['show']);
    expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(cfg, null, 2));
  });

  test('resets to DEFAULT_CONFIG', () => {
    handleConfigCmd(['reset']);
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: DEFAULT_CONFIG.fields,
        thresholds: DEFAULT_CONFIG.thresholds,
        separator: DEFAULT_CONFIG.separator,
      }),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('reset'));
  });

  test('dies on unknown subcommand', () => {
    expect(() => handleConfigCmd(['bogus'])).toThrow('process.exit');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
  });
});

// ── preview ───────────────────────────────────────────────────────────────────

describe('preview', () => {
  test('writes rendered output to stdout', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['dir', 'model', 'ctx'],
      colors: {},
      separator: '  ',
      dirColors: {},
      thresholds: { warning: 50, critical: 75 },
      timeFormat: '24h',
    }));

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    preview();
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = stdoutSpy.mock.calls[0][0] as string;
    // Should contain at least one field and end with newline
    expect(output).toBeTruthy();
    expect(output.endsWith('\n')).toBe(true);
    stdoutSpy.mockRestore();
  });

  test('sample data includes expected fields', () => {
    vi.mocked(loadConfig).mockReturnValue(makeConfig({
      fields: ['model', 'session', 'version'],
      colors: { model: 'none', session: 'none', version: 'none' },
      separator: '  ',
      dirColors: {},
      thresholds: { warning: 50, critical: 75 },
      timeFormat: '24h',
    }));

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    preview();
    const output = (stdoutSpy.mock.calls[0][0] as string).replace(/\x1b\[[0-9;]*m/g, '');
    expect(output).toContain('Sonnet 4.6');
    expect(output).toContain('session:my-feature');
    expect(output).toContain('v1.4.2');
    stdoutSpy.mockRestore();
  });
});
