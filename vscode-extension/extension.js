const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.claude', 'simbionte');
const URLS_PATH = path.join(os.homedir(), '.claude', 'simbionte-urls.json');

// progressoDoPlano vem do mesmo módulo que o hook usa — sem isso a extensão
// teria que reimplementar o parser de checkbox. Vem empacotado em lib/
// (prepare.js), então funciona mesmo antes de os hooks serem instalados.
let progressoDoPlano = () => null, resumoSessoes = () => null, contextoDoTranscript = () => null;
try {
  ({ progressoDoPlano, resumoSessoes, contextoDoTranscript } = require('./lib/store.js'));
} catch (e) { /* rodando do repo sem prepare.js — cai pro cache do hook */ }
const { ARQUIVOS, hooksFaltando, adicionarHooks, removerHooks, arquivosDesatualizados, statusLineFaltando } = require('./lib/hooks-settings.js');

// Agrupa os cards por repo de origem (worktrees, sub-pastas, outro clone).
// Cache por caminho: a origem de uma pasta não muda durante a sessão, e o
// painel reenvia a lista a cada 5s.
let agruparProjetos = projetos => projetos;
let marcarOcultos = projetos => projetos;
try {
  const origem = require('./lib/origem.js');
  const cache = new Map();
  const origemMemo = p => {
    if (!cache.has(p)) cache.set(p, origem.origemDoProjeto(p));
    return cache.get(p);
  };
  agruparProjetos = projetos => origem.agruparProjetos(projetos, origemMemo);
  // Pasta apagada (worktree removido): a linha some do painel, mas o projeto
  // segue na lista marcado — as edições de hoje continuam contando.
  marcarOcultos = projetos => { const vivos = new Set(origem.soPastasExistentes(projetos)); return projetos.map(p => (vivos.has(p) ? p : { ...p, oculto: true })); };
} catch (e) { /* rodando do repo sem prepare.js — cards sem grupo, como antes */ }

// Padrão de uso por hora (padrao.js): varre os transcripts do Claude Code em
// segundo plano (assíncrono — não trava o VS Code), uma varredura por vez,
// e guarda em _padrao.json pra não reler tudo a cada abertura.
// Atualizar sem recarregar o VS Code (vigia.js): a instalação reaproveita a
// mesma pasta da extensão, então dá pra vigiar os próprios arquivos.
let criarVigia = null;
try { ({ criarVigia } = require('./lib/vigia.js')); } catch (e) { /* rodando do repo sem prepare.js */ }
// Assinatura pelo CONTEÚDO: todo empacotamento regrava todos os arquivos,
// então data de modificação acusaria mudança de código num update só de painel.
const assinaturaDe = arquivos => { try { const h = require("crypto").createHash("sha1"); for (const a of arquivos) h.update(fs.readFileSync(a)); return h.digest("hex"); } catch (e) { return null; } };
function arquivosDeCodigo(dir) {
  const lista = [];
  (function andar(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p); else if (e.name.endsWith(".js")) lista.push(p);
    }
  })(dir);
  return lista.sort();
}

let padraoLib = null;
try { padraoLib = require('./lib/padrao.js'); } catch (e) { /* rodando do repo sem prepare.js */ }
let padraoEstado = null;
let varrendo = false;
async function atualizarPadrao() {
  if (!padraoLib || varrendo) return;
  varrendo = true;
  const arquivo = path.join(DIR, '_padrao.json');
  try {
    if (!padraoEstado) {
      try { padraoEstado = JSON.parse(await fs.promises.readFile(arquivo, 'utf8')); } catch (e) { /* 1ª vez: varredura completa */ }
    }
    padraoEstado = await padraoLib.varrer(path.join(CLAUDE_DIR, 'projects'), padraoEstado);
    await fs.promises.writeFile(arquivo + '.tmp', JSON.stringify(padraoEstado));
    await fs.promises.rename(arquivo + '.tmp', arquivo);
  } catch (e) { /* tenta de novo na próxima rodada */ }
  finally { varrendo = false; }
}
function resumoPadrao(semanal) {
  if (!padraoLib || !padraoEstado) return null;
  const agora = Date.now();
  const p = padraoLib.perfil(padraoEstado.horas, agora);
  return {
    dia: p.dia, semana: p.semana, semanas: p.semanas, dias: p.dias,
    janela: padraoLib.janelaAtiva(p.dia), horaAtual: new Date(agora).getHours(),
    previsao: padraoLib.previsao(semanal, padraoEstado.horas, p),
  };
}

