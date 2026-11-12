// Self-check: o rótulo "building:" diz ONDE no plano você está. Plano grande
// (Phase > Task > Step, só os Steps são checkbox) mostrava "Step 1: Write
// the failing test" — igual em toda Task. Agora leva Phase/Task dos títulos
// acima do próximo checkbox; título dentro de bloco de código não conta.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { progressoDoPlano } = require('../store.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simbionte-rotulo-'));
const planos = path.join(dir, 'docs', 'superpowers', 'plans');
fs.mkdirSync(planos, { recursive: true });
const rotulo = (nome, texto) => {
  const f = path.join(planos, nome);
  fs.writeFileSync(f, texto);
  return progressoDoPlano(f).activeLabel;
};

try {
  const grande = [
    '# Restrictive Recording Access Implementation Plan',
    '## Conventions (read before any task)',
    '# Phase 1 - Content only by explicit grant',
    '### Task 1: The `transcript` permission',
    '- [x] **Step 1: Write the failing test**',
    '```bash',
    '# Phase 9 - isto é comentário de shell, não título',
    'dotnet test',
    '```',
    '- [x] **Step 2: Run it to make sure it fails**',
    '### Task 2: Recognise upstream sessions',
    '- [ ] **Step 1: Write the failing test**',
    '# Phase 2 - Upstream wording',
    '### Task 3: Something',
    '- [ ] **Step 1: Later**',
  ].join('\n');
  assert.strictEqual(rotulo('a.md', grande), 'Phase 1 › Task 2 › Step 1: Write the failing test');

  const fase2 = grande.replace('- [ ] **Step 1: Write the failing test**', '- [x] **Step 1: Write the failing test**');
  assert.strictEqual(rotulo('b.md', fase2), 'Phase 2 › Task 3 › Step 1: Later', 'Phase nova zera a Task da fase anterior');

  const soTask = ['# Group Cards Plan', '### Task 4: Panel renders group cards', '- [ ] **Step 1: Write the failing test**'].join('\n');
  assert.strictEqual(rotulo('c.md', soTask), 'Task 4 › Step 1: Write the failing test', 'título do plano não entra');

  const semTitulos = ['# Watchdog com estados', '- [x] store.js pronto', '- [ ] teste real: instalar o .vsix'].join('\n');
  assert.strictEqual(rotulo('d.md', semTitulos), 'teste real: instalar o .vsix', 'sem Phase/Task: igual a antes');

  const faseSemTask = ['# Phase 3: Rollout', '- [ ] **Step 1: Ship**'].join('\n');
  assert.strictEqual(rotulo('e.md', faseSemTask), 'Phase 3 › Step 1: Ship');

  assert.strictEqual(progressoDoPlano(path.join(planos, 'b.md')).completed, 3, 'contagem não muda');

  assert.deepStrictEqual(progressoDoPlano(path.join(planos, 'a.md')).tarefas,
    { total: 3, feitas: 1, atual: { numero: 2, titulo: 'Recognise upstream sessions', passos: 1, feitos: 0 } }, 'Task 1 feita (2/2), atual = Task 2 com 1 passo');
  assert.deepStrictEqual(progressoDoPlano(path.join(planos, 'b.md')).tarefas.atual, { numero: 3, titulo: 'Something', passos: 1, feitos: 0 });
  assert.strictEqual(progressoDoPlano(path.join(planos, 'd.md')).tarefas, null, 'sem títulos Task: null');

  console.log('OK: rótulo do plano leva Phase/Task (título em bloco de código não conta)');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
