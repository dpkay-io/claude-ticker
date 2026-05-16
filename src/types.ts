export type NamedColor =
  | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'dim' | 'dynamic' | 'none';

export type ColorName = string; // NamedColor, hex (#rgb / #rrggbb), or CSS color name

export type TimeFormat = '12h' | '24h';

const ESC = '\x1b';
export const RESET = ESC + '[0m';
export const DIM   = ESC + '[2m';

export const COLOR_CODES: Record<NamedColor, string> = {
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

export const VALID_COLORS: NamedColor[] = [
  'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'dim', 'dynamic', 'none',
];

export const BG_COLOR_CODES: Partial<Record<NamedColor, string>> = {
  red: '\x1b[41m', green: '\x1b[42m', yellow: '\x1b[43m',
  blue: '\x1b[44m', magenta: '\x1b[45m', cyan: '\x1b[46m', white: '\x1b[47m',
};

export const BG_TEXT_CODES: Partial<Record<NamedColor, string>> = {
  red: '\x1b[97m', green: '\x1b[30m', yellow: '\x1b[30m',
  blue: '\x1b[97m', magenta: '\x1b[97m', cyan: '\x1b[30m', white: '\x1b[30m',
};

export const VALID_DIR_COLORS: NamedColor[] = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

// CSS named colors (W3C CSS Color Level 4) mapped to hex values.
export const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff',
  aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc',
  bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd',
  blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
  darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff',
  dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff',
  firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff',
  gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080',
  honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c',
  lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
  lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000',
  mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3',
  mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23',
  orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9',
  peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460',
  seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c',
  teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

export function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

export function isValidColor(s: string): boolean {
  return (VALID_COLORS as string[]).includes(s)
    || isHexColor(s)
    || s.toLowerCase() in CSS_NAMED_COLORS;
}

export function isValidDirColor(s: string): boolean {
  if (s === 'dim' || s === 'dynamic' || s === 'none') return false;
  return isValidColor(s);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hexToFgAnsi(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function hexToBgAnsi(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function contrastTextAnsi(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const toLinear = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.3 ? '\x1b[30m' : '\x1b[97m';
}

export function colorToFgCode(color: string): string {
  if (Object.prototype.hasOwnProperty.call(COLOR_CODES, color)) return COLOR_CODES[color as NamedColor];
  if (isHexColor(color)) return hexToFgAnsi(color);
  const lower = color.toLowerCase();
  if (lower in CSS_NAMED_COLORS) return hexToFgAnsi(CSS_NAMED_COLORS[lower]);
  return '';
}

export function colorToBgCode(color: string): { bg: string; fg: string } | null {
  if (Object.prototype.hasOwnProperty.call(BG_COLOR_CODES, color)) {
    return { bg: BG_COLOR_CODES[color as NamedColor]!, fg: BG_TEXT_CODES[color as NamedColor] ?? '' };
  }
  if (isHexColor(color)) return { bg: hexToBgAnsi(color), fg: contrastTextAnsi(color) };
  const lower = color.toLowerCase();
  if (lower in CSS_NAMED_COLORS) {
    const hex = CSS_NAMED_COLORS[lower];
    return { bg: hexToBgAnsi(hex), fg: contrastTextAnsi(hex) };
  }
  return null;
}