// Visão completa do padrão (comando "Symbiont: Show usage pattern"): uma aba
// com as grades dia da semana × hora. Reaproveita a aba se já aberta.
let painelPadrao = null;
async function mostrarPadrao(extensionUri) {
  if (!padraoEstado) await atualizarPadrao();
  if (painelPadrao) painelPadrao.reveal();
  else {
    painelPadrao = vscode.window.createWebviewPanel('simbionte.padrao', 'Symbiont: usage pattern', vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [extensionUri] });
    painelPadrao.webview.html = fs.readFileSync(vscode.Uri.joinPath(extensionUri, 'media', 'padrao.html').fsPath, 'utf8');
    painelPadrao.onDidDispose(() => { painelPadrao = null; });
  }
  let semanal = null;
  try { semanal = JSON.parse(fs.readFileSync(path.join(DIR, '_uso.json'), 'utf8')).semanal || null; } catch (e) { /* sem statusLine ainda */ }
  painelPadrao.webview.postMessage({ type: 'padrao', dados: resumoPadrao(semanal) });
}

// Programas (programa.js): grupo cuja raiz (checkout principal) tem
// .symbiont/programme.json ganha o progresso somado em cada membro; o anel
// usa o do projeto que ele escolher (foco vivo, senão o mais recente).
let programaLib = null;
try { programaLib = require('./lib/programa.js'); } catch (e) { /* rodando do repo sem prepare.js */ }
function anexarProgramas(projetos) {
  if (!programaLib) return projetos;
  const porRaiz = new Map();
  const doWorktree = w => projetos.find(p => p.projectPath && path.basename(p.projectPath).toLowerCase() === String(w).toLowerCase());
  return projetos.map(p => {
    const raiz = (p.grupo && p.grupo.raiz) || p.projectPath;
    if (!raiz) return p;
    if (!porRaiz.has(raiz)) {
      const prog = programaLib.lerPrograma(raiz);
      let r = null;
      if (prog) {
        r = programaLib.progressoPrograma(prog, raiz, progressoDoPlano, w => { const q = doWorktree(w); return !!(q && q.agentes && q.agentes.length); });
        if (r.atual && r.atual.worktree) { const q = doWorktree(r.atual.worktree); r.atual.agentes = (q && q.agentes) || []; }
      }
      porRaiz.set(raiz, r);
    }
    const r = porRaiz.get(raiz);
    return r ? { ...p, programa: r } : p;
  });
}

let transicoes = null;
try { ({ transicoes } = require('./lib/transicoes.js')); } catch (e) { /* rodando do repo sem prepare.js — sem notificações */ }

// Agentes vivos (agentes-hook -> _agentes.json) ligados às linhas.
let agentesNoPainel = projetos => projetos;
try {
  const ag = require('./lib/agentes.js');
  agentesNoPainel = projetos => {
    let estado = null;
    try { estado = JSON.parse(fs.readFileSync(path.join(DIR, '_agentes.json'), 'utf8')); } catch (e) { /* sem agentes ainda */ }
    return ag.anexarAgentes(projetos, ag.agentesAtivos(estado, Date.now()));
  };
} catch (e) { /* rodando do repo sem prepare.js — sem agentes, como antes */ }

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
function lerSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch (e) { return e.code === 'ENOENT' ? {} : null; } // null = JSON inválido, não sobrescrever
}

