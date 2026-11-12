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

  // Linha de pasta apagada (worktree removido) some do painel; projeto sem
  // caminho conhecido fica. O histórico no disco não é tocado.
  const { soPastasExistentes } = require('../origem.js');
  const vis = soPastasExistentes([proj('a', main), proj('gone', apagado), proj('sem', undefined)]);
  assert.deepStrictEqual(vis.map(p => p.projectId), ['a', 'sem'], 'pasta que não existe mais: some');
  assert.deepStrictEqual(soPastasExistentes([proj('x', 'C:/y')], () => true).length, 1, 'existe injetável');

  console.log('OK: origem do projeto (worktree, sub-pasta, clone ssh, sem origin, fora do git)');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
