// ~/.claude/simbionte-store.js — leitura/escrita atômica do estado do
// Simbionte, compartilhado por progress-hook.js e activity-hook.js.
//
// Identificação de projeto é genérica (raiz git mais próxima do arquivo
// tocado) — sem lista curada, sem caminho hardcoded, funciona em qualquer
// máquina/pasta. Único desvio: convenção de worktree do superpowers
// (<projeto>/.worktrees/<branch>/...) sobe pro projeto real, senão cada
// worktree viraria um "projeto" separado no painel.
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.claude', 'simbionte');

function encontrarRaizGit(caminho) {
  // Não depende do arquivo já existir no disco (um Write pode disparar o
  // hook antes de qualquer coisa tocar fs.statSync nele em certas ordens) —
  // só tenta checar se é diretório; se der erro (arquivo novo, permissão,
  // etc.), assume que é um arquivo comum e sobe a partir do dirname mesmo.
  let dir;
  try {
    dir = fs.statSync(caminho).isDirectory() ? caminho : path.dirname(caminho);
  } catch (e) {
    dir = path.dirname(caminho);
  }
  const raizFs = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (dir === raizFs) return null;
    dir = path.dirname(dir);
  }
}

// Monorepo (ex: meu-monorepo com dezenas de addons): a raiz git sozinha
// rotula tudo com o mesmo nome do repo, escondendo em qual sub-projeto o
// trabalho realmente está. Se existir um marcador de sub-pacote (manifest)
// entre o arquivo tocado e a raiz git, usa o mais próximo do arquivo — sem
// hardcode de "addons/" ou qualquer coisa específica de um framework.
const MARCADORES_SUBPROJETO = ['__manifest__.py', 'package.json', 'pyproject.toml'];

function encontrarSubProjeto(caminho, raiz) {
  let dir;
  try {
    dir = fs.statSync(caminho).isDirectory() ? caminho : path.dirname(caminho);
  } catch (e) {
    dir = path.dirname(caminho);
  }
  while (dir.length > raiz.length && dir.startsWith(raiz)) {
    if (MARCADORES_SUBPROJETO.some(m => fs.existsSync(path.join(dir, m)))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

// Achado 2026-09-02: repo com 1 módulo só (ex. addons/<modulo>/__manifest__.py)
// e o plano em docs/superpowers/plans/ (fora de addons/) virava DOIS ids no
// Simbionte — o do módulo (toda a atividade de código, progress:null porque
// o plano nunca resolve pra dentro de addons/) e o da raiz (só as edições do
// plano, progress certo, quase nenhuma atividade) — dois cards desconectados
// pro mesmo trabalho. Só separa em sub-projeto quando o repo REALMENTE tem
// mais de 1 (monorepo de verdade, tipo meu-monorepo). Busca rasa
// (profundidade 3, para no 2º achado) — não pesa em repo grande.
const IGNORAR_DIR_BUSCA = new Set(['.git', '.worktrees', 'node_modules', '__pycache__']);

function temMaisDeUmSubProjeto(raiz) {
  let achados = 0;
  function visitar(dir, profundidade) {
    if (achados >= 2 || profundidade > 3) return;
    if (MARCADORES_SUBPROJETO.some(m => fs.existsSync(path.join(dir, m)))) achados++;
    if (achados >= 2) return;
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entrada of entradas) {
      if (achados >= 2) return;
      if (!entrada.isDirectory() || IGNORAR_DIR_BUSCA.has(entrada.name)) continue;
      visitar(path.join(dir, entrada.name), profundidade + 1);
    }
  }
  visitar(raiz, 0);
  return achados > 1;
}

function resolverProjeto(caminho) {
  if (!caminho) return null;
  caminho = path.resolve(caminho); // nunca deixa path relativo degenerar em "."
  let raiz = encontrarRaizGit(caminho);
  if (!raiz) return null;
  if (path.basename(path.dirname(raiz)) === '.worktrees') {
    raiz = path.dirname(path.dirname(raiz));
  }
  let dirFinal = encontrarSubProjeto(caminho, raiz);
  if (dirFinal && !temMaisDeUmSubProjeto(raiz)) dirFinal = null; // só 1 no repo -- não separa
  dirFinal = dirFinal || raiz;
  const id = path.basename(dirFinal);
  return { id, name: id, path: dirFinal };
}

// Lock de arquivo bem simples pra proteger o padrão ler->mesclar->escrever
// (atualizarProgresso/registrarAtividade) de dois hooks quase simultâneos
// pisando um no outro. ponytail: busy-wait curto (~5ms x20 = ~100ms teto),
// sem dependência nova; desiste e segue SEM lock depois disso — nunca trava
// o hook (que já tem timeout de 3s no settings.json). Se um processo morrer
// com o lock preso, autodestrava depois de 2s (mtime velho = órfão).
function adquirirLock(projectId) {
  fs.mkdirSync(DIR, { recursive: true });
  const lockPath = path.join(DIR, `.${projectId}.lock`);
  for (let i = 0; i < 20; i++) {
    try {
      fs.closeSync(fs.openSync(lockPath, 'wx'));
      return lockPath;
    } catch (e) {
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 2000) fs.unlinkSync(lockPath);
      } catch (e2) { /* já sumiu, outro processo destravou primeiro */ }
      const fim = Date.now() + 5;
      while (Date.now() < fim) { /* espera curta síncrona */ }
    }
  }
  return null;
}