// Os hooks fazem require('./simbionte-store') — o store vai como irmão.
function origemEmpacotada(extensionUri, f) {
  const lib = vscode.Uri.joinPath(extensionUri, 'lib').fsPath;
  return f === 'simbionte-store.js' ? path.join(lib, 'store.js') : path.join(lib, 'hooks', f);
}

// Extensão atualizada não atualizava os hooks em ~/.claude (fix no store só
// chegava a quem rodasse "Install hooks" de novo). Na ativação, se os hooks
// já estão instalados, troca os arquivos que mudaram — nunca o settings.json.
// Cópia em .tmp + rename: um hook rodando agora nunca carrega meio arquivo.
// Falhou (arquivo ocupado)? Fica pra próxima ativação.
function atualizarArquivosInstalados(extensionUri, settings) {
  const ler = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
  const empacotado = {}, instalado = {};
  for (const f of ARQUIVOS) {
    empacotado[f] = ler(origemEmpacotada(extensionUri, f));
    instalado[f] = ler(path.join(CLAUDE_DIR, f));
  }
  const trocados = [];
  for (const f of arquivosDesatualizados(settings, empacotado, instalado)) {
    const destino = path.join(CLAUDE_DIR, f);
    try {
      fs.copyFileSync(origemEmpacotada(extensionUri, f), `${destino}.tmp`);
      fs.renameSync(`${destino}.tmp`, destino);
      trocados.push(f);
    } catch (e) {
      try { fs.unlinkSync(`${destino}.tmp`); } catch (e2) { /* nem chegou a criar */ }
    }
  }
  return trocados;
}

// Copia hooks + store pra ~/.claude e registra em settings.json. Idempotente:
// rodar de novo só atualiza os arquivos e acrescenta o que faltar (quem veio
// da 1.0.x ganha os hooks de estado do watchdog sem duplicar os antigos).
async function instalarHooks(extensionUri) {
  const settings = lerSettings();
  if (settings === null) {
    return vscode.window.showErrorMessage(`Symbiont: ${SETTINGS_PATH} is not valid JSON — fix it before installing.`);
  }
  const faltando = hooksFaltando(settings);
  const eventos = [...new Set(faltando.map(h => h.evento))].join(', ');
  const semStatusLine = statusLineFaltando(settings);
  const mudancas = [
    faltando.length ? `add ${faltando.length} hooks to settings.json (${eventos})` : '',
    semStatusLine ? 'set its status line (for the weekly usage meter)' : '',
  ].filter(Boolean).join(' and ');
  const ok = await vscode.window.showWarningMessage(
    `Symbiont will copy ${ARQUIVOS.length} files to ${CLAUDE_DIR}`
    + (mudancas ? ` and ${mudancas}. The original settings.json is backed up to settings.json.bak.` : '.'),
    { modal: true }, 'Install');
  if (ok !== 'Install') return;

  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  for (const f of ARQUIVOS) fs.copyFileSync(origemEmpacotada(extensionUri, f), path.join(CLAUDE_DIR, f));

  if (faltando.length || semStatusLine) {
    // .bak só na 1ª vez: guarda o settings de ANTES do Simbionte. Sobrescrever
    // a cada instalação trocaria o original por uma cópia já com os hooks.
    const bak = SETTINGS_PATH + '.bak';
    if (fs.existsSync(SETTINGS_PATH) && !fs.existsSync(bak)) fs.copyFileSync(SETTINGS_PATH, bak);
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(adicionarHooks(settings, CLAUDE_DIR), null, 2) + '\n');
  }
  vscode.window.showInformationMessage('Symbiont: hooks installed. They take effect in your next Claude Code sessions.');
}

