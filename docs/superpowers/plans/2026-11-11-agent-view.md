# Agent View and Task Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each worktree row shows "Task N/total · implementing / in review / fixing" and its live subagents.

**Architecture:** A new hook (`agentes-hook.js`) feeds `aplicarEventoAgente` in `store.js`, which keeps live agents per session in `~/.claude/simbionte/_agentes.json`. `progressoDoPlano` adds task counts from `Task N` headings. The extension maps agents to rows (`agentes.js`, by the description convention or the session folder) and the panel renders them. Spec: `docs/superpowers/specs/2026-11-11-agent-view-design.md`.

**Tech Stack:** Node (no dependencies), VS Code webview, `node test-all.js`.

**Rules:** tick checkboxes here with the Edit tool. Code comments in Portuguese; UI text in English.

---

### Task 1: Store — agent state and task counts

**Files:**
- Modify: `store.js` (new functions before `module.exports`; `progressoDoPlano` return; exports)
- Create: `test/test_agentes.js`
- Modify: `test/test_rotulo_plano.js`

- [x] **Step 1: Write the failing tests**

`test/test_agentes.js`:

```js
// Self-check: agentes vivos por sessão (store.aplicarEventoAgente) com os
// formatos reais de payload (logs do Nik / testes do Claude TV), o hook de
// ponta a ponta num HOME temporário, a convenção de descrição e o mapeamento
// pras linhas do painel (agentes.js).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-agentes-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const { aplicarEventoAgente } = require('../store.js');

const T = 1700000000000;
const ev = o => ({ session_id: 's1', cwd: 'D:\\CI', ...o });
const DESC_I = 'governance-shell: Task 12 implement – customer storage URL';
let st = {};
st = aplicarEventoAgente(st, ev({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: DESC_I, subagent_type: 'implementer', prompt: 'x'.repeat(5000) } }), T);
st = aplicarEventoAgente(st, ev({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'Review Shell Task 11', subagent_type: 'deep-reviewer' } }), T + 1);
st = aplicarEventoAgente(st, ev({ hook_event_name: 'SubagentStart', agent_id: 'r1', agent_type: 'deep-reviewer' }), T + 2);
st = aplicarEventoAgente(st, ev({ hook_event_name: 'SubagentStart', agent_id: 'i1', agent_type: 'implementer' }), T + 3);
assert.strictEqual(st.sessoes.s1.agentes.i1.descricao, DESC_I, 'descrição casada pelo tipo, não pela ordem');
assert.strictEqual(st.sessoes.s1.agentes.r1.descricao, 'Review Shell Task 11');
assert.strictEqual(st.sessoes.s1.pendentes.length, 0);
assert.strictEqual(st.sessoes.s1.cwd, 'D:\\CI');
assert.ok(!JSON.stringify(st).includes('xxxxx'), 'prompt não é guardado');

st = aplicarEventoAgente(st, ev({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }), T + 4);
assert.strictEqual(st.sessoes.s1.pendentes.length, 0, 'outra ferramenta não vira pendente');

st = aplicarEventoAgente(st, ev({ hook_event_name: 'SubagentStop', agent_id: 'r1', agent_type: 'deep-reviewer', background_tasks: [
  { id: 'r1', type: 'subagent', status: 'running', description: 'Review Shell Task 11', agent_type: 'deep-reviewer' },
  { id: 'i1', type: 'subagent', status: 'running', description: DESC_I, agent_type: 'implementer' },
  { id: 'm1', type: 'monitor', status: 'running', description: 'live updates' },
] }), T + 5);
assert.strictEqual(st.sessoes.s1.agentes.r1.fim, T + 5, 'SubagentStop fecha o próprio agente (mesmo listado como running)');
assert.strictEqual(st.sessoes.s1.agentes.i1.fim, null);
assert.ok(!st.sessoes.s1.agentes.m1, 'monitor não é agente');

st = aplicarEventoAgente(st, ev({ hook_event_name: 'Stop', background_tasks: [
  { id: 'i1', type: 'subagent', status: 'running', description: 'outra coisa', agent_type: 'implementer' },
  { id: 'x9', type: 'subagent', status: 'running', description: 'policy-model-1: Task 7 fix – coverage', agent_type: 'implementer' },
] }), T + 6);
assert.strictEqual(st.sessoes.s1.agentes.x9.descricao, 'policy-model-1: Task 7 fix – coverage', 'agente não visto nascer entra pela lista');
assert.strictEqual(st.sessoes.s1.agentes.i1.descricao, DESC_I, 'descrição conhecida não é trocada');

st = aplicarEventoAgente(st, ev({ hook_event_name: 'Stop', background_tasks: [
  { id: 'x9', type: 'subagent', status: 'running', description: 'policy-model-1: Task 7 fix – coverage', agent_type: 'implementer' },
] }), T + 7);
assert.strictEqual(st.sessoes.s1.agentes.i1.fim, T + 7, 'Stop sem o agente na lista: acabou');

st = aplicarEventoAgente(st, { hook_event_name: 'Stop', session_id: 's2', background_tasks: [] }, T + 7 + 11 * 60000);
assert.ok(!st.sessoes.s1.agentes.r1 && !st.sessoes.s1.agentes.i1, 'terminados há mais de 10 min somem');
assert.ok(st.sessoes.s1.agentes.x9, 'rodando continua');
assert.ok(!st.sessoes.s2, 'sessão sem agentes não fica');
st = aplicarEventoAgente(st, { hook_event_name: 'Stop', session_id: 's2', background_tasks: [] }, T + 3 * 3600000);
assert.ok(!st.sessoes.s1, 'rodando há mais de 2h: perdido, sai');

assert.deepStrictEqual(aplicarEventoAgente({}, ev({ hook_event_name: 'SubagentStart', agent_type: 'x' }), T), { sessoes: {} }, 'sem agent_id (Claude Code antigo): ignora');
const congelado = { sessoes: { s9: { cwd: null, pendentes: [], agentes: { q: { tipo: 't', descricao: '', inicio: T, fim: T } } } } };
aplicarEventoAgente(congelado, { hook_event_name: 'Stop', session_id: 's8' }, T + 20 * 60000);
assert.ok(congelado.sessoes.s9.agentes.q, 'não muta o estado recebido');

console.log('OK: agentes vivos por sessão (início, fim, lista do Stop, limpeza)');
fs.rmSync(home, { recursive: true, force: true });
```