function liberarLock(lockPath) {
  if (!lockPath) return;
  try { fs.unlinkSync(lockPath); } catch (e) { /* já sumiu, tudo bem */ }
}

function lerProjeto(projectId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${projectId}.json`), 'utf8'));
  } catch (e) {
    return null;
  }
}

function escreverAtomico(projectId, dados) {
  fs.mkdirSync(DIR, { recursive: true });
  const alvo = path.join(DIR, `${projectId}.json`);
  const tmp = `${alvo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados));
  renomearComRetry(tmp, alvo); // rename é atômico no mesmo volume — nunca deixa
  // a extensão ler um arquivo pela metade, mesmo se o processo morrer entre
  // o writeFileSync e o rename (o .tmp fica órfão, o .json bom continua lá).
}

// Achado 2026-11-11: no Windows o rename falha com EPERM/EACCES/EBUSY se
// outro processo estiver com o destino aberto — e o painel lê esses arquivos
// a cada mudança, então hook e painel colidiam de verdade (sobrava
// <projeto>.json.tmp órfão e o update se perdia, porque o hook engole erro).
// Leitura do painel dura milissegundos: tenta de novo por até ~200ms
// (10ms x20), mesmo esquema de espera curta do adquirirLock. Esgotou, joga
// o erro como antes.
function renomearComRetry(origem, destino) {
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(origem, destino);
    } catch (e) {
      if (i >= 19 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      const fim = Date.now() + 10;
      while (Date.now() < fim) { /* espera curta síncrona */ }
    }
  }
}

// origem ('edit'|'bash'): a REGRA DE OURO diz pra nunca fechar checkbox de
// plano via Bash — a trava técnica em activity-hook.js já resincroniza esse
// caso, mas antes fazia isso em silêncio. Marcar viaBash aqui deixa o
// painel avisar de verdade em vez de só corrigir os números por baixo.
// Achado 2026-09-23: qualquer Bash que só CITA o plano (git add/commit do
// arquivo) caía na trava e acendia o aviso, sem checkbox nenhum mudar — o
// painel ficou com ⚠ em todo projeto trabalhado. Bash só acende o aviso se
// o progresso mudou; sem mudança, mantém o aviso como estava. Edit apaga.
// Achado 2026-11-11: ainda sobrava falso alarme — plano visto pela 1ª vez
// num Bash (sem `anterior` pra comparar) e plano reescrito por script (só o
// total mudou) acendiam o aviso com 0 checkbox marcado. Agora só conta
// checkbox marcado: nada marcado = sem aviso (apaga também os gravados antes
// deste fix); sem anterior = avisa só se já tem item marcado.
function viaBashNovo(anterior, progress, origem) {
  if (origem !== 'bash' || !progress || !progress.completed) return false;
  if (!anterior) return true;
  return anterior.completed !== progress.completed ? true : !!anterior.viaBash;
}