// Desfaz a instalação: tira do settings.json só as entradas do Simbionte
// (hooks de outras ferramentas ficam) e apaga os arquivos copiados. Não
// restaura o .bak de propósito — ele é de antes da instalação, e restaurar
// jogaria fora tudo que você mudou no settings.json depois disso.
async function removerHooksCmd() {
  const settings = lerSettings();
  if (settings === null) {
    return vscode.window.showErrorMessage(`Symbiont: ${SETTINGS_PATH} is not valid JSON — fix it before removing.`);
  }
  const ok = await vscode.window.showWarningMessage(
    `Symbiont will remove its hooks from settings.json and delete ${ARQUIVOS.join(', ')} from ${CLAUDE_DIR}. Other tools' hooks are not touched.`,
    { modal: true }, 'Remove');
  if (ok !== 'Remove') return;
  if (fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(removerHooks(settings), null, 2) + '\n');
  }
  for (const f of ARQUIVOS) {
    try { fs.unlinkSync(path.join(CLAUDE_DIR, f)); } catch (e) { /* já não existia */ }
  }
  vscode.window.showInformationMessage(`Symbiont: hooks removed. The panel's data stays in ${DIR} (you can delete that folder). Now you can uninstall the extension.`);
}

// Insights calculados AQUI, não buscados por HTTP: insights.js é puro —
// recebe o scan e devolve sinais, sem saber o que é servidor. O scan vem do
// disco (`_scan.<porta>.json`, escrito pelo servidor). Resultado: o painel
// mostra saúde e sinais mesmo com o servidor fora do ar; só envelhece.
//
// lib/ é populado pelo deploy.js a partir da raiz do repo — o vsce empacota
// só o que está sob vscode-extension/, então um require('../') quebraria na
// extensão instalada. Import defensivo pelo mesmo motivo do de cima.
let lerScan = () => null, computeSignals = null, synthesize = null, computeHealth = null,
    classificar = null, PROJECTS = [], RELATIONS = [];
try {
  ({ lerScan } = require('./lib/scan-store.js'));
  ({ computeSignals, synthesize, computeHealth, classificar } = require('./lib/insights.js'));
  ({ PROJECTS, RELATIONS } = require('./lib/data.js'));
} catch (e) { /* libs não empacotadas — painel segue sem o bloco de insights */ }

// Um projeto novo entra no store sozinho (o hook o descobre pelo cwd) e
// aparece na lista na hora, mas fica fora de saúde e sinais até alguém rodar
// `node gerar-data.js --gravar`. Sem este aviso, some em silêncio desses dois
// blocos e ninguém nota — a pergunta que originou isto foi exatamente "e se
// eu criar outro projeto, vai ser pego?".
function naoCatalogados(projetos) {
  if (!classificar || !PROJECTS.length) return [];
  return projetos
    .map(p => p.projectId)
    .filter(id => id && classificar(id, PROJECTS).foraDoMapa);
}

const PORTA_SERVIDOR = 4737;

// { id: nome legível } — montado uma vez, o catálogo não muda em runtime.
const NOMES_PROJETO = Object.fromEntries(PROJECTS.map(p => [p.id, p.name]));

function lerInsights() {
  if (!computeSignals || !lerScan) return null;
  const scan = lerScan(PORTA_SERVIDOR);
  if (!scan) return null; // servidor nunca rodou nesta máquina
  try {
    const signals = computeSignals(scan.data, PROJECTS, RELATIONS);
    return {
      synthesis: synthesize(signals),
      health: computeHealth(scan.data, PROJECTS, RELATIONS),
      scanAgeMs: Date.now() - scan.updatedAt,
    };
  } catch (e) {
    // Insight quebrado não pode derrubar o painel: o progresso e a atividade
    // são mais críticos e não dependem disto. Mesmo raciocínio do try/catch
    // separado em server.js:refresh().
    return null;
  }
}

