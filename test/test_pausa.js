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

// ── Task 2: hooks de ponta a ponta ──
const claude = path.join(home, '.claude');
for (const f of ['estado-hook.js', 'agentes-hook.js']) fs.copyFileSync(path.join(__dirname, '..', 'claude-hooks', f), path.join(claude, f));
fs.copyFileSync(path.join(__dirname, '..', 'store.js'), path.join(claude, 'simbionte-store.js'));
const hook = (f, payload) => execFileSync(process.execPath, [path.join(claude, f)], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
const negou = out => { const j = out && JSON.parse(out); return !!(j && j.hookSpecificOutput && j.hookSpecificOutput.hookEventName === 'PreToolUse' && j.hookSpecificOutput.permissionDecision === 'deny' && /paused/i.test(j.hookSpecificOutput.permissionDecisionReason)); };
assert.ok(negou(hook('agentes-hook.js', { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Agent', tool_input: { description: 'policy-model-2: Task 15 review', subagent_type: 'deep-reviewer' } })), 'pausada: Agent negado');
let ag = { sessoes: {} };
try { ag = JSON.parse(fs.readFileSync(path.join(claude, 'simbionte', '_agentes.json'), 'utf8')); } catch (e) { /* nada gravado: certo */ }
assert.ok(!ag.sessoes.s1 || !ag.sessoes.s1.pendentes.length, 'agente negado não vira pendente');
assert.strictEqual(hook('agentes-hook.js', { hook_event_name: 'PreToolUse', session_id: 's9', tool_name: 'Agent', tool_input: { description: 'x', subagent_type: 'Explore' } }), '', 'outra sessão: silêncio');
assert.strictEqual(hook('agentes-hook.js', { hook_event_name: 'Stop', session_id: 's1', background_tasks: [] }), '', 'Stop nunca escreve');
assert.ok(negou(hook('estado-hook.js', { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'scripts/test-suite.sh api', run_in_background: true } })), 'pausada: Bash em segundo plano negado');
assert.strictEqual(hook('estado-hook.js', { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }), '', 'commit do passo atual passa');
assert.strictEqual(hook('estado-hook.js', { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'oi' }), '', 'UserPromptSubmit nunca escreve');
assert.strictEqual(store.estadoDaSessao({ evento: 'SessionStart', ts: 0 }, 60 * 60000, 15 * 60000).estado, 'aguardando', 'SessionStart não vira "travada" depois de 15 min');
const { HOOKS } = require('../hooks-settings.js');
assert.ok(HOOKS.some(h => h.evento === 'SessionStart' && h.file === 'estado-hook.js'), 'SessionStart registra a inbox nova depois de um reload');

console.log('OK: pausa (inbox, arquivo de pausa, regra de bloqueio, hooks)');
fs.rmSync(home, { recursive: true, force: true });
