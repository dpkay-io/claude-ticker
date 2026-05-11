import { homedir }   from 'os';
import { join }      from 'path';
import { loadConfig, saveConfig } from './config.js';
import { renderStatus }           from './render.js';
import type { FieldName, Config } from './fields.js';
import type { ColorName } from './types.js';
import { ALL_FIELDS, FIELD_REGISTRY, DEFAULT_CONFIG } from './fields.js';
import type { TimeFormat } from './types.js';
import { VALID_COLORS, VALID_DIR_COLORS, isValidColor, isValidDirColor } from './types.js';

const DIR_NAME_MIN = 2;
const DIR_NAME_MAX = 30;

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function resolvePath(p: string): string {
  return p === '.' ? process.cwd() : p;
}

// ── fields ────────────────────────────────────────────────────────────────────

export function handleFields(args: string[]): void {
  const [sub, ...rest] = args;
  const cfg = loadConfig();

  switch (sub) {
    case undefined:
    case 'list': {
      console.log('\nField       Visible  Order  Description');
      console.log('────────────────────────────────────────────────────');
      for (const f of ALL_FIELDS) {
        const idx     = cfg.fields.indexOf(f);
        const visible = idx >= 0;
        const label   = FIELD_REGISTRY[f].label;
        console.log(
          `${f.padEnd(12)}${(visible ? 'yes' : 'no').padEnd(9)}${(visible ? '#' + (idx + 1) : '-').padEnd(7)}${label}`,
        );
      }
      console.log('\nUse `claude-ticker fields show|hide|order` to adjust.');
      break;
    }
    case 'show': {
      const field = rest[0] as FieldName;
      if (!field || !ALL_FIELDS.includes(field))
        die(`Unknown field "${field}". Valid: ${ALL_FIELDS.join(', ')}`);
      if (!cfg.fields.includes(field)) { cfg.fields.push(field); saveConfig(cfg); }
      else console.log(`"${field}" is already visible.`);
      break;
    }
    case 'hide': {
      const field = rest[0] as FieldName;
      if (!field || !ALL_FIELDS.includes(field))
        die(`Unknown field "${field}". Valid: ${ALL_FIELDS.join(', ')}`);
      cfg.fields = cfg.fields.filter(f => f !== field);
      saveConfig(cfg);
      break;
    }
    case 'order': {
      if (rest.length === 0) die('Usage: claude-ticker fields order <f1> <f2> ...');
      const invalid = rest.filter(f => !ALL_FIELDS.includes(f as FieldName));
      if (invalid.length) die(`Unknown fields: ${invalid.join(', ')}. Valid: ${ALL_FIELDS.join(', ')}`);
      cfg.fields = rest as FieldName[];
      saveConfig(cfg);
      break;
    }
    case 'reset': {
      cfg.fields = [...DEFAULT_CONFIG.fields];
      saveConfig(cfg);
      console.log(`Fields reset to default: ${DEFAULT_CONFIG.fields.join(', ')}`);
      break;
    }
    default:
      die(`Unknown subcommand "fields ${sub}". Use: list, show, hide, order, reset`);
  }
}

// ── color ─────────────────────────────────────────────────────────────────────

export function handleColor(args: string[]): void {
  const [sub, ...rest] = args;

  switch (sub) {
    case undefined:
    case 'list': {
      const cfg = loadConfig();
      console.log('\nField       Color       Source    Notes');
      console.log('─────────────────────────────────────────────────────────────────');
      for (const f of ALL_FIELDS) {
        const overridden  = f in cfg.colors;
        const color       = cfg.colors[f] ?? FIELD_REGISTRY[f].defaultColor;
        const source      = overridden ? 'config' : 'default';
        const notes = color === 'dynamic'
          ? `green <${cfg.thresholds.warning}%  yellow <${cfg.thresholds.critical}%  red ≥${cfg.thresholds.critical}%`
          : '';
        console.log(
          `${f.padEnd(12)}${color.padEnd(12)}${source.padEnd(10)}${notes}`,
        );
      }
      console.log(`\nValid colors: ${VALID_COLORS.join(', ')}, any CSS color name (coral, tomato…), or hex (#rgb / #rrggbb)`);
      console.log('Thresholds apply to: ctx, 5h, 7d, effort');
      break;
    }
    case 'set': {
      const field = rest[0] as FieldName;
      const color = rest[1] as ColorName;
      if (!field || !ALL_FIELDS.includes(field))  die(`Unknown field "${field}". Valid: ${ALL_FIELDS.join(', ')}`);
      if (!color || !isValidColor(color)) die(`Unknown color "${color}". Use a named color (${VALID_COLORS.join(', ')}), a CSS color name, or hex (#rgb / #rrggbb)`);
      const cfg = loadConfig();
      cfg.colors[field] = color;
      saveConfig(cfg);
      break;
    }
    case 'reset': {
      const field = rest[0] as FieldName;
      if (!field || !ALL_FIELDS.includes(field))
        die(`Unknown field "${field}". Valid: ${ALL_FIELDS.join(', ')}`);
      const cfg = loadConfig();
      delete cfg.colors[field];
      saveConfig(cfg);
      break;
    }
    case 'thresholds': {
      const warning  = parseInt(rest[0], 10);
      const critical = parseInt(rest[1], 10);
      if (isNaN(warning) || isNaN(critical) || warning < 0 || critical > 100 || warning >= critical)
        die('Usage: claude-ticker color thresholds <warning%> <critical%>  e.g. 50 75');
      const cfg = loadConfig();
      cfg.thresholds = { warning, critical };
      saveConfig(cfg);
      break;
    }
    default:
      die(`Unknown subcommand "color ${sub}". Use: list, set, reset, thresholds`);
  }
}