// ponytail: tentei node-notifier pra notificação de SO de verdade (visível
// mesmo com o VS Code em segundo plano), mas o SnoreToast.exe que ele usa
// no Windows travou (nunca retorna) neste ambiente — sem confiança nisso,
// melhor usar só a API do VS Code, que já é confiável, do que arriscar
// processo zumbi. Upgrade: revisitar node-notifier (ou notificação nativa
// via PowerShell/WinRT) se essa notificação in-app se mostrar insuficiente.
function notificar(title, message) {
  vscode.window.showInformationMessage(`${title}: ${message}`);
}

function lerUrlProjeto(projectId) {
  try { return JSON.parse(fs.readFileSync(URLS_PATH, 'utf8'))[projectId] || null; }
  catch (e) { return null; }
}

// Sincronização entre máquinas: o progresso do plano já sincroniza sozinho
// via git (docs/superpowers/plans/*.md é versionado) — o que falta é o
// CACHE em ~/.claude/simbionte/*.json, que só é atualizado quando o hook
// dispara. Um "git pull" sozinho nunca re-dispara o hook, então o painel
// ficava preso no estado de antes do pull. Aqui, só pro projeto em foco
// (custo: 1 scan de diretório por enviar(), não vale pagar isso pra todo
// projeto listado), lê o `.md` de plano mais recente direto do disco e
// usa esse resultado se ele for mais novo que o cache.
function planoMaisRecente(projectPath) {
  if (!projectPath) return null;
  const dir = path.join(projectPath, 'docs', 'superpowers', 'plans');
  let arquivos;
  try { arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.md')); }
  catch (e) { return null; }
  let escolhido = null, maiorMtime = -1;
  for (const f of arquivos) {
    const p = path.join(dir, f);
    try {
      const mtime = fs.statSync(p).mtimeMs;
      if (mtime > maiorMtime) { maiorMtime = mtime; escolhido = p; }
    } catch (e) { /* sumiu entre o readdir e o stat, ignora */ }
  }
  return escolhido;
}

function comProgressoAoVivo(projeto, currentProject) {
  if (!projeto || (projeto.projectId !== currentProject && projeto.projectName !== currentProject)) return projeto;
  const plano = planoMaisRecente(projeto.projectPath);
  if (!plano) return projeto;
  const vivo = progressoDoPlano(plano);
  if (!vivo) return projeto;
  // updatedAt vira o mtime do arquivo, não Date.now() — senão a cada poll
  // de 5s o "progress" pareceria mais novo que qualquer atividade, e a
  // lógica de "atividade após conclusão" do build.html nunca disparava.
  try { vivo.updatedAt = fs.statSync(plano).mtimeMs; } catch (e) { /* arquivo sumiu no meio, usa Date.now() mesmo */ }
  return { ...projeto, progress: vivo };
}

// Arquivos de controle que dividem o diretório com os projetos. `_scan` é do
// servidor, `_heartbeat` dos hooks, `_aviso_uso_*` é de OUTRA ferramenta
// (um hook de aviso de uso) — o diretório não é exclusivo do Simbionte.
const INTERNOS_RE = /^_(heartbeat|agentes|uso|padrao|scan\.\d+|aviso_uso_[^/\\]*)\.json$/i;

function lerTodosProjetos(currentProject) {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    // Achado 2026-09-23: o filtro era `!f.startsWith('_')`, e isso escondia
    // DOIS projetos reais — `_ferramentas` (o próprio Simbionte) e
    // `_workspace` — porque as pastas deles começam com underscore. O
    // painel ficava cego justamente pro repo em que se estava trabalhando.
    // Agora descarta por nome só o que é sabidamente interno, e confirma
    // pela FORMA do conteúdo: arquivo de projeto tem projectName, os de
    // controle não têm. Nome é convenção e quebra; forma é o contrato.
    .filter(f => f.endsWith('.json') && !INTERNOS_RE.test(f))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
      catch (e) { return null; }
    })
    .filter(p => p && p.projectName)
    .map(p => comProgressoAoVivo(p, currentProject));
}

