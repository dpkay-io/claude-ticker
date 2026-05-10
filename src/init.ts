import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline/promises';
import { join }    from 'path';
import { homedir } from 'os';

const CLAUDE_DIR    = join(homedir(), '.claude');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const BACKUP_PATH   = join(CLAUDE_DIR, 'settings.json.bak');
const COMMAND       = 'claude-ticker';

export async function init(): Promise<void> {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  if (!existsSync(SETTINGS_PATH)) {
    writeFileSync(
      SETTINGS_PATH,
      JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }, null, 2),
      'utf8',
    );
    console.log(`Created ${SETTINGS_PATH}`);
    console.log('Done! Restart Claude CLI to see your status bar.');
    return;
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as Record<string, unknown>;
  } catch {
    console.error(`Cannot parse ${SETTINGS_PATH} — fix the JSON first, then re-run init.`);
    process.exit(1);
  }

  const current = settings.statusLine as Record<string, unknown> | undefined;
  if (current?.command === COMMAND) {
    console.log('Already configured. No changes made.');
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

  settings.statusLine = { type: 'command', command: COMMAND };
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`Updated ${SETTINGS_PATH}`);
  console.log('Done! Restart Claude CLI to see your status bar.');
}
