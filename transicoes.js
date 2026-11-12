// Notificação de SO só na TRANSIÇÃO (plano bateu 100%, ou um checkbox foi
// fechado via Bash) — nunca a cada poll de 5s, senão vira spam. Achado
// 2026-11-11: o último estado conhecido ficava só em memória, então todo
// reload do VS Code renotificava cada plano já concluído. Agora a extensão
// salva `conhecidos` no globalState; esta função é pura pra ser testável.
//
// conhecidos: { [projectId]: { percent, viaBash } } salvo, ou undefined na
// primeira vez (aí só aprende, sem notificar).
function transicoes(conhecidos, projetos) {
  const primeiraVez = conhecidos == null;
  const novos = { ...(conhecidos || {}) };
  const avisos = [];
  let mudou = primeiraVez;
  for (const p of projetos) {
    const anterior = novos[p.projectId] || {};
    const percent = p.progress ? p.progress.percent : null;
    const viaBash = !!(p.progress && p.progress.viaBash);
    if (!primeiraVez) {
      if (percent === 100 && anterior.percent !== 100) avisos.push({ tipo: 'concluido', nome: p.projectName });
      if (viaBash && !anterior.viaBash) avisos.push({ tipo: 'viaBash', nome: p.projectName });
    }
    if (anterior.percent !== percent || !!anterior.viaBash !== viaBash) mudou = true;
    novos[p.projectId] = { percent, viaBash };
  }
  return { avisos, conhecidos: novos, mudou };
}

module.exports = { transicoes };
