export type ColorName =
  | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'dim' | 'dynamic' | 'none';

export type TimeFormat = '12h' | '24h';

const ESC = '\x1b';
export const RESET = ESC + '[0m';
export const DIM   = ESC + '[2m';

export const COLOR_CODES: Record<ColorName, string> = {
  red:     ESC + '[91m',
  green:   ESC + '[92m',
  yellow:  ESC + '[93m',
  blue:    ESC + '[94m',
  magenta: ESC + '[95m',
  cyan:    ESC + '[96m',
  white:   ESC + '[97m',
  dim:     ESC + '[2m',
  dynamic: '',
  none:    '',
};

export const VALID_COLORS: ColorName[] = [
  'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'dim', 'dynamic', 'none',
];

export const BG_COLOR_CODES: Partial<Record<ColorName, string>> = {
  red: '\x1b[41m', green: '\x1b[42m', yellow: '\x1b[43m',
  blue: '\x1b[44m', magenta: '\x1b[45m', cyan: '\x1b[46m', white: '\x1b[47m',
};

export const BG_TEXT_CODES: Partial<Record<ColorName, string>> = {
  red: '\x1b[97m', green: '\x1b[30m', yellow: '\x1b[30m',
  blue: '\x1b[97m', magenta: '\x1b[97m', cyan: '\x1b[30m', white: '\x1b[30m',
};

export const VALID_DIR_COLORS: ColorName[] = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
