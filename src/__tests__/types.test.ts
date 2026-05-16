import { describe, test, expect } from 'vitest';
import { colorToFgCode, colorToBgCode } from '../types.js';

describe('types / color processing', () => {
  test('colorToFgCode handles hex colors', () => {
    expect(colorToFgCode('#ff0000')).toBe('\x1b[38;2;255;0;0m');
    expect(colorToFgCode('#f00')).toBe('\x1b[38;2;255;0;0m');
  });

  test('colorToFgCode handles CSS named colors', () => {
    expect(colorToFgCode('coral')).toBe('\x1b[38;2;255;127;80m');
    expect(colorToFgCode('CORAL')).toBe('\x1b[38;2;255;127;80m');
  });

  test('colorToFgCode returns empty string for invalid color', () => {
    expect(colorToFgCode('not-a-color')).toBe('');
  });

  test('colorToBgCode handles hex colors', () => {
    expect(colorToBgCode('#ff0000')).toEqual({
      bg: '\x1b[48;2;255;0;0m',
      fg: '\x1b[97m', // red requires white text
    });
    expect(colorToBgCode('#000')).toEqual({
      bg: '\x1b[48;2;0;0;0m',
      fg: '\x1b[97m', // black requires white text
    });
    expect(colorToBgCode('#ffffff')).toEqual({
      bg: '\x1b[48;2;255;255;255m',
      fg: '\x1b[30m', // white requires black text
    });
  });

  test('colorToBgCode handles CSS named colors', () => {
    expect(colorToBgCode('coral')).toEqual({
      bg: '\x1b[48;2;255;127;80m',
      fg: '\x1b[30m', // coral requires black text
    });
  });

  test('colorToBgCode returns null for invalid color', () => {
    expect(colorToBgCode('not-a-color')).toBeNull();
  });
});
