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
// removido), do main. Cópia de worktree IGUAL à do main não está em
// andamento: todo worktree recém-criado tem cópia de todo plano com mtime
// novo, e ganhava todos (achado 2026-11-12, Governance Reconciliation).
// Nem cópia com MENOS ticks que o main: worktree de base velha está atrás
// do main, não à frente (tick só aumenta).
const texto = f => { try { return fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return null; } };
const ticks = t => (t.match(/^\s*[-*] \[[xX]\]/gm) || []).length;
function copiaMaisNova(raiz, rel) {
  const doMain = path.join(raiz, rel);
  const candidatos = [{ arquivo: doMain, worktree: null }];
  try {
    for (const w of fs.readdirSync(path.join(raiz, '.worktrees'), { withFileTypes: true })) {
      if (w.isDirectory()) candidatos.push({ arquivo: path.join(raiz, '.worktrees', w.name, rel), worktree: w.name });
    }
  } catch (e) { /* sem worktrees */ }
  let original; // texto do main, lido só se algum worktree tiver o plano
  let melhor = null, mtime = -1;
  for (const c of candidatos) {
    let m;
    try { m = fs.statSync(c.arquivo).mtimeMs; } catch (e) { continue; /* não existe nesse worktree */ }
    if (m <= mtime) continue;
    if (c.worktree) {
      if (original === undefined) original = texto(doMain);
      if (original !== null) {
        const t = texto(c.arquivo);
        if (t === original || (t !== null && ticks(t) < ticks(original))) continue;
      }
    }
    mtime = m; melhor = c;
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
  // ativo: escolhido por ter agente vivo no worktree ("building:"); senão é
  // só o próximo plano aberto ("next:") — antes dizia "building:" num plano
  // parado (achado 2026-11-12).
  const comAgente = abertos.find(p => p.worktree && temAgentes(p.worktree));
  const atual = comAgente ? { ...comAgente, ativo: true } : abertos[0] ? { ...abertos[0], ativo: false } : null;
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
