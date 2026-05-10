import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return { ...actual };
});

import * as fs from 'fs';
import { loadConfig, saveConfig, CONFIG_PATH } from '../config.js';
import { DEFAULT_CONFIG } from '../fields.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CONFIG_PATH', () => {
  test('points to .claude/claude-ticker.json under home', () => {
    expect(CONFIG_PATH).toContain('claude-ticker.json');
    expect(CONFIG_PATH).toContain('.claude');
  });
});

describe('loadConfig', () => {
  test('returns DEFAULT_CONFIG when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = loadConfig();
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  test('returns clone (not reference) of DEFAULT_CONFIG when file missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const a = loadConfig();
    const b = loadConfig();
    expect(a).not.toBe(b);
  });

  test('merges saved config with defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const saved = { separator: ' :: ', timeFormat: '12h' };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(saved));
    const result = loadConfig();
    expect(result.separator).toBe(' :: ');
    expect(result.timeFormat).toBe('12h');
    // defaults still present
    expect(result.thresholds).toEqual(DEFAULT_CONFIG.thresholds);
    expect(result.fields).toEqual(DEFAULT_CONFIG.fields);
  });

  test('merges nested colors with defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const saved = { colors: { dir: 'blue' } };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(saved));
    const result = loadConfig();
    expect(result.colors.dir).toBe('blue');
  });

  test('merges nested thresholds with defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const saved = { thresholds: { warning: 60, critical: 80 } };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(saved));
    const result = loadConfig();
    expect(result.thresholds).toEqual({ warning: 60, critical: 80 });
  });

  test('merges nested dirColors with defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const saved = { dirColors: { '/home/testuser/work': 'green' } };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(saved));
    const result = loadConfig();
    expect(result.dirColors['/home/testuser/work']).toBe('green');
  });

  test('returns DEFAULT_CONFIG on invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json !!!');
    const result = loadConfig();
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  test('returns DEFAULT_CONFIG on readFileSync throwing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    const result = loadConfig();
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  test('reads from CONFIG_PATH', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
    loadConfig();
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(CONFIG_PATH, 'utf8');
  });
});

describe('saveConfig', () => {
  test('writes JSON to CONFIG_PATH', () => {
    const cfg = { ...DEFAULT_CONFIG, separator: ' | ' };
    saveConfig(cfg);
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      CONFIG_PATH,
      JSON.stringify(cfg, null, 2),
      'utf8',
    );
  });

  test('logs the save path', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    saveConfig(DEFAULT_CONFIG);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(CONFIG_PATH));
    consoleSpy.mockRestore();
  });

  test('produces valid JSON output', () => {
    let written = '';
    vi.mocked(fs.writeFileSync).mockImplementation((_path, content) => {
      written = content as string;
    });
    saveConfig(DEFAULT_CONFIG);
    expect(() => JSON.parse(written)).not.toThrow();
    expect(JSON.parse(written)).toEqual(DEFAULT_CONFIG);
  });
});
