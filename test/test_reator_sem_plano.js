// Self-check: o anel sem plano ativo (plano fechado e trabalho depois dele,
// ou projeto sem plano) diz "no active plan" e o arquivo ativo, em vez de
// "0 / 0 steps · system idle" com o Claude trabalhando. Roda o <script> de
// media/build.html de verdade numa VM com DOM mínimo.
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
  document: {
    getElementById: id => (elementos[id] = elementos[id] || elemento()),
    createElementNS: () => elemento(), createElement: () => elemento(),
    querySelector: () => null, querySelectorAll: () => [],
  },
  window: { addEventListener() {} },
  acquireVsCodeApi: () => ({ getState: () => null, setState() {}, postMessage() {} }),
  CSS: { escape: s => s },
  console, Date, Math, JSON, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);

const agora = Date.now();
const anel = () => [elementos.pct.textContent, elementos.steps.textContent, elementos.reactorLabel.innerHTML];

// Plano fechado e edição depois dele: o card já cai pra "active: arquivo".
ctx.renderReator([{
  projectId: 'p', projectName: 'p', lastTouch: agora,
  progress: { percent: 100, completed: 28, total: 28, activeLabel: null, updatedAt: agora - 60000 },
  activity: [{ file: 'CHANGELOG.md', path: 'x', ts: agora - 1000 }],
}], 'p');
assert.deepStrictEqual(anel(), ['0%', 'no active plan', 'active: <b>CHANGELOG.md</b>']);

// Sem plano e sem arquivo editado (só comandos): idle de verdade.
ctx.renderReator([{ projectId: 'p', projectName: 'p', lastTouch: agora, progress: null, activity: [] }], 'p');
assert.deepStrictEqual(anel(), ['0%', 'no active plan', 'system idle']);

// Plano em andamento: igual a antes.
ctx.renderReator([{
  projectId: 'p', projectName: 'p', lastTouch: agora, activity: [],
  progress: { percent: 50, completed: 1, total: 2, activeLabel: 'Task 1 › Step 2: Go', updatedAt: agora },
}], 'p');
assert.deepStrictEqual(anel(), ['50%', '1 / 2 steps', 'building: <b>Task 1 › Step 2: Go</b>']);

// Plano concluído sem nada depois: igual a antes.
ctx.renderReator([{
  projectId: 'p', projectName: 'p', lastTouch: agora, activity: [],
  progress: { percent: 100, completed: 2, total: 2, activeLabel: null, updatedAt: agora },
}], 'p');
assert.deepStrictEqual(anel(), ['100%', '2 / 2 steps', 'task complete']);

console.log('OK: anel sem plano ativo mostra "no active plan" e o arquivo ativo');
