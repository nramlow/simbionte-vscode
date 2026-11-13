// Self-check: progresso de um PROGRAMA (programa.js) — vários planos, cada um
// no seu worktree, somados a partir de .symbiont/programme.json. Plano em
// andamento conta da cópia mais nova (worktree); mergeado, da do main.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lerPrograma, copiaMaisNova, progressoPrograma } = require('../programa.js');
const { progressoDoPlano } = require('../store.js');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-programa-'));
const P = 'docs/superpowers/plans';
const escrever = (dir, nome, feitos, total, quando) => {
  const f = path.join(raiz, dir, P, nome);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const linhas = ['# Plano', '## Task 1: A'];
  for (let i = 0; i < total; i++) linhas.push(`- [${i < feitos ? 'x' : ' '}] **Step ${i + 1}: s${i + 1}**`);
  fs.writeFileSync(f, linhas.join('\n') + '\n');
  if (quando) fs.utimesSync(f, quando / 1000, quando / 1000);
};
const T = Date.now();

try {
  assert.strictEqual(lerPrograma(raiz), null, 'sem arquivo: null');
  // shell: mergeado (só no main), 4/4. part1: mergeado, 2/2.
  escrever('', 'shell.md', 4, 4, T - 3e6);
  escrever('', 'part1.md', 2, 2, T - 3e6);
  // part2: cópia velha no main (0/6) e a de verdade no worktree (3/6, mais nova).
  escrever('', 'part2.md', 0, 6, T - 5e6);
  escrever('.worktrees/policy-model-2', 'part2.md', 3, 6, T - 1e5);
  // outro worktree com cópia ainda mais velha do part2 não ganha.
  escrever('.worktrees/velho', 'part2.md', 1, 6, T - 9e6);

  assert.deepStrictEqual(copiaMaisNova(raiz, `${P}/part2.md`), { arquivo: path.join(raiz, '.worktrees', 'policy-model-2', P, 'part2.md'), worktree: 'policy-model-2' });
  assert.deepStrictEqual(copiaMaisNova(raiz, `${P}/shell.md`), { arquivo: path.join(raiz, P, 'shell.md'), worktree: null });
  assert.strictEqual(copiaMaisNova(raiz, `${P}/nao-existe.md`), null);

  fs.mkdirSync(path.join(raiz, '.symbiont'));
  fs.writeFileSync(path.join(raiz, '.symbiont', 'programme.json'), JSON.stringify({
    name: 'Governance redesign', subprojects: 8,
    plans: [`${P}/shell.md`, `${P}/part1.md`, `${P}/part2.md`, `${P}/ainda-nao-escrito.md`],
  }));
  const prog = lerPrograma(raiz);
  assert.strictEqual(prog.name, 'Governance redesign');

  const r = progressoPrograma(prog, raiz, progressoDoPlano);
  assert.strictEqual(r.nome, 'Governance redesign');
  assert.deepStrictEqual(r.subprojetos, { feitos: 2, total: 8 }, 'dois planos a 100%; 8 sub-projetos declarados');
  assert.deepStrictEqual(r.passos, { feitos: 9, total: 12 }, '4+2+3 de 4+2+6; plano listado que não existe não soma');
  assert.strictEqual(r.atual.rel, `${P}/part2.md`);
  assert.strictEqual(r.atual.worktree, 'policy-model-2');
  assert.strictEqual(r.atual.progresso.completed, 3);

  // Worktree criado agora do main (achado 2026-11-12, Governance
  // Reconciliation): ele tem cópia IDÊNTICA de todo plano com mtime novo.
  // Cópia igual à do main não é "em andamento" — conta do main, worktree null.
  const igual = (de, para, quando) => {
    const f = path.join(raiz, para, P, path.basename(de));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.copyFileSync(path.join(raiz, de), f);
    fs.utimesSync(f, quando / 1000, quando / 1000);
  };
  igual(`${P}/shell.md`, '.worktrees/ui-nits', T);
  igual(`${P}/part2.md`, '.worktrees/ui-nits', T);
  assert.deepStrictEqual(copiaMaisNova(raiz, `${P}/shell.md`), { arquivo: path.join(raiz, P, 'shell.md'), worktree: null }, 'cópia idêntica e mais nova no worktree não rouba o plano');
  // ...e não esconde a edição de verdade em policy-model-2 (mais velha que ui-nits).
  assert.deepStrictEqual(copiaMaisNova(raiz, `${P}/part2.md`), { arquivo: path.join(raiz, '.worktrees', 'policy-model-2', P, 'part2.md'), worktree: 'policy-model-2' }, 'edição real ganha da cópia idêntica mais nova');
  // Mesmo texto com CRLF (checkout no Windows) continua "igual".
  const crlf = path.join(raiz, '.worktrees', 'ui-nits', P, 'part1.md');
  fs.writeFileSync(crlf, fs.readFileSync(path.join(raiz, P, 'part1.md'), 'utf8').replace(/\n/g, '\r\n'));
  assert.strictEqual(copiaMaisNova(raiz, `${P}/part1.md`).worktree, null, 'só fim de linha diferente: igual');
  // Worktree velho com cópia desatualizada (o main andou depois): main ganha.
  escrever('', 'part4.md', 3, 4, T - 1e5);
  escrever('.worktrees/parado', 'part4.md', 1, 4, T - 4e6);
  assert.strictEqual(copiaMaisNova(raiz, `${P}/part4.md`).worktree, null, 'cópia velha diferente não ganha do main mais novo');
  // Worktree de base velha (menos ticks que o main) mas mtime mais novo: está
  // atrás do main, não à frente (caso real: part2 100/105 no worktree, 101 no main).
  escrever('', 'part5.md', 4, 6, T - 4e6);
  escrever('.worktrees/base-velha', 'part5.md', 3, 6, T);
  assert.strictEqual(copiaMaisNova(raiz, `${P}/part5.md`).worktree, null, 'menos ticks que o main: main ganha');
  // Plano reescrito no worktree (mesmos ticks, texto diferente): conta do worktree.
  fs.appendFileSync(path.join(raiz, '.worktrees', 'base-velha', P, 'part5.md'), '- [x] **Step 7: extra**\n');
  fs.utimesSync(path.join(raiz, '.worktrees', 'base-velha', P, 'part5.md'), T / 1000, T / 1000);
  assert.strictEqual(copiaMaisNova(raiz, `${P}/part5.md`).worktree, 'base-velha', 'mesmos ou mais ticks e texto diferente: worktree');

  // "building:" com agentes vivos só no worktree que não mexeu no plano: não aponta pra lá.
  fs.writeFileSync(path.join(raiz, '.symbiont', 'programme.json'), JSON.stringify({ name: 'W', plans: [`${P}/part2.md`] }));
  const comUiNits = progressoPrograma(lerPrograma(raiz), raiz, progressoDoPlano, w => w === 'ui-nits');
  assert.strictEqual(comUiNits.atual.worktree, 'policy-model-2', 'agentes em ui-nits não tornam ui-nits o plano atual');
  assert.strictEqual(comUiNits.atual.ativo, false, 'sem agente no worktree do plano: "next", não "building"');
  assert.strictEqual(progressoPrograma(lerPrograma(raiz), raiz, progressoDoPlano, w => w === 'policy-model-2').atual.ativo, true);

  // Preferência por plano com agentes vivos no worktree.
  escrever('.worktrees/outro', 'part3.md', 0, 2, T);
  fs.writeFileSync(path.join(raiz, '.symbiont', 'programme.json'), JSON.stringify({ name: 'X', plans: [`${P}/part2.md`, `${P}/part3.md`] }));
  assert.strictEqual(progressoPrograma(lerPrograma(raiz), raiz, progressoDoPlano, w => w === 'outro').atual.rel, `${P}/part3.md`, 'agente vivo no worktree ganha');
  assert.deepStrictEqual(progressoPrograma(lerPrograma(raiz), raiz, progressoDoPlano).subprojetos, { feitos: 0, total: 2 }, 'sem subprojects: conta os planos');

  // Tudo concluído: atual null.
  fs.writeFileSync(path.join(raiz, '.symbiont', 'programme.json'), JSON.stringify({ name: 'Y', plans: [`${P}/shell.md`] }));
  assert.strictEqual(progressoPrograma(lerPrograma(raiz), raiz, progressoDoPlano).atual, null);

  // Arquivo inválido ou sem planos: ignorado.
  fs.writeFileSync(path.join(raiz, '.symbiont', 'programme.json'), '{ não é json');
  assert.strictEqual(lerPrograma(raiz), null);
  fs.writeFileSync(path.join(raiz, '.symbiont', 'programme.json'), JSON.stringify({ name: 'Z', plans: [] }));
  assert.strictEqual(lerPrograma(raiz), null);

  console.log('OK: progresso de programa (cópia mais nova, soma, sub-projetos, plano atual)');
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
