# Group Project Cards by Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards from the same git origin (worktrees, sub-folders, other clones) render as one collapsible group card in the Symbiont panel.

**Architecture:** A new Node module `origem.js` works out each project's origin from git's own files and tags every project with `grupo: { chave, nome, raiz }`. The extension tags the list before posting it to the webview; `build.html` only buckets by `grupo.chave` and renders. Spec: `docs/superpowers/specs/2026-11-11-group-by-origin-design.md`.

**Tech Stack:** Node (no dependencies), VS Code webview (plain HTML/JS), `node test-all.js`.

**Rules for this repo:** tick checkboxes in this file with the Edit tool, never via Bash (the panel's "golden rule"). Comments in code are Portuguese, matching the codebase; UI text is English.

---

### Task 1: `origem.js` — origin of one project

**Files:**
- Create: `origem.js`
- Test: `test/test_origem.js`

- [x] **Step 1: Write the failing test**

`test/test_origem.js`:

```js
// Self-check: origem de um projeto (origem.js) com repos git de verdade —
// worktree, sub-pasta com package.json, outro clone do mesmo remoto (forma
// ssh), repo sem origin, pasta fora do git e worktree apagado.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { normalizarUrl, origemDoProjeto, agruparProjetos } = require('../origem.js');

assert.strictEqual(normalizarUrl('https://PingCoDEV@dev.azure.com/PingCoDEV/TCAP%20DEV/_git/repo'), 'dev.azure.com/pingcodev/tcap%20dev/_git/repo');
assert.strictEqual(normalizarUrl('git@github.com:nramlow/simbionte-vscode.git'), 'github.com/nramlow/simbionte-vscode');
assert.strictEqual(normalizarUrl('https://github.com/nramlow/simbionte-vscode.git/'), 'github.com/nramlow/simbionte-vscode');
assert.strictEqual(normalizarUrl('ssh://git@host.com:2222/org/repo.git'), 'host.com/org/repo');
assert.strictEqual(normalizarUrl(''), null);
assert.strictEqual(normalizarUrl(null), null);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-origem-'));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'pipe' });
const URL_HTTPS = 'https://User@dev.azure.com/Org/My%20Proj/_git/my-repo';
const CHAVE = 'dev.azure.com/org/my%20proj/_git/my-repo';

try {
  const main = path.join(tmp, 'Main-Repo');
  fs.mkdirSync(main);
  git(main, 'init', '-q');
  git(main, 'remote', 'add', 'origin', URL_HTTPS);
  git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(main, 'worktree', 'add', '-q', '-b', 'feat-a', path.join('.worktrees', 'feat-a'));
  const feat = path.join(main, '.worktrees', 'feat-a');
  const ui = path.join(feat, 'ui');
  fs.mkdirSync(ui);
  fs.writeFileSync(path.join(ui, 'package.json'), '{}');

  const outro = path.join(tmp, 'other-clone');
  fs.mkdirSync(outro);
  git(outro, 'init', '-q');
  git(outro, 'remote', 'add', 'origin', 'git@dev.azure.com:Org/My%20Proj/_git/my-repo.git');

  const sozinho = path.join(tmp, 'lonely');
  fs.mkdirSync(sozinho);
  git(sozinho, 'init', '-q');

  const solto = path.join(tmp, 'plain');
  fs.mkdirSync(solto);
  const apagado = path.join(main, '.worktrees', 'gone');

  const oMain = origemDoProjeto(main);
  assert.strictEqual(oMain.chave, CHAVE);
  assert.strictEqual(path.basename(oMain.raiz), 'Main-Repo');
  assert.deepStrictEqual(origemDoProjeto(feat), oMain, 'worktree tem a mesma origem e a mesma raiz do repo principal');
  assert.deepStrictEqual(origemDoProjeto(ui), oMain, 'sub-pasta dentro do worktree também');
  const oOutro = origemDoProjeto(outro);
  assert.strictEqual(oOutro.chave, CHAVE, 'outro clone do mesmo remoto (forma ssh) cai na mesma chave');
  assert.strictEqual(path.basename(oOutro.raiz), 'other-clone');
  const oSozinho = origemDoProjeto(sozinho);
  assert.ok(oSozinho && oSozinho.chave !== CHAVE, 'sem origin: chave pelo .git do repo');
  assert.strictEqual(path.basename(oSozinho.raiz), 'lonely');
  assert.strictEqual(origemDoProjeto(solto), null, 'fora do git: sem origem');
  assert.strictEqual(origemDoProjeto(apagado), null, 'pasta que não existe: sem origem');
  assert.strictEqual(origemDoProjeto(null), null);

  console.log('OK: origem do projeto (worktree, sub-pasta, clone ssh, sem origin, fora do git)');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

(`agruparProjetos` is imported now and exercised in Task 2.)

- [x] **Step 2: Run test to verify it fails**

Run: `node test/test_origem.js`
Expected: FAIL with `Cannot find module '../origem.js'`

- [x] **Step 3: Write minimal implementation**

`origem.js`:

```js
// Origem de um projeto: de qual repositório ele vem. Worktrees e sub-pastas
// com package.json viram projetos separados no painel; a origem junta de
// volta os que são do mesmo repo (ou do mesmo remoto, em outro clone). Lê
// os arquivos do git direto — nunca roda `git` (sem janela de console no
// Windows, sem depender do PATH).
const fs = require('fs');
const path = require('path');

// https://user@host/a/b.git, ssh://git@host:22/a/b, git@host:a/b.git ->
// host/a/b. Formas diferentes do mesmo remoto precisam colidir.
function normalizarUrl(url) {
  let u = String(url || '').trim().toLowerCase();
  if (!u) return null;
  const temEsquema = /^[a-z][a-z0-9+.-]*:\/\//.test(u);
  u = u.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^@/]+@/, '');
  u = temEsquema ? u.replace(/^([^/:]+):\d+\//, '$1/') : u.replace(/^([^/:]+):/, '$1/');
  return u.replace(/\/+$/, '').replace(/\.git$/, '');
}