function atualizarProgresso(projectId, projectName, progress, projectPath, origem) {
  const lock = adquirirLock(projectId);
  try {
    const atual = lerProjeto(projectId) || { projectId, projectName, progress: null, activity: [] };
    const comOrigem = progress ? { ...progress, viaBash: viaBashNovo(atual.progress, progress, origem) } : progress;
    escreverAtomico(projectId, { ...atual, projectId, projectName, progress: comOrigem, projectPath: projectPath || atual.projectPath });
  } finally { liberarLock(lock); }
}

// Extraído de activity-hook.js (2026-08-29) pra poder ser reusado também
// pela extensão (leitura ao vivo do plano pro projeto em foco, sem esperar
// o hook disparar de novo — cobre o caso de "git pull" trazer o plano
// fechado de outra máquina sem nenhuma edição local).
function progressoDoPlano(file) {
  if (!/docs[\\/]superpowers[\\/]plans[\\/].*\.md$/i.test(file)) return null;
  let texto;
  try { texto = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const linhas = texto.match(/^- \[[ x]\].*$/gim) || [];
  if (!linhas.length) return null;
  const total = linhas.length;
  const completed = linhas.filter(l => /^- \[x\]/i.test(l)).length;
  const proxima = linhas.find(l => /^- \[ \]/.test(l));
  return {
    percent: Math.round((completed / total) * 100), completed, total,
    activeLabel: proxima
      ? (rotuloDoProximo(texto) || proxima.replace(/^- \[ \]\s*/, '').replace(/\*\*/g, '').slice(0, 80))
      : null,
    updatedAt: Date.now(),
    tarefas: tarefasDoPlano(texto),
  };
}

// Plano grande (Phase > Task > Step, só os Steps são checkbox) mostrava
// "Step 1: Write the failing test" — igual em toda Task. O rótulo leva os
// títulos Phase/Task acima do próximo checkbox: "Phase 1 › Task 2 › Step 1".
// Pilha por nível de título (título novo descarta os mais fundos); título
// dentro de bloco ``` é comentário de código, não conta.
const TITULO_CURTO = /^(phase|task|part|stage|milestone|fase|etapa|tarefa)\s+[\w.-]+/i;
function rotuloDoProximo(texto) {
  const pilha = [];
  let emCodigo = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (/^\s*```/.test(linha)) { emCodigo = !emCodigo; continue; }
    if (emCodigo) continue;
    const titulo = linha.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      const nivel = titulo[1].length;
      while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();
      pilha.push({ nivel, texto: titulo[2] });
      continue;
    }
    if (/^- \[ \]/.test(linha)) {
      const passo = linha.replace(/^- \[ \]\s*/, '').replace(/\*\*/g, '');
      const onde = pilha.map(t => (t.texto.replace(/[`*]/g, '').match(TITULO_CURTO) || [])[0]).filter(Boolean);
      return [...onde, passo].join(' › ').slice(0, 100);
    }
  }
  return null;
}

// Plano que atravessa repos (2026-09-23, ex: plano em app-backend,
// metade do trabalho em app-frontend): o reator segue o projeto
// tocado por último, que não tinha plano, e zerava no meio da tarefa. O plano
// declara os outros projetos numa linha `<!-- simbionte-projetos: a, b -->`;
// cada nome é uma pasta irmã da raiz git do plano.
function projetosExtrasDoPlano(file) {
  let texto;
  try { texto = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  const m = texto.match(/<!--\s*simbionte-projetos:\s*([^>]*?)\s*-->/i);
  const raiz = m && encontrarRaizGit(path.resolve(file));
  if (!raiz) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean)
    .map(nome => ({ id: nome, name: nome, path: path.join(path.dirname(raiz), nome) }))
    .filter(p => fs.existsSync(p.path));
}

// Sinal de recência separado de `activity` (só arquivo Edit/Write de
// verdade) — Bash sem file_path (docker, scripts, etc.) não vira "arquivo
// tocado" fake, mas ainda precisa contar como "você tá ativo aqui" pra
// bolinha de status não ficar vermelha enquanto você trabalha só via Bash.
function registrarToque(projectId, projectName, projectPath) {
  const lock = adquirirLock(projectId);
  try {
    const atual = lerProjeto(projectId) || { projectId, projectName, progress: null, activity: [] };
    escreverAtomico(projectId, { ...atual, projectId, projectName, projectPath: projectPath || atual.projectPath, lastTouch: Date.now() });
  } finally { liberarLock(lock); }
}

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bumpHoje(atual) {
  const hoje = hojeLocal();
  if (atual.today?.date === hoje) return { date: hoje, count: atual.today.count + 1 };
  return { date: hoje, count: 1 };
}

