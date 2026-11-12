# Programme Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The top ring shows a programme's overall progress across its plans and worktrees.

**Architecture:** see `docs/superpowers/specs/2026-11-12-programme-progress-design.md`.

**Tech Stack:** Node, VS Code webview, `node test-all.js`.

---

### Task 1: programa.js

- [x] **Step 1: Failing test** — `test/test_programa.js`.
- [x] **Step 2: Implement** `lerPrograma`, `copiaMaisNova`, `progressoPrograma`.
- [x] **Step 3: Pass**, commit; run against the real CI repo with a scratch programme file (not written into that repo).

### Task 2: Extension and ring

- [x] **Step 1: Failing test** — `test/test_programa_painel.js`.
- [x] **Step 2: Implement** — extension sends `programa`; `renderReator` uses it; `prepare.js` copies `programa.js`.
- [x] **Step 3: Pass + full suite**, commit.

### Task 3: Ship

- [x] **Step 1: README + CHANGELOG** (file format documented).
- [ ] **Step 2: Package, install, push, CI green.**
- [ ] **Step 3: Tell Governance Reconciliation the format** and that it can create the file.
- [ ] **Step 4: Real check** — screenshot of the ring once the file exists.
