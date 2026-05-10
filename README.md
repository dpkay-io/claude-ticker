# claude-ticker

Customizable status bar for [Claude CLI](https://claude.ai/code). Shows your working directory, model, context window usage, rate limits, cost, and more — all in one glanceable line with color coding.

![claude-ticker in action](https://raw.githubusercontent.com/dpkay-io/claude-ticker/master/claude-cli.png)

Colors shift green → yellow → red as usage climbs, so you always know at a glance how close you are to a limit.

## Features

- **15 configurable fields** — show exactly what you care about: directory, model, context, rate limits, cost, session time, line counts, vim mode, and more
- **Dynamic color coding** — context and rate-limit fields shift green → yellow → red as usage climbs; fully customizable per field with named colors, CSS color names, or hex values
- **Per-directory background colors** — highlight the `dir` field with a different background per project so you always know which repo you're in
- **Directory aliases** — replace long paths with short names; `set-long` mode appends the sub-path so you never lose your bearings deep in a tree
- **Flexible ordering and visibility** — reorder fields and toggle any on or off with a single command; changes take effect immediately
- **Configurable separator** — change the string between fields (default two spaces) to anything you like, e.g. `" | "`
- **12h/24h clock** — rate-limit reset times shown in whichever format you prefer
- **Zero runtime dependencies** — lightweight and fast; no extra packages pulled into your environment
- **Safe init** — `claude-ticker init` backs up your existing `settings.json` before writing anything

## Prerequisites

- [Claude CLI](https://claude.ai/code) installed (`npm install -g @anthropic-ai/claude-code`)
- Node.js ≥ 18 (already required by Claude CLI)

## Installation

```sh
npm install -g claude-ticker
```

## Quick start

```sh
claude-ticker init    # sets claude-ticker as your Claude CLI status bar
```

Restart Claude CLI. Your status bar appears immediately.

To see a preview without restarting:

```sh
claude-ticker preview
```

## Commands

### `claude-ticker init`

Configures claude-ticker as the Claude CLI status bar. Your existing settings are backed up to `~/.claude/settings.json.bak` before any changes are made.

---

### `claude-ticker preview`

Renders the status bar with sample data so you can see your current configuration without running Claude CLI.

---

### `claude-ticker fields`

```sh
claude-ticker fields [list]              # show all fields and visibility
claude-ticker fields show <field>        # enable a field
claude-ticker fields hide <field>        # disable a field
claude-ticker fields order <f1> <f2> …  # set display order
```

Available fields:

| Field | Default | Description |
|-------|---------|-------------|
| `dir` | on | Current working directory (home folder shortened to `~`) |
| `worktree` | on | Git worktree branch, shown as `wt:<branch>` |
| `model` | on | Active Claude model, "Claude " prefix stripped |
| `ctx` | on | Context window fill % — how full this conversation's memory is |
| `5h` | on | 5-hour usage % with reset time |
| `7d` | on | 7-day usage % with reset day+time |
| `cost` | off | Session cost in USD, e.g. `$0.042` |
| `duration` | off | Session wall time, e.g. `4m32s` |
| `lines` | off | Lines added/removed this session, e.g. `+84 -12` |
| `session` | off | Session name, shown as `session:<name>` |
| `version` | off | Claude Code version, e.g. `v1.9.0` |
| `effort` | off | Reasoning effort level, e.g. `effort:high` |
| `thinking` | off | Extended thinking state, e.g. `thinking:on` |
| `vim` | off | Vim mode (INSERT, NORMAL, etc.) |
| `agent` | off | Agent name when running a sub-agent, shown as `agent:<name>` |

**Examples:**

```sh
claude-ticker fields hide model
claude-ticker fields show cost duration
claude-ticker fields order ctx 5h 7d dir cost
```

---

### `claude-ticker color`

```sh
claude-ticker color [list]                     # show colors and thresholds
claude-ticker color set <field> <color>        # set a field's color
claude-ticker color thresholds <warn%> <crit%> # set dynamic thresholds
```

Available colors: `red` `green` `yellow` `blue` `magenta` `cyan` `white` `dim` `dynamic` `none`, any CSS color name (`coral`, `tomato`, …), or hex (`#rgb` / `#rrggbb`)

- **`dynamic`** — percentage/level fields only; color shifts green → yellow → red based on thresholds (default for `ctx`, `5h`, `7d`, `effort`)
- **`none`** — no color applied

Default thresholds: warning at 50%, critical at 75%.

Field color defaults:

| Field | Default color |
|-------|---------------|
| `dir` | yellow |
| `worktree` | cyan |
| `agent` | magenta |
| `session` | dim |
| `version` | dim |
| `ctx` | dynamic |
| `5h` | dynamic |
| `7d` | dynamic |
| `effort` | dynamic |
| everything else | none |

**Examples:**

```sh
claude-ticker color set dir cyan
claude-ticker color set ctx green          # always green, ignores thresholds
claude-ticker color set model coral        # CSS color name
claude-ticker color set model "#ff7f50"    # hex color
claude-ticker color thresholds 40 70      # warn earlier
```

---

### `claude-ticker dir-color`

Assign a background color to a directory. When your current working directory is at or under a configured path, the `dir` field is highlighted with that background color. The longest-matching path wins.

```sh
claude-ticker dir-color [list]                 # list all mappings
claude-ticker dir-color set <path> <color>     # assign a background color
claude-ticker dir-color reset <path>           # remove a mapping
```

Valid colors: `red` `green` `yellow` `blue` `magenta` `cyan` `white`, any CSS color name (`coral`, `tomato`, …), or hex (`#rgb` / `#rrggbb`)

`~` in paths is expanded to your home directory. Use `.` to refer to the current directory. Matching is case-insensitive on Windows.

**Examples:**

```sh
claude-ticker dir-color set ~/ws/my-project blue
claude-ticker dir-color set ~/ws/client-work red
claude-ticker dir-color set . coral          # current directory, CSS color
claude-ticker dir-color set . "#4682b4"      # current directory, hex color
claude-ticker dir-color list
claude-ticker dir-color reset ~/ws/my-project
claude-ticker dir-color reset .              # current directory
```

---

### `claude-ticker dir-name`

Assign a human-readable alias to a directory. When your current working directory is at or under a configured path, the alias is shown in the `dir` field instead of the full path. Works with `dir-color` — the alias gets the background color if one is set.

```sh
claude-ticker dir-name [list]                       # list all aliases
claude-ticker dir-name set <path> <name>            # assign an alias (shows alias only)
claude-ticker dir-name set-long <path> <name>       # assign an alias (shows alias/subdir/remainder)
claude-ticker dir-name reset <path>                 # remove an alias
```

- **`set`** — always shows just the alias, regardless of how deep in the directory tree you are
- **`set-long`** — shows the alias plus the subdirectory path relative to the named root (e.g. `my-project/src/components`)

Name constraints: 2–30 characters, no ANSI escape codes. Matching uses the longest-matching path prefix, same as `dir-color`. `~` is expanded to your home directory. Use `.` to refer to the current directory.

**Examples:**

```sh
claude-ticker dir-name set ~/ws/my-project "my-project"
claude-ticker dir-name set-long ~/ws/client-work "client"
# → shows "client/src/api" when in ~/ws/client-work/src/api

claude-ticker dir-name set . "cur"           # alias for current directory
claude-ticker dir-name set-long . "cur"      # long form for current directory

claude-ticker dir-name set ~/ws/my-project "proj" && claude-ticker dir-color set ~/ws/my-project blue
# → "proj" shown with blue background

claude-ticker dir-name list
claude-ticker dir-name reset ~/ws/my-project
claude-ticker dir-name reset .               # current directory
```

---

### `claude-ticker separator [value]`

Get or set the string printed between fields. Default is two spaces (`"  "`).

```sh
claude-ticker separator           # show current value
claude-ticker separator " | "     # set to " | "
claude-ticker separator "  "      # restore double-space (quote it)
```

---

### `claude-ticker time <12h|24h>`

Controls how reset times are displayed. Default is `24h`.

```sh
claude-ticker time 12h   # → 5h:8%@2:30PM
claude-ticker time 24h   # → 5h:8%@14:30
```

---

### `claude-ticker config`

```sh
claude-ticker config [show]   # print full JSON config
claude-ticker config reset    # reset everything to defaults
```

---

## Configuration file

Settings are stored in `~/.claude/claude-ticker.json`. You can edit it directly or use the commands above.

```json
{
  "fields": ["dir", "worktree", "model", "ctx", "5h", "7d"],
  "colors": {},
  "thresholds": {
    "warning": 50,
    "critical": 75
  },
  "separator": "  ",
  "timeFormat": "24h",
  "dirColors": {},
  "dirNames": {}
}
```

`colors` defaults to `{}` — each field uses its built-in default color unless overridden here.

`dirColors` maps directory paths to background colors for the `dir` field.

`dirNames` maps directory paths to alias objects: `{ "name": "my-project", "long": false }`. Use the `dir-name` command to manage these.

## Rate limit fields

`5h` and `7d` are only populated by Claude CLI for Claude.ai subscribers (Pro / Max) and only appear after the first API response in a session. They are silently omitted until data is available.

## Contributing

Issues and PRs welcome. The project has zero runtime dependencies — please keep it that way.

```sh
git clone https://github.com/dpkay-io/claude-ticker
cd claude-ticker
npm install
npm run dev    # watch mode
npm run build  # compile to dist/
```

## License

MIT
