import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join }    from 'path';
import { homedir } from 'os';
import type { Config } from './fields.js';
import { DEFAULT_CONFIG } from './fields.js';

export const CONFIG_PATH = join(homedir(), '.claude', 'claude-ticker.json');

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
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Saved: ${CONFIG_PATH}`);
}
