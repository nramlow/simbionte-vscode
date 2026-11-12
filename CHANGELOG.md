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
- Agent view: each row shows `Task N/total · implementing / in review / fixing › Step N/total` and its live subagents (new `agentes-hook.js` on PreToolUse(Agent), SubagentStart, SubagentStop, Stop). Agents map to worktrees through descriptions like `governance-shell: Task 12 implement – title`.
- Claude usage meters at the bottom of the panel: context window of the followed session (from its transcript) and the weekly limit (from Symbiont's status line, set only when you have none). Under them, a weekly pace estimate like Claude's usage page: "On track · about 93% by reset" or "Ahead of pace · limit around Wed 6:00 PM", projected linearly from the start of the week to the reset Claude Code reports. The meters stay pinned to the bottom while the panel scrolls, and the "Today" list can be folded.
- Usage pattern: learns from your Claude Code transcripts when Claude works and when you send messages, hour by hour (last 12 weeks, incremental scan every 10 minutes). Shows two 24-hour strips with your usual active hours, a full weekday × hour view (**Symbiont: Show usage pattern**), and forecasts the weekly limit from your usual hours once a full week is learned.
- Markdown links opening in the preview moved to its own extension: [vscode-claudecode-markdown-preview](https://github.com/nullreferenceexception/vscode-claudecode-markdown-preview).
- A row's stage comes from live activity: "building" only with a live agent or activity in the last 15 minutes, otherwise "idle · next: …". The plan shown is the one the hooks recorded for that folder (re-read for git pulls), not the newest plan file there. A finished plan followed by new activity no longer reads "task complete". Edits outside a project (e.g. a session's memory file) no longer show as its activity. Empty leftover worktree folders (no .git) are hidden.
- The window's project stays put: its card (or group) is always first, the ring always follows it, and the status line and context meter follow the session working in its folder, instead of switching to whatever was active last.
- Programme progress: a `.symbiont/programme.json` in the main checkout lists several plans (one per sub-project/worktree); the top ring then shows the overall progress (sub-project n/N, total steps) and the running plan's task and step.
- Rows whose folder no longer exists (a worktree removed after merging) are hidden; their edits still count in "Today". A row with a live agent stays yellow instead of red.
- Updates without reloading VS Code: when a new version is installed, the panel reloads itself and the hook files are refreshed; changes to the rest of the extension show a "reload when convenient" notice.
- Fix: "edited via Bash" only when a shell command actually writes to the plan; commands that merely mention it (git add/commit, grep, a heredoc to another file) no longer trigger it.
- Fix: "Plan complete" and "edited via Bash" popups no longer repeat on every VS Code reload; what was already announced is kept in VS Code's storage.
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
