// Self-check: o painel mostra "Task N/total · in review" e uma linha por
// agente vivo. Roda o <script> de media/build.html numa VM com DOM mínimo.
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
const prog = { percent: 48, completed: 64, total: 134, activeLabel: 'Task 11 › Step 1: Imports in endpoints.tsx', updatedAt: agora,
  tarefas: { total: 20, feitas: 10, atual: { numero: 11, titulo: 'access in URL' } } };
const ag = (id, tipo, descricao, convencao, min) => ({ id, tipo, descricao, convencao, inicio: agora - min * 60000 });
const AGS = [
  ag('b', 'deep-reviewer', 'governance-shell: Task 11 review', { worktree: 'governance-shell', tarefa: 11, papel: 'review', titulo: '' }, 2),
  ag('a', 'implementer', 'governance-shell: Task 12 implement – customer storage URL', { worktree: 'governance-shell', tarefa: 12, papel: 'implement', titulo: 'customer storage URL' }, 9),
];
const p = { projectId: 'governance-shell', projectName: 'governance-shell', projectPath: 'D:\\x', lastTouch: agora, activity: [], progress: prog, agentes: AGS };

ctx.renderStatusList([p], null);
let out = elementos.statusList.innerHTML;
assert.ok(out.includes('building: Task 11/20 · in review › Step 1: Imports in endpoints.tsx'), 'Task N/total + estado do agente na tarefa atual');
assert.strictEqual((out.match(/class="agente"/g) || []).length, 2, 'uma linha por agente vivo');
assert.ok(out.includes('Task 12 implement – customer storage URL'));
assert.ok(out.includes('deep-reviewer'));

ctx.renderStatusList([{ ...p, agentes: [] }], null);
assert.ok(elementos.statusList.innerHTML.includes('building: Task 11/20 › Step 1: Imports in endpoints.tsx'), 'sem agente na tarefa: só Task N/total');

ctx.renderStatusList([{ ...p, agentes: [], progress: { ...prog, activeLabel: 'teste real', tarefas: null } }], null);
assert.ok(elementos.statusList.innerHTML.includes('building: teste real<'), 'plano sem Task: rótulo como antes');

ctx.renderReator([p], 'governance-shell');
assert.strictEqual(elementos.reactorLabel.innerHTML, 'building: <b>Task 11/20 · in review › Step 1: Imports in endpoints.tsx</b>');

const membro = (id, extra) => ({ projectId: id, projectName: id, projectPath: 'D:\\CI\\' + id, lastTouch: agora, activity: [], progress: null,
  grupo: { chave: 'k', nome: 'CI', raiz: 'D:\\CI' }, ...extra });
ctx.renderStatusList([membro('governance-shell', { agentes: AGS }), membro('policy-model-1', {})], null);
assert.strictEqual((elementos.statusList.innerHTML.match(/class="agente"/g) || []).length, 2, 'agentes também nas linhas de grupo');
ctx.alternarGrupo('k');
assert.ok(elementos.statusList.innerHTML.includes('2 projects · governance-shell: system idle · 2 agents'), 'grupo dobrado conta agentes');

console.log('OK: painel mostra Task N/total com estado e os agentes vivos');
