import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import * as fs from 'fs';
import { join } from 'path';
import { postinstall } from '../postinstall.js';

const CLAUDE_DIR    = join('/home/testuser', '.claude');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const COMMAND       = 'claude-ticker';

let mockConsoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('postinstall', () => {
  test('creates .claude directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    postinstall();
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(CLAUDE_DIR, { recursive: true });
  });

  describe('when settings.json does not exist', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('writes a new settings.json with statusLine', () => {
      postinstall();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        SETTINGS_PATH,
        JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }, null, 2),
        'utf8',
      );
    });

    test('logs creation message', () => {
      postinstall();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(SETTINGS_PATH));
    });
  });

  describe('when settings.json exists with statusLine already set to claude-ticker', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }),
      );
    });

    test('does not modify files', () => {
      postinstall();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    test('does not log anything', () => {
      postinstall();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('when settings.json exists with a different statusLine', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ statusLine: { type: 'command', command: 'other-tool' } }),
      );
    });

    test('skips silently without modifying files', () => {
      postinstall();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    test('does not log anything', () => {
      postinstall();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('when settings.json exists with no statusLine', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }));
    });

    test('adds statusLine preserving existing keys', () => {
      postinstall();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.theme).toBe('dark');
      expect(written.statusLine).toEqual({ type: 'command', command: COMMAND });
    });

    test('logs update message', () => {
      postinstall();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(SETTINGS_PATH));
    });
  });

  describe('when settings.json has invalid JSON', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json }');
    });

    test('silently returns without modifying files', () => {
      postinstall();
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    test('does not throw', () => {
      expect(() => postinstall()).not.toThrow();
    });
  });
});
