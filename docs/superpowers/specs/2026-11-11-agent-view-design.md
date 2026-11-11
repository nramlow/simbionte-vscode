# Agent view and task progress — design

Date: 2026-11-11 · Status: approved by Nik (card "Approve, go ahead"); requested
via communication-intelligence-dd, which adopted the description convention.

## Problem

Rows show only the next unticked step. Sessions run plans with subagents
(implementer, deep-reviewer, fix) per task, two plans in parallel (one per
worktree), and tick steps only after review. Between ticks the panel can't
tell "Task 11 being implemented" from "Task 11 in review", and shows no
agents.

## Signals (verified in Nik's hook logs and Claude TV's tests)

- `PreToolUse` with `tool_name: "Agent"`: `tool_input.description`,
  `tool_input.subagent_type`.
- `SubagentStart`: `agent_id`, `agent_type` (no description).
- `SubagentStop`: `agent_id`, `agent_type`, `background_tasks`.
- `Stop`: `background_tasks` = running background work:
  `[{ id, type: "subagent"|"shell"|"monitor", status, description, agent_type }]`;
  a subagent's `id` equals its `agent_id`.

## Convention (adopted by the CI sessions)

Agent description `<worktree folder>: Task <n> <implement|review|fix> – <title>`,
e.g. `governance-shell: Task 12 implement – customer storage URL`.

## Data — `store.js` (installed as `~/.claude/simbionte-store.js`)

`aplicarEventoAgente(estado, data, agora)` — pure. State
`{ sessoes: { [session_id]: { cwd, pendentes: [{tipo, descricao, ts}],
agentes: { [agent_id]: {tipo, descricao, inicio, fim} } } } }`.

- PreToolUse/Agent → push a pending `{tipo: subagent_type, descricao}`.
- SubagentStart → agent `{tipo: agent_type, descricao: first pending with the
  same tipo (else first pending), inicio}`; that pending is consumed. No
  `agent_id` (older Claude Code) → ignored.
- SubagentStop / Stop → sync with `background_tasks`: each running subagent
  task creates or completes its agent's description; on **Stop**, running
  agents not in the list are ended. SubagentStop then ends its own agent.
- Cleanup on every event: pendings older than 2 min, agents ended over
  10 min ago, agents running over 2 h, empty sessions.

`registrarEventoAgente(data)` — lock `_agentes`, read, apply, atomic write of
`~/.claude/simbionte/_agentes.json`.

New hook `claude-hooks/agentes-hook.js` (never writes stdout) on
`PreToolUse` (matcher `Agent`), `SubagentStart`, `SubagentStop`, `Stop`. A
separate file because `hooks-settings` identifies a hook by event + file:
adding a matcher to `estado-hook` would never install for existing users.
The extension's "new hooks are available → Update hooks" prompt registers it;
the automatic file refresh copies the file.

## Task progress — `progressoDoPlano`

Adds `tarefas: { total, feitas, atual: { numero, titulo } | null }` from
headings matching `Task <n>` (any level) that have at least one step
checkbox; a task is done when all its steps are ticked; `atual` is the first
task with an unticked step. No Task headings → `tarefas: null`.

## Extension side — `agentes.js` (new, copied to `lib/`)

- `lerConvencao(descricao)` → `{ worktree, tarefa, papel, titulo } | null`.
- `agentesAtivos(estado, agora)` → running agents (`fim` null) with session
  `cwd` and the parsed convention.
- `anexarAgentes(projetos, ativos)` → each project gets `agentes: [...]`:
  convention `worktree` equal to `projectId` (or the basename of
  `projectPath`); otherwise the project whose `projectPath` contains the
  session `cwd` most deeply.

`extension.js` posts `anexarAgentes(agruparProjetos(…), agentesAtivos(_agentes.json))`.
`_agentes.json` is added to the internal-file filter.

## Panel

- Label: `Task N` in the plan label becomes `Task N/total`, plus
  ` · implementing | in review | fixing` when a live agent on that row works on
  task N (newest wins): "Phase 1 › Task 11/20 · in review › Step 1: …". Same
  for the ring.
- Under a row's info line, one compact line per live agent:
  `<agent type> · <description> · <running time>`.
- Folded group summary adds `· N agents` when any.

## Testing

`test/test_agentes.js` (event sequences with real payload shapes, hook end to
end in a temp HOME, convention parsing, row mapping);
`test/test_rotulo_plano.js` (task counts); `test/test_agentes_painel.js`
(panel in a VM with a stub DOM).

## Out of scope

Recently finished agents; agent history; shells and monitors from
`background_tasks`.
