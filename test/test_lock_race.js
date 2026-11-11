// Self-check: 2 processos registrando atividade quase ao mesmo tempo pro
// mesmo projeto nao devem se pisar (bug da auditoria: ler->mesclar->escrever
// sem lock perdia update). Roda de verdade com 2 processos node separados.
// Usa o store.js do repo num HOME temporario (igual test_heartbeat_alert.js):
// testar a copia instalada em ~/.claude quebrava em maquina sem os hooks e
// sujava o estado real do usuario.
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-lock-'));
// os.homedir() le USERPROFILE no Windows e HOME no resto; os filhos herdam.
process.env.HOME = home;
process.env.USERPROFILE = home;

const PROJ = '_teste_lock_race';
const alvo = path.join(home, '.claude', 'simbionte', `${PROJ}.json`);
const storePath = path.join(__dirname, '..', 'store.js');
const script = (n) => `
const { registrarAtividade } = require(${JSON.stringify(storePath)});
registrarAtividade('${PROJ}', '${PROJ}', { file: 'arquivo${n}.js', path: 'C:/x/arquivo${n}.js', tool: 'Write', ts: Date.now() });
`;

const filhos = [1, 2].map(n => {
  const p = spawn(process.execPath, ['-e', script(n)]);
  p.stderrTexto = '';
  p.stderr.on('data', c => p.stderrTexto += c);
  return p;
});

let pendentes = filhos.length;
function checarFim() {
  pendentes--;
  if (pendentes > 0) return;
  try {
    // Filho que morreu antes de escrever viraria um ENOENT enganoso abaixo.
    for (const p of filhos) assert.strictEqual(p.exitCode, 0, `processo filho falhou:\n${p.stderrTexto}`);
    const dados = JSON.parse(fs.readFileSync(alvo, 'utf8'));
    assert.strictEqual(dados.activity.length, 2, `esperava 2 atividades registradas, achou ${dados.activity.length} — update perdido pela corrida`);
    console.log('OK: 2 escritas quase simultaneas nao se perderam (lock funcionou)');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}
filhos.forEach(p => p.on('close', checarFim));