// Notificação real de SO só na TRANSIÇÃO (transicoes.js). O último estado
// conhecido vai pro globalState do VS Code: em memória, todo reload
// renotificava cada plano já concluído.
const CHAVE_TRANSICOES = 'simbionte.transicoes';
let estadoGlobal = null; // context.globalState, setado no activate
function checarTransicoes(projetos) {
  if (!transicoes) return;
  const r = transicoes(estadoGlobal ? estadoGlobal.get(CHAVE_TRANSICOES) : undefined, projetos);
  for (const a of r.avisos) {
    if (a.tipo === 'concluido') notificar('Symbiont', `Plan complete: ${a.nome}`);
    else notificar('Symbiont — GOLDEN RULE', `Checkbox edited via Bash in ${a.nome} — use Edit/Write instead`);
  }
  if (r.mudou && estadoGlobal) estadoGlobal.update(CHAVE_TRANSICOES, r.conhecidos);
}

let enviarAtual = null;

class SimbiontePainelProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    webviewView.webview.html = this._html();

    const projetoAtual = () => {
      const pasta = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return pasta ? path.basename(pasta) : null;
    };
    const enviar = () => {
      const atual = projetoAtual();
      const projetos = anexarProgramas(marcarOcultos(agentesNoPainel(agruparProjetos(lerTodosProjetos(atual)))));
      checarTransicoes(projetos);
      const sessao = sessaoAtual();
      const uso = usoAtual(sessao);
      // Achado 2026-09-23: o banner lia um estado recalculado pelo timer de
      // 60s e ficava na tela até um minuto DEPOIS de os hooks voltarem.
      // Aqui o estado é lido do disco na hora (ciclo de 5s); o timer de 60s
      // é só pro popup, que não pode disparar a cada poll.
      webviewView.webview.postMessage({
        type: 'update', projetos, currentProject: atual, sessao, uso, padrao: resumoPadrao(uso.semanal),
        insights: lerInsights(),
        // Os insights vêm com o id do catálogo ("MEU-APP-V4"); o nome
        // legível só existe no data.js, que é do lado da extensão.
        nomesProjeto: NOMES_PROJETO,
        naoCatalogados: naoCatalogados(projetos),
      });
    };
    enviarAtual = enviar;
    enviar();

    fs.mkdirSync(DIR, { recursive: true });
    // escreverAtomico grava um .tmp e depois renomeia — as duas operações
    // disparam esse watcher, então cada update real chama enviar() 2x sem
    // isso; filtrar o .tmp evita o re-render redundante.
    const watcher = fs.watch(DIR, { persistent: true }, (_evento, filename) => {
      if (!filename || !filename.endsWith('.tmp')) enviar();
    });
    // ponytail: fs.watch em diretório trava silenciosamente no Windows sob
    // carga (sem emitir 'error') — poll de reserva garante no máximo alguns
    // segundos de atraso mesmo se o watcher morrer. Upgrade se não bastar:
    // watcher.on('error', ...) recriando o watch.
    // Painel novo instalado (build.html mudou): recarrega só o painel, sem
    // reload do VS Code. Reenvia os dados depois que a página carrega.
    const htmlPainel = vscode.Uri.joinPath(this.extensionUri, 'media', 'build.html').fsPath;
    const vigiaPainel = criarVigia ? criarVigia(() => assinaturaDe([htmlPainel]), () => {
      webviewView.webview.html = this._html();
      setTimeout(enviar, 800);
    }) : () => {};
    const pollFallback = setInterval(() => { vigiaPainel(); enviar(); }, 5000);
    const msgListener = webviewView.webview.onDidReceiveMessage(msg => {
      if (!msg) return;
      if (msg.type === 'openApp') {
        const url = msg.projectId ? lerUrlProjeto(msg.projectId) : null;
        if (url && /^https?:\/\//i.test(url)) {
          vscode.env.openExternal(vscode.Uri.parse(url));
        } else if (msg.path) {
          vscode.window.showTextDocument(vscode.Uri.file(msg.path))
            .then(undefined, () => vscode.window.showWarningMessage('File not found: ' + msg.path));
        }
      } else if (msg.type === 'abrirPadrao') {
        vscode.commands.executeCommand('simbionte.mostrarPadrao');
      } else if (msg.type === 'openProject' && msg.path) {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), { forceNewWindow: true });
      }
    });
    webviewView.onDidDispose(() => {
      watcher.close();
      clearInterval(pollFallback);
      msgListener.dispose();
      if (enviarAtual === enviar) enviarAtual = null;
    });
  }

  _html() {
    const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'build.html').fsPath;
    return fs.readFileSync(htmlPath, 'utf8');
  }
}

