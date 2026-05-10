import { describe, test, expect } from 'vitest';
import {
  RESET, DIM, COLOR_CODES, BG_COLOR_CODES, BG_TEXT_CODES,
  VALID_COLORS, VALID_DIR_COLORS,
} from '../types.js';

const ESC = '\x1b';

describe('ANSI escape constants', () => {
  test('RESET is correct code', () => {
    expect(RESET).toBe(ESC + '[0m');
  });

  test('DIM is correct code', () => {
    expect(DIM).toBe(ESC + '[2m');
  });
});

describe('COLOR_CODES', () => {
  test('has all named colors', () => {
    expect(COLOR_CODES.red).toBe(ESC + '[91m');
    expect(COLOR_CODES.green).toBe(ESC + '[92m');
    expect(COLOR_CODES.yellow).toBe(ESC + '[93m');
    expect(COLOR_CODES.blue).toBe(ESC + '[94m');
    expect(COLOR_CODES.magenta).toBe(ESC + '[95m');
    expect(COLOR_CODES.cyan).toBe(ESC + '[96m');
    expect(COLOR_CODES.white).toBe(ESC + '[97m');
    expect(COLOR_CODES.dim).toBe(ESC + '[2m');
  });

  test('dynamic and none produce empty strings', () => {
    expect(COLOR_CODES.dynamic).toBe('');
    expect(COLOR_CODES.none).toBe('');
  });
});

describe('BG_COLOR_CODES', () => {
  test('has background codes for solid colors', () => {
    expect(BG_COLOR_CODES.red).toBe('\x1b[41m');
    expect(BG_COLOR_CODES.green).toBe('\x1b[42m');
    expect(BG_COLOR_CODES.yellow).toBe('\x1b[43m');
    expect(BG_COLOR_CODES.blue).toBe('\x1b[44m');
    expect(BG_COLOR_CODES.magenta).toBe('\x1b[45m');
    expect(BG_COLOR_CODES.cyan).toBe('\x1b[46m');
    expect(BG_COLOR_CODES.white).toBe('\x1b[47m');
  });

  test('does not include dim/dynamic/none', () => {
    expect(BG_COLOR_CODES.dim).toBeUndefined();
    expect((BG_COLOR_CODES as Record<string, unknown>).dynamic).toBeUndefined();
    expect((BG_COLOR_CODES as Record<string, unknown>).none).toBeUndefined();
  });
});

describe('BG_TEXT_CODES', () => {
  test('light text on dark backgrounds', () => {
    expect(BG_TEXT_CODES.red).toBe('\x1b[97m');    // white text
    expect(BG_TEXT_CODES.blue).toBe('\x1b[97m');
    expect(BG_TEXT_CODES.magenta).toBe('\x1b[97m');
  });

  test('dark text on light backgrounds', () => {
    expect(BG_TEXT_CODES.green).toBe('\x1b[30m');  // black text
    expect(BG_TEXT_CODES.yellow).toBe('\x1b[30m');
    expect(BG_TEXT_CODES.cyan).toBe('\x1b[30m');
    expect(BG_TEXT_CODES.white).toBe('\x1b[30m');
  });
});

describe('VALID_COLORS', () => {
  test('contains all expected color names', () => {
    expect(VALID_COLORS).toContain('red');
    expect(VALID_COLORS).toContain('green');
    expect(VALID_COLORS).toContain('yellow');
    expect(VALID_COLORS).toContain('blue');
    expect(VALID_COLORS).toContain('magenta');
    expect(VALID_COLORS).toContain('cyan');
    expect(VALID_COLORS).toContain('white');
    expect(VALID_COLORS).toContain('dim');
    expect(VALID_COLORS).toContain('dynamic');
    expect(VALID_COLORS).toContain('none');
  });

  test('has exactly 10 entries', () => {
    expect(VALID_COLORS).toHaveLength(10);
  });
});

describe('VALID_DIR_COLORS', () => {
  test('only contains solid color names', () => {
    expect(VALID_DIR_COLORS).toContain('red');
    expect(VALID_DIR_COLORS).toContain('green');
    expect(VALID_DIR_COLORS).toContain('yellow');
    expect(VALID_DIR_COLORS).toContain('blue');
    expect(VALID_DIR_COLORS).toContain('magenta');
    expect(VALID_DIR_COLORS).toContain('cyan');
    expect(VALID_DIR_COLORS).toContain('white');
  });

  test('does not include dim, dynamic, or none', () => {
    expect(VALID_DIR_COLORS).not.toContain('dim');
    expect(VALID_DIR_COLORS).not.toContain('dynamic');
    expect(VALID_DIR_COLORS).not.toContain('none');
  });
});
