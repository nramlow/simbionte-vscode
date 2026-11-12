# Pause / resume a project's sessions — design

Date: 2026-11-12 · Status: approved by Nik (card "Yes, build it").

## Why

Nik runs Communication-Intelligence in its own VS Code window with very long
tasks and agents. To reload that window (to get a new Symbiont) he needs the
work to reach a safe point first. A reload restarts every Claude Code session
in that window.

## Channel: the session inbox

Claude Code exports `CLAUDE_CODE_MESSAGING_SOCKET` and
`CLAUDE_CODE_MESSAGING_TOKEN` to command hooks (docs:
cross-session-messaging, "the session's inbox socket"; Claude TV uses it for
dictation). A newline-delimited JSON write — `{"type":"auth","token"}` then
`{"type":"user","from","message":{"content"}}` — is delivered as the
session's own message: an idle session starts a turn, a busy one reads it
between tool calls. A reload gives the session a new socket and token.

## Pieces

**store.js**
- `registrarHeartbeat` keeps `inbox: { socket, token }` per session when both
  env vars are present and well-formed (pipe/socket and token shapes as
  Claude TV checks them).
- `_pausa.json` = `{ sessoes: { [id]: { desde, pasta } } }`;
  `lerPausa()`, `pausar(ids, pasta)`, `retomar(ids)`.
- `bloqueioPausa(data, pausa)` (pure) → reason or null: while the hook's
  session is paused, block `Agent` launches and `Bash` with
  `run_in_background: true`. Running agents and plain commands continue.

**Hooks**
- `estado-hook.js` also on `SessionStart` (new HOOKS entry) so a restarted
  session re-registers its inbox. On `PreToolUse` (Bash) it prints a deny
  (`hookSpecificOutput.permissionDecision: "deny"` + reason) when blocked.
- `agentes-hook.js` on `PreToolUse` (Agent): prints the deny when blocked
  (and records no pending agent). Never prints on Stop.

**pausa.js** (extension side)
- `alvos(projetos, sessoes, ids)` → session ids for the chosen rows: sessions
  whose cwd is in a row's folder, plus sessions owning that row's agents.
- `estadoPausa(id, sessoes, agentesDaSessao)` → `pausando` (still working or
  agents alive) or `pausado` (last event Stop/Notification and no live
  agents).
- `enviar(inbox, texto)` → pipe write (3 s timeout).

**Extension** — webview messages `pausar` / `retomar` with project ids →
confirm dialog ("Pause N sessions working in X?"), write `_pausa.json`,
send the message to each target's inbox; report sessions without a known
inbox ("not reachable until its next prompt"). Each project row gets
`pausa: { estado, agentes, sessoes }`.

**Panel** — hover ⏸ on rows and group headers; paused rows show
"pausing… (N agents running)" or "paused · safe to reload" and a ▶ button.

## Messages

Pause: "Nik pressed Pause in Symbiont for <folder> (he wants to reload VS
Code). Finish the step you're on, don't start new tasks, agents or
background commands, let running agents finish (don't stop them), make sure
work is saved, then stop and say where you are and what's left. Wait for
Nik to resume."

Resume: "Nik pressed Resume in Symbiont: continue where you left off."

## Testing

`test/test_pausa.js`: inbox capture in heartbeat (valid/invalid shapes),
pause file helpers, `bloqueioPausa`, hooks end to end (deny JSON on
PreToolUse when paused, silent otherwise, silent on Stop), `alvos`,
`estadoPausa`, `enviar` against a local test server; panel buttons/labels in
the VM test.
