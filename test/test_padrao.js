// Self-check: padrão de uso por hora (padrao.js) — lê os transcripts do
// Claude Code em baldes por hora local: uso do Claude (tokens ponderados,
// subagentes inclusos) e mensagens do Nik (origin human, ou ditado de voz do
// Claude TV), varredura incremental, perfil semanal, janela ativa e previsão.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PESOS, lerLinhas } = require('../padrao.js');

const local = (a, m, d, h, min = 0) => new Date(a, m - 1, d, h, min).toISOString();
const resp = (ts, u, extra) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { model: 'claude-opus-5-5', usage: u }, ...extra });
const user = (ts, content, extra) => JSON.stringify({ type: 'user', timestamp: ts, message: { role: 'user', content }, ...extra });

// ── Task 1: linhas -> baldes ──
const b = {};
lerLinhas([
  resp(local(2026, 11, 11, 14, 5), { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 20 }),
  resp(local(2026, 11, 11, 14, 50), { input_tokens: 0, output_tokens: 2 }, { isSidechain: true }),
  user(local(2026, 11, 11, 14, 6), [{ type: 'text', text: 'oi' }], { origin: { kind: 'human' } }),
  user(local(2026, 11, 11, 14, 7), 'Ok continue', { origin: { kind: 'human' } }),
  user(local(2026, 11, 11, 14, 8), [{ type: 'tool_result', content: 'x' }], { origin: { kind: 'human' } }),
  user(local(2026, 11, 11, 14, 9), [{ type: 'text', text: '[Image: source…]' }], { isMeta: true, origin: { kind: 'human' } }),
  user(local(2026, 11, 11, 23, 1), 'Another Claude session sent a message:\nfoo', { isMeta: true, origin: { kind: 'peer' } }),
  user(local(2026, 11, 11, 23, 2), 'Another Claude session sent a message:\n<cross-session-message from="x">\nNik, by voice (Claude TV dictation; may contain …) status', { isMeta: true, origin: { kind: 'peer' } }),
  user(local(2026, 11, 12, 0, 30), 'mensagem antiga sem origin'),
  user(local(2026, 11, 12, 0, 31), [{ type: 'tool_result', content: 'y' }]),
  user(local(2026, 11, 12, 0, 32), 'subagente', { isSidechain: true }),
  'linha {cortada',
  '',
].join('\n'), b);
const esperado14 = 10 * PESOS.input + 100 * PESOS.cacheEscrita + 1000 * PESOS.cacheLeitura + 20 * PESOS.saida + 2 * PESOS.saida;
assert.deepStrictEqual(b['2026-11-11T14'], { uso: esperado14, msgs: 2 }, 'uso inclui sidechain; só 2 mensagens humanas (tool_result e meta fora)');
assert.deepStrictEqual(b['2026-11-11T23'], { uso: 0, msgs: 1 }, 'ditado de voz do Claude TV conta; outra mensagem de sessão não');
assert.deepStrictEqual(b['2026-11-12T00'], { uso: 0, msgs: 1 }, 'formato antigo sem origin: texto conta, tool_result e sidechain não');

// ── Task 2: varredura incremental ──
const { varrer } = require('../padrao.js');
(async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-padrao-'));
  try {
    const proj = path.join(raiz, 'd--x');
    fs.mkdirSync(path.join(proj, 'sess', 'subagents'), { recursive: true });
    const arq = path.join(proj, 'sess.jsonl');
    const sub = path.join(proj, 'sess', 'subagents', 'agent-1.jsonl');
    const agora = new Date(2026, 10, 11, 20, 0).getTime();
    const r1 = resp(local(2026, 11, 11, 15), { output_tokens: 10 });
    fs.writeFileSync(arq, r1 + '\n' + user(local(2026, 11, 11, 15, 1), 'oi', { origin: { kind: 'human' } }) + '\n');
    fs.writeFileSync(sub, resp(local(2026, 11, 11, 16), { output_tokens: 4 }, { isSidechain: true }) + '\n');
    fs.writeFileSync(path.join(proj, 'notas.txt'), 'não é jsonl');

    let e = await varrer(raiz, null, agora);
    assert.deepStrictEqual(e.horas['2026-11-11T15'], { uso: 50, msgs: 1 });
    assert.deepStrictEqual(e.horas['2026-11-11T16'], { uso: 20, msgs: 0 }, 'subagentes também');

    // Linha nova + meia linha sendo escrita: conta a inteira, espera a metade.
    const r2 = resp(local(2026, 11, 11, 15, 30), { output_tokens: 1 });
    fs.appendFileSync(arq, r2 + '\n' + r2.slice(0, 20));
    e = await varrer(raiz, e, agora);
    assert.strictEqual(e.horas['2026-11-11T15'].uso, 55, 'linhas já lidas não contam de novo');
    fs.appendFileSync(arq, r2.slice(20) + '\n');
    e = await varrer(raiz, e, agora);
    assert.strictEqual(e.horas['2026-11-11T15'].uso, 60, 'a meia linha conta quando termina');

    // Arquivo que encolheu (reescrito): relido do zero, sem somar em dobro.
    const antes = JSON.parse(JSON.stringify(e.horas));
    fs.writeFileSync(sub, resp(local(2026, 11, 11, 17), { output_tokens: 2 }) + '\n');
    e = await varrer(raiz, e, agora);
    assert.strictEqual(e.horas['2026-11-11T17'].uso, 10);
    assert.deepStrictEqual(e.horas['2026-11-11T15'], antes['2026-11-11T15']);

    // Baldes com mais de 12 semanas saem.
    e.arquivos[arq].baldes['2026-08-01T10'] = { uso: 5, msgs: 1 };
    e.arquivos[path.join(proj, 'apagado.jsonl')] = { offset: 99, baldes: { '2026-11-10T09': { uso: 7, msgs: 0 } } };
    e = await varrer(raiz, e, agora);
    assert.ok(!e.horas['2026-08-01T10'], 'mais de 12 semanas: sai');
    assert.deepStrictEqual(e.horas['2026-11-10T09'], { uso: 7, msgs: 0 }, 'transcript apagado pelo Claude Code: histórico fica');
    assert.strictEqual(e.atualizadoEm, agora);

    console.log('OK: padrão de uso (baldes por hora, varredura incremental)');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exit(1); });
