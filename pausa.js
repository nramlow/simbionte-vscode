// Pausar / retomar as sessões de um projeto pelo painel (pedido do Nik,
// 2026-11-12): ele recarrega a janela do Communication-Intelligence pra ver
// o Symbiont novo, e as tarefas e agentes de lá são muito longos. A mensagem
// vai pela inbox da sessão (o mesmo canal do ditado do Claude TV): sessão
// parada começa um turno com ela, sessão trabalhando lê entre uma ferramenta
// e outra. Os hooks garantem a pausa (store.bloqueioPausa).
const net = require('net');
const path = require('path');

function dentroDe(filho, pai) {
  if (!filho || !pai) return false;
  const rel = path.relative(path.resolve(pai).toLowerCase(), path.resolve(filho).toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Sessões das linhas escolhidas: as que trabalham dentro da pasta (o checkout
// principal pega os worktrees, que ficam dentro dele) e as donas dos agentes
// listados na linha. Sessão encerrada fica de fora.
function alvos(projetos, sessoes) {
  const ids = new Set();
  for (const p of projetos) {
    for (const [id, reg] of Object.entries(sessoes || {})) {
      if (reg.evento !== 'SessionEnd' && dentroDe(reg.cwd, p.projectPath)) ids.add(id);
    }
    for (const a of p.agentes || []) {
      const reg = sessoes && sessoes[a.sessao];
      if (reg && reg.evento !== 'SessionEnd') ids.add(a.sessao);
    }
  }
  return [...ids];
}

// Pausado = turno terminou (Stop/Notification, ou recém-aberta depois do
// reload) e nada mais rodando: nem agente, nem comando em segundo plano.
function estadoPausa(reg, agentesVivos, shellsRodando) {
  const parou = reg && ['Stop', 'Notification', 'SessionStart', 'SessionEnd'].includes(reg.evento);
  return parou && !agentesVivos && !shellsRodando ? 'pausado' : 'pausando';
}

const mensagemPausa = pasta => `Nik pressed Pause in Symbiont for ${pasta} (he wants to reload VS Code). `
  + 'Start nothing new: no new task, review, agent or background command. Let work that is already running finish '
  + "(the agents' current steps, test runs, commits), then stop and say where you are and what is next. Wait for Nik to resume.";
const MENSAGEM_RETOMA = 'Nik pressed Resume in Symbiont: continue where you left off.';

// Formato da inbox do Claude Code: JSON por linha, auth primeiro (exigido no
// Windows), depois a mensagem. false se a sessão não tem inbox conhecida ou
// sumiu (pipe inexistente) — nunca lança.
function enviar(inbox, de, texto) {
  return new Promise(resolve => {
    if (!inbox || !inbox.socket || !inbox.token) return resolve(false);
    const linhas = [JSON.stringify({ type: 'auth', token: inbox.token }),
      JSON.stringify({ type: 'user', from: de, message: { content: texto } })];
    let pronto = false;
    const fim = ok => { if (!pronto) { pronto = true; clearTimeout(timer); resolve(ok); } };
    const sock = net.connect(inbox.socket);
    const timer = setTimeout(() => { sock.destroy(); fim(false); }, 3000);
    sock.once('error', () => fim(false));
    sock.once('connect', () => sock.end(linhas.map(l => l + '\n').join('')));
    sock.once('close', erro => fim(!erro));
  });
}

module.exports = { alvos, estadoPausa, mensagemPausa, MENSAGEM_RETOMA, enviar };
