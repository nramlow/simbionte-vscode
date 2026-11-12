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

console.log('OK: padrão de uso (baldes por hora)');
