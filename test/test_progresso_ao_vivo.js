// Self-check: progressoDoPlano lê o plano direto do disco — depois de um
// "git pull" (aqui simulado reescrevendo o arquivo sem passar pelo hook),
// o progresso já reflete o conteúdo novo, sem precisar de Edit/Write local.
// Sustenta o item "sincronizar entre as 2 máquinas" de extension.js:
// comProgressoAoVivo/planoMaisRecente.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
// Fonte do repo, não a cópia instalada em ~/.claude — testar a cópia deixa
// a fonte livre pra divergir sem ninguém perceber. Também destrava rodar
// esta suíte em qualquer máquina, não só na do autor.
const { progressoDoPlano } = require('../store.js');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-plano-'));
const dir = path.join(tmpRoot, 'docs', 'superpowers', 'plans');
fs.mkdirSync(dir, { recursive: true });
const arquivo = path.join(dir, 'plano.md');

try {
  fs.writeFileSync(arquivo, '- [x] passo 1\n- [ ] passo 2\n');
  let p = progressoDoPlano(arquivo);
  assert.strictEqual(p.percent, 50);
  assert.strictEqual(p.completed, 1);
  assert.strictEqual(p.total, 2);

  // "git pull" trazendo o plano fechado da outra máquina — sem hook nenhum,
  // só o arquivo mudando no disco.
  fs.writeFileSync(arquivo, '- [x] passo 1\n- [x] passo 2\n');
  p = progressoDoPlano(arquivo);
  assert.strictEqual(p.percent, 100, 'leitura direta do disco deveria refletir o pull, sem Edit/Write');

  // O progresso diz de qual arquivo veio: a extensão relê ESSE plano (pra
  // refletir git pull), não "o mais novo da pasta" — depois de um pull, o
  // mais novo por data é qualquer plano que o pull tocou (achado 2026-11-12:
  // main checkout mostrava "building" num plano que ninguém tocava).
  assert.strictEqual(p.plano, path.resolve(arquivo));

  // Plano citado no checkout principal, com cópia mais nova num worktree
  // (achado 2026-11-12: "main checkout" mostrava 0/105 lendo a cópia velha do
  // main, enquanto o trabalho estava no worktree): vale a cópia do worktree.
  const { copiaMaisNovaDoPlano } = require('../store.js');
  const mainRepo = path.join(tmpRoot, 'repo');
  const rel = path.join('docs', 'superpowers', 'plans', 'part2.md');
  fs.mkdirSync(path.join(mainRepo, '.git'), { recursive: true });
  const wt = path.join(mainRepo, '.worktrees', 'policy-model-2');
  fs.mkdirSync(path.join(wt, 'docs', 'superpowers', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: x');
  fs.mkdirSync(path.join(mainRepo, 'docs', 'superpowers', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(mainRepo, rel), '- [ ] a\n');
  fs.writeFileSync(path.join(wt, rel), '- [x] a\n');
  const T0 = Date.now() / 1000;
  fs.utimesSync(path.join(mainRepo, rel), T0 - 3600, T0 - 3600);
  assert.strictEqual(copiaMaisNovaDoPlano(path.join(mainRepo, rel)), path.join(wt, rel), 'worktree mais novo ganha');
  fs.utimesSync(path.join(wt, rel), T0 - 7200, T0 - 7200);
  assert.strictEqual(copiaMaisNovaDoPlano(path.join(mainRepo, rel)), path.join(mainRepo, rel), 'main mais novo (já mergeado): fica no main');
  assert.strictEqual(copiaMaisNovaDoPlano(path.join(wt, rel)), path.join(wt, rel), 'citado dentro do worktree: fica');
  assert.strictEqual(copiaMaisNovaDoPlano(arquivo), arquivo, 'repo sem worktrees: fica');

  // fora do padrão docs/superpowers/plans -> ignora
  const outro = path.join(tmpRoot, 'nota.md');
  fs.writeFileSync(outro, '- [x] x\n');
  assert.strictEqual(progressoDoPlano(outro), null);

  console.log('OK: progressoDoPlano reflete o conteúdo do disco (git pull) sem depender do hook');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
