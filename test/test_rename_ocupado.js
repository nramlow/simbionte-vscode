// Self-check: no Windows, o rename atômico do store falha com EPERM se
// outro processo estiver com o .json aberto naquele instante — e o painel
// instalado lê esses arquivos a cada mudança. O hook engolia o erro e o
// update se perdia (sobrava um <projeto>.json.tmp órfão). Aqui um processo
// separado segura o arquivo aberto por um instante, como o painel faz, e a
// escrita tem que passar mesmo assim.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// HOME temporário antes do require: store.js fixa o diretório ao carregar.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-ocupado-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const { registrarToque, lerProjeto } = require('../store.js');

const PROJ = '_teste_rename_ocupado';
const alvo = path.join(home, '.claude', 'simbionte', `${PROJ}.json`);
registrarToque(PROJ, PROJ, 'C:/x');
const antes = lerProjeto(PROJ).lastTouch;

const leitor = spawn(process.execPath, ['-e',
  `const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(alvo)}, 'r');
   process.stdout.write('aberto'); setTimeout(() => fs.closeSync(fd), 60);`]);

leitor.stdout.once('data', () => {
  try {
    const fim = Date.now() + 5;
    while (Date.now() < fim) { /* garante lastTouch diferente */ }
    assert.doesNotThrow(() => registrarToque(PROJ, PROJ, 'C:/x'), 'rename com o arquivo aberto por outro processo não pode perder o update');
    assert.ok(lerProjeto(PROJ).lastTouch > antes, 'o .json deveria ter o lastTouch novo');
    assert.ok(!fs.existsSync(`${alvo}.tmp`), 'não pode sobrar .tmp órfão');
    console.log('OK: escrita atômica sobrevive a um leitor segurando o arquivo (EPERM no Windows)');
  } finally {
    leitor.on('exit', () => fs.rmSync(home, { recursive: true, force: true }));
  }
});
