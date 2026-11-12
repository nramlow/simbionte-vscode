# Usage Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn Nik's and Claude's hourly usage from transcripts; show it; forecast the weekly limit from it.

**Architecture:** see `docs/superpowers/specs/2026-11-11-usage-pattern-design.md`. `padrao.js` (pure + async scan) → `_padrao.json`; extension sends a summary; panel draws strips; a command opens a full view.

**Tech Stack:** Node, VS Code webview, `node test-all.js`.

---

### Task 1: Reading transcripts into hourly buckets

- [ ] **Step 1: Failing test** — `test/test_padrao.js`: `lerLinhas` (weights, human/peer-voice/old-format detection, tool_result and meta ignored, sidechain usage counted, local-hour keys).
- [ ] **Step 2: Implement** `padrao.js` `PESOS`, `lerLinhas`.
- [ ] **Step 3: Pass**, commit.

### Task 2: Incremental scan

- [ ] **Step 1: Failing test** — `varrer` on a temp tree: first scan, appended lines only counted once, half-written last line waits, shrunk file reread, buckets older than 12 weeks dropped.
- [ ] **Step 2: Implement** `varrer`.
- [ ] **Step 3: Pass**, commit.

### Task 3: Profile, active window, forecast

- [ ] **Step 1: Failing test** — `perfil` (complete weeks only), `janelaAtiva` (wrap past midnight), `previsao` (hand-computed projection, crossing hour, null fallbacks).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass**, commit; print the real profile from Nik's data as a sanity check.

### Task 4: Extension — background scan, summary, full view

- [ ] **Step 1: Implement** scan scheduling, `_padrao` in `INTERNOS_RE`, `padrao` in the update message, `prepare.js` copies `padrao.js`.
- [ ] **Step 2: Full view** — `media/padrao.html` + command `simbionte.mostrarPadrao` in `package.json`.
- [ ] **Step 3: Test** — `test/test_padrao_painel.js` covers the full view's render function; syntax check; commit.

### Task 5: Panel strips and pace source

- [ ] **Step 1: Failing test** — strips render 24 cells per row with current hour outlined; window text; pace uses `padrao.previsao` with "from your usual hours", linear otherwise.
- [ ] **Step 2: Implement** in `build.html`.
- [ ] **Step 3: Pass + full suite**, commit.

### Task 6: Ship

- [ ] **Step 1: README + CHANGELOG.**
- [ ] **Step 2: Package, install, push, CI green.**
- [ ] **Step 3: Real check** — screenshot of the strips and pace line; the full view opens.
