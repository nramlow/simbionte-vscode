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
