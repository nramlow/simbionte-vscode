// Self-check: anel do topo com PROGRAMA (vários planos somados). Roda o
// <script> de media/build.html numa VM com DOM mínimo.
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
const main = { projectId: 'Communication-Intelligence', projectName: 'Communication-Intelligence', lastTouch: agora, activity: [],
  progress: { percent: 0, completed: 0, total: 20, activeLabel: 'Task 1 › Step 1: unrelated', updatedAt: agora } };
const programa = {
  nome: 'Governance redesign', subprojetos: { feitos: 2, total: 8 }, passos: { feitos: 255, total: 311 },
  atual: { rel: 'x.md', worktree: 'policy-model-2',
    progresso: { percent: 47, completed: 49, total: 105, activeLabel: 'Task 10 › Step 1: Write the failing test', updatedAt: agora,
      tarefas: { total: 20, feitas: 9, atual: { numero: 10, titulo: 'Access reads assignments', passos: 5, feitos: 0 } } },
    agentes: [{ id: 'a', tipo: 'implementer', descricao: '', inicio: agora, convencao: { worktree: 'policy-model-2', tarefa: 10, papel: 'implement', titulo: '' } }] },
};
const anel = () => [elementos.pct.textContent, elementos.steps.textContent, elementos.reactorLabel.innerHTML];

ctx.renderReator([{ ...main, programa }], 'Communication-Intelligence');
assert.deepStrictEqual(anel(), ['82%', 'Governance redesign · sub-project 3/8 · 255/311 steps',
  'building: <b>policy-model-2 › Task 10/20 · implementing › Step 1/5: Write the failing test</b>'], 'programa ganha do plano solto do main');

ctx.renderReator([{ ...main, programa: { ...programa, subprojetos: { feitos: 3, total: 8 }, passos: { feitos: 311, total: 311 }, atual: null } }], 'Communication-Intelligence');
assert.deepStrictEqual(anel(), ['100%', 'Governance redesign · 3/8 sub-projects · 311/311 steps', 'next sub-project not planned yet']);
ctx.renderReator([{ ...main, programa: { ...programa, subprojetos: { feitos: 8, total: 8 }, passos: { feitos: 900, total: 900 }, atual: null } }], 'Communication-Intelligence');
assert.deepStrictEqual(anel(), ['100%', 'Governance redesign · 8/8 sub-projects · 900/900 steps', 'programme complete']);

ctx.renderReator([main], 'Communication-Intelligence');
assert.strictEqual(elementos.steps.textContent, '0 / 20 steps', 'sem programa: como antes');

console.log('OK: anel mostra o progresso do programa');
