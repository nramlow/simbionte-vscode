#!/usr/bin/env node
// PostToolUse hook (matcher: Edit|Write|Bash) — grava arquivo tocado e
// recalcula progresso de plano (- [ ]/- [x]) pro Simbionte, em disco.
//
// REGRA DE OURO (2026-08-26): nunca deixar o Simbionte desatualizado por eu
// ter editado um plano via Bash/script em vez de Edit/Write — esta trava
// cobre esse caso (busca o caminho de um plano no texto do comando Bash).
const path = require('path');
const { resolverProjeto, resolverProjetoAtivo, atualizarProgresso, registrarAtividade, registrarHeartbeat, progressoDoPlano, projetosExtrasDoPlano, registrarToque, comandoEscrevePlano, copiaMaisNovaDoPlano } = require('./simbionte-store');

function extrairPlanoDoComandoBash(comando) {
  if (!comando) return null;
  const match = comando.match(/[^\s"'`]*docs[\\/]superpowers[\\/]plans[\\/][^\s"'`]*\.md/i);
  return match ? match[0] : null;
}

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    registrarHeartbeat('PostToolUse', data);
    const fileDireto = data.tool_input?.file_path;
    // Plano citado num comando: caminho relativo resolve pela pasta da sessão,
    // e se o trabalho dele está num worktree (cópia mais nova), vale a do
    // worktree — achado 2026-11-12, main checkout com 0/105 da cópia velha.
    const citado = !fileDireto && extrairPlanoDoComandoBash(data.tool_input?.command);
    const filePlano = fileDireto || (citado && copiaMaisNovaDoPlano(path.resolve(data.cwd || process.cwd(), citado)));

    // Bash genérico (docker, script de verificação, etc.) não tem
    // file_path nem referencia um plano — antes disso era "return" direto
    // sem registrar nada. Agora resolve por cwd (igual progress-hook.js já
    // fazia pro TodoWrite) pra pelo menos contar como "você tá ativo aqui".
    const proj = (filePlano && resolverProjeto(filePlano))
      || resolverProjetoAtivo(data.cwd || process.cwd());
    if (!proj) return process.exit(0);

    registrarToque(proj.id, proj.name, proj.path);

    // Arquivo fora do projeto (memória da sessão em ~/.claude, etc.) não é
    // atividade dele — só o toque acima (achado 2026-11-12, linha "ui").
    const dentro = fileDireto && proj.path && !path.relative(proj.path, path.resolve(fileDireto)).startsWith("..") && !path.isAbsolute(path.relative(proj.path, path.resolve(fileDireto)));
    if (dentro) {
      registrarAtividade(proj.id, proj.name, {
        file: path.basename(fileDireto), path: path.resolve(fileDireto), tool: data.tool_name || '?', ts: Date.now(),
      }, proj.path);
    }
    if (filePlano) {
      const progresso = progressoDoPlano(filePlano);
      if (progresso) {
        // Bash só é 'bash' (aviso da REGRA DE OURO) quando ESCREVE no plano;
        // só citá-lo (git add, heredoc, grep) é 'leitura' — achado 2026-11-11.
        const origem = fileDireto ? 'edit' : (comandoEscrevePlano(data.tool_input?.command) ? 'bash' : 'leitura');
        atualizarProgresso(proj.id, proj.name, progresso, proj.path, origem);
        // Plano que cobre mais de um repo: mesmo progresso nos outros projetos.
        projetosExtrasDoPlano(filePlano).forEach(p => {
          if (p.id !== proj.id) atualizarProgresso(p.id, p.name, progresso, p.path, origem);
        });
      }
    }
  } catch (e) { /* payload inválido ou projeto não reconhecido — ignora */ }
  process.exit(0);
});
