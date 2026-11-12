// Self-check: medidores de uso no rodapé do painel (contexto e semanal).
// Roda o <script> de media/build.html numa VM com DOM mínimo.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'vscode-extension', 'media', 'build.html'), 'utf8');
assert.ok(html.includes('id="medContexto"') && html.includes('id="medSemanal"'), 'os dois medidores existem no HTML');
const elementos = {};
let estadoWebview = null;
const elemento = () => {
  const classes = new Set();
  return {
    innerHTML: '', textContent: '', hidden: false, title: '', style: {}, dataset: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) },
    addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, focus() {},
  };
};
const ctx = {
  document: {
    getElementById: id => (elementos[id] = elementos[id] || elemento()),
    createElementNS: () => elemento(), createElement: () => elemento(),
    querySelector: () => null, querySelectorAll: () => [],
  },
  window: { addEventListener() {} },
  acquireVsCodeApi: () => ({ getState: () => estadoWebview, setState: s => { estadoWebview = s; }, postMessage() {} }),
  CSS: { escape: s => s },
  console, Date, Math, JSON, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);

const agora = Date.now();
const sabado = new Date(2026, 10, 14, 9, 0).getTime();
ctx.renderUso({ contexto: { pct: 41, tokens: 412345, janela: 1000000 }, semanal: { pct: 58, resetsAt: sabado, ts: agora - 60000 } });
assert.strictEqual(elementos.medContextoPct.textContent, '41%');
assert.strictEqual(elementos.medContextoSub.textContent, '412k / 1M');
assert.strictEqual(elementos.medSemanalPct.textContent, '58%');
assert.strictEqual(elementos.medSemanalSub.textContent, 'resets Sat 9:00 AM');
assert.ok(!elementos.medSemanal.classList.contains('alto'));

ctx.renderUso({ contexto: { pct: 96, tokens: 192000, janela: 200000 }, semanal: { pct: 83, resetsAt: sabado, ts: agora - 3 * 3600000 } });
assert.strictEqual(elementos.medContextoSub.textContent, '192k / 200k');
assert.ok(elementos.medContexto.classList.contains('critico'), '≥95%: vermelho');
assert.ok(elementos.medSemanal.classList.contains('alto') && !elementos.medSemanal.classList.contains('critico'), '≥80%: âmbar');
assert.strictEqual(elementos.medSemanalSub.textContent, 'resets Sat 9:00 AM · as of 3h ago', 'dado velho diz a idade');

ctx.renderUso({ contexto: null, semanal: null });
assert.strictEqual(elementos.medContextoPct.textContent, '–');
assert.strictEqual(elementos.medContextoSub.textContent, 'no session yet');
assert.strictEqual(elementos.medSemanalPct.textContent, '–');
assert.strictEqual(elementos.medSemanalSub.textContent, 'run Claude in a terminal');
ctx.renderUso(undefined);
assert.strictEqual(elementos.medSemanalPct.textContent, '–', 'extensão antiga sem uso: não quebra');

// Rodapé fixo: os medidores ficam visíveis com a lista rolando.
assert.ok(/\.uso-rodape\{[^}]*position:sticky[^}]*bottom:0/.test(html), 'rodapé de uso grudado embaixo');
assert.ok(html.indexOf('class="uso-rodape"') > html.indexOf('id="hojeList"'), 'rodapé é o último bloco');

// "today" dobrável, lembrado no estado do webview.
assert.strictEqual(elementos.hojeList.hidden, false, 'começa aberto');
ctx.alternarHoje();
assert.strictEqual(elementos.hojeList.hidden, true);
assert.strictEqual(elementos.hojeSeta.textContent, '▸');
assert.strictEqual(estadoWebview.hojeDobrado, true, 'salvo pro reload');
ctx.alternarHoje();
assert.strictEqual(elementos.hojeList.hidden, false);

console.log('OK: medidores de uso (contexto e semanal) no rodapé');
