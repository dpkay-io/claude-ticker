import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('../config.js', async () => {
  const { DEFAULT_CONFIG } = await import('../fields.js');
  return { loadConfig: vi.fn(() => structuredClone(DEFAULT_CONFIG)) };
});

const mockRl = { question: vi.fn(), close: vi.fn() };
vi.mock('readline/promises', () => ({
  createInterface: vi.fn(() => mockRl),
}));

import * as fs from 'fs';
import { join } from 'path';
import { init } from '../init.js';

// Compute paths using path.join (same as init.ts) so they use platform separators
const CLAUDE_DIR    = join('/home/testuser', '.claude');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const BACKUP_PATH   = join(CLAUDE_DIR, 'settings.json.bak');
const COMMAND       = 'claude-ticker';
const DEFAULT_STATUS_LINE = { type: 'command', command: COMMAND, refreshInterval: 30 };

let mockExit: ReturnType<typeof vi.spyOn>;
let mockConsoleLog: ReturnType<typeof vi.spyOn>;
let mockConsoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mockRl.question.mockResolvedValue('');
  mockRl.close.mockReset();
});

describe('init', () => {
  test('creates .claude directory', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await init();
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true });
  });

  describe('when settings.json does not exist', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('writes a new settings.json with statusLine command', async () => {
      await init();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        SETTINGS_PATH,
        JSON.stringify({ statusLine: DEFAULT_STATUS_LINE }, null, 2),
        'utf8',
      );
    });

    test('logs creation message', async () => {
      await init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(SETTINGS_PATH));
    });

    test('logs restart message', async () => {
      await init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Restart'));
    });

    test('does not copy backup', async () => {
      await init();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
    });
  });

  describe('when settings.json exists and already configured with current options', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ statusLine: DEFAULT_STATUS_LINE }),
      );
    });

    test('logs already configured message', async () => {
      await init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Already configured'));
    });

    test('does not modify files', async () => {
      await init();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
    });
  });

  describe('when settings.json is configured by an older claude-ticker (no options)', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: COMMAND } }),
      );
    });

    test('adds the new options without prompting or backing up', async () => {
      await init();
      expect(mockRl.question).not.toHaveBeenCalled();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.statusLine).toEqual(DEFAULT_STATUS_LINE);
      expect(written.theme).toBe('dark');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Added missing status line options'));
    });
  });

  describe('when the claude-ticker statusLine has a user-chosen refreshInterval', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ statusLine: { type: 'command', command: COMMAND, refreshInterval: 5 } }),
      );
    });

    test('keeps it and makes no changes', async () => {
      await init();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No changes made'));
    });
  });

  describe('when settings.json exists with different config', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'other-tool' } }),
      );
    });

    test('prompts with existing command name', async () => {
      await init();
      expect(mockRl.question).toHaveBeenCalledWith(expect.stringContaining('other-tool'));
    });

    test('backs up existing settings when user confirms', async () => {
      await init();
      expect(vi.mocked(fs.copyFileSync)).toHaveBeenCalledWith(SETTINGS_PATH, BACKUP_PATH);
    });

    test('logs backup message', async () => {
      await init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(BACKUP_PATH));
    });

    test('writes updated settings preserving other keys', async () => {
      await init();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.theme).toBe('dark');
      expect(written.statusLine).toEqual(DEFAULT_STATUS_LINE);
    });

    test('writes to SETTINGS_PATH', async () => {
      await init();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        SETTINGS_PATH,
        expect.any(String),
        'utf8',
      );
    });

    test('logs update message', async () => {
      await init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(SETTINGS_PATH));
    });

    test('logs restart message', async () => {
      await init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Restart'));
    });

    test('aborts without changes when user answers n', async () => {
      mockRl.question.mockResolvedValue('n');
      await init();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Aborted'));
    });

    test('aborts without changes when user answers N', async () => {
      mockRl.question.mockResolvedValue('N');
      await init();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    test('proceeds when user answers y', async () => {
      mockRl.question.mockResolvedValue('y');
      await init();
      expect(vi.mocked(fs.copyFileSync)).toHaveBeenCalled();
    });
  });

  describe('when settings.json has no statusLine', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }));
    });

    test('adds statusLine to existing config without prompting', async () => {
      await init();
      expect(mockRl.question).not.toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.statusLine).toEqual(DEFAULT_STATUS_LINE);
      expect(written.theme).toBe('dark');
    });
  });

  describe('when settings.json has invalid JSON', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json }');
    });

    test('logs error and exits', async () => {
      await expect(init()).rejects.toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Cannot parse'));
    });
  });
});