Append to `test/test_rotulo_plano.js`, before its `console.log`:

```js
  assert.deepStrictEqual(progressoDoPlano(path.join(planos, 'a.md')).tarefas,
    { total: 3, feitas: 1, atual: { numero: 2, titulo: 'Recognise upstream sessions' } }, 'Task 1 feita (2/2), atual = Task 2');
  assert.deepStrictEqual(progressoDoPlano(path.join(planos, 'b.md')).tarefas.atual, { numero: 3, titulo: 'Something' });
  assert.strictEqual(progressoDoPlano(path.join(planos, 'd.md')).tarefas, null, 'sem títulos Task: null');
```

- [x] **Step 2: Run them to verify they fail**

Run: `node test/test_agentes.js; node test/test_rotulo_plano.js`
Expected: FAIL (`aplicarEventoAgente is not a function`; `tarefas` undefined)

- [x] **Step 3: Implement**

In `store.js`, in `progressoDoPlano`'s returned object, add after `updatedAt: Date.now(),`:

```js
    tarefas: tarefasDoPlano(texto),
```

Add before `module.exports`:

```js
// Tarefas do plano (títulos "Task N", qualquer nível) pra linha mostrar
// "Task 11/20". Tarefa sem checkbox não conta; feita = todos os passos
// marcados; atual = a primeira com passo aberto. Título de nível igual ou
// acima fecha a tarefa; bloco ``` é código, não conta.
function tarefasDoPlano(texto) {
  const tarefas = [];
  let atual = null;
  let emCodigo = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (/^\s*```/.test(linha)) { emCodigo = !emCodigo; continue; }
    if (emCodigo) continue;
    const titulo = linha.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      const nivel = titulo[1].length;
      const t = titulo[2].replace(/[`*]/g, '').match(/^task\s+(\d+)\s*[:.–—-]?\s*(.*)$/i);
      if (t) { atual = { numero: Number(t[1]), titulo: t[2].trim(), nivel, passos: 0, feitos: 0 }; tarefas.push(atual); }
      else if (atual && nivel <= atual.nivel) atual = null;
      continue;
    }
    const caixa = linha.match(/^- \[([ xX])\]/);
    if (caixa && atual) { atual.passos++; if (caixa[1] !== ' ') atual.feitos++; }
  }
  const comPassos = tarefas.filter(t => t.passos);
  if (!comPassos.length) return null;
  const proxima = comPassos.find(t => t.feitos < t.passos);
  return {
    total: comPassos.length,
    feitas: comPassos.filter(t => t.feitos === t.passos).length,
    atual: proxima ? { numero: proxima.numero, titulo: proxima.titulo.slice(0, 80) } : null,
  };
}

