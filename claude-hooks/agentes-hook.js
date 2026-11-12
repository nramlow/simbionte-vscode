#!/usr/bin/env node
// Hook dos AGENTES pro painel do Symbiont: PreToolUse (matcher Agent),
// SubagentStart, SubagentStop e Stop. Guarda quais subagentes estão vivos em
// cada sessão (~/.claude/simbionte/_agentes.json), com a descrição que liga
// cada um a um worktree e a uma Task. Arquivo separado do estado-hook porque
// o registro de hooks identifica por evento + arquivo.
//
// Pausa (2026-11-12): sessão pausada pelo painel não começa agente novo — o
// PreToolUse devolve "deny" com o motivo, que o modelo lê. Fora isso nunca
// escreve em stdout: no Stop, uma saída errada poderia bloquear o fim da
// resposta.
const { registrarEventoAgente, lerPausa, bloqueioPausa } = require('./simbionte-store');

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  let data = null;
  try { data = JSON.parse(input); } catch (e) { return process.exit(0); /* payload inválido */ }
  try {
    const motivo = data.hook_event_name === 'PreToolUse' && bloqueioPausa(data, lerPausa());
    if (motivo) {
      const saida = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } };
      return process.stdout.write(JSON.stringify(saida), () => process.exit(0));
    }
    registrarEventoAgente(data);
  } catch (e) { /* hook nunca pode quebrar a sessão */ }
  process.exit(0);
});
