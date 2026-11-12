# Symbiont

**Left Claude Code running and can't tell whether it finished, got stuck or
is waiting for you?** Symbiont shows it live in a VS Code sidebar: plan
progress, files touched and session state — no server, no account, nothing
sent anywhere.

> Symbiont is an English fork of
> [**Simbionte**](https://github.com/dragonfurioso35-art/simbionte-vscode)
> by Oscar Wilder Rojas Rivero. All credit for the original design and code
> goes to him; this fork translates the extension to English.

<img src="https://raw.githubusercontent.com/nramlow/simbionte-vscode/main/docs/painel.png" alt="Symbiont panel: current plan progress at 62%, project list and today's edits" width="360">

## What it shows

- **Plan progress** — reads the checkboxes in `docs/superpowers/plans/*.md`
  (the convention of the [superpowers](https://github.com/obra/superpowers)
  plugin) and Claude Code's task list (TodoWrite). Notifies you when a plan
  reaches 100%.
- **Activity** — which files the agent edited, in which project, and how
  long ago.
- **Session state** — *Claude working*, *waiting for you* (finished reply or
  permission prompt), *running a command for N min* (with the command),
  *session ended*. It only warns **possibly stuck** when Claude was working
  and went silent past the threshold (15 min by default, adjustable in
  *Settings → Extensions → Symbiont → Stuck Threshold Minutes*).
- **Checkbox ticked via Bash** — warns when the agent closed a plan item with
  a script instead of Edit/Write (the most common way the panel gets out of
  date).
- Projects are detected automatically from the git root (and from
  sub-packages in monorepos: `package.json`, `pyproject.toml`,
  `__manifest__.py`).
- Projects that come from the same repository — git worktrees, sub-folders
  with their own `package.json`, or another clone of the same remote — are
  grouped into one card you can fold. Click the group's header to fold or
  unfold it; the panel remembers.
- **Tasks and agents** — a row shows which task of the plan is next
  (`Task 11/20`) and, while a subagent works on it, what's happening:
  *implementing*, *in review* or *fixing*. Live subagents are listed under
  their row. An agent lands on the right worktree when its description
  follows `<worktree folder>: Task <n> <implement|review|fix> – <title>`;
  otherwise it shows on the folder its session runs in.

## Installation

1. Build the extension from this repo and install it:
   ```
   cd vscode-extension
   npx @vscode/vsce package --allow-missing-repository
   code --install-extension simbionte-1.2.0.vsix
   ```
   (Or in VS Code: *Extensions → … → Install from VSIX*.)
2. On first launch you'll see *"Claude Code hooks are not installed yet"* →
   **Install now**. (Or `Ctrl+Shift+P` →
   **Symbiont: Install Claude Code hooks**.)
3. Start a new Claude Code session. Done — the Symbiont icon in the Activity
   Bar opens the panel.

Coming from 1.0.x? The extension tells you *"new hooks are available"* →
**Update hooks**. Without that the panel still works, but session state
doesn't show.

Requirements: VS Code 1.85+, Node on the PATH (the hooks run with `node`),
Claude Code.

### What the extension changes on your computer

Step 2 (and only step 2 — the extension never installs anything on its own):

- copies 5 files to `~/.claude/`: `progress-hook.js`, `activity-hook.js`,
  `estado-hook.js`, `agentes-hook.js` and `simbionte-store.js`;
- adds entries to `~/.claude/settings.json`, **without touching** the hooks
  already there:

  | Event | Matcher | Hook | Purpose |
  |---|---|---|---|
  | `PostToolUse` | `TodoWrite` | progress-hook.js | task list progress |
  | `PostToolUse` | `Edit\|Write\|Bash` | activity-hook.js | files touched, plan progress |
  | `PreToolUse` / `PostToolUseFailure` | `Bash` | estado-hook.js | "running a command" |
  | `Notification`, `Stop` | — | estado-hook.js | "waiting for you" |
  | `UserPromptSubmit` | — | estado-hook.js | "working" |
  | `SessionEnd` | — | estado-hook.js | "session ended" |
  | `PreToolUse` | `Agent` | agentes-hook.js | agent launched (description, type) |
  | `SubagentStart`, `SubagentStop`, `Stop` | — | agentes-hook.js | live agents per session |

- before changing `settings.json` for the first time, saves the original as
  `settings.json.bak` (later installs don't overwrite that backup).

Running the command again is safe: it updates the files and only adds what's
missing, without duplicating.

After an extension update, Symbiont refreshes its own 5 files in
`~/.claude/` when they differ from the new version, and tells you which ones
it updated. It does this only if the hooks are already installed, and never
changes `settings.json`; after **Remove** it leaves `~/.claude/` alone.

### Remove / revert

`Ctrl+Shift+P` → **Symbiont: Remove Claude Code hooks**. Removes only
Symbiont's entries from `settings.json` (other tools' hooks stay) and deletes
the 5 files. Then uninstall the extension and, if you like, delete
`~/.claude/simbionte/`. `settings.json.bak` stays in place in case you'd
rather restore the file exactly as it was before installing.

### Optional: open the project's app with one click

Create `~/.claude/simbionte-urls.json` mapping project id → URL
(see [`simbionte-urls.example.json`](vscode-extension/simbionte-urls.example.json)).

## Privacy

Everything stays on your disk, in `~/.claude/simbionte/`. The extension makes
no network calls. The command of a running Bash call is stored there (first
120 characters) only so it can appear in the panel.

---

## For contributors

Internal names (command and setting IDs, file names, the `~/.claude/simbionte/`
folder) keep the original `simbionte` spelling so existing installs and
settings keep working.

### Layout

```
store.js            <- reads/writes ~/.claude/simbionte/ (the data contract)
claude-hooks/       <- hook sources (progress-hook.js, activity-hook.js, estado-hook.js)
hooks-settings.js   <- pure: register/remove the hooks in settings.json
vscode-extension/   <- the extension (media/build.html is the panel; lib/ is generated by prepare.js)
insights.js         <- pure: signals, summary, health score, classification
scan-store.js       <- persists the git scan to _scan.<port>.json
git-scan.js         <- reads real git data for each project
data.js             <- project catalog (GENERATED — node gerar-data.js --gravar)
server.js           <- (optional) HTTP + full graph in simbionte.html
supervisor.js, run-server.cmd, deploy.js  <- server autostart (Windows)
test-all.js         <- runs every suite
```

### How the pieces talk

The contract is the **disk**, not HTTP:

```
hooks  ──write──>  ~/.claude/simbionte/<project>.json   ──read──>  panel
server ──writes─>  ~/.claude/simbionte/_scan.<port>.json ──read──>  panel
```

The panel works without the server. The (optional) server only adds the git
scan — project health and signals like "no commit for N days" — and the
graph in `simbionte.html`.

### Optional server (project health)

```
node gerar-data.js --gravar   # builds data.js from the projects the hooks have seen
node server.js                # http://localhost:4737
```

Projects are looked up in `~/Projects/<id>`; change that with the
`SIMBIONTE_PROJECTS_ROOT` variable. On Windows, `node deploy.js` packages and
installs the extension, copies the hooks and registers the server in Startup.

**Security:** the server has no authentication and sends
`Access-Control-Allow-Origin: *`. That's only acceptable because it listens
on loopback only (`127.0.0.1`/`::1`, covered by a test) and `/api/open` only
opens folders already listed in `data.js`. Don't expose it beyond
`localhost`.

**Port 4737:** chosen outside the Firebase Emulator Suite range (4000, 4400,
4500, 5000, 5001, 8080, 8085, 9000, 9099, 9199, 9299, 9499) — 4500 collided
with the Logging Emulator and the panel silently stopped updating.

### Tests

```
node test-all.js
```

Zero dependencies on purpose (there's no `package.json` at the root). Suites
are discovered automatically (`*.test.js` at the root and `test/*.js`). A
missing dependency (e.g. `playwright` in the visual test) shows up as
`PULADO:` (skipped), not as a failure. `test.js` starts an isolated instance
on port 4577.

The hook tests run the repo's source (`claude-hooks/` + `store.js`) in a
temporary HOME — they don't need the hooks installed in `~/.claude/`.

## License

[MIT](LICENSE). Original work © Oscar Wilder Rojas Rivero
([Simbionte](https://github.com/dragonfurioso35-art/simbionte-vscode)).
