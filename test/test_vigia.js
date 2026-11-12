// Self-check: vigia de arquivos da própria extensão (vigia.js) — atualiza o
// painel sem recarregar o VS Code. Só age quando a mudança ASSENTOU (mesma
// assinatura em duas checagens seguidas): a instalação extrai arquivo por
// arquivo, e agir no meio pegaria metade nova, metade velha.
const assert = require('assert');
const { criarVigia } = require('../vigia.js');

let assinatura = 'a';
const chamadas = [];
const tick = criarVigia(() => assinatura, nova => chamadas.push(nova));

tick(); tick();
assert.deepStrictEqual(chamadas, [], 'sem mudança: nada');
assinatura = 'b';
tick();
assert.deepStrictEqual(chamadas, [], 'mudou agora: espera assentar');
assinatura = 'c';
tick();
assert.deepStrictEqual(chamadas, [], 'ainda mudando (instalação em curso)');
tick();
assert.deepStrictEqual(chamadas, ['c'], 'assentou: age uma vez');
tick(); tick();
assert.deepStrictEqual(chamadas, ['c'], 'não repete');
assinatura = null;
tick(); tick();
assert.deepStrictEqual(chamadas, ['c'], 'arquivo sumiu no meio da instalação: espera voltar');
assinatura = 'c';
tick(); tick();
assert.deepStrictEqual(chamadas, ['c'], 'voltou igual ao já aplicado: nada');
assert.throws(() => criarVigia(() => { throw new Error('x'); }, () => {})(), /x/, 'erro do leitor sobe (quem chama decide)');

console.log('OK: vigia age só quando a mudança assentou');