function registrarAtividade(projectId, projectName, item, projectPath) {
  const lock = adquirirLock(projectId);
  try {
    const atual = lerProjeto(projectId) || { projectId, projectName, progress: null, activity: [] };
    const activity = [item, ...(atual.activity || [])].slice(0, 8);
    escreverAtomico(projectId, {
      ...atual, projectId, projectName, activity,
      projectPath: projectPath || atual.projectPath,
      today: bumpHoje(atual),
    });
  } finally { liberarLock(lock); }
}

// TodoWrite não referencia um arquivo (só o cwd da sessão) — num monorepo
// isso sempre resolve pra raiz, enquanto activity-hook.js (por arquivo)
// acha o sub-projeto certo. Prefere um sub-projeto (mesma raiz) tocado nos
// últimos 5 minutos, se existir, senão cai pro cwd normal. ponytail:
// heurística por janela de tempo, não é garantia — pode escolher errado se
// você TodoWrite logo depois de mexer num addon vizinho que não é o alvo;
// upgrade seria o hook receber o sub-projeto ativo explicitamente.
function resolverProjetoAtivo(cwd) {
  const base = resolverProjeto(cwd);
  if (!base) return null;
  try {
    const candidatos = fs.readdirSync(DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } })
      .filter(p => p && p.projectPath && p.projectPath !== base.path
        && p.projectPath.startsWith(base.path + path.sep)
        && p.activity && p.activity[0] && p.activity[0].ts > Date.now() - 5 * 60 * 1000);
    if (candidatos.length) {
      candidatos.sort((a, b) => b.activity[0].ts - a.activity[0].ts);
      const c = candidatos[0];
      return { id: c.projectId, name: c.projectName, path: c.projectPath };
    }
  } catch (e) { /* sem pasta ainda, ou erro de leitura — cai pro base */ }
  return base;
}

// Heartbeat: grava toda vez que o hook RODA de verdade (independente de
// resolver projeto) — 2026-08-26, a pedido do autor depois de uma sessão de
// ~3h onde o processo do Claude Code reiniciou no meio e os hooks pararam de
// disparar sem nenhum sinal visível. Não é monitor automático, só um
// registro pra checar manualmente ("_heartbeat.json" na pasta simbionte) se
// o Simbionte parecer desatualizado de novo — comparar lastRun contra agora.
//
// 1.1.0: além do lastRun (mantido pra checagem manual), guarda o ÚLTIMO
// evento de cada sessão (`sessoes[session_id]`). "15 min sem hook" sozinho
// não diz nada — pode ser o Claude esperando você, um build longo ou a
// sessão encerrada. O último evento diz qual dos casos é (estadoDaSessao).
// Lock porque várias sessões abertas escrevem no mesmo arquivo.
const SESSAO_EXPIRA_MS = 24 * 60 * 60 * 1000;
function registrarHeartbeat(evento, data) {
  const agora = Date.now();
  const lock = adquirirLock('_heartbeat');
  try {
    let hb = {};
    try { hb = JSON.parse(fs.readFileSync(path.join(DIR, '_heartbeat.json'), 'utf8')); } catch (e) { /* 1ª vez */ }
    const sessoes = hb.sessoes || {};
    if (evento && data && data.session_id) {
      const reg = { evento, ts: agora };
      if (data.notification_type) reg.tipo = data.notification_type;
      if (evento === 'PreToolUse' && data.tool_input && data.tool_input.command) {
        reg.comando = String(data.tool_input.command).slice(0, 120);
      }
      sessoes[data.session_id] = reg;
    }
    for (const id of Object.keys(sessoes)) {
      if (agora - sessoes[id].ts > SESSAO_EXPIRA_MS) delete sessoes[id];
    }
    escreverAtomico('_heartbeat', { lastRun: agora, sessoes });
  } finally { liberarLock(lock); }
}