// Sobe até o primeiro .git. Pasta = repo comum; arquivo = worktree (ou
// submódulo), que aponta pro gitdir dele; worktree tem `commondir` levando
// ao .git do repo principal. raiz = pasta do checkout principal.
function gitDe(projectPath) {
  let dir = path.resolve(projectPath);
  if (!fs.existsSync(dir)) return null;
  for (;;) {
    const ponto = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(ponto); } catch (e) { /* não tem aqui, sobe */ }
    if (st && st.isDirectory()) return { comum: ponto, raiz: dir };
    if (st && st.isFile()) {
      const m = fs.readFileSync(ponto, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m);
      if (!m) return null;
      const gitdir = path.resolve(dir, m[1]);
      try {
        const comum = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim());
        return { comum, raiz: path.dirname(comum) };
      } catch (e) {
        return { comum: gitdir, raiz: dir }; // submódulo: sem commondir
      }
    }
    const pai = path.dirname(dir);
    if (pai === dir) return null;
    dir = pai;
  }
}

function urlDaOrigem(gitComum) {
  let texto;
  try { texto = fs.readFileSync(path.join(gitComum, 'config'), 'utf8'); } catch (e) { return null; }
  let naOrigem = false;
  for (const linha of texto.split(/\r?\n/)) {
    const secao = linha.match(/^\s*\[(.+)\]\s*$/);
    if (secao) { naOrigem = /^remote\s+"origin"$/i.test(secao[1].trim()); continue; }
    const url = naOrigem && linha.match(/^\s*url\s*=\s*(.+?)\s*$/i);
    if (url) return url[1];
  }
  return null;
}

function origemDoProjeto(projectPath) {
  if (!projectPath) return null;
  const git = gitDe(projectPath);
  if (!git) return null;
  const chave = normalizarUrl(urlDaOrigem(git.comum))
    || (process.platform === 'win32' ? git.comum.toLowerCase() : git.comum);
  return { chave, raiz: git.raiz };
}

