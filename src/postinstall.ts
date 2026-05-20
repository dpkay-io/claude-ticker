#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join }    from 'path';
import { homedir } from 'os';

const CLAUDE_DIR    = join(homedir(), '.claude');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const COMMAND       = 'claude-ticker';

export function postinstall(): void {
  mkdirSync(CLAUDE_DIR, { recursive: true });

  if (!existsSync(SETTINGS_PATH)) {
    writeFileSync(
      SETTINGS_PATH,
      JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }, null, 2),
      'utf8',
    );
    console.log(`claude-ticker: created ${SETTINGS_PATH}`);
    return;
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as Record<string, unknown>;
  } catch {
    return;
  }

  if (settings.statusLine !== undefined) return;

  settings.statusLine = { type: 'command', command: COMMAND };
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`claude-ticker: updated ${SETTINGS_PATH}`);
}

try {
  postinstall();
} catch {
  // never fail the install
}