// ── dir-color ─────────────────────────────────────────────────────────────────

export function handleDirColor(args: string[]): void {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'list': {
      const cfg = loadConfig();
      const entries = Object.entries(cfg.dirColors);
      if (entries.length === 0) {
        console.log('No directory colors configured. Use `claude-ticker dir-color set <path> <color>`.');
      } else {
        console.log('\nDirectory                         Color');
        console.log('──────────────────────────────────────────────');
        for (const [path, color] of entries) {
          console.log(`${path.padEnd(34)}${color}`);
        }
      }
      console.log(`\nValid colors: ${VALID_DIR_COLORS.join(', ')}, any CSS color name (coral, tomato…), or hex (#rgb / #rrggbb)`);
      break;
    }
    case 'set': {
      const [rawPath, color] = rest;
      if (!rawPath || !color) die('Usage: claude-ticker dir-color set <path|.> <color>');
      if (!isValidDirColor(color))
        die(`Unknown color "${color}". Use a named color (${VALID_DIR_COLORS.join(', ')}), a CSS color name, or hex (#rgb / #rrggbb)`);
      const cfg = loadConfig();
      cfg.dirColors[resolvePath(rawPath)] = color as ColorName;
      saveConfig(cfg);
      break;
    }
    case 'reset': {
      const [rawPath] = rest;
      if (!rawPath) die('Usage: claude-ticker dir-color reset <path|.>');
      const cfg = loadConfig();
      delete cfg.dirColors[resolvePath(rawPath)];
      saveConfig(cfg);
      break;
    }
    default:
      die(`Unknown subcommand "dir-color ${sub}". Use: list, set, reset`);
  }
}

// ── dir-name ──────────────────────────────────────────────────────────────────

function validateDirName(name: string): void {
  if (name.length < DIR_NAME_MIN) die(`Name must be at least ${DIR_NAME_MIN} characters.`);
  if (name.length > DIR_NAME_MAX) die(`Name must be at most ${DIR_NAME_MAX} characters.`);
  if (name.includes('\x1b')) die('Name must not contain ANSI escape codes.');
}

export function handleDirName(args: string[]): void {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'list': {
      const cfg = loadConfig();
      const entries = Object.entries(cfg.dirNames);
      if (entries.length === 0) {
        console.log('No directory names configured. Use `claude-ticker dir-name set <path> <name>`.');
      } else {
        console.log('\nDirectory                         Name                           Mode');
        console.log('──────────────────────────────────────────────────────────────────────');
        for (const [path, { name, long }] of entries) {
          console.log(`${path.padEnd(34)}${name.padEnd(31)}${long ? 'long' : 'short'}`);
        }
      }
      break;
    }
    case 'set':
    case 'set-long': {
      const [rawPath, name] = rest;
      if (!rawPath || !name) die(`Usage: claude-ticker dir-name ${sub} <path|.> <name>`);
      validateDirName(name);
      const cfg = loadConfig();
      cfg.dirNames[resolvePath(rawPath)] = { name, long: sub === 'set-long' };
      saveConfig(cfg);
      break;
    }
    case 'reset': {
      const [rawPath] = rest;
      if (!rawPath) die('Usage: claude-ticker dir-name reset <path|.>');
      const cfg = loadConfig();
      delete cfg.dirNames[resolvePath(rawPath)];
      saveConfig(cfg);
      break;
    }
    default:
      die(`Unknown subcommand "dir-name ${sub}". Use: list, set, set-long, reset`);
  }
}

// ── separator ─────────────────────────────────────────────────────────────────

export function handleSeparator(args: string[]): void {
  if (args.length === 0) {
    console.log(`Current separator: ${JSON.stringify(loadConfig().separator)}`);
    return;
  }
  const cfg = loadConfig();
  cfg.separator = args.join(' ');
  saveConfig(cfg);
}

// ── time ──────────────────────────────────────────────────────────────────────

export function handleTime(args: string[]): void {
  const fmt = args[0];
  if (fmt !== '12h' && fmt !== '24h') die('Usage: claude-ticker time <12h|24h>');
  const cfg = loadConfig();
  cfg.timeFormat = fmt as TimeFormat;
  saveConfig(cfg);
}

// ── config ────────────────────────────────────────────────────────────────────

export function handleConfigCmd(args: string[]): void {
  switch (args[0]) {
    case undefined:
    case 'show':
      console.log(JSON.stringify(loadConfig(), null, 2));
      break;
    case 'reset':
      saveConfig(structuredClone(DEFAULT_CONFIG) as Config);
      console.log('Config reset to defaults.');
      break;
    default:
      die(`Unknown subcommand "config ${args[0]}". Use: show, reset`);
  }
}

// ── preview ───────────────────────────────────────────────────────────────────

export function preview(): void {
  const now  = Math.floor(Date.now() / 1000);
  const sample = {
    workspace:      { current_dir: join(homedir(), 'ws', 'my-project') },
    model:          { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
    context_window: { used_percentage: 12 },
    cost: {
      total_cost_usd:      0.042,
      total_duration_ms:   222_000,
      total_lines_added:   42,
      total_lines_removed: 5,
    },
    rate_limits: {
      five_hour: { used_percentage: 8,  resets_at: now + 3_600 },
      seven_day: { used_percentage: 55, resets_at: now + 86_400 * 3 },
    },
    session_name: 'my-feature',
    version:      '1.4.2',
    effort:       { level: 'high' },
    thinking:     { enabled: true },
    vim:          { mode: 'INSERT' },
    worktree:     { branch: 'feat/new-ui' },
    agent:        { name: 'my-agent' },
  };
  process.stdout.write(renderStatus(sample as unknown as Record<string, unknown>) + '\n');
}
