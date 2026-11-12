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