// Agentes (subagentes) vivos por sessão, pro painel mostrar "Task 11 · in
// review" e os agentes de cada worktree. Puro; registrarEventoAgente grava
// em _agentes.json. Fontes: PreToolUse da ferramenta Agent (descrição e
// tipo), SubagentStart (agent_id + tipo, sem descrição), SubagentStop e Stop
// (background_tasks: subagentes rodando, com descrição; id = agent_id).
const PENDENTE_EXPIRA_MS = 2 * 60 * 1000;
const AGENTE_FIM_GUARDA_MS = 10 * 60 * 1000;
const AGENTE_MAX_MS = 2 * 60 * 60 * 1000;

function aplicarEventoAgente(estado, data, agora) {
  const sessoes = {};
  for (const [id, s] of Object.entries((estado && estado.sessoes) || {})) {
    sessoes[id] = { cwd: s.cwd || null, pendentes: [...(s.pendentes || [])], agentes: { ...(s.agentes || {}) } };
  }
  const evento = data && data.hook_event_name;
  const sid = data && data.session_id;
  if (evento && sid) {
    const s = sessoes[sid] = sessoes[sid] || { cwd: null, pendentes: [], agentes: {} };
    if (data.cwd) s.cwd = data.cwd;
    const desc = v => String(v || '').slice(0, 160);
    if (evento === 'PreToolUse' && data.tool_name === 'Agent' && data.tool_input) {
      s.pendentes.push({ tipo: data.tool_input.subagent_type || 'general-purpose', descricao: desc(data.tool_input.description), ts: agora });
    } else if (evento === 'SubagentStart' && data.agent_id) {
      const i = s.pendentes.findIndex(p => p.tipo === data.agent_type);
      const p = s.pendentes.splice(i < 0 ? 0 : i, 1)[0] || null;
      s.agentes[data.agent_id] = { tipo: data.agent_type || (p && p.tipo) || '?', descricao: (p && p.descricao) || '', inicio: agora, fim: null };
    } else if (evento === 'SubagentStop' || evento === 'Stop') {
      const rodando = (data.background_tasks || []).filter(t => t && t.type === 'subagent' && t.status === 'running');
      for (const t of rodando) {
        const a = s.agentes[t.id];
        s.agentes[t.id] = a
          ? { ...a, descricao: a.descricao || desc(t.description) }
          : { tipo: t.agent_type || '?', descricao: desc(t.description), inicio: agora, fim: null };
      }
      if (evento === 'Stop') {
        const ids = new Set(rodando.map(t => t.id));
        for (const [id, a] of Object.entries(s.agentes)) if (!a.fim && !ids.has(id)) s.agentes[id] = { ...a, fim: agora };
      } else if (data.agent_id) {
        const a = s.agentes[data.agent_id] || { tipo: data.agent_type || '?', descricao: '', inicio: agora };
        s.agentes[data.agent_id] = { ...a, fim: agora };
      }
    }
  }
  for (const [id, s] of Object.entries(sessoes)) {
    s.pendentes = s.pendentes.filter(p => agora - p.ts < PENDENTE_EXPIRA_MS);
    for (const [aid, a] of Object.entries(s.agentes)) {
      if ((a.fim && agora - a.fim > AGENTE_FIM_GUARDA_MS) || (!a.fim && agora - a.inicio > AGENTE_MAX_MS)) delete s.agentes[aid];
    }
    if (!s.pendentes.length && !Object.keys(s.agentes).length) delete sessoes[id];
  }
  return { sessoes };
}

