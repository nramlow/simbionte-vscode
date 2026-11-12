#!/usr/bin/env node
// Hook dos AGENTES pro painel do Symbiont: PreToolUse (matcher Agent),
// SubagentStart, SubagentStop e Stop. Guarda quais subagentes estão vivos em
// cada sessão (~/.claude/simbionte/_agentes.json), com a descrição que liga
// cada um a um worktree e a uma Task. Arquivo separado do estado-hook porque
// o registro de hooks identifica por evento + arquivo.
//
// Nunca escreve em stdout: no Stop, uma saída errada poderia bloquear o fim
// da resposta.
const { registrarEventoAgente } = require('./simbionte-store');

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  try { registrarEventoAgente(JSON.parse(input)); }
  catch (e) { /* payload inválido — hook nunca pode quebrar a sessão */ }
  process.exit(0);
});
