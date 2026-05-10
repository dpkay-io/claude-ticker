#!/usr/bin/env node

import { render }         from './render.js';
import { init }           from './init.js';
import { handleFields, handleColor, handleSeparator,
         handleTime, handleConfigCmd, preview, handleDirColor, handleDirName } from './commands.js';

const [,, cmd, ...rest] = process.argv;

const HELP = `
claude-ticker — customizable status bar for Claude CLI

Usage:
  claude-ticker                           Render status bar (reads JSON from stdin)
  claude-ticker init                      Wire claude-ticker into ~/.claude/settings.json
  claude-ticker preview                   Preview the status bar with sample data

  claude-ticker fields [list]             List fields and current visibility
  claude-ticker fields show <field>       Enable a field
  claude-ticker fields hide <field>       Disable a field
  claude-ticker fields order <f1> <f2>…  Set display order

  claude-ticker color [list]                Show field colors and dynamic thresholds
  claude-ticker color set <field> <color>   Set a field's color
  claude-ticker color reset <field>         Reset a field's color to its default
  claude-ticker color thresholds <w%> <c%>  Set warning / critical thresholds

  claude-ticker dir-color [list]                    List directory color mappings
  claude-ticker dir-color set <path> <color>        Assign a background color to a directory
  claude-ticker dir-color reset <path>              Remove a directory's color mapping

  claude-ticker dir-name [list]                     List directory name aliases
  claude-ticker dir-name set <path> <name>          Assign a display name to a directory (alias only)
  claude-ticker dir-name set-long <path> <name>     Assign a display name, appending subdirectory remainder
  claude-ticker dir-name reset <path>               Remove a directory's name alias

  claude-ticker separator [value]         Get or set the separator between fields
  claude-ticker time <12h|24h>            Set reset-time display format

  claude-ticker config [show]             Print full JSON config
  claude-ticker config reset              Reset all settings to defaults

Fields (default on):   dir · model · ctx · 5h · 7d
Fields (opt-in):       cost · duration · lines · session · version · effort · thinking · vim · worktree · agent
Colors:                red · green · yellow · blue · magenta · cyan · white · dim · dynamic · none
`;

switch (cmd) {
  case undefined:
  case 'render':
    await render();
    break;
  case 'init':
    await init();
    break;
  case 'preview':
    preview();
    break;
  case 'fields':
    handleFields(rest);
    break;
  case 'color':
    handleColor(rest);
    break;
  case 'dir-color':
    handleDirColor(rest);
    break;
  case 'dir-name':
    handleDirName(rest);
    break;
  case 'separator':
    handleSeparator(rest);
    break;
  case 'time':
    handleTime(rest);
    break;
  case 'config':
    handleConfigCmd(rest);
    break;
  case '--help':
  case '-h':
  case 'help':
    console.log(HELP);
    break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    process.exit(1);
}
