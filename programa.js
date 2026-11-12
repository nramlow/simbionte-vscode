// Progresso de um PROGRAMA: vários planos (um por sub-projeto, cada um no
// seu worktree) somados pro anel do topo. A sessão dona do programa lista os
// planos em <checkout principal>/.symbiont/programme.json (pedido da sessão
// Governance Reconciliation, aprovado pelo Nik em 2026-11-12):
//   { "name": "...", "subprojects": 8, "plans": ["docs/superpowers/plans/x.md", ...] }
const fs = require('fs');
const path = require('path');

function lerPrograma(raiz) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(raiz, '.symbiont', 'programme.json'), 'utf8'));
    return p && Array.isArray(p.plans) && p.plans.length ? p : null;
  } catch (e) { return null; }
}

// Cópia mais nova do plano entre o checkout principal e cada worktree em
// .worktrees/: em andamento conta do worktree; mergeado (worktree já
// removido), do main.
function copiaMaisNova(raiz, rel) {
  const candidatos = [{ arquivo: path.join(raiz, rel), worktree: null }];
  try {
    for (const w of fs.readdirSync(path.join(raiz, '.worktrees'), { withFileTypes: true })) {
      if (w.isDirectory()) candidatos.push({ arquivo: path.join(raiz, '.worktrees', w.name, rel), worktree: w.name });
    }
  } catch (e) { /* sem worktrees */ }
  let melhor = null, mtime = -1;
  for (const c of candidatos) {
    try {
      const m = fs.statSync(c.arquivo).mtimeMs;
      if (m > mtime) { mtime = m; melhor = c; }
    } catch (e) { /* não existe nesse worktree */ }
  }
  return melhor;
}

// lerPlano = progressoDoPlano do store (injetado); temAgentes(worktree) diz
// se há agente vivo ali — o plano atual prefere esse.
function progressoPrograma(prog, raiz, lerPlano, temAgentes = () => false) {
  const planos = [];
  for (const rel of prog.plans) {
    const copia = copiaMaisNova(raiz, rel);
    const progresso = copia && lerPlano(copia.arquivo);
    if (progresso) planos.push({ rel, worktree: copia.worktree, progresso });
  }
  const feitos = planos.filter(p => p.progresso.completed === p.progresso.total).length;
  const abertos = planos.filter(p => p.progresso.completed < p.progresso.total);
  const atual = abertos.find(p => p.worktree && temAgentes(p.worktree)) || abertos[0] || null;
  return {
    nome: prog.name || 'Programme',
    subprojetos: { feitos, total: Math.max(Number(prog.subprojects) || 0, prog.plans.length) },
    passos: {
      feitos: planos.reduce((n, p) => n + p.progresso.completed, 0),
      total: planos.reduce((n, p) => n + p.progresso.total, 0),
    },
    atual,
  };
}

module.exports = { lerPrograma, copiaMaisNova, progressoPrograma };
