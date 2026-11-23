import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }    from 'path';
import type { Config } from './fields.js';
import { DEFAULT_CONFIG } from './fields.js';
import { CLAUDE_DIR } from './settings.js';

export const CONFIG_PATH = join(CLAUDE_DIR, 'claude-ticker.json');

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return structuredClone(DEFAULT_CONFIG);
  try {
    const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<Config>;
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      colors:     { ...DEFAULT_CONFIG.colors,     ...saved.colors },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...saved.thresholds },
      dirColors:  { ...DEFAULT_CONFIG.dirColors,  ...saved.dirColors },
      dirNames:   { ...DEFAULT_CONFIG.dirNames,   ...saved.dirNames },
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: Config): void {
  // A fresh machine may not have ~/.claude yet (Claude Code creates it on first run).
  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Saved: ${CONFIG_PATH}`);
}
