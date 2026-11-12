// Self-check: medidores de uso do Claude. Limite semanal vem do statusLine
// (só sessão de terminal chama), contexto vem do transcript de qualquer
// sessão. Testa as funções puras, o script de statusLine de ponta a ponta num
// HOME temporário, e as regras de instalar/remover o statusLine.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-uso-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const { aplicarUso, contextoDoTranscript, registrarHeartbeat } = require('../store.js');

// aplicarUso: semanal + tamanho da janela por modelo (sem o "[1m]")
const T = 1794440000000;
const probe = {
  model: { id: 'claude-opus-5-5[1m]' },
  context_window: { context_window_size: 1000000, used_percentage: 6 },
  rate_limits: { seven_day: { used_percentage: 58, resets_at: 1794668400 } },
};
let u = aplicarUso({}, probe, T);
assert.deepStrictEqual(u.semanal, { pct: 58, resetsAt: 1794668400000, ts: T });
assert.deepStrictEqual(u.janelas, { 'claude-opus-5-5': 1000000 });
u = aplicarUso(u, { model: { id: 'claude-haiku-4-5' }, context_window: { context_window_size: 200000 } }, T + 1);
assert.strictEqual(u.semanal.ts, T, 'sem rate_limits (antes da 1ª resposta / não-assinante): semanal anterior fica');
assert.strictEqual(u.janelas['claude-haiku-4-5'], 200000);
assert.strictEqual(u.janelas['claude-opus-5-5'], 1000000);

// contextoDoTranscript: última resposta da thread principal
const linha = o => JSON.stringify(o);
const assistente = (tokens, extra) => linha({ type: 'assistant', timestamp: '2026-11-11T23:00:00.000Z',
  message: { model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_creation_input_tokens: 1206, cache_read_input_tokens: tokens, output_tokens: 99 } }, ...extra });
const texto = [
  'ortada no meio da linha"}}',
  assistente(300000),
  linha({ type: 'user', message: { content: 'oi' } }),
  assistente(384276),
  assistente(5, { isSidechain: true }),
  linha({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } }),
  '',
].join('\n');
assert.deepStrictEqual(contextoDoTranscript(texto), { tokens: 385484, modelo: 'claude-opus-5-5', ts: Date.parse('2026-11-11T23:00:00.000Z') },
  'ignora linha cortada, sidechain e <synthetic>; soma input + cache');
assert.strictEqual(contextoDoTranscript(''), null);

// heartbeat guarda o transcript da sessão
registrarHeartbeat('PostToolUse', { session_id: 's1', transcript_path: 'C:\\t\\s1.jsonl' });
const hb = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'simbionte', '_heartbeat.json'), 'utf8'));
assert.strictEqual(hb.sessoes.s1.transcript, 'C:\\t\\s1.jsonl');

// statusLine de ponta a ponta: grava _uso.json e imprime linha curta
const claude = path.join(home, '.claude');
fs.copyFileSync(path.join(__dirname, '..', 'claude-hooks', 'simbionte-statusline.js'), path.join(claude, 'simbionte-statusline.js'));
fs.copyFileSync(path.join(__dirname, '..', 'store.js'), path.join(claude, 'simbionte-store.js'));
const status = bruto => execFileSync(process.execPath, [path.join(claude, 'simbionte-statusline.js')], { input: bruto, encoding: 'utf8' });
assert.strictEqual(status(JSON.stringify(probe)), 'ctx 6% · 7d 58%');
const uso = JSON.parse(fs.readFileSync(path.join(claude, 'simbionte', '_uso.json'), 'utf8'));
assert.strictEqual(uso.semanal.pct, 58);
assert.strictEqual(status(JSON.stringify({ model: { id: 'x' } })), 'ctx – · 7d –', 'sem números: traço');
assert.strictEqual(status('{não é json'), ' ', 'payload inválido: linha vazia, nunca erro');

// Instalar/remover o statusLine: é um só por usuário, então só ocupa vazio
// (ou a sonda temporária de 2026-11-11) e só remove o nosso.
const { ARQUIVOS, adicionarHooks, removerHooks, statusLineFaltando } = require('../hooks-settings.js');
const DIR_C = '/home/x/.claude';
assert.ok(ARQUIVOS.includes('simbionte-statusline.js'), 'script copiado/atualizado/apagado junto com os hooks');
const vazio = adicionarHooks({}, DIR_C);
assert.strictEqual(vazio.statusLine.type, 'command');
assert.ok(vazio.statusLine.command.includes('simbionte-statusline.js'));
assert.strictEqual(statusLineFaltando(vazio), false);
assert.strictEqual(statusLineFaltando({}), true);
const sonda = { statusLine: { type: 'command', command: 'node "C:/Users/n/.claude/simbionte-statusline-probe.js"' } };
assert.strictEqual(statusLineFaltando(sonda), true, 'a sonda é substituída');
assert.ok(adicionarHooks(sonda, DIR_C).statusLine.command.includes('simbionte-statusline.js'));
const alheio = { statusLine: { type: 'command', command: 'bash ~/my-status.sh' } };
assert.strictEqual(statusLineFaltando(alheio), false, 'statusLine de outra pessoa: não conta como faltando');
assert.strictEqual(adicionarHooks(JSON.parse(JSON.stringify(alheio)), DIR_C).statusLine.command, 'bash ~/my-status.sh', 'nunca troca o de outra pessoa');
assert.ok(!('statusLine' in removerHooks(adicionarHooks({}, DIR_C))), 'remover tira o nosso');
assert.strictEqual(removerHooks(JSON.parse(JSON.stringify(alheio))).statusLine.command, 'bash ~/my-status.sh', 'remover não mexe no alheio');

console.log('OK: uso do Claude (semanal do statusLine, contexto do transcript)');
fs.rmSync(home, { recursive: true, force: true });
