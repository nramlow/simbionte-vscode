// Self-check: Markdown abre no preview mesmo vindo de link (autopreview.js).
// Os links do painel do Claude Code usam showTextDocument, que ignora o
// workbench.editorAssociations; o Explorer respeita. Regras: só .md em disco,
// sem edição pendente, nunca diff; quem volta pro editor de texto de
// propósito ("Reopen Editor With… → Text Editor") fica no texto até fechar.
const assert = require('assert');
const { criarEstado, registrarEvento, deveTrocar } = require('../autopreview.js');

const md = (uri, extra) => ({ tipo: 'texto', uri, scheme: 'file', caminho: uri, sujo: false, ...extra });
const prev = uri => ({ tipo: 'custom', uri, viewType: 'vscode.markdown.preview.editor' });
let e = criarEstado();
const T = 1000;

// Link abre um .md no editor de texto: troca.
registrarEvento(e, { abertas: [md('a.md')], fechadas: [], abertasAgora: ['a.md'] }, T);
assert.strictEqual(deveTrocar(e, md('a.md'), T + 300), true);

// Não-.md, fora do disco (untitled, readonly do Claude), sujo, diff: não.
assert.strictEqual(deveTrocar(e, md('a.txt'), T), false);
assert.strictEqual(deveTrocar(e, md('x.md', { scheme: 'untitled' }), T), false);
assert.strictEqual(deveTrocar(e, md('b.md', { sujo: true }), T), false);
assert.strictEqual(deveTrocar(e, { tipo: 'diff', uri: 'c.md', scheme: 'file', caminho: 'c.md' }, T), false);
assert.strictEqual(deveTrocar(e, md('README.MD'), T), true, 'extensão sem ligar pra caixa');

// Usuário reabre como texto: o preview fecha e o texto abre (em qualquer
// ordem, no mesmo evento ou em eventos seguidos) -> fica no texto.
e = criarEstado();
registrarEvento(e, { abertas: [md('d.md')], fechadas: [prev('d.md')], abertasAgora: ['d.md'] }, T);
assert.strictEqual(deveTrocar(e, md('d.md'), T + 300), false, 'mesmo evento');
e = criarEstado();
registrarEvento(e, { abertas: [md('f.md')], fechadas: [], abertasAgora: ['f.md'] }, T);
registrarEvento(e, { abertas: [], fechadas: [prev('f.md')], abertasAgora: ['f.md'] }, T + 50);
assert.strictEqual(deveTrocar(e, md('f.md'), T + 300), false, 'texto abriu antes do preview fechar');
// ...e continua no texto se abrir de novo enquanto houver aba dele aberta.
registrarEvento(e, { abertas: [md('f.md')], fechadas: [], abertasAgora: ['f.md'] }, T + 5000);
assert.strictEqual(deveTrocar(e, md('f.md'), T + 5300), false);
// Fechou todas as abas do arquivo: volta à regra normal.
registrarEvento(e, { abertas: [], fechadas: [md('f.md')], abertasAgora: [] }, T + 6000);
registrarEvento(e, { abertas: [md('f.md')], fechadas: [], abertasAgora: ['f.md'] }, T + 7000);
assert.strictEqual(deveTrocar(e, md('f.md'), T + 7300), true);

// Preview fechado há muito tempo não conta como "voltou pro texto".
e = criarEstado();
registrarEvento(e, { abertas: [], fechadas: [prev('g.md')], abertasAgora: [] }, T);
registrarEvento(e, { abertas: [md('g.md')], fechadas: [], abertasAgora: ['g.md'] }, T + 60000);
assert.strictEqual(deveTrocar(e, md('g.md'), T + 60300), true);

console.log('OK: auto-preview de Markdown (troca, exceções, voltar pro texto)');
