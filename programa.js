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

// Status de cada sub-projeto e itens sem plano (pedido do Nik via
// Governance Reconciliation, 2026-11-13): programme.json pode trazer
//   subprojectStatus: [{ plan, title, status, stage, branch?, worktree?, note, blockedBy? }]
//   workItems:        [{ title, status, stage, owner?, worktree?, note, blockedBy? }]
// status/etapa/nota/bloqueio vêm daí (checkbox não diz "on hold"); contagens
// vêm do arquivo do plano. worktree explícito escolhe a cópia — mtime não.
const texto1 = v => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 300) : null;
function estadoDe(e) {
  return {
    status: texto1(e.status), etapa: texto1(e.stage), nota: texto1(e.note), bloqueio: texto1(e.blockedBy),
    dono: texto1(e.owner), worktree: texto1(e.worktree), branch: texto1(e.branch),
  };
}

function copiaDoPlano(raiz, rel, estado) {
  if (estado) {
    const w = estado.worktree && path.basename(estado.worktree); // só nome de pasta em .worktrees/
    if (w) {
      const arquivo = path.join(raiz, '.worktrees', w, rel);
      if (fs.existsSync(arquivo)) return { arquivo, worktree: w };
    } else if (fs.existsSync(path.join(raiz, rel))) return { arquivo: path.join(raiz, rel), worktree: null };
  }
  return copiaMaisNova(raiz, rel);
}

// "Task n/N": n = tarefa em curso (a 1ª com passo aberto); tudo marcado = N/N;
// nada marcado = 0/N (não começou).
function tarefaDe(progresso) {
  const t = progresso && progresso.tarefas;
  if (!t || !t.total) return null;
  if (!progresso.completed) return { n: 0, total: t.total };
  return { n: t.atual ? t.atual.numero : t.total, total: t.total };
}

// lerPlano = progressoDoPlano do store (injetado); temAgentes(worktree) diz
// se há agente vivo ali — o plano atual prefere esse.
function progressoPrograma(prog, raiz, lerPlano, temAgentes = () => false) {
  const estados = Array.isArray(prog.subprojectStatus) ? prog.subprojectStatus.filter(e => e && typeof e === 'object') : null;
  const estadoDoPlano = rel => estados && estados.find(e => e.plan === rel);
  const planos = [];
  const lista = [];
  for (const rel of prog.plans) {
    const bruto = estadoDoPlano(rel);
    const estado = bruto ? estadoDe(bruto) : null;
    const copia = copiaDoPlano(raiz, rel, estado);
    const progresso = copia && lerPlano(copia.arquivo);
    if (progresso && !(estado && estado.status === 'superseded')) planos.push({ rel, worktree: copia.worktree, progresso, estado });
    if (estados) {
      lista.push({
        rel, titulo: texto1(bruto && bruto.title) || path.basename(rel, '.md'),
        ...(estado || {}), worktree: copia ? copia.worktree : (estado && estado.worktree) || null,
        tarefa: tarefaDe(progresso),
        passos: progresso ? { feitos: progresso.completed, total: progresso.total } : null,
      });
    }
  }
  const concluido = p => p.estado && p.estado.status ? p.estado.status === 'done' : p.progresso.completed === p.progresso.total;
  const feitos = planos.filter(concluido).length;
  const abertos = planos.filter(p => p.progresso.completed < p.progresso.total);
  const trabalhos = estados && Array.isArray(prog.workItems)
    ? prog.workItems.filter(e => e && typeof e === 'object' && texto1(e.title)).map(e => ({ titulo: texto1(e.title), ...estadoDe(e) }))
    : null;
  // "building:" com status: os itens in-progress (planos e trabalhos), o que
  // tem agente vivo no worktree primeiro.
  let construindo = null;
  if (estados) {
    const emCurso = [...lista, ...(trabalhos || [])].filter(i => i.status === 'in-progress');
    const comVida = i => !!(i.worktree && temAgentes(i.worktree));
    construindo = [...emCurso.filter(comVida), ...emCurso.filter(i => !comVida(i))].map(i => ({ ...i, vivo: comVida(i) }));
  }
  // ativo: escolhido por ter agente vivo no worktree ("building:"); senão é
  // só o próximo plano aberto ("next:") — antes dizia "building:" num plano
  // parado (achado 2026-11-12).
  const comAgente = abertos.find(p => p.worktree && temAgentes(p.worktree));
  const atual = comAgente ? { ...comAgente, ativo: true } : abertos[0] ? { ...abertos[0], ativo: false } : null;
  return {
    nome: prog.name || 'Programme',
    subprojetos: { feitos, total: Math.max(Number(prog.subprojects) || 0, prog.plans.length - lista.filter(i => i.status === 'superseded').length) },
    passos: {
      feitos: planos.reduce((n, p) => n + p.progresso.completed, 0),
      total: planos.reduce((n, p) => n + p.progresso.total, 0),
    },
    atual,
    // Só quando programme.json traz subprojectStatus (senão o anel fica como antes).
    ...(estados ? { lista, trabalhos: trabalhos || [], construindo, atualizadoEm: texto1(prog.updatedAt) } : {}),
  };
}

module.exports = { lerPrograma, copiaMaisNova, progressoPrograma };
