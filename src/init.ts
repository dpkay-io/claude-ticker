import { copyFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline/promises';
import { loadConfig } from './config.js';
import {
  CLAUDE_DIR, SETTINGS_PATH, BACKUP_PATH,
  buildStatusLine, isOurStatusLine, readSettings, writeSettings, syncStatusLine,
} from './settings.js';
import type { JsonObj } from './settings.js';

const RESTART_MSG = 'Done! Restart Claude CLI to see your status bar.';

export async function init(): Promise<void> {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  const cfg = loadConfig();
  const read = readSettings();

  if (read.kind === 'missing') {
    writeSettings({ statusLine: buildStatusLine(cfg) });
    console.log(`Created ${SETTINGS_PATH}`);
    console.log(RESTART_MSG);
    return;
  }

  if (read.kind === 'invalid') {
    console.error(`Cannot parse ${SETTINGS_PATH} — fix the JSON first, then re-run init.`);
    process.exit(1);
  }

  const { settings } = read;
  const current = settings.statusLine as JsonObj | undefined;

  if (isOurStatusLine(current)) {
    const result = syncStatusLine(cfg, 'fill');
    console.log(result === 'updated'
      ? `Already configured. Added missing status line options to ${SETTINGS_PATH}`
      : 'Already configured. No changes made.');
    return;
  }

  if (current !== undefined) {
    const existing = current.command ?? JSON.stringify(current);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`statusLine is currently set to: "${existing}"\nReplace with claude-ticker? [Y/n] `);
    rl.close();
    if (answer.trim().toLowerCase() === 'n') {
      console.log('Aborted. No changes made.');
      return;
    }
  }

  copyFileSync(SETTINGS_PATH, BACKUP_PATH);
  console.log(`Backup → ${BACKUP_PATH}`);

  writeSettings({ ...settings, statusLine: buildStatusLine(cfg) });
  console.log(`Updated ${SETTINGS_PATH}`);
  console.log(RESTART_MSG);
}