module.exports = { normalizarUrl, origemDoProjeto };
```

- [x] **Step 4: Run test to verify it passes**

Run: `node test/test_origem.js`
Expected: `OK: origem do projeto (worktree, sub-pasta, clone ssh, sem origin, fora do git)`

- [x] **Step 5: Commit**

```bash
git add origem.js test/test_origem.js
git commit -m "feat: origem.js works out which repo a project comes from"
```

### Task 2: `agruparProjetos` — tag every project with its group

**Files:**
- Modify: `origem.js` (add function, export)
- Test: `test/test_origem.js` (add assertions inside the `try`, before the `console.log`)

- [x] **Step 1: Write the failing test**

Insert before `console.log('OK: origem do projeto …')` in `test/test_origem.js`:

```js
  const proj = (id, p) => ({ projectId: id, projectName: id, projectPath: p });
  const lista = agruparProjetos([
    proj('Main-Repo', main), proj('feat-a', feat), proj('ui', ui), proj('gone', apagado),
    proj('other-clone', outro), proj('lonely', sozinho), proj('plain', solto), proj('sem-caminho', undefined),
  ]);
  const g = id => lista.find(p => p.projectId === id).grupo;
  for (const id of ['feat-a', 'ui', 'gone', 'other-clone']) assert.strictEqual(g(id).chave, CHAVE, `${id} no grupo do repo`);
  assert.strictEqual(g('Main-Repo').nome, 'Main-Repo');
  assert.strictEqual(g('gone').nome, 'Main-Repo', 'worktree apagado fica com o repo que contém a pasta dele');
  assert.strictEqual(g('gone').raiz, oMain.raiz);
  assert.strictEqual(g('other-clone').nome, 'other-clone', 'outro clone: mesma chave, nome da pasta dele');
  assert.notStrictEqual(g('lonely').chave, CHAVE);
  assert.deepStrictEqual(g('plain'), { chave: 'projeto:plain', nome: 'plain', raiz: solto }, 'fora do git: grupo só dele');
  assert.strictEqual(g('sem-caminho').chave, 'projeto:sem-caminho');
  assert.strictEqual(lista.find(p => p.projectId === 'ui').projectName, 'ui', 'o resto do projeto passa intacto');
  let chamadas = 0;
  agruparProjetos([proj('a', main)], p => { chamadas++; return origemDoProjeto(p); });
  assert.strictEqual(chamadas, 1, 'origemDe é injetável (a extensão passa uma versão com cache)');
