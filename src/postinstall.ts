#!/usr/bin/env node

import { loadConfig } from './config.js';
import { SETTINGS_PATH, buildStatusLine, readSettings, writeSettings, syncStatusLine } from './settings.js';

export function postinstall(): void {
  const cfg = loadConfig();
  const read = readSettings();

  if (read.kind === 'missing') {
    writeSettings({ statusLine: buildStatusLine(cfg) });
    console.log(`claude-ticker: created ${SETTINGS_PATH}`);
    return;
  }
  if (read.kind === 'invalid') return;

  if (read.settings.statusLine === undefined) {
    writeSettings({ ...read.settings, statusLine: buildStatusLine(cfg) });
    console.log(`claude-ticker: updated ${SETTINGS_PATH}`);
    return;
  }

  // Upgrade an existing claude-ticker status line with newly supported options,
  // without overriding anything the user already set. Other tools' lines are left alone.
  if (syncStatusLine(cfg, 'fill') === 'updated') {
    console.log(`claude-ticker: added new status line options to ${SETTINGS_PATH}`);
  }
}

try {
  postinstall();
} catch {
  // never fail the install
}
