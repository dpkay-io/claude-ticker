import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

vi.mock('os', () => ({ homedir: vi.fn(() => '/home/testuser') }));

import * as fs from 'fs';
import { buildStatusLine, syncStatusLine, readSettings, isOurStatusLine, ourStatusLine, COMMAND } from '../settings.js';
import { DEFAULT_CONFIG } from '../fields.js';
import type { Config } from '../fields.js';

const cfgWith = (o: Partial<Config> = {}): Config => ({ ...structuredClone(DEFAULT_CONFIG), ...o });
const BASE = { type: 'command', command: COMMAND };

beforeEach(() => vi.clearAllMocks());

describe('buildStatusLine', () => {
  test('default config adds the default refresh interval only', () => {
    expect(buildStatusLine(cfgWith())).toEqual({ ...BASE, refreshInterval: 30 });
  });

  test('refreshInterval 0 and padding 0 are omitted', () => {
    expect(buildStatusLine(cfgWith({ refreshInterval: 0, padding: 0 }))).toEqual(BASE);
  });

  test('padding > 0 is written', () => {
    expect(buildStatusLine(cfgWith({ padding: 2 })).padding).toBe(2);
  });

  test('hides Claude Code vim indicator only when the vim field is shown', () => {
    expect(buildStatusLine(cfgWith({ fields: ['vim'] })).hideVimModeIndicator).toBe(true);
    expect(buildStatusLine(cfgWith({ fields: ['ctx'] }), { ...BASE, hideVimModeIndicator: true }))
      .not.toHaveProperty('hideVimModeIndicator');
  });

  test('keeps unmanaged keys from the existing statusLine', () => {
    expect(buildStatusLine(cfgWith(), { ...BASE, futureOption: 'x' }).futureOption).toBe('x');
  });

  test('overwrite mode replaces user values with config values', () => {
    expect(buildStatusLine(cfgWith(), { ...BASE, refreshInterval: 5 }).refreshInterval).toBe(30);
  });

  test('keys limits which managed options are touched', () => {
    const out = buildStatusLine(cfgWith({ fields: ['vim'] }), { ...BASE, refreshInterval: 5 }, 'overwrite', ['hideVimModeIndicator']);
    expect(out).toEqual({ ...BASE, refreshInterval: 5, hideVimModeIndicator: true });
  });

  test('fill mode keeps user values and only adds missing keys', () => {
    const out = buildStatusLine(cfgWith({ fields: ['vim'] }), { ...BASE, refreshInterval: 5 }, 'fill');
    expect(out).toEqual({ ...BASE, refreshInterval: 5, hideVimModeIndicator: true });
  });
});

describe('isOurStatusLine', () => {
  test.each([
    [{ ...BASE }, true],
    [{ type: 'command', command: 'other' }, false],
    [undefined, false],
    ['claude-ticker', false],
  ])('%j → %s', (v, expected) => {
    expect(isOurStatusLine(v)).toBe(expected);
  });
});

describe('readSettings', () => {
  test('missing file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readSettings()).toEqual({ kind: 'missing' });
  });
  test.each(['{ bad', '[1,2]', 'null'])('invalid content %j', (content) => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(content);
    expect(readSettings()).toEqual({ kind: 'invalid' });
  });
});

describe('syncStatusLine', () => {
  const withSettings = (settings: unknown) => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(settings));
  };

  test('updates our statusLine and preserves other settings', () => {
    withSettings({ theme: 'dark', statusLine: BASE });
    expect(syncStatusLine(cfgWith({ padding: 1 }))).toBe('updated');
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written).toEqual({ theme: 'dark', statusLine: { ...BASE, refreshInterval: 30, padding: 1 } });
  });

  test('reports unchanged without writing', () => {
    withSettings({ statusLine: { ...BASE, refreshInterval: 30 } });
    expect(syncStatusLine(cfgWith())).toBe('unchanged');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('never touches another tool\'s statusLine', () => {
    withSettings({ statusLine: { type: 'command', command: 'other' } });
    expect(syncStatusLine(cfgWith())).toBe('not-ours');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('never creates settings.json', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(syncStatusLine(cfgWith())).toBe('missing');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('ourStatusLine', () => {
  test('returns our statusLine, null for another tool or missing file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ statusLine: { ...BASE, padding: 1 } }));
    expect(ourStatusLine()).toEqual({ ...BASE, padding: 1 });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ statusLine: { type: 'command', command: 'x' } }));
    expect(ourStatusLine()).toBeNull();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(ourStatusLine()).toBeNull();
  });
});
