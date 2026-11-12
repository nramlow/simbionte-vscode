// Self-check: notificação de SO (plano concluído / violação da REGRA DE
// OURO) dispara só na TRANSIÇÃO (borda de subida), nunca a cada poll de 5s
// — e nunca de novo depois de recarregar o VS Code (achado 2026-11-11: o
// estado ficava só em memória e todo reload renotificava cada plano 100%).
// Testa a função real (transicoes.js), não uma cópia.
const assert = require('assert');
const { transicoes } = require('../transicoes.js');

const p100 = { projectId: 'x', projectName: 'x', progress: { percent: 100 } };
const pBash = { projectId: 'y', projectName: 'y', progress: { percent: 40, viaBash: true } };
const tipos = r => r.avisos.map(a => `${a.tipo}:${a.nome}`);

// Primeira vez (nada salvo ainda): só aprende o estado, não notifica — senão
// a atualização pra esta versão despejaria um popup por plano já concluído.
let r = transicoes(undefined, [p100, pBash]);
assert.deepStrictEqual(tipos(r), []);
assert.deepStrictEqual(r.conhecidos, { x: { percent: 100, viaBash: false }, y: { percent: 40, viaBash: true } });

// Estado salvo sobrevive ao reload: mesmo estado = nada.
r = transicoes(JSON.parse(JSON.stringify(r.conhecidos)), [p100, pBash]);
assert.deepStrictEqual(tipos(r), [], 'reload não renotifica');

// Transições de verdade.
let c = { x: { percent: 80, viaBash: false } };
r = transicoes(c, [p100]);
assert.deepStrictEqual(tipos(r), ['concluido:x']);
r = transicoes(r.conhecidos, [p100]);
assert.deepStrictEqual(tipos(r), [], 'poll de novo, mesmo estado');
r = transicoes({}, [pBash]);
assert.deepStrictEqual(tipos(r), ['viaBash:y'], 'projeto novo já com aviso: avisa');
r = transicoes(r.conhecidos, [pBash]);
assert.deepStrictEqual(tipos(r), []);

// Projeto que some da lista não perde o histórico (não renotifica ao voltar).
r = transicoes({ x: { percent: 100, viaBash: false } }, []);
assert.deepStrictEqual(r.conhecidos.x, { percent: 100, viaBash: false });
assert.strictEqual(r.mudou, false);
assert.strictEqual(transicoes({ x: { percent: 80, viaBash: false } }, [p100]).mudou, true, 'mudou = precisa salvar');

console.log('OK: notificações de transição (plano concluído / viaBash) disparam só uma vez, mesmo com reload');
