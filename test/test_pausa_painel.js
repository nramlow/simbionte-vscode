// Self-check: botões de pausa no painel (⏸ discreto na linha e no grupo, ▶
// quando pausado) e o estado "pausing… / paused · safe to reload".
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'vscode-extension', 'media', 'build.html'), 'utf8');
const elementos = {};
const elemento = () => ({
  innerHTML: '', textContent: '', hidden: false, title: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, focus() {},
});
const ctx = {
  document: { getElementById: id => (elementos[id] = elementos[id] || elemento()), createElementNS: () => elemento(), createElement: () => elemento(), querySelector: () => null, querySelectorAll: () => [] },
  window: { addEventListener() {} },
  acquireVsCodeApi: () => ({ getState: () => null, setState() {}, postMessage() {} }),
  CSS: { escape: s => s }, console, Date, Math, JSON, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);

const agora = Date.now();
const row = (id, extra) => ({ projectId: id, projectName: id, projectPath: 'D:\\' + id, lastTouch: agora, activity: [], progress: null, ...extra });

ctx.renderStatusList([row('simbionte-vscode')], null);
let out = elementos.statusList.innerHTML;
assert.ok(out.includes('class="pausa-btn" data-acao="pausar" data-ids="simbionte-vscode"'), 'linha tem ⏸ discreto');
assert.ok(!out.includes('pausa-estado'), 'sem pausa: nenhum estado');

ctx.renderStatusList([row('policy-model-2', { pausa: { estado: 'pausando', agentes: 2, shells: 1, sessoes: 1 } })], null);
out = elementos.statusList.innerHTML;
assert.ok(out.includes('pausing… (2 agents, 1 background command running)'));
assert.ok(out.includes('data-acao="retomar"'), 'pausada: ▶ resume');

ctx.renderStatusList([row('policy-model-2', { pausa: { estado: 'pausado', agentes: 0, shells: 0, sessoes: 1 } })], null);
assert.ok(elementos.statusList.innerHTML.includes('paused · safe to reload'));

const g = { chave: 'k', nome: 'Communication-Intelligence', raiz: 'D:\\CI' };
ctx.renderStatusList([row('policy-model-2', { grupo: g }), row('Communication-Intelligence', { grupo: g, projectPath: 'D:\\CI' })], null);
out = elementos.statusList.innerHTML;
assert.ok(/grupo-cabeca[^]*?data-acao="pausar" data-ids="policy-model-2,Communication-Intelligence"/.test(out), 'cabeça do grupo pausa o repo todo');

console.log('OK: botões de pausa e estado no painel');