function limiteTravadoMs() {
  // English fork: setting renamed to stuckThresholdMinutes; the old key is still honored.
  const cfg = vscode.workspace.getConfiguration('simbionte');
  const novo = cfg.inspect('stuckThresholdMinutes');
  const definidoNovo = novo && (novo.globalValue ?? novo.workspaceValue ?? novo.workspaceFolderValue) !== undefined;
  const min = Number(definidoNovo ? cfg.get('stuckThresholdMinutes', 15) : cfg.get('limiteTravadoMin', 15));
  return Math.max(1, min || 15) * 60 * 1000;
}

function lerSessoes() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, '_heartbeat.json'), 'utf8')).sessoes || {}; }
  catch (e) { return {}; }
}

// Lido do disco na hora, a cada envio: o banner é um alarme, e alarme que
// demora a desligar treina a pessoa a ignorá-lo. Sem sessão conhecida
// (hooks da 1.0.x, ou nenhum hook rodou ainda) = null, nunca "travada".
function sessaoAtual() {
  const limite = limiteTravadoMs();
  const s = resumoSessoes(lerSessoes(), Date.now(), limite);
  if (s) s.limiteMin = Math.round(limite / 60000);
  return s;
}

// Medidores de uso: contexto da mesma sessão que a linha de estado mostra
// (último trecho do transcript dela) e o limite semanal que o statusLine
// gravou. Janela: a que o statusLine viu pra esse modelo; sem isso, 1M se o
// uso já passou de 200k, senão 200k.
function lerFimDoArquivo(arquivo, bytes) {
  let fd;
  try {
    fd = fs.openSync(arquivo, 'r');
    const tam = fs.fstatSync(fd).size;
    const n = Math.min(tam, bytes);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, tam - n);
    return buf.toString('utf8');
  } catch (e) { return ''; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* já fechado */ } }
}

function usoAtual(sessao) {
  let uso = {};
  try { uso = JSON.parse(fs.readFileSync(path.join(DIR, '_uso.json'), 'utf8')); } catch (e) { /* statusLine ainda não rodou */ }
  let contexto = null;
  const reg = sessao && lerSessoes()[sessao.sessionId];
  const c = reg && reg.transcript ? contextoDoTranscript(lerFimDoArquivo(reg.transcript, 512 * 1024)) : null;
  if (c) {
    const janela = ((uso.janelas || {})[c.modelo]) || (c.tokens > 200000 ? 1000000 : 200000);
    contexto = { pct: Math.min(100, (c.tokens / janela) * 100), tokens: c.tokens, janela };
  }
  return { contexto, semanal: uso.semanal || null };
}

