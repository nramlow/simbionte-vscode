# Watchdog com estados (Simbionte 1.1.0)

Objetivo: parar os falsos alarmes de "travou". Hoje só `PostToolUse` alimenta o
heartbeat, então esperar o usuário, rodar um comando longo ou encerrar a sessão
vira "travou" depois de 15 min.

- [x] store.js: heartbeat por sessão (`registrarHeartbeat(evento, data)`) + `estadoDaSessao` / `resumoSessoes` puros
- [x] claude-hooks/estado-hook.js: PreToolUse(Bash), PostToolUseFailure(Bash), Notification, Stop, UserPromptSubmit, SessionEnd
- [x] activity-hook.js grava evento PostToolUse com session_id
- [x] hooks-settings.js: HOOKS por evento, registro idempotente, .bak só na 1ª vez, remoção
- [x] extension.js: estado por sessão, setting simbionte.limiteTravadoMin, comando removerHooks, aviso de hooks desatualizados
- [x] build.html: banner/linha de estado com texto vindo da extensão
- [x] testes: estados + instalar/remover; test-all verde (exceto insights-paridade, que já falhava antes: depende dos repos locais)
- [x] README (dor, PT/EN, eventos, remoção) + CHANGELOG 1.1.0 + versão
- [x] teste real: instalar o .vsix, Atualizar hooks, ver os estados (sleep 120 / permissão / exit) — 2026-11-11, fork Symbiont 1.2.0: 8/8 hooks no settings.json; _heartbeat.json real mostra comando/trabalhando/encerrada. Pedido de permissão não observado (sessão em bypass).
- [x] commit + push + publicar 1.1.0 no Marketplace (92acf0e; .vsix enviado pelo site em 25/09)
- [x] build.html: centralizar `.sessao-linha` e dar respiro sob o anel (`margin:var(--sp-2) 0 var(--sp-3);text-align:center`); já aplicado no interno — aplicado no fork em 2026-11-11

Fork Symbiont (2026-11-11): removidos 3 itens de divulgação do upstream que
eram do Oscar (GIF, Open VSX na conta dele, escolha de publisher); não se
aplicam a este fork.