function registrarEventoAgente(data) {
  const lock = adquirirLock('_agentes');
  try {
    let estado = {};
    try { estado = JSON.parse(fs.readFileSync(path.join(DIR, '_agentes.json'), 'utf8')); } catch (e) { /* 1ª vez */ }
    escreverAtomico('_agentes', aplicarEventoAgente(estado, data, Date.now()));
  } finally { liberarLock(lock); }
}
```

Add `aplicarEventoAgente, registrarEventoAgente` to `module.exports`.

- [x] **Step 4: Run them to verify they pass**

Run: `node test/test_agentes.js && node test/test_rotulo_plano.js`
Expected: both `OK:` lines.

- [x] **Step 5: Commit**

```bash
git add store.js test/test_agentes.js test/test_rotulo_plano.js
git commit -m "feat(store): live agents per session and task counts from plan headings"
```

### Task 2: Hook, install, extension side

**Files:**
- Create: `claude-hooks/agentes-hook.js`, `agentes.js`
- Modify: `hooks-settings.js` (HOOKS), `vscode-extension/prepare.js` (copy `agentes.js`), `vscode-extension/extension.js` (INTERNOS_RE, require, `enviar`, update prompt text)
- Modify: `test/test_agentes.js` (append before its final `console.log`)

- [x] **Step 1: Write the failing tests**

Insert into `test/test_agentes.js` before `console.log('OK: agentes vivos…')`:

```js
const { lerConvencao, agentesAtivos, anexarAgentes } = require('../agentes.js');
assert.deepStrictEqual(lerConvencao(DESC_I), { worktree: 'governance-shell', tarefa: 12, papel: 'implement', titulo: 'customer storage URL' });
assert.deepStrictEqual(lerConvencao('policy-model-1: Task 7 Review'), { worktree: 'policy-model-1', tarefa: 7, papel: 'review', titulo: '' });
assert.strictEqual(lerConvencao('Shell Task 11: access in URL'), null, 'fora da convenção');

const CI = path.join(home, 'CI');
const estado = { sessoes: { s1: { cwd: CI, pendentes: [], agentes: {
  a: { tipo: 'implementer', descricao: 'governance-shell: Task 12 implement – x', inicio: T, fim: null },
  b: { tipo: 'deep-reviewer', descricao: 'governance-shell: Task 11 review', inicio: T + 1, fim: null },
  c: { tipo: 'Explore', descricao: 'find usages', inicio: T + 2, fim: null },
  d: { tipo: 'implementer', descricao: 'policy-model-1: Task 7 fix – y', inicio: T, fim: T + 5 },
} } } };
const ativos = agentesAtivos(estado, T + 10);
assert.deepStrictEqual(ativos.map(a => a.id), ['c', 'b', 'a'], 'só os vivos, mais novo primeiro');
assert.strictEqual(ativos[1].convencao.tarefa, 11);
const projs = [
  { projectId: 'Communication-Intelligence', projectPath: CI },
  { projectId: 'governance-shell', projectPath: path.join(CI, '.worktrees', 'governance-shell') },
  { projectId: 'ui', projectPath: path.join(CI, '.worktrees', 'governance-shell', 'ui') },
  { projectId: 'outro', projectPath: path.join(home, 'outro') },
];
const com = anexarAgentes(projs, ativos);
const de = id => (com.find(p => p.projectId === id).agentes || []).map(a => a.id);
assert.deepStrictEqual(de('governance-shell'), ['b', 'a'], 'pela convenção');
assert.deepStrictEqual(de('Communication-Intelligence'), ['c'], 'sem convenção: pasta da sessão');
assert.deepStrictEqual(de('ui'), []);
assert.strictEqual(com[3], projs[3], 'projeto sem agentes passa intacto');
assert.deepStrictEqual(anexarAgentes(projs, agentesAtivos(null, T)), projs, 'sem _agentes.json: nada muda');