// Popup só na transição pra "travada", uma vez por episódio de cada sessão.
// O banner já mostra o estado; o popup é pra quem está em outra aba.
function iniciarAlertaTravamento() {
  const alertadas = new Set();
  return setInterval(() => {
    const s = sessaoAtual();
    const travada = s && s.estado === 'travada' ? s.sessionId : null;
    for (const id of alertadas) if (id !== travada) alertadas.delete(id);
    if (!travada || alertadas.has(travada)) return;
    alertadas.add(travada);
    vscode.window.showWarningMessage(
      `Symbiont: Claude Code was working and has had no signal for over ${s.limiteMin} min — it may be stuck.`,
      'Show Symbiont'
    ).then(escolha => {
      if (escolha) vscode.commands.executeCommand('workbench.view.extension.simbionte');
    });
  }, 60 * 1000);
}

function activate(context) {
  estadoGlobal = context.globalState;
  const provider = new SimbiontePainelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('simbionte.painel', provider)
  );
  const timer = iniciarAlertaTravamento();
  // Código da extensão novo instalado: o painel já se atualiza sozinho; os
  // hooks em ~/.claude também (arquivos empacotados novos). O resto do código
  // só carrega num reload — avisa, sem forçar.
  if (criarVigia) {
    const raizExt = context.extensionUri.fsPath;
    const vigiaCodigo = criarVigia(() => { try { return assinaturaDe(arquivosDeCodigo(path.join(raizExt, 'lib')).concat(path.join(raizExt, 'extension.js'))); } catch (e) { return null; } }, () => {
      const trocados = atualizarArquivosInstalados(context.extensionUri, lerSettings());
      vscode.window.showInformationMessage('Symbiont was updated. The panel already shows the new version' + (trocados.length ? ' and the hooks are updated' : '') + '; reload VS Code when convenient for the rest.', 'Reload now')
        .then(escolha => { if (escolha) vscode.commands.executeCommand('workbench.action.reloadWindow'); });
    });
    const vigiaTimer = setInterval(vigiaCodigo, 5000);
    context.subscriptions.push({ dispose: () => clearInterval(vigiaTimer) });
  }
  // Padrão de uso: 1ª varredura 5s depois de abrir (não atrasa a ativação), depois a cada 10 min.
  const primeiraVarredura = setTimeout(atualizarPadrao, 5000);
  const varreduras = setInterval(atualizarPadrao, 10 * 60 * 1000);
  context.subscriptions.push({ dispose: () => { clearTimeout(primeiraVarredura); clearInterval(varreduras); } });
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  context.subscriptions.push(
    vscode.commands.registerCommand('simbionte.instalarHooks', () => instalarHooks(context.extensionUri)),
    vscode.commands.registerCommand('simbionte.removerHooks', removerHooksCmd),
    vscode.commands.registerCommand('simbionte.mostrarPadrao', () => mostrarPadrao(context.extensionUri)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if ((e.affectsConfiguration('simbionte.stuckThresholdMinutes') || e.affectsConfiguration('simbionte.limiteTravadoMin')) && enviarAtual) enviarAtual();
    })
  );
  // Sem hooks o painel fica vazio pra sempre; com hooks da 1.0.x o watchdog
  // não distingue "esperando você" de "travou". Avisa uma vez por sessão.
  const settings = lerSettings();
  const trocados = atualizarArquivosInstalados(context.extensionUri, settings);
  if (trocados.length) {
    vscode.window.showInformationMessage(`Symbiont: updated ${trocados.join(', ')} in ${CLAUDE_DIR} to match this version.`);
  }
  const faltando = settings ? hooksFaltando(settings) : [];
  // statusLine livre só conta pra quem já instalou: o aviso de "não
  // instalado" já cobre quem não tem hook nenhum.
  const nenhum = faltando.length === hooksFaltando({}).length;
  if (faltando.length || (settings && !nenhum && statusLineFaltando(settings))) {
    vscode.window.showInformationMessage(
      nenhum ? 'Symbiont: Claude Code hooks are not installed yet.'
        : 'Symbiont: new hooks are available (usage meters, agent view) — update to get them.',
      nenhum ? 'Install now' : 'Update hooks')
      .then(escolha => { if (escolha) instalarHooks(context.extensionUri); });
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
