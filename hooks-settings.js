// Registro/remoção dos hooks do Simbionte no settings.json do Claude Code.
// Puro (recebe e devolve o objeto settings, sem disco nem vscode) pra ser
// testável; quem lê/grava o arquivo e faz o backup é o extension.js.
const path = require('path');

// evento -> matcher -> arquivo. Sem matcher = todos (e eventos como Stop e
// SessionEnd nem aceitam matcher).
const HOOKS = [
  { evento: 'PostToolUse', matcher: 'TodoWrite', file: 'progress-hook.js' },
  { evento: 'PostToolUse', matcher: 'Edit|Write|Bash', file: 'activity-hook.js' },
  { evento: 'PreToolUse', matcher: 'Bash', file: 'estado-hook.js' },
  { evento: 'PostToolUseFailure', matcher: 'Bash', file: 'estado-hook.js' },
  { evento: 'Notification', file: 'estado-hook.js' },
  { evento: 'Stop', file: 'estado-hook.js' },
  { evento: 'UserPromptSubmit', file: 'estado-hook.js' },
  { evento: 'SessionEnd', file: 'estado-hook.js' },
  { evento: 'SessionStart', file: 'estado-hook.js' },
  { evento: 'PreToolUse', matcher: 'Agent', file: 'agentes-hook.js' },
  { evento: 'SubagentStart', file: 'agentes-hook.js' },
  { evento: 'SubagentStop', file: 'agentes-hook.js' },
  { evento: 'Stop', file: 'agentes-hook.js' },
];
// statusLine: única fonte do limite semanal pros medidores de uso. É um só
// por usuário — só ocupamos se estiver vazio (ou se for a sonda temporária
// de 2026-11-11), nunca trocamos o de outra pessoa.
const STATUSLINE = 'simbionte-statusline.js';
// Arquivos que o Simbionte copia pra ~/.claude (hooks + statusLine + store).
const ARQUIVOS = [...new Set(HOOKS.map(h => h.file)), STATUSLINE, 'simbionte-store.js'];

const comandoStatusLine = s => String((s && s.statusLine && s.statusLine.command) || '');
function statusLineFaltando(settings) {
  const c = comandoStatusLine(settings);
  return !c || c.includes('simbionte-statusline-probe.js');
}

// Por evento + arquivo, ignorando o matcher: quem instalou à mão com um
// matcher diferente (ex. "Edit|Write|Bash|MultiEdit") não ganha duplicata.
function jaTem(settings, h) {
  const entradas = (settings && settings.hooks && settings.hooks[h.evento]) || [];
  return entradas.some(e => (e.hooks || []).some(x => String(x.command || '').includes(h.file)));
}

function hooksFaltando(settings) {
  return HOOKS.filter(h => !jaTem(settings, h));
}

// Acrescenta só o que falta (idempotente). Não toca em hooks de terceiros.
function adicionarHooks(settings, claudeDir) {
  settings.hooks = settings.hooks || {};
  for (const h of hooksFaltando(settings)) {
    const entrada = { hooks: [{ type: 'command', command: `node "${path.join(claudeDir, h.file)}"`, timeout: 3 }] };
    if (h.matcher) entrada.matcher = h.matcher;
    (settings.hooks[h.evento] = settings.hooks[h.evento] || []).push(entrada);
  }
  if (statusLineFaltando(settings)) {
    settings.statusLine = { type: 'command', command: `node "${path.join(claudeDir, STATUSLINE)}"` };
  }
  return settings;
}

// Tira todo comando que cita um arquivo do Simbionte, em qualquer evento.
// Entrada que fica sem hook some; evento que fica vazio some. O resto
// (hooks de outras ferramentas) fica exatamente como estava.
function removerHooks(settings) {
  if (settings && comandoStatusLine(settings).includes(STATUSLINE)) delete settings.statusLine;
  if (!settings || !settings.hooks) return settings;
  const nosso = x => ARQUIVOS.some(f => String(x.command || '').includes(f));
  for (const evento of Object.keys(settings.hooks)) {
    const entradas = (settings.hooks[evento] || [])
      .map(e => ({ ...e, hooks: (e.hooks || []).filter(x => !nosso(x)) }))
      .filter(e => e.hooks.length);
    if (entradas.length) settings.hooks[evento] = entradas;
    else delete settings.hooks[evento];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  return settings;
}

// Quais arquivos instalados em ~/.claude diferem da versão empacotada
// (conteúdo por arquivo; null = não existe). Antes, atualizar a extensão não
// atualizava os hooks: fix no store só chegava a quem rodasse "Install
// hooks" de novo. Só vale pra quem já instalou (algum hook nosso no
// settings.json) — quem nunca instalou ou removeu não ganha arquivo sozinho.
function arquivosDesatualizados(settings, empacotado, instalado) {
  if (hooksFaltando(settings).length === HOOKS.length) return [];
  return ARQUIVOS.filter(f => empacotado[f] != null && empacotado[f] !== instalado[f]);
}

module.exports = { HOOKS, ARQUIVOS, hooksFaltando, adicionarHooks, removerHooks, arquivosDesatualizados, statusLineFaltando };
