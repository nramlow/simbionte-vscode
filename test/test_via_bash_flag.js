// Self-check: atualizarProgresso grava viaBash=true quando origem='bash',
// pra o painel poder alertar de verdade em vez de só resincronizar em
// silêncio (era o comportamento antigo da trava da REGRA DE OURO).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
// Fonte do repo, não a cópia instalada em ~/.claude — testar a cópia deixa
// a fonte livre pra divergir sem ninguém perceber. Também destrava rodar
// esta suíte em qualquer máquina, não só na do autor.
// HOME temporário (igual test_heartbeat_alert.js): o painel instalado vigia
// ~/.claude/simbionte/ e, no Windows, lê o arquivo bem na hora do rename
// atômico seguinte (EPERM) — além de mostrar um projeto falso no painel.
// O env vem antes do require: store.js fixa o diretório ao carregar.
const homeTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-home-'));
process.env.HOME = homeTemp;
process.env.USERPROFILE = homeTemp;
const { resolverProjeto, atualizarProgresso, lerProjeto, viaBashNovo, comandoEscrevePlano } = require('../store.js');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-viabash-'));
execSync('git init -q', { cwd: tmpRoot });
const proj = resolverProjeto(tmpRoot);

try {
  atualizarProgresso(proj.id, proj.name, { percent: 50, completed: 1, total: 2, activeLabel: null, updatedAt: Date.now() }, proj.path, 'edit');
  assert.strictEqual(lerProjeto(proj.id).progress.viaBash, false, 'origem edit não deveria marcar viaBash');

  atualizarProgresso(proj.id, proj.name, { percent: 100, completed: 2, total: 2, activeLabel: null, updatedAt: Date.now() }, proj.path, 'bash');
  assert.strictEqual(lerProjeto(proj.id).progress.viaBash, true, 'origem bash deveria marcar viaBash pro painel alertar');

  // Falso alarme (2026-11-11): plano visto pela 1ª vez num Bash que só o
  // cita (cat, git add) acendia o aviso com 0 checkbox marcado — e um plano
  // reescrito por script (total mudou) também. Só conta checkbox marcado.
  const pr = (completed, total) => ({ percent: 0, completed, total, activeLabel: 'x', updatedAt: Date.now() });
  assert.strictEqual(viaBashNovo(null, pr(0, 134), 'bash'), false, '1ª vez via Bash, nada marcado: sem aviso');
  assert.strictEqual(viaBashNovo(null, pr(3, 10), 'bash'), true, '1ª vez via Bash já com item marcado: avisa');
  assert.strictEqual(viaBashNovo({ ...pr(2, 10), viaBash: false }, pr(2, 12), 'bash'), false, 'só o total mudou: não é checkbox marcado');
  assert.strictEqual(viaBashNovo({ ...pr(2, 10), viaBash: false }, pr(3, 10), 'bash'), true, 'marcou via Bash: avisa');
  assert.strictEqual(viaBashNovo({ ...pr(3, 10), viaBash: true }, pr(3, 10), 'bash'), true, 'Bash sem mudança mantém o aviso aceso');
  assert.strictEqual(viaBashNovo({ ...pr(0, 134), viaBash: true }, pr(0, 134), 'bash'), false, 'nada marcado apaga aviso velho (falso alarme gravado antes do fix)');
  assert.strictEqual(viaBashNovo({ ...pr(3, 10), viaBash: true }, pr(3, 10), 'edit'), false, 'Edit apaga');

  // Falso alarme (2026-11-11, governance-shell): um heredoc gravando a
  // descrição de um PR num arquivo de rascunho CITAVA o plano; a contagem
  // tinha mudado por Edits que o hook não viu, e a culpa caiu no comando.
  // Só conta como "via Bash" o comando que ESCREVE no plano.
  const P = 'D:/r/.worktrees/w/docs/superpowers/plans/2026-11-11-x.md';
  const escreve = c => comandoEscrevePlano(c);
  assert.strictEqual(escreve(`sed -i 's/- \\[ \\]/- [x]/' ${P}`), true);
  assert.strictEqual(escreve(`perl -pi -e 's/x/y/' ${P}`), true);
  assert.strictEqual(escreve(`echo "- [x] a" >> ${P}`), true);
  assert.strictEqual(escreve(`(Get-Content ${P}) -replace 'a','b' | Set-Content ${P}`), true);
  assert.strictEqual(escreve(`node -e "fs.writeFileSync('${P}', t)"`), true);
  assert.strictEqual(escreve(`cat > $S/pr.json <<'EOF'\n{"description": "plan ${P} 134/134"}\nEOF`), false, 'heredoc em outro arquivo só cita');
  assert.strictEqual(escreve(`git add ${P} && git commit -m "tick"`), false);
  assert.strictEqual(escreve(`grep -c '^- \\[x\\]' ${P}`), false);
  assert.strictEqual(escreve(`git worktree remove --force .worktrees/w`), false);
  // Origem "leitura" (Bash que só cita): contagem igual mantém o aviso; mudou
  // sem escrita vista (Edit fora do hook, git merge): não é culpa do Bash.
  assert.strictEqual(viaBashNovo({ ...pr(3, 10), viaBash: true }, pr(3, 10), 'leitura'), true);
  assert.strictEqual(viaBashNovo({ ...pr(3, 10), viaBash: false }, pr(9, 10), 'leitura'), false);
  assert.strictEqual(viaBashNovo({ ...pr(3, 10), viaBash: true }, pr(9, 10), 'leitura'), false);

  console.log('OK: atualizarProgresso marca viaBash quando origem é bash');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(homeTemp, { recursive: true, force: true });
}
