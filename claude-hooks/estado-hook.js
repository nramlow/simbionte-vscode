#!/usr/bin/env node
// Hook de ESTADO da sessão pro watchdog do Simbionte. Um script só, registrado
// em vários eventos (SessionStart, PreToolUse/PostToolUseFailure com matcher
// Bash, Notification, Stop, UserPromptSubmit, SessionEnd) — o nome do evento
// vem no próprio payload (hook_event_name), então não precisa de um arquivo
// por evento. Também guarda a inbox da sessão (pausar/retomar pelo painel).
//
// Só escreve em stdout pra negar, no PreToolUse, um comando em segundo plano
// numa sessão pausada. Fora isso nunca: no UserPromptSubmit, stdout vira
// contexto do Claude; no Stop, uma saída errada poderia bloquear o fim da
// resposta.
const { registrarHeartbeat, lerPausa, bloqueioPausa } = require('./simbionte-store');

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    // Falha de Bash fecha o comando igual a um PostToolUse — senão a sessão
    // ficaria "executando comando" até o próximo evento.
    const evento = data.hook_event_name === 'PostToolUseFailure' ? 'PostToolUse' : data.hook_event_name;
    const motivo = evento === 'PreToolUse' && bloqueioPausa(data, lerPausa());
    if (motivo) {
      const saida = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } };
      return process.stdout.write(JSON.stringify(saida), () => process.exit(0));
    }
    if (evento) registrarHeartbeat(evento, data);
  } catch (e) { /* payload inválido — ignora, hook nunca pode quebrar a sessão */ }
  process.exit(0);
});
