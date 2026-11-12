// Self-check: pausar/retomar sessões (pedido do Nik, 2026-11-12: recarregar
// a janela do Communication-Intelligence sem cortar tarefas e agentes longos).
// Store (inbox no heartbeat, _pausa.json, regra de bloqueio), hooks de ponta a
// ponta e pausa.js (alvos, estado, envio pela inbox).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-pausa-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const store = require('../store.js');

const PIPE = '\\\\.\\pipe\\LOCAL\\cc-msg-0123456789abcdef0123456789abcdef';
const TOKEN = 'abcdefabcdefabcdefabcdefabcdef12';

// ── Task 1: store ──
// Inbox da sessão vem das variáveis de ambiente que o Claude Code dá aos hooks.
process.env.CLAUDE_CODE_MESSAGING_SOCKET = PIPE;
process.env.CLAUDE_CODE_MESSAGING_TOKEN = TOKEN;
store.registrarHeartbeat('SessionStart', { session_id: 's1', cwd: 'D:\\CI' });
let hb = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'simbionte', '_heartbeat.json'), 'utf8'));
assert.deepStrictEqual(hb.sessoes.s1.inbox, { socket: PIPE, token: TOKEN });
process.env.CLAUDE_CODE_MESSAGING_SOCKET = 'C:\\qualquer\\coisa';
store.registrarHeartbeat('PostToolUse', { session_id: 's2', cwd: 'D:\\x' });
hb = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'simbionte', '_heartbeat.json'), 'utf8'));
assert.strictEqual(hb.sessoes.s2.inbox, undefined, 'só caminho de inbox do Claude Code (forma checada)');
delete process.env.CLAUDE_CODE_MESSAGING_SOCKET;
delete process.env.CLAUDE_CODE_MESSAGING_TOKEN;
store.registrarHeartbeat('PostToolUse', { session_id: 's1', cwd: 'D:\\CI' });
hb = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'simbionte', '_heartbeat.json'), 'utf8'));
assert.deepStrictEqual(hb.sessoes.s1.inbox, { socket: PIPE, token: TOKEN }, 'evento sem env não apaga a inbox conhecida');

// _pausa.json
assert.deepStrictEqual(store.lerPausa(), { sessoes: {} });
store.pausar(['s1', 's3'], 'D:\\CI\\.worktrees\\policy-model-2');
let pz = store.lerPausa();
assert.deepStrictEqual(Object.keys(pz.sessoes).sort(), ['s1', 's3']);
assert.strictEqual(pz.sessoes.s1.pasta, 'D:\\CI\\.worktrees\\policy-model-2');
store.retomar(['s3']);
assert.deepStrictEqual(Object.keys(store.lerPausa().sessoes), ['s1']);

// Regra de bloqueio: sessão pausada não começa agente nem comando em segundo plano.
pz = store.lerPausa();
const b = d => store.bloqueioPausa({ session_id: 's1', hook_event_name: 'PreToolUse', ...d }, pz);
assert.ok(/paused/i.test(b({ tool_name: 'Agent', tool_input: { description: 'x' } })), 'Agent bloqueado');
assert.ok(b({ tool_name: 'Bash', tool_input: { command: 'npm test', run_in_background: true } }), 'Bash em segundo plano bloqueado');
assert.strictEqual(b({ tool_name: 'Bash', tool_input: { command: 'git status' } }), null, 'comando normal passa');
assert.strictEqual(b({ tool_name: 'Edit', tool_input: {} }), null, 'terminar o passo atual: edições passam');
assert.strictEqual(store.bloqueioPausa({ session_id: 'outra', hook_event_name: 'PreToolUse', tool_name: 'Agent' }, pz), null, 'outra sessão não');
assert.strictEqual(store.bloqueioPausa({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Agent' }, { sessoes: {} }), null, 'retomada: passa');

console.log('OK: pausa (inbox, arquivo de pausa, regra de bloqueio)');
fs.rmSync(home, { recursive: true, force: true });
