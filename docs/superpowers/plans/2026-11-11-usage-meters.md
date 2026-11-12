# Claude Usage Meters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two small meters at the bottom of the panel: context of the followed session, and the weekly limit.

**Architecture:** see `docs/superpowers/specs/2026-11-11-usage-meters-design.md`. Store gets pure `aplicarUso` / `contextoDoTranscript`; a status line script records the weekly limit; the extension sends `uso`; the panel draws two bead rings.

**Tech Stack:** Node, VS Code webview, `node test-all.js`.

---

### Task 1: Store and status line

- [x] **Step 1: Write the failing test** — `test/test_uso.js` covering `aplicarUso`, `contextoDoTranscript`, heartbeat `transcript`, and the status line script end to end in a temp HOME.
- [x] **Step 2: Run it to see it fail** — `node test/test_uso.js` → `aplicarUso is not a function`.
- [x] **Step 3: Implement** — `store.js` (`aplicarUso`, `registrarUso`, `contextoDoTranscript`, heartbeat `transcript`); `claude-hooks/simbionte-statusline.js`.
- [x] **Step 4: Run it to see it pass**, then commit.

### Task 2: Install the status line

- [x] **Step 1: Failing test** — append to `test/test_uso.js`: `adicionarHooks` sets `statusLine` when absent or the probe, keeps a foreign one; `removerHooks` removes only ours; `ARQUIVOS` includes the script; `statusLineFaltando`.
- [x] **Step 2: Implement** — `hooks-settings.js`; `extension.js` install writes settings when the status line is missing and the update prompt counts it.
- [x] **Step 3: Pass**, commit.

### Task 3: Extension sends usage; panel draws meters

- [x] **Step 1: Failing test** — `test/test_uso_painel.js`: `renderUso` fills both meters (pct, `412k / 1M`, `resets …`, stale note, empty state, warn classes).
- [x] **Step 2: Implement** — `extension.js` `usoAtual()` in the update message, `_uso` in `INTERNOS_RE`; `build.html` section, `montarAnel` reused, `renderUso`.
- [x] **Step 3: Pass + full suite**, commit.

### Task 4: Ship

- [x] **Step 1: README + CHANGELOG.**
- [x] **Step 2: Package, install, push, CI green.**
- [x] **Step 3: Replace the probe** — Nik clicks **Update hooks**; `settings.json` statusLine points to `simbionte-statusline.js`; delete the probe script and `_statusline_probe/`.
- [x] **Step 4: Real check** — screenshot shows both meters.