// Estado de UMA sessão a partir do último evento. Puro (sem disco) pra ser
// testável e usado igual pela extensão e pelos testes.
//  - Stop / Notification: Claude terminou a resposta ou pediu algo -> é a vez do usuário
//  - PreToolUse sem Post depois: comando rodando (build, testes, npm install)
//  - SessionEnd: acabou
//  - PostToolUse / PostToolUseFailure / UserPromptSubmit: Claude trabalhando;
//    só aqui silêncio longo é suspeito.
// ponytail: Esc (interrupção) não dispara Stop — o último evento fica como
// "trabalhando"/"comando" e pode virar alerta falso. Upgrade: ler o fim do
// transcript_path pra detectar "[Request interrupted by user]".
// ponytail: tool sem hook (Read, Grep, subagente só lendo) não gera evento;
// uma sessão que passa > limite só lendo cai em "possivelmente travada".
const ABANDONADA_MS = 3 * 60 * 60 * 1000; // silêncio > 3h: já alertou, sai do painel
function estadoDaSessao(reg, agora, limiteMs) {
  if (!reg) return null;
  const desde = agora - reg.ts;
  if (reg.evento === 'SessionEnd') return { estado: 'encerrada', desde };
  if (reg.evento === 'Stop' || reg.evento === 'Notification') {
    return { estado: 'aguardando', desde, tipo: reg.tipo || null };
  }
  if (desde > ABANDONADA_MS) return null;
  if (reg.evento === 'PreToolUse') return { estado: 'comando', desde, comando: reg.comando || '' };
  return { estado: desde > limiteMs ? 'travada' : 'trabalhando', desde };
}

// Sessão que representa o painel: a travada tem prioridade (é o alarme);
// senão, a com evento mais recente. null = nenhuma sessão conhecida.
function resumoSessoes(sessoes, agora, limiteMs) {
  const prioridade = e => (e.estado === 'travada' ? 0 : 1);
  let escolhida = null;
  for (const [id, reg] of Object.entries(sessoes || {})) {
    const e = estadoDaSessao(reg, agora, limiteMs);
    if (!e) continue;
    e.sessionId = id;
    if (!escolhida || prioridade(e) < prioridade(escolhida)
      || (prioridade(e) === prioridade(escolhida) && e.desde < escolhida.desde)) escolhida = e;
  }
  return escolhida;
}

// Tarefas do plano (títulos "Task N", qualquer nível) pra linha mostrar
// "Task 11/20". Tarefa sem checkbox não conta; feita = todos os passos
// marcados; atual = a primeira com passo aberto. Título de nível igual ou
// acima fecha a tarefa; bloco ``` é código, não conta.
function tarefasDoPlano(texto) {
  const tarefas = [];
  let atual = null;
  let emCodigo = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (/^\s*```/.test(linha)) { emCodigo = !emCodigo; continue; }
    if (emCodigo) continue;
    const titulo = linha.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      const nivel = titulo[1].length;
      const t = titulo[2].replace(/[`*]/g, '').match(/^task\s+(\d+)\s*[:.–—-]?\s*(.*)$/i);
      if (t) { atual = { numero: Number(t[1]), titulo: t[2].trim(), nivel, passos: 0, feitos: 0 }; tarefas.push(atual); }
      else if (atual && nivel <= atual.nivel) atual = null;
      continue;
    }
    const caixa = linha.match(/^- \[([ xX])\]/);
    if (caixa && atual) { atual.passos++; if (caixa[1] !== ' ') atual.feitos++; }
  }
  const comPassos = tarefas.filter(t => t.passos);
  if (!comPassos.length) return null;
  const proxima = comPassos.find(t => t.feitos < t.passos);
  return {
    total: comPassos.length,
    feitas: comPassos.filter(t => t.feitos === t.passos).length,
    // passos/feitos da tarefa atual: o painel mostra "Step 2/5".
    atual: proxima ? { numero: proxima.numero, titulo: proxima.titulo.slice(0, 80), passos: proxima.passos, feitos: proxima.feitos } : null,
  };
}

