// Instalar/remover hooks no settings.json: idempotente, não duplica quem veio
// da 1.0.x e nunca mexe em hook de outra ferramenta.
const assert = require('assert');
const { HOOKS, ARQUIVOS, hooksFaltando, adicionarHooks, removerHooks, arquivosDesatualizados } = require('../hooks-settings.js');

const DIR = '/home/x/.claude';
const terceiro = { matcher: '', hooks: [{ type: 'command', command: 'node "/home/x/.claude/usage-warn-hook.js"' }] };
const clone = o => JSON.parse(JSON.stringify(o));

// Instalação limpa, preservando o hook de terceiro no mesmo evento.
const s = adicionarHooks({ model: 'opus', hooks: { UserPromptSubmit: [clone(terceiro)] } }, DIR);
assert.strictEqual(hooksFaltando(s).length, 0);
assert.strictEqual(s.model, 'opus');
assert.deepStrictEqual(s.hooks.UserPromptSubmit[0], terceiro, 'hook de terceiro intacto');
assert.ok(!('matcher' in s.hooks.Stop[0]), 'Stop não aceita matcher');
assert.strictEqual(s.hooks.PreToolUse[0].matcher, 'Bash');

// Rodar de novo não duplica nada.
const antes = JSON.stringify(s);
assert.strictEqual(JSON.stringify(adicionarHooks(s, DIR)), antes, 'segunda instalação é no-op');

// Quem veio da 1.0.x (só PostToolUse, matcher editado à mão) ganha só o que falta.
const v10 = { hooks: { PostToolUse: [
  { matcher: 'TodoWrite', hooks: [{ type: 'command', command: 'node "/home/x/.claude/progress-hook.js"' }] },
  { matcher: 'Edit|Write|Bash|MultiEdit', hooks: [{ type: 'command', command: 'node "/home/x/.claude/activity-hook.js"' }] },
] } };
assert.strictEqual(hooksFaltando(v10).length, HOOKS.length - 2);
adicionarHooks(v10, DIR);
assert.strictEqual(v10.hooks.PostToolUse.length, 2, 'não duplica os hooks antigos');
assert.strictEqual(hooksFaltando(v10).length, 0);

// Remoção: só sobra o que é de terceiro; eventos vazios somem.
const r = removerHooks(clone(s));
assert.deepStrictEqual(r.hooks, { UserPromptSubmit: [terceiro] });
assert.strictEqual(r.model, 'opus');
// Entrada mista (nosso + terceiro no mesmo bloco): tira só o nosso.
const misto = { hooks: { Stop: [{ hooks: [{ command: 'node "/h/.claude/estado-hook.js"' }, { command: 'say done' }] }] } };
assert.deepStrictEqual(removerHooks(misto).hooks.Stop[0].hooks, [{ command: 'say done' }]);
// Tudo nosso: a chave hooks some por completo.
assert.ok(!('hooks' in removerHooks(adicionarHooks({}, DIR))));

// Extensão atualizada: troca só os arquivos instalados que mudaram, e só pra
// quem já instalou. Quem nunca instalou ou removeu não ganha arquivo nenhum.
const empacotado = Object.fromEntries(ARQUIVOS.map(a => [a, 'v2 ' + a]));
const instalado = { ...empacotado, 'simbionte-store.js': 'v1', 'estado-hook.js': null };
assert.deepStrictEqual(arquivosDesatualizados(s, empacotado, instalado).sort(), ['estado-hook.js', 'simbionte-store.js'],
  'instalado: troca o que mudou e repõe o que sumiu');
assert.deepStrictEqual(arquivosDesatualizados(s, empacotado, empacotado), [], 'tudo igual: nada a fazer');
assert.deepStrictEqual(arquivosDesatualizados({}, empacotado, instalado), [], 'nunca instalou: não instala sozinho');
assert.deepStrictEqual(arquivosDesatualizados(removerHooks(clone(s)), empacotado, instalado), [], 'removeu: não reinstala');
assert.deepStrictEqual(arquivosDesatualizados(null, empacotado, instalado), [], 'settings.json inválido: não mexe');
const parcial = { hooks: { PostToolUse: [{ matcher: 'TodoWrite', hooks: [{ command: 'node "/h/.claude/progress-hook.js"' }] }] } };
assert.deepStrictEqual(arquivosDesatualizados(parcial, empacotado, { ...empacotado, 'progress-hook.js': 'v1' }), ['progress-hook.js'],
  'instalação parcial (1.0.x) também recebe os arquivos novos');
assert.deepStrictEqual(arquivosDesatualizados(s, { ...empacotado, 'activity-hook.js': null }, instalado).includes('activity-hook.js'), false,
  'sem a cópia empacotada (rodando do repo sem prepare.js), não apaga nada');

console.log('OK: instalar/remover hooks no settings.json');
