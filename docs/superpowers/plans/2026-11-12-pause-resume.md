# Pause / Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause a project's sessions at a safe point before a VS Code reload, and resume them after.

**Architecture:** see `docs/superpowers/specs/2026-11-12-pause-resume-design.md`.

**Tech Stack:** Node, VS Code webview, `node test-all.js`.

---

### Task 1: Store — inbox capture, pause file, block rule

- [x] **Step 1: Failing test** — `test/test_pausa.js` (store part).
- [x] **Step 2: Implement** in `store.js`.
- [x] **Step 3: Pass**, commit.

### Task 2: Hooks — SessionStart, deny while paused

- [x] **Step 1: Failing test** — hooks end to end in a temp HOME.
- [x] **Step 2: Implement** `estado-hook.js`, `agentes-hook.js`, `hooks-settings.js`.
- [x] **Step 3: Pass**, commit.

### Task 3: pausa.js — targets, state, inbox send

- [x] **Step 1: Failing test** — `alvos`, `estadoPausa`, `enviar` against a local server.
- [x] **Step 2: Implement** `pausa.js`.
- [x] **Step 3: Pass**, commit.

### Task 4: Extension and panel

- [x] **Step 1: Failing test** — panel buttons and labels.
- [x] **Step 2: Implement** extension commands and `build.html`.
- [x] **Step 3: Pass + full suite**, commit.

### Task 5: Ship

- [x] **Step 1: README + CHANGELOG.**
- [x] **Step 2: Package, install, push, CI green.**
- [ ] **Step 3: Real check** — Nik clicks Update hooks, pauses a row, sees "paused · safe to reload", reloads, resumes.
