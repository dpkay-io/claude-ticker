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

import * as fs from 'fs';
import { join } from 'path';
import { init } from '../init.js';

// Compute paths using path.join (same as init.ts) so they use platform separators
const CLAUDE_DIR    = join('/home/testuser', '.claude');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const BACKUP_PATH   = join(CLAUDE_DIR, 'settings.json.bak');
const COMMAND       = 'claude-ticker';

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
});

describe('init', () => {
  test('creates .claude directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    init();
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true });
  });

  describe('when settings.json does not exist', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('writes a new settings.json with statusLine command', () => {
      init();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        SETTINGS_PATH,
        JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }, null, 2),
        'utf8',
      );
    });

    test('logs creation message', () => {
      init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(SETTINGS_PATH));
    });

    test('logs restart message', () => {
      init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Restart'));
    });

    test('does not copy backup', () => {
      init();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
    });
  });

  describe('when settings.json exists and already configured', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }),
      );
    });

    test('logs already configured message', () => {
      init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Already configured'));
    });

    test('does not modify files', () => {
      init();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
      expect(vi.mocked(fs.copyFileSync)).not.toHaveBeenCalled();
    });
  });

  describe('when settings.json exists with different config', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'other-tool' } }),
      );
    });

    test('backs up existing settings', () => {
      init();
      expect(vi.mocked(fs.copyFileSync)).toHaveBeenCalledWith(SETTINGS_PATH, BACKUP_PATH);
    });

    test('logs backup message', () => {
      init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(BACKUP_PATH));
    });

    test('writes updated settings preserving other keys', () => {
      init();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.theme).toBe('dark');
      expect(written.statusLine).toEqual({ type: 'command', command: COMMAND });
    });

    test('writes to SETTINGS_PATH', () => {
      init();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        SETTINGS_PATH,
        expect.any(String),
        'utf8',
      );
    });

    test('logs update message', () => {
      init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(SETTINGS_PATH));
    });

    test('logs restart message', () => {
      init();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Restart'));
    });
  });

  describe('when settings.json has no statusLine', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }));
    });

    test('adds statusLine to existing config', () => {
      init();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.statusLine).toEqual({ type: 'command', command: COMMAND });
      expect(written.theme).toBe('dark');
    });
  });

  describe('when settings.json has invalid JSON', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json }');
    });

    test('logs error and exits', () => {
      expect(() => init()).toThrow('process.exit');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Cannot parse'));
    });
  });
});
