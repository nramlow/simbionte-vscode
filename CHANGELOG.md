# Changelog

## 1.2.0 — 2026-11-11

Symbiont: English fork of [Simbionte](https://github.com/dragonfurioso35-art/simbionte-vscode) by Oscar Wilder Rojas Rivero.

- Renamed to **Symbiont** everywhere it's visible (sidebar, panel, commands, settings, notifications).
- Panel, notifications, commands, settings and README translated to English.
- Setting renamed to `simbionte.stuckThresholdMinutes`; the old `simbionte.limiteTravadoMin` is still honored if the new one isn't set.
- Internal IDs and file names keep the original `simbionte` spelling, so existing installs and settings keep working.
- Projects from the same git origin (worktrees, sub-folders with their own `package.json`, other clones of the same remote) are grouped into one collapsible card. A repo with a single project looks as before.
- The "open" arrow on cards points right instead of up (it read as "collapse").
- The "building:" label says where you are in big plans: "Phase 1 › Task 2 › Step 1: …", from the Phase/Task headings above the next unticked step.
- With no active plan (none, or a finished plan followed by more work), the ring says "no active plan" and shows the file being edited, instead of an empty "0 / 0 steps · system idle".
- Fix: the "checkbox edited via Bash" warning no longer fires when nothing was ticked — e.g. the first time a plan shows up in a command like `cat` or `git add`, or when only the plan's item count changed. Warnings recorded that way clear on the plan's next update.
- Updating the extension now refreshes its hook files in `~/.claude/` when they're out of date (only if the hooks are installed; `settings.json` is never touched). Before, fixes to the hooks only arrived after running **Install Claude Code hooks** again.
- Fix: on Windows, a hook update could be lost when the panel was reading the same file at that moment (the atomic rename failed with EPERM and left a `.json.tmp` behind). The rename now retries for up to about 200 ms.

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