const claude = path.join(home, '.claude');
fs.mkdirSync(claude, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'claude-hooks', 'agentes-hook.js'), path.join(claude, 'agentes-hook.js'));
fs.copyFileSync(path.join(__dirname, '..', 'store.js'), path.join(claude, 'simbionte-store.js'));
const rodar = bruto => execFileSync(process.execPath, [path.join(claude, 'agentes-hook.js')], { input: bruto, encoding: 'utf8' });
assert.strictEqual(rodar(JSON.stringify(ev({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'governance-shell: Task 3 review', subagent_type: 'deep-reviewer' } }))), '', 'hook não escreve em stdout');
rodar(JSON.stringify(ev({ hook_event_name: 'SubagentStart', agent_id: 'z1', agent_type: 'deep-reviewer' })));
const gravado = JSON.parse(fs.readFileSync(path.join(claude, 'simbionte', '_agentes.json'), 'utf8'));
assert.strictEqual(gravado.sessoes.s1.agentes.z1.descricao, 'governance-shell: Task 3 review');
assert.strictEqual(rodar('{isto não é json'), '', 'payload inválido: sai quieto');

const { HOOKS } = require('../hooks-settings.js');
for (const ev2 of ['PreToolUse', 'SubagentStart', 'SubagentStop', 'Stop']) {
  assert.ok(HOOKS.some(h => h.evento === ev2 && h.file === 'agentes-hook.js'), `agentes-hook registrado em ${ev2}`);
}
assert.strictEqual(HOOKS.find(h => h.evento === 'PreToolUse' && h.file === 'agentes-hook.js').matcher, 'Agent');
```

- [x] **Step 2: Run to verify it fails**

Run: `node test/test_agentes.js`
Expected: FAIL with `Cannot find module '../agentes.js'`

- [x] **Step 3: Implement**

`claude-hooks/agentes-hook.js`:

```js
#!/usr/bin/env node
// Hook dos AGENTES pro painel do Symbiont: PreToolUse (matcher Agent),
// SubagentStart, SubagentStop e Stop. Guarda quais subagentes estão vivos em
// cada sessão (~/.claude/simbionte/_agentes.json), com a descrição que liga
// cada um a um worktree e a uma Task. Arquivo separado do estado-hook porque
// o registro de hooks identifica por evento + arquivo.
//
// Nunca escreve em stdout: no Stop, uma saída errada poderia bloquear o fim
// da resposta.
const { registrarEventoAgente } = require('./simbionte-store');

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  try { registrarEventoAgente(JSON.parse(input)); }
  catch (e) { /* payload inválido — hook nunca pode quebrar a sessão */ }
  process.exit(0);
});
```

`agentes.js`:

```js
// Lado da extensão: agentes vivos (de _agentes.json, gravado pelo
// agentes-hook) ligados às linhas do painel. Convenção das descrições, que
// as sessões do Nik adotaram:
//   "<pasta do worktree>: Task <n> <implement|review|fix> – <título>"
const path = require('path');

const CONVENCAO = /^\s*([\w.-]+)\s*:\s*Task\s+(\d+)\s+(implement|review|fix)\b\s*(?:[–—-]\s*(.*))?$/i;
function lerConvencao(descricao) {
  const m = String(descricao || '').match(CONVENCAO);
  return m ? { worktree: m[1], tarefa: Number(m[2]), papel: m[3].toLowerCase(), titulo: (m[4] || '').trim() } : null;
}

function agentesAtivos(estado, agora) {
  const lista = [];
  for (const [sessao, s] of Object.entries((estado && estado.sessoes) || {})) {
    for (const [id, a] of Object.entries(s.agentes || {})) {
      if (a.fim) continue;
      lista.push({ id, sessao, cwd: s.cwd || null, tipo: a.tipo, descricao: a.descricao || '', inicio: a.inicio, convencao: lerConvencao(a.descricao) });
    }
  }
  return lista.sort((x, y) => y.inicio - x.inicio);
}