```

- [x] **Step 2: Run test to verify it fails**

Run: `node test/test_origem.js`
Expected: FAIL with `agruparProjetos is not a function`

- [x] **Step 3: Write minimal implementation**

Add to `origem.js` above `module.exports`, and export it:

```js
function dentroDe(filho, pai) {
  const rel = path.relative(pai, filho);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Devolve os mesmos projetos, cada um com grupo { chave, nome, raiz }.
// Sem origem (pasta apagada, worktree removido): fica com o grupo cuja raiz
// contém o caminho dele; senão, grupo só dele. origemDe é injetável pra
// extensão passar uma versão com cache (origem de um caminho não muda).
function agruparProjetos(projetos, origemDe = origemDoProjeto) {
  const origens = projetos.map(p => origemDe(p.projectPath));
  const conhecidas = origens.filter(Boolean);
  return projetos.map((p, i) => {
    const o = origens[i]
      || (p.projectPath && conhecidas.find(c => dentroDe(p.projectPath, c.raiz)))
      || null;
    const grupo = o
      ? { chave: o.chave, nome: path.basename(o.raiz), raiz: o.raiz }
      : { chave: `projeto:${p.projectId}`, nome: p.projectName, raiz: p.projectPath };
    return { ...p, grupo };
  });
}

module.exports = { normalizarUrl, origemDoProjeto, agruparProjetos };
```

- [x] **Step 4: Run test to verify it passes**

Run: `node test/test_origem.js`
Expected: `OK: origem do projeto …`

- [x] **Step 5: Commit**

```bash
git add origem.js test/test_origem.js
git commit -m "feat: agruparProjetos tags each project with its origin group"
```

### Task 3: Extension sends grouped projects

**Files:**
- Modify: `vscode-extension/prepare.js:12` (copy `origem.js` into `lib/`)
- Modify: `vscode-extension/extension.js` (require + memo near the other `require('./lib/…')`; tag in `enviar`)

- [x] **Step 1: Copy `origem.js` into the package**

In `vscode-extension/prepare.js`, change the list:

```js
for (const f of ['scan-store.js', 'insights.js', 'data.js', 'store.js', 'hooks-settings.js', 'origem.js']) {
```

- [x] **Step 2: Require it with a cache**

In `vscode-extension/extension.js`, after the `require('./lib/hooks-settings.js')` line:

```js
// Agrupa os cards por repo de origem (worktrees, sub-pastas, outro clone).
// Cache por caminho: a origem de uma pasta não muda durante a sessão, e o
// painel reenvia a lista a cada 5s.
let agruparProjetos = projetos => projetos;
try {
  const origem = require('./lib/origem.js');
  const cache = new Map();
  const origemMemo = p => {
    if (!cache.has(p)) cache.set(p, origem.origemDoProjeto(p));
    return cache.get(p);
  };
  agruparProjetos = projetos => origem.agruparProjetos(projetos, origemMemo);
} catch (e) { /* rodando do repo sem prepare.js — cards sem grupo, como antes */ }
```

- [x] **Step 3: Tag the list before posting**

In `enviar` inside `resolveWebviewView`, change

```js
      const projetos = lerTodosProjetos(atual);
```

to

```js
      const projetos = agruparProjetos(lerTodosProjetos(atual));
```

- [x] **Step 4: Verify**

Run: `node vscode-extension/prepare.js && node --check vscode-extension/extension.js && ls vscode-extension/lib/origem.js`
Expected: `lib/ pronta`, no syntax error, the file listed.

- [x] **Step 5: Commit**

```bash
git add vscode-extension/prepare.js vscode-extension/extension.js
git commit -m "feat(extension): tag projects with their origin group before posting"
```

### Task 4: Panel renders group cards

**Files:**
- Modify: `vscode-extension/media/build.html` (CSS after `.status-warn`; arrow fix in `.clickable::after`; `renderStatusList`; click/keydown handlers; fold state after `const vscode = acquireVsCodeApi();`)
- Test: `test/test_grupos_painel.js`

- [x] **Step 1: Write the failing test**

`test/test_grupos_painel.js`:

```js
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

ctx.renderStatusList(projetos.map(p => ({ ...p, grupo: undefined })), null);
assert.strictEqual((elementos.statusList.innerHTML.match(/class="status-row/g) || []).length, 4, 'sem grupo (extensão antiga): cards como antes');

console.log('OK: painel agrupa cards pela origem (grupo dobrável, card único intacto)');
```

- [x] **Step 2: Run test to verify it fails**

Run: `node test/test_grupos_painel.js`
Expected: FAIL (first assertion: 0 group cards), or a stub error naming a DOM call the stub lacks — add that call to the stub and rerun until the failure is the assertion.

- [x] **Step 3: CSS — group card + arrow fix**

In `build.html`, after the `.status-warn{…}` line, add:

```css
  /* card de grupo: vários projetos da mesma origem (worktrees, sub-pastas,
     outro clone) num card só, dobrável. Linhas de membro são compactas. */
  .status-grupo{background:var(--glass);border:1px solid var(--edge);border-radius:var(--r-lg);
    margin-bottom:var(--sp-2);font-size:var(--fs-xs);box-shadow:var(--shadow-1);overflow:hidden;}
  .status-grupo.atual{border-color:var(--edge-hi);background:var(--glass-hi);box-shadow:var(--shadow-2);}
  .status-grupo.atual .grupo-cabeca .status-nome{font-size:var(--fs-lg);}
  .grupo-cabeca{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);cursor:pointer;}
  .grupo-seta{flex:none;color:var(--dim);font-size:var(--fs-sm);width:1em;text-align:center;transition:color .15s;}
  .grupo-cabeca:hover .grupo-seta{color:var(--teal);}
  .grupo-membros{border-top:1px solid var(--edge);padding:var(--sp-1) 0;}
  .grupo-membro{display:flex;align-items:center;gap:var(--sp-2);position:relative;
    padding:var(--sp-1) var(--sp-3) var(--sp-1) calc(var(--sp-3) + 6px);}
  .grupo-membro .status-nome{font-size:var(--fs-xs);}
  .grupo-membro .status-dot{width:7px;height:7px;}
  .grupo-membro.atual{background:var(--glass-hi);}
  .grupo-membro.clickable:hover{background:rgba(63,232,196,.06);}
```

In `.clickable::after` and `.clickable:hover::after`, change both `rotate(-45deg)` to `rotate(45deg)` (the arrow then points right, "open", instead of up).

- [x] **Step 4: JS — render groups**

Replace the whole `function renderStatusList(projetos, currentProject) { … }` with:

```js
const ehAtual = (p, currentProject) => p.projectId === currentProject || p.projectName === currentProject;
const normCaminho = s => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const avisoBash = () => `<span class="status-warn" title="checkbox edited via Bash — use Edit/Write instead">${ICON_WARN}</span>`;

function cardProjeto(p, currentProject, primeiro) {
  const progress = progressoEfetivo(p);
  const ultima = ultimaAtividade(p);
  const cor = corRecencia(ultima);
  // só a linha #0 (mais recente de todo o painel) pulsa — ver @keyframes
  // respirar: 1 sinal de "ao vivo" por vez, não uma parede piscando.
  const pulsa = primeiro && cor === 'verde';
  const barra = progress
    ? `<div class="status-bar-wrap">
        <div class="status-bar"><div class="status-bar-fill" style="transform:scaleX(${(progress.percent || 0) / 100})"></div></div>
        <span class="status-pct">${progress.percent || 0}%</span>
      </div>`
    : '';
  const aviso = (p.progress && p.progress.viaBash) ? avisoBash() : '';
  // path do clique é o arquivo mais recente tocado (mesmo comportamento
  // do reactor de antes: abre o que você tava fazendo, não a pasta) — a
  // extensão ainda tenta a URL mapeada (simbionte-urls.json) primeiro,
  // no lado do host, então isso funciona pra apps web também.
  const arquivoRecente = (p.activity && p.activity[0]) ? p.activity[0].path : '';
  return `
    <div class="status-row${ehAtual(p, currentProject) ? ' atual' : ''} clickable"
         data-project-id="${escapeHtml(p.projectId || '')}"
         data-path="${escapeHtml(arquivoRecente)}"
         tabindex="0" role="button">
      <div class="status-dot ${cor}${pulsa ? ' pulso' : ''}"></div>
      <div class="status-body">
        <div class="status-nome">${escapeHtml(p.projectName)} <span class="status-tempo">${tempoRelativo(ultima)}</span></div>
        <div class="status-info">${infoLinha(p)}</div>
        ${barra}
      </div>
      ${aviso}
    </div>`;
}

function linhaMembro(p, currentProject, nome) {
  const progress = progressoEfetivo(p);
  const ultima = ultimaAtividade(p);
  const arquivoRecente = (p.activity && p.activity[0]) ? p.activity[0].path : '';
  return `
    <div class="grupo-membro${ehAtual(p, currentProject) ? ' atual' : ''} clickable"
         data-project-id="${escapeHtml(p.projectId || '')}"
         data-path="${escapeHtml(arquivoRecente)}"
         tabindex="0" role="button">
      <div class="status-dot ${corRecencia(ultima)}"></div>
      <div class="status-body">
        <div class="status-nome">${escapeHtml(nome)} <span class="status-tempo">${tempoRelativo(ultima)}</span></div>
        <div class="status-info">${infoLinha(p)}</div>
      </div>
      ${progress ? `<span class="status-pct">${progress.percent || 0}%</span>` : ''}
      ${(p.progress && p.progress.viaBash) ? avisoBash() : ''}
    </div>`;
}

function cardGrupo(g, currentProject, primeiro) {
  const novo = g.membros[0];
  const ultima = ultimaAtividade(novo);
  const cor = corRecencia(ultima);
  const pulsa = primeiro && cor === 'verde';
  const dobrado = !!dobrados[g.chave];
  const raiz = normCaminho(novo.grupo.raiz);
  const nomeDe = p => (raiz && normCaminho(p.projectPath) === raiz) ? 'main checkout' : p.projectName;
  const aviso = g.membros.some(p => p.progress && p.progress.viaBash) ? avisoBash() : '';
  const resumo = dobrado
    ? `<div class="status-info">${g.membros.length} projects · ${escapeHtml(nomeDe(novo))}: ${infoLinha(novo)}</div>`
    : '';
  const membros = dobrado
    ? ''
    : `<div class="grupo-membros">${g.membros.map(p => linhaMembro(p, currentProject, nomeDe(p))).join('')}</div>`;
  return `
    <div class="status-grupo${g.membros.some(p => ehAtual(p, currentProject)) ? ' atual' : ''}">
      <div class="grupo-cabeca" data-grupo="${escapeHtml(g.chave)}" tabindex="0" role="button" aria-expanded="${!dobrado}">
        <div class="status-dot ${cor}${pulsa ? ' pulso' : ''}"></div>
        <div class="status-body">
          <div class="status-nome">${escapeHtml(novo.grupo.nome)} <span class="status-tempo">${tempoRelativo(ultima)}</span></div>
          ${resumo}
        </div>
        ${aviso}
        <span class="grupo-seta" aria-hidden="true">${dobrado ? '▸' : '▾'}</span>
      </div>
      ${membros}
    </div>`;
}

// Agrupamento por origem (origem.js, lado da extensão): cada projeto chega
// com grupo.chave. Repo com 1 projeto fica com o card de sempre; 2+ viram
// um card de grupo dobrável. Grupos na ordem do membro mais recente.
let ultimoStatus = null;
function renderStatusList(projetos, currentProject) {
  ultimoStatus = [projetos, currentProject];
  const list = document.getElementById('statusList');
  const count = document.getElementById('statusCount');
  if (!projetos.length) {
    count.textContent = '';
    list.innerHTML = `<div class="empty">${ICON_SIGNAL}<span>no project activity yet</span></div>`;
    return;
  }
  const ordenados = projetos.slice().sort((a, b) => ultimaAtividade(b) - ultimaAtividade(a));
  count.textContent = String(ordenados.length);
  const grupos = [];
  const porChave = new Map();
  for (const p of ordenados) {
    const chave = (p.grupo && p.grupo.chave) || `projeto:${p.projectId}`;
    if (!porChave.has(chave)) { porChave.set(chave, { chave, membros: [] }); grupos.push(porChave.get(chave)); }
    porChave.get(chave).membros.push(p);
  }
  list.innerHTML = grupos.map((g, i) => g.membros.length === 1
    ? cardProjeto(g.membros[0], currentProject, i === 0)
    : cardGrupo(g, currentProject, i === 0)).join('');
}
```

- [x] **Step 5: JS — fold state and clicks**

Right after `const vscode = acquireVsCodeApi();` add:

```js
// Dobra por grupo, salva no estado do webview (sobrevive a reload).
let dobrados = (vscode.getState() || {}).dobrados || {};
function alternarGrupo(chave) {
  dobrados = { ...dobrados, [chave]: !dobrados[chave] };
  vscode.setState({ ...(vscode.getState() || {}), dobrados });
  if (ultimoStatus) renderStatusList(...ultimoStatus);
  const cabeca = document.querySelector(`[data-grupo="${CSS.escape(chave)}"]`);
  if (cabeca) cabeca.focus(); // re-render troca o DOM; teclado não perde o lugar
}
```

Replace the two `statusList` listeners (click and keydown) with:

```js
function acaoDaLista(alvo) {
  const cabeca = alvo.closest('.grupo-cabeca');
  if (cabeca) return alternarGrupo(cabeca.dataset.grupo);
  abrirLinha(alvo.closest('.status-row, .grupo-membro'));
}
document.getElementById('statusList').addEventListener('click', (ev) => acaoDaLista(ev.target));
document.getElementById('statusList').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  if (!ev.target.closest('.grupo-cabeca, .status-row, .grupo-membro')) return;
  ev.preventDefault();
  acaoDaLista(ev.target);
});
```

- [x] **Step 6: Run test to verify it passes**

Run: `node test/test_grupos_painel.js`
Expected: `OK: painel agrupa cards pela origem (grupo dobrável, card único intacto)`

- [x] **Step 7: Run the full suite**

Run: `node test-all.js`
Expected: `Todas as 25 suítes rodadas passaram. (1 pulada(s) por dependência ausente.)`

- [x] **Step 8: Commit**

```bash
git add vscode-extension/media/build.html test/test_grupos_painel.js
git commit -m "feat(panel): group cards that share an origin into one collapsible card"
```

### Task 5: Docs, build, install, push

**Files:**
- Modify: `CHANGELOG.md` (1.2.0 list), `README.md` ("What it shows")

- [x] **Step 1: CHANGELOG** — add to the 1.2.0 list, after the rename lines:

```markdown
- Projects from the same git origin (worktrees, sub-folders with their own `package.json`, other clones of the same remote) are grouped into one collapsible card. A repo with a single project looks as before.
- The "open" arrow on cards points right instead of up (it read as "collapse").
```

- [x] **Step 2: README** — add to "What it shows", after the "Projects are detected automatically…" bullet:

```markdown
- Projects that come from the same repository — git worktrees, sub-folders
  with their own `package.json`, or another clone of the same remote — are
  grouped into one card you can fold. Click the group's header to fold or
  unfold it; the panel remembers.
```

- [x] **Step 3: Full suite, package, install**

Run: `node test-all.js && cd vscode-extension && rm -f *.vsix && npx --yes @vscode/vsce package --allow-missing-repository && code --install-extension simbionte-1.2.0.vsix --force`
Expected: all suites pass; `Extension 'simbionte-1.2.0.vsix' was successfully installed.`

- [x] **Step 4: Commit and push**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: group-by-origin in README and CHANGELOG"
git push origin main
```

- [x] **Step 5: Real check** — after a VS Code window reload, the Communication-Intelligence projects show as one group card; folding survives another reload (screenshot from Nik).
