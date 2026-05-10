/**
 * Tests for src/index.ts — the CLI entry point switch statement.
 *
 * Each test resets modules and re-imports index.ts with process.argv set to
 * the desired command. All real dependencies are mocked so no I/O occurs.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Shared mock functions — recreated fresh in each beforeEach via resetModules.
let mockRender: ReturnType<typeof vi.fn>;
let mockInit: ReturnType<typeof vi.fn>;
let mockHandleFields: ReturnType<typeof vi.fn>;
let mockHandleColor: ReturnType<typeof vi.fn>;
let mockHandleDirColor: ReturnType<typeof vi.fn>;
let mockHandleSeparator: ReturnType<typeof vi.fn>;
let mockHandleTime: ReturnType<typeof vi.fn>;
let mockHandleConfigCmd: ReturnType<typeof vi.fn>;
let mockPreview: ReturnType<typeof vi.fn>;

async function runCli(argv: string[]): Promise<void> {
  vi.resetModules();

  mockRender       = vi.fn().mockResolvedValue(undefined);
  mockInit         = vi.fn();
  mockHandleFields    = vi.fn();
  mockHandleColor     = vi.fn();
  mockHandleDirColor  = vi.fn();
  mockHandleSeparator = vi.fn();
  mockHandleTime      = vi.fn();
  mockHandleConfigCmd = vi.fn();
  mockPreview         = vi.fn();

  vi.doMock('../render.js',   () => ({ render: mockRender }));
  vi.doMock('../init.js',     () => ({ init: mockInit }));
  vi.doMock('../commands.js', () => ({
    handleFields:    mockHandleFields,
    handleColor:     mockHandleColor,
    handleDirColor:  mockHandleDirColor,
    handleSeparator: mockHandleSeparator,
    handleTime:      mockHandleTime,
    handleConfigCmd: mockHandleConfigCmd,
    preview:         mockPreview,
  }));

  process.argv = ['node', 'index.js', ...argv];

  await import('../index.js');
}

const consoleLog   = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const exitSpy      = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit');
}) as never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('index.ts CLI routing', () => {
  test('no command → calls render()', async () => {
    await runCli([]);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  test('"render" command → calls render()', async () => {
    await runCli(['render']);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  test('"init" command → calls init()', async () => {
    await runCli(['init']);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  test('"preview" command → calls preview()', async () => {
    await runCli(['preview']);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  test('"fields" command → calls handleFields with rest args', async () => {
    await runCli(['fields', 'list']);
    expect(mockHandleFields).toHaveBeenCalledWith(['list']);
  });

  test('"fields" with sub-args → passes all rest args', async () => {
    await runCli(['fields', 'show', 'model']);
    expect(mockHandleFields).toHaveBeenCalledWith(['show', 'model']);
  });

  test('"color" command → calls handleColor with rest args', async () => {
    await runCli(['color', 'set', 'model', 'blue']);
    expect(mockHandleColor).toHaveBeenCalledWith(['set', 'model', 'blue']);
  });

  test('"dir-color" command → calls handleDirColor with rest args', async () => {
    await runCli(['dir-color', 'list']);
    expect(mockHandleDirColor).toHaveBeenCalledWith(['list']);
  });

  test('"separator" command → calls handleSeparator with rest args', async () => {
    await runCli(['separator', ' | ']);
    expect(mockHandleSeparator).toHaveBeenCalledWith([' | ']);
  });

  test('"time" command → calls handleTime with rest args', async () => {
    await runCli(['time', '12h']);
    expect(mockHandleTime).toHaveBeenCalledWith(['12h']);
  });

  test('"config" command → calls handleConfigCmd with rest args', async () => {
    await runCli(['config', 'show']);
    expect(mockHandleConfigCmd).toHaveBeenCalledWith(['show']);
  });

  test('"--help" → prints help text', async () => {
    await runCli(['--help']);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('claude-ticker'));
  });

  test('"-h" → prints help text', async () => {
    await runCli(['-h']);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('claude-ticker'));
  });

  test('"help" → prints help text', async () => {
    await runCli(['help']);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('claude-ticker'));
  });

  test('unknown command → prints error and exits 1', async () => {
    await expect(runCli(['bogus-cmd'])).rejects.toThrow('process.exit');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