// Agentes (subagentes) vivos por sessão, pro painel mostrar "Task 11 · in
// review" e os agentes de cada worktree. Puro; registrarEventoAgente grava
// em _agentes.json. Fontes: PreToolUse da ferramenta Agent (descrição e
// tipo), SubagentStart (agent_id + tipo, sem descrição), SubagentStop e Stop
// (background_tasks: subagentes rodando, com descrição; id = agent_id).
const PENDENTE_EXPIRA_MS = 2 * 60 * 1000;
const AGENTE_FIM_GUARDA_MS = 10 * 60 * 1000;
const AGENTE_MAX_MS = 2 * 60 * 60 * 1000;

function aplicarEventoAgente(estado, data, agora) {
  const sessoes = {};
  for (const [id, s] of Object.entries((estado && estado.sessoes) || {})) {
    sessoes[id] = { cwd: s.cwd || null, pendentes: [...(s.pendentes || [])], agentes: { ...(s.agentes || {}) } };
  }
  const evento = data && data.hook_event_name;
  const sid = data && data.session_id;
  if (evento && sid) {
    const s = sessoes[sid] = sessoes[sid] || { cwd: null, pendentes: [], agentes: {} };
    if (data.cwd) s.cwd = data.cwd;
    const desc = v => String(v || '').slice(0, 160);
    if (evento === 'PreToolUse' && data.tool_name === 'Agent' && data.tool_input) {
      s.pendentes.push({ tipo: data.tool_input.subagent_type || 'general-purpose', descricao: desc(data.tool_input.description), ts: agora });
    } else if (evento === 'SubagentStart' && data.agent_id) {
      const i = s.pendentes.findIndex(p => p.tipo === data.agent_type);
      const p = s.pendentes.splice(i < 0 ? 0 : i, 1)[0] || null;
      s.agentes[data.agent_id] = { tipo: data.agent_type || (p && p.tipo) || '?', descricao: (p && p.descricao) || '', inicio: agora, fim: null };
    } else if (evento === 'SubagentStop' || evento === 'Stop') {
      const rodando = (data.background_tasks || []).filter(t => t && t.type === 'subagent' && t.status === 'running');
      for (const t of rodando) {
        const a = s.agentes[t.id];
        s.agentes[t.id] = a
          ? { ...a, descricao: a.descricao || desc(t.description) }
          : { tipo: t.agent_type || '?', descricao: desc(t.description), inicio: agora, fim: null };
      }
      if (evento === 'Stop') {
        const ids = new Set(rodando.map(t => t.id));
        for (const [id, a] of Object.entries(s.agentes)) if (!a.fim && !ids.has(id)) s.agentes[id] = { ...a, fim: agora };
      } else if (data.agent_id) {
        const a = s.agentes[data.agent_id] || { tipo: data.agent_type || '?', descricao: '', inicio: agora };
        s.agentes[data.agent_id] = { ...a, fim: agora };
      }
    }
  }
  for (const [id, s] of Object.entries(sessoes)) {
    s.pendentes = s.pendentes.filter(p => agora - p.ts < PENDENTE_EXPIRA_MS);
    for (const [aid, a] of Object.entries(s.agentes)) {
      if ((a.fim && agora - a.fim > AGENTE_FIM_GUARDA_MS) || (!a.fim && agora - a.inicio > AGENTE_MAX_MS)) delete s.agentes[aid];
    }
    if (!s.pendentes.length && !Object.keys(s.agentes).length) delete sessoes[id];
  }
  return { sessoes };
}

function registrarEventoAgente(data) {
  const lock = adquirirLock('_agentes');
  try {
    let estado = {};
    try { estado = JSON.parse(fs.readFileSync(path.join(DIR, '_agentes.json'), 'utf8')); } catch (e) { /* 1ª vez */ }
    escreverAtomico('_agentes', aplicarEventoAgente(estado, data, Date.now()));
  } finally { liberarLock(lock); }
}

module.exports = { resolverProjeto, resolverProjetoAtivo, lerProjeto, atualizarProgresso, registrarAtividade, registrarHeartbeat, estadoDaSessao, resumoSessoes, progressoDoPlano, projetosExtrasDoPlano, registrarToque, viaBashNovo, aplicarEventoAgente, registrarEventoAgente };
