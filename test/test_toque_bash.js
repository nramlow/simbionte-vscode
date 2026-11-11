// Self-check: Bash genérico (sem file_path, sem referenciar plano nenhum)
// precisa contar como "você tá ativo aqui" — antes disso o hook dava
// return antes de resolver o projeto, e a bolinha de status ficava
// vermelha mesmo com o usuário trabalhando via comandos o tempo todo.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// Fonte do repo num HOME temporário (igual test_heartbeat_alert.js), não a
// cópia instalada em ~/.claude — testar a cópia deixa a fonte livre pra
// divergir, quebra em máquina sem os hooks instalados e suja o estado real.
// O env vem antes do require: store.js fixa o diretório ao carregar.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-toque-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const claude = path.join(home, '.claude');
fs.mkdirSync(claude, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'claude-hooks', 'activity-hook.js'), path.join(claude, 'activity-hook.js'));
fs.copyFileSync(path.join(__dirname, '..', 'store.js'), path.join(claude, 'simbionte-store.js'));
const HOOK = path.join(claude, 'activity-hook.js');

const { resolverProjeto, lerProjeto } = require('../store.js');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-toque-'));
execSync('git init -q', { cwd: tmpRoot });
const proj = resolverProjeto(tmpRoot);

try {
  const payload = JSON.stringify({ tool_name: 'Bash', cwd: tmpRoot, tool_input: { command: 'docker compose start odoo' } });
  execFileSync(process.execPath, [HOOK], { input: payload });

  const depois = lerProjeto(proj.id);
  assert.ok(depois, 'esperava projeto resolvido por cwd, mesmo sem file_path');
  assert.ok(typeof depois.lastTouch === 'number' && Date.now() - depois.lastTouch < 5000, 'lastTouch deveria estar recente');
  assert.strictEqual((depois.activity || []).length, 0, 'Bash sem arquivo não deveria virar "atividade" de arquivo fake');

  console.log('OK: Bash genérico registra lastTouch (recência), sem poluir activity');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
}
