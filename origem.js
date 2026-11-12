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

// Linha cuja pasta não existe mais (worktree removido depois do merge) sai
// do painel — pedido do Nik, 2026-11-12. Projeto sem caminho conhecido fica.
// O arquivo em ~/.claude/simbionte/ continua (histórico, contagem de hoje).
// Pasta viva: existe e, se fica dentro de .worktrees/ de um repo, tem o .git
// próprio do worktree. Worktree removido cuja pasta vazia ficou (travada por
// outro processo — achado 2026-11-12, .worktrees/docs-testing) conta como
// sumido; subpasta de worktree vivo (ui/) acha o .git do worktree antes.
function pastaViva(p) {
  if (!fs.existsSync(p)) return false;
  let dir = path.resolve(p);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      const rel = path.relative(dir, path.resolve(p));
      return !rel.split(path.sep)[0] || rel.split(path.sep)[0] !== '.worktrees';
    }
    const pai = path.dirname(dir);
    if (pai === dir) return true; // fora de git: basta existir
    dir = pai;
  }
}

function soPastasExistentes(projetos, existe = pastaViva) {
  return projetos.filter(p => !p.projectPath || existe(p.projectPath));
}

// Atividade de arquivo fora da pasta do projeto (gravada antes de o hook
// filtrar isso — memória de sessão em ~/.claude, achado 2026-11-12) não
// aparece na linha. Comparação por texto normalizado (barra, caixa).
const normTexto = s => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
function soAtividadeDaPasta(p) {
  if (!p || !p.projectPath || !Array.isArray(p.activity)) return p;
  const pasta = normTexto(p.projectPath);
  const dentro = a => { const c = normTexto(a && a.path); return !c || c === pasta || c.startsWith(pasta + '/'); };
  return p.activity.every(dentro) ? p : { ...p, activity: p.activity.filter(dentro) };
}

module.exports = { normalizarUrl, origemDoProjeto, agruparProjetos, soPastasExistentes, soAtividadeDaPasta };
