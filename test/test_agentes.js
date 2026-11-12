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

const { lerConvencao, agentesAtivos, anexarAgentes } = require('../agentes.js');
assert.deepStrictEqual(lerConvencao(DESC_I), { worktree: 'governance-shell', tarefa: 12, papel: 'implement', titulo: 'customer storage URL' });
assert.deepStrictEqual(lerConvencao('policy-model-1: Task 7 Review'), { worktree: 'policy-model-1', tarefa: 7, papel: 'review', titulo: '' });
assert.strictEqual(lerConvencao('Shell Task 11: access in URL'), null, 'fora da convenção');
// "<worktree>: …" sem Task/papel (achado 2026-11-12: "governance-pages-plan:
// plan review – sub-project 3" caía na pasta da sessão): acha a linha mesmo
// assim, sem tarefa nem papel.
assert.deepStrictEqual(lerConvencao('governance-pages-plan: plan review – sub-project 3'), { worktree: 'governance-pages-plan', tarefa: null, papel: null, titulo: 'plan review – sub-project 3' });
assert.strictEqual(lerConvencao('Write plan: shell and tables'), null, 'frase comum com dois-pontos não é worktree (tem espaço antes)');

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

console.log('OK: agentes vivos por sessão (início, fim, lista do Stop, limpeza)');
fs.rmSync(home, { recursive: true, force: true });
