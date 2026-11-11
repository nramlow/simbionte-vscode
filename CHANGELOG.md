# Changelog

## 1.2.0 — 2026-11-11

Symbiont: English fork of [Simbionte](https://github.com/dragonfurioso35-art/simbionte-vscode) by Oscar Wilder Rojas Rivero.

- Renamed to **Symbiont** everywhere it's visible (sidebar, panel, commands, settings, notifications).
- Panel, notifications, commands, settings and README translated to English.
- Setting renamed to `simbionte.stuckThresholdMinutes`; the old `simbionte.limiteTravadoMin` is still honored if the new one isn't set.
- Internal IDs and file names keep the original `simbionte` spelling, so existing installs and settings keep working.

## 1.1.0 — 2026-09-25

No more false "stuck" alarms.

- **Session state** in the panel: working, waiting for you, running a command (with the command and for how long), session ended. It only warns *possibly stuck* when Claude was working and went silent.
- New `estado-hook.js` hook on the `PreToolUse`/`PostToolUseFailure` (Bash), `Notification`, `Stop`, `UserPromptSubmit` and `SessionEnd` events. State is kept per session (several open sessions don't overwrite each other).
- Setting `simbionte.limiteTravadoMin` (default 15).
- **Remove Claude Code hooks** command — removes only Simbionte's entries from `settings.json` and deletes the copied files.
- Installing only adds the hooks that are missing; `settings.json.bak` is written only the first time (it keeps the original).
- Users coming from 1.0.x get the "new hooks are available" prompt → **Update hooks**.

## 1.0.1 — 2026-09-24

- README with a screenshot of the panel.

## 1.0.0 — 2026-09-24

First public release.

- Activity Bar panel: plan progress (`docs/superpowers/plans/*.md` and TodoWrite), activity per project, stuck-hook alert.
- **Install Claude Code hooks** command — copies the hooks to `~/.claude/` and registers them in `settings.json` (with a backup).
- Store and hooks bundled inside the extension.
