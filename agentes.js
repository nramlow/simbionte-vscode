// Lado da extensão: agentes vivos (de _agentes.json, gravado pelo
// agentes-hook) ligados às linhas do painel. Convenção das descrições, que
// as sessões do Nik adotaram:
//   "<pasta do worktree>: Task <n> <implement|review|fix> – <título>"
const path = require('path');

const CONVENCAO = /^\s*([\w.-]+)\s*:\s*Task\s+(\d+)\s+(implement|review|fix)\b\s*(?:[–—-]\s*(.*))?$/i;
// Forma solta "<worktree>: <qualquer coisa>" (sem espaço antes do ":"): só
// pra achar a linha — achado 2026-11-12, "governance-pages-plan: plan review
// – sub-project 3" caía na pasta da sessão.
const SO_WORKTREE = /^\s*([\w.-]+):\s*(.+)$/;
function lerConvencao(descricao) {
  const d = String(descricao || '');
  const m = d.match(CONVENCAO);
  if (m) return { worktree: m[1], tarefa: Number(m[2]), papel: m[3].toLowerCase(), titulo: (m[4] || '').trim() };
  const s = d.match(SO_WORKTREE);
  return s ? { worktree: s[1], tarefa: null, papel: null, titulo: s[2].trim() } : null;
}

function agentesAtivos(estado, agora) {
  const lista = [];
  for (const [sessao, s] of Object.entries((estado && estado.sessoes) || {})) {
    for (const [id, a] of Object.entries(s.agentes || {})) {
      if (a.fim) continue;
      lista.push({ id, sessao, cwd: s.cwd || null, tipo: a.tipo, descricao: a.descricao || '', inicio: a.inicio, convencao: lerConvencao(a.descricao) });
    }
  }
  return lista.sort((x, y) => y.inicio - x.inicio);
}

function dentroDe(filho, pai) {
  const rel = path.relative(pai, filho);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Cada agente vai pra linha do worktree da convenção; sem convenção, pra
// linha mais funda que contém a pasta da sessão.
function anexarAgentes(projetos, ativos) {
  const porProjeto = new Map();
  for (const a of ativos) {
    let alvo = null;
    if (a.convencao) {
      const w = a.convencao.worktree.toLowerCase();
      alvo = projetos.find(p => String(p.projectId || '').toLowerCase() === w
        || (p.projectPath && path.basename(p.projectPath).toLowerCase() === w)) || null;
    }
    if (!alvo && a.cwd) {
      alvo = projetos.filter(p => p.projectPath && dentroDe(a.cwd, p.projectPath))
        .sort((x, y) => y.projectPath.length - x.projectPath.length)[0] || null;
    }
    if (!alvo) continue;
    if (!porProjeto.has(alvo)) porProjeto.set(alvo, []);
    porProjeto.get(alvo).push(a);
  }
  return projetos.map(p => (porProjeto.has(p) ? { ...p, agentes: porProjeto.get(p) } : p));
}

module.exports = { lerConvencao, agentesAtivos, anexarAgentes };