function dentroDe(filho, pai) {
  const rel = path.relative(pai, filho);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Cada agente vai pra linha do worktree da convenção; sem convenção, pra
// linha mais funda que contém a pasta da sessão.
function anexarAgentes(projetos, ativos) {
  const porProjeto = new Map();
  for (const a of ativos) {
    let alvo = null;
    if (a.convencao) {
      const w = a.convencao.worktree.toLowerCase();
      alvo = projetos.find(p => String(p.projectId || '').toLowerCase() === w
        || (p.projectPath && path.basename(p.projectPath).toLowerCase() === w)) || null;
    }
    if (!alvo && a.cwd) {
      alvo = projetos.filter(p => p.projectPath && dentroDe(a.cwd, p.projectPath))
        .sort((x, y) => y.projectPath.length - x.projectPath.length)[0] || null;
    }
    if (!alvo) continue;
    if (!porProjeto.has(alvo)) porProjeto.set(alvo, []);
    porProjeto.get(alvo).push(a);
  }
  return projetos.map(p => (porProjeto.has(p) ? { ...p, agentes: porProjeto.get(p) } : p));
}

module.exports = { lerConvencao, agentesAtivos, anexarAgentes };
```

`hooks-settings.js` — add to `HOOKS` after the `SessionEnd` line:

```js
  { evento: 'PreToolUse', matcher: 'Agent', file: 'agentes-hook.js' },
  { evento: 'SubagentStart', file: 'agentes-hook.js' },
  { evento: 'SubagentStop', file: 'agentes-hook.js' },
  { evento: 'Stop', file: 'agentes-hook.js' },
```

`vscode-extension/prepare.js` — the list becomes:

```js
for (const f of ['scan-store.js', 'insights.js', 'data.js', 'store.js', 'hooks-settings.js', 'origem.js', 'agentes.js']) {
```

`vscode-extension/extension.js`:
- `INTERNOS_RE` becomes `/^_(heartbeat|agentes|scan\.\d+|aviso_uso_[^/\\]*)\.json$/i`.
- After the `agruparProjetos` block add:

```js
// Agentes vivos (agentes-hook -> _agentes.json) ligados às linhas.
let agentesNoPainel = projetos => projetos;
try {
  const ag = require('./lib/agentes.js');
  agentesNoPainel = projetos => {
    let estado = null;
    try { estado = JSON.parse(fs.readFileSync(path.join(DIR, '_agentes.json'), 'utf8')); } catch (e) { /* sem agentes ainda */ }
    return ag.anexarAgentes(projetos, ag.agentesAtivos(estado, Date.now()));
  };
} catch (e) { /* rodando do repo sem prepare.js — sem agentes, como antes */ }
```

- In `enviar`: `const projetos = agentesNoPainel(agruparProjetos(lerTodosProjetos(atual)));`
- Update prompt text: `'Symbiont: new hooks are available (agent view, session state) — update to get them.'`

- [x] **Step 4: Run to verify it passes**

Run: `node test/test_agentes.js && node test/test_hooks_settings.js && node vscode-extension/prepare.js && node --check vscode-extension/extension.js`
Expected: `OK:` lines, `lib/ pronta`, no syntax error.

- [x] **Step 5: Commit**

```bash
git add claude-hooks/agentes-hook.js agentes.js hooks-settings.js vscode-extension/prepare.js vscode-extension/extension.js test/test_agentes.js
git commit -m "feat: agentes-hook records live subagents; extension maps them to rows"
```

### Task 3: Panel — task label and agent lines

**Files:**
- Modify: `vscode-extension/media/build.html`
- Create: `test/test_agentes_painel.js`

- [x] **Step 1: Write the failing test**

`test/test_agentes_painel.js`:

```js
// Self-check: o painel mostra "Task N/total · in review" e uma linha por
// agente vivo. Roda o <script> de media/build.html numa VM com DOM mínimo.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'vscode-extension', 'media', 'build.html'), 'utf8');
const elementos = {};
const elemento = () => ({
  innerHTML: '', textContent: '', hidden: false, title: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, focus() {},
});
const ctx = {
  document: {
    getElementById: id => (elementos[id] = elementos[id] || elemento()),
    createElementNS: () => elemento(), createElement: () => elemento(),
    querySelector: () => null, querySelectorAll: () => [],
  },
  window: { addEventListener() {} },
  acquireVsCodeApi: () => ({ getState: () => null, setState() {}, postMessage() {} }),
  CSS: { escape: s => s },
  console, Date, Math, JSON, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);

const agora = Date.now();
const prog = { percent: 48, completed: 64, total: 134, activeLabel: 'Task 11 › Step 1: Imports in endpoints.tsx', updatedAt: agora,
  tarefas: { total: 20, feitas: 10, atual: { numero: 11, titulo: 'access in URL' } } };
const ag = (id, tipo, descricao, convencao, min) => ({ id, tipo, descricao, convencao, inicio: agora - min * 60000 });
const AGS = [
  ag('b', 'deep-reviewer', 'governance-shell: Task 11 review', { worktree: 'governance-shell', tarefa: 11, papel: 'review', titulo: '' }, 2),
  ag('a', 'implementer', 'governance-shell: Task 12 implement – customer storage URL', { worktree: 'governance-shell', tarefa: 12, papel: 'implement', titulo: 'customer storage URL' }, 9),
];
const p = { projectId: 'governance-shell', projectName: 'governance-shell', projectPath: 'D:\\x', lastTouch: agora, activity: [], progress: prog, agentes: AGS };

ctx.renderStatusList([p], null);
let out = elementos.statusList.innerHTML;
assert.ok(out.includes('building: Task 11/20 · in review › Step 1: Imports in endpoints.tsx'), 'Task N/total + estado do agente na tarefa atual');
assert.strictEqual((out.match(/class="agente"/g) || []).length, 2, 'uma linha por agente vivo');
assert.ok(out.includes('Task 12 implement – customer storage URL'));
assert.ok(out.includes('deep-reviewer'));

ctx.renderStatusList([{ ...p, agentes: [] }], null);
assert.ok(elementos.statusList.innerHTML.includes('building: Task 11/20 › Step 1: Imports in endpoints.tsx'), 'sem agente na tarefa: só Task N/total');

ctx.renderStatusList([{ ...p, agentes: [], progress: { ...prog, activeLabel: 'teste real', tarefas: null } }], null);
assert.ok(elementos.statusList.innerHTML.includes('building: teste real<'), 'plano sem Task: rótulo como antes');

ctx.renderReator([p], 'governance-shell');
assert.strictEqual(elementos.reactorLabel.innerHTML, 'building: <b>Task 11/20 · in review › Step 1: Imports in endpoints.tsx</b>');

const membro = (id, extra) => ({ projectId: id, projectName: id, projectPath: 'D:\\CI\\' + id, lastTouch: agora, activity: [], progress: null,
  grupo: { chave: 'k', nome: 'CI', raiz: 'D:\\CI' }, ...extra });
ctx.renderStatusList([membro('governance-shell', { agentes: AGS }), membro('policy-model-1', {})], null);
assert.strictEqual((elementos.statusList.innerHTML.match(/class="agente"/g) || []).length, 2, 'agentes também nas linhas de grupo');
ctx.alternarGrupo('k');
assert.ok(elementos.statusList.innerHTML.includes('2 projects · governance-shell: system idle · 2 agents'), 'grupo dobrado conta agentes');

console.log('OK: painel mostra Task N/total com estado e os agentes vivos');
```

- [x] **Step 2: Run to verify it fails**

Run: `node test/test_agentes_painel.js`
Expected: FAIL on the first assertion.

- [x] **Step 3: Implement**

CSS, after the `.grupo-membro.clickable:hover` line:

```css
  /* agentes vivos da linha (subagentes: implementer, reviewer…) */
  .agentes{margin-top:3px;display:flex;flex-direction:column;gap:1px;}
  .agente{color:var(--dim);font-size:var(--fs-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .agente::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--teal);
    margin-right:6px;vertical-align:middle;box-shadow:0 0 6px var(--teal);}
  .agente-tipo{color:var(--text);}
```

In the `@container painel (max-width: 210px)` block, add `.agentes{display:none;}`.

JS, before `function infoLinha(p) {`:

```js
// "Task 11" do rótulo vira "Task 11/20", mais o que o agente daquela tarefa
// está fazendo (implementing / in review / fixing) — o mais novo ganha.
const PAPEL = { implement: 'implementing', review: 'in review', fix: 'fixing' };
function rotuloComTarefa(p, progress) {
  const rotulo = progress.activeLabel;
  const t = progress.tarefas;
  if (!t || !t.atual) return rotulo;
  const agente = (p.agentes || []).find(a => a.convencao && a.convencao.tarefa === t.atual.numero);
  const marca = `Task ${t.atual.numero}/${t.total}${agente ? ' · ' + PAPEL[agente.convencao.papel] : ''}`;
  return /\bTask \d+\b/.test(rotulo) ? rotulo.replace(/\bTask \d+\b/, marca) : `${marca} › ${rotulo}`;
}

function linhasAgentes(p) {
  const ags = p.agentes || [];
  if (!ags.length) return '';
  return `<div class="agentes">${ags.map(a => {
    const c = a.convencao;
    const texto = c ? `Task ${c.tarefa} ${c.papel}${c.titulo ? ' – ' + c.titulo : ''}` : (a.descricao || '');
    return `<div class="agente"><span class="agente-tipo">${escapeHtml(a.tipo)}</span> ${escapeHtml(texto)} <span class="status-tempo">${tempoRelativo(a.inicio)}</span></div>`;
  }).join('')}</div>`;
}
```

In `infoLinha`, the building line becomes:

```js
  if (progress && progress.activeLabel) return `building: ${escapeHtml(rotuloComTarefa(p, progress))}`;
```

In `renderReator`, the building branch becomes:

```js
    : (progress.activeLabel ? `building: <b>${escapeHtml(rotuloComTarefa(alvo, progress))}</b>`
```

In `cardProjeto` and `linhaMembro`, right after `<div class="status-info">${infoLinha(p)}</div>` add `${linhasAgentes(p)}`.

In `cardGrupo`, the folded summary becomes:

```js
  const nAgentes = g.membros.reduce((n, p) => n + (p.agentes || []).length, 0);
  const resumo = dobrado
    ? `<div class="status-info">${g.membros.length} projects · ${escapeHtml(nomeDe(novo))}: ${infoLinha(novo)}${nAgentes ? ` · ${nAgentes} agent${nAgentes > 1 ? 's' : ''}` : ''}</div>`
    : '';
```

- [x] **Step 4: Run to verify it passes, then the full suite**

Run: `node test/test_agentes_painel.js && node test-all.js`
Expected: `OK:` line; `Todas as 29 suítes rodadas passaram.`

- [x] **Step 5: Commit**

```bash
git add vscode-extension/media/build.html test/test_agentes_painel.js
git commit -m "feat(panel): Task N/total with agent state, and live agent lines"
```

### Task 4: Docs, build, install, real check

- [x] **Step 1: CHANGELOG and README** — CHANGELOG 1.2.0: "Agent view: each row shows `Task N/total · implementing / in review / fixing` and its live subagents (new `agentes-hook.js` on PreToolUse(Agent), SubagentStart, SubagentStop, Stop). Agents map to worktrees through descriptions like `governance-shell: Task 12 implement – title`." README: add `agentes-hook.js` to the files list (now 5) and its row to the hooks table; a "What it shows" bullet for agents.
- [x] **Step 2: Full suite, package, install, push** — `node test-all.js`, package + `code --install-extension --force`, commit, `git push origin main`, CI green.
- [x] **Step 3: Real check** — after a reload Nik clicks **Update hooks**; `~/.claude/settings.json` gains the 4 entries; once a CI session launches an agent, `_agentes.json` fills and the row shows it.
