// Self-check: o painel (media/build.html) agrupa cards pela origem que a
// extensão manda em grupo.chave. Roda o <script> de verdade numa VM com um
// DOM mínimo — não copia a lógica pro teste (cópia fica verde enquanto o
// código real muda).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'vscode-extension', 'media', 'build.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const elementos = {};
const elemento = () => ({
  innerHTML: '', textContent: '', hidden: false, title: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, focus() {},
});
let estado = null;
const ctx = {
  document: {
    getElementById: id => (elementos[id] = elementos[id] || elemento()),
    createElementNS: () => elemento(), createElement: () => elemento(),
    querySelector: () => null, querySelectorAll: () => [],
  },
  window: { addEventListener() {} },
  acquireVsCodeApi: () => ({ getState: () => estado, setState: s => { estado = s; }, postMessage() {} }),
  CSS: { escape: s => s },
  console, Date, Math, JSON, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(script, ctx);

const agora = Date.now();
const R = 'D:\\Sauce\\ci-ui\\Communication-Intelligence';
const proj = (id, p, minAtras, extra) => ({
  projectId: id, projectName: id, projectPath: p, lastTouch: agora - minAtras * 60000,
  activity: [], progress: null, grupo: { chave: 'dev.azure.com/org/ci', nome: 'Communication-Intelligence', raiz: R }, ...extra,
});
const projetos = [
  proj('Communication-Intelligence', 'd:\\Sauce\\ci-ui\\Communication-Intelligence', 2),
  proj('governance-shell', R + '\\.worktrees\\governance-shell', 1),
  proj('ui', R + '\\.worktrees\\governance-shell\\ui', 0, { activity: [{ file: 'formDirty.ts', path: 'x', ts: agora }] }),
  { projectId: 'simbionte-vscode', projectName: 'simbionte-vscode', projectPath: 'D:\\Sauce\\simbionte-vscode', lastTouch: agora - 120000,
    activity: [], progress: { percent: 100, completed: 11, total: 11, activeLabel: null, updatedAt: agora - 120000 },
    grupo: { chave: 'github.com/nramlow/simbionte-vscode', nome: 'simbionte-vscode', raiz: 'D:\\Sauce\\simbionte-vscode' } },
];

ctx.renderStatusList(projetos, 'simbionte-vscode');
let out = elementos.statusList.innerHTML;
assert.strictEqual((out.match(/class="status-grupo/g) || []).length, 1, 'um card de grupo pro repo com 3 projetos');
assert.strictEqual((out.match(/class="status-row/g) || []).length, 1, 'repo com 1 projeto continua card normal');
assert.ok(out.indexOf('status-grupo') < out.indexOf('status-row'), 'grupo mais recente vem primeiro');
assert.ok(out.includes('>Communication-Intelligence <span'), 'cabeçalho com o nome do repo');
assert.ok(out.includes('main checkout'), 'checkout principal aparece como "main checkout" (caminho com outra caixa/barra)');
assert.ok(out.includes('active: formDirty.ts'));
assert.strictEqual((out.match(/class="grupo-membro[ "]/g) || []).length, 3, 'desdobrado por padrão: 1 linha por projeto');
assert.ok(out.includes('aria-expanded="true"'));
assert.ok(out.includes('status-row atual'), 'projeto da janela atual destacado');
assert.ok(elementos.statusCount.textContent === '4', 'contador continua contando projetos');

ctx.alternarGrupo('dev.azure.com/org/ci');
out = elementos.statusList.innerHTML;
assert.strictEqual((out.match(/class="grupo-membro[ "]/g) || []).length, 0, 'dobrado: sem linhas');
assert.ok(out.includes('3 projects · ui: active: formDirty.ts'), 'dobrado: resumo com o mais recente');
assert.ok(out.includes('aria-expanded="false"'));
assert.deepStrictEqual(JSON.parse(JSON.stringify(estado.dobrados)), { 'dev.azure.com/org/ci': true }, 'estado de dobra salvo pro reload');

// Pasta apagada (oculto): sai das linhas, mas a edição de hoje conta.
const hojeChave = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const comOculto = [...projetos, { ...proj('governance-ux', R + '\\.worktrees\\governance-ux', 300), oculto: true, today: { date: hojeChave, count: 7 } }];
ctx.render(comOculto, 'simbionte-vscode', null, null, null, null);
assert.ok(!elementos.statusList.innerHTML.includes('governance-ux'), 'linha de pasta apagada some');
assert.strictEqual(elementos.statusCount.textContent, '4', 'contador só conta as visíveis');
assert.ok(elementos.hojeTitle.textContent.includes('7 edits'), 'edições de hoje da pasta apagada continuam contando');

ctx.renderStatusList(projetos.map(p => ({ ...p, grupo: undefined })), null);
assert.strictEqual((elementos.statusList.innerHTML.match(/class="status-row/g) || []).length, 4, 'sem grupo (extensão antiga): cards como antes');

console.log('OK: painel agrupa cards pela origem (grupo dobrável, card único intacto)');
