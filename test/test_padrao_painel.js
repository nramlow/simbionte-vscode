// Self-check: visão completa do padrão de uso (media/padrao.html) — duas
// grades dia da semana × hora (Claude e você), janela ativa e base. Roda o
// <script> de verdade numa VM com DOM mínimo.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'vscode-extension', 'media', 'padrao.html'), 'utf8');
const elementos = {};
const elemento = () => ({ innerHTML: '', textContent: '', hidden: false, style: {}, classList: { add() {}, remove() {}, toggle() {} } });
let ouvinte = null;
const ctx = {
  document: { getElementById: id => (elementos[id] = elementos[id] || elemento()) },
  window: { addEventListener: (tipo, fn) => { if (tipo === 'message') ouvinte = fn; } },
  acquireVsCodeApi: () => ({ postMessage() {} }),
  console, Date, Math, JSON,
};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);

const semana = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => ({ uso: d === 3 && h === 16 ? 100 : 10, msgs: h === 16 ? 2 : 0 })));
const dia = Array.from({ length: 24 }, (_, h) => ({ uso: 10, msgs: h === 16 ? 2 : 0 }));
ouvinte({ data: { type: 'padrao', dados: { semana, dia, semanas: 8, dias: 56, janela: { inicio: 8, fim: 6, pico: 16 }, horaAtual: 16, previsao: { projecao: 71, batida: null } } } });

const claude = elementos.gradeClaude.innerHTML, voce = elementos.gradeVoce.innerHTML;
assert.strictEqual((claude.match(/class="cel/g) || []).length, 168, '7 × 24 células (Claude)');
assert.strictEqual((voce.match(/class="cel/g) || []).length, 168, '7 × 24 células (você)');
assert.ok(claude.includes('title="Wed 4 PM'), 'célula diz dia e hora');
assert.ok(/Wed 4 PM[^"]*" style="opacity:1(\.0+)?"/.test(claude), 'célula mais forte em opacidade total');
assert.strictEqual(elementos.resumo.textContent, "You're usually active 8 AM–6 AM · busiest around 4 PM · from the last 56 days (8 weeks).");
assert.strictEqual(elementos.previsao.textContent, 'Weekly limit forecast from your usual hours: about 71% by reset.');

ouvinte({ data: { type: 'padrao', dados: { semana, dia, semanas: 8, dias: 56, janela: { inicio: 8, fim: 6, pico: 16 }, horaAtual: 16,
  previsao: { projecao: 113, batida: new Date(2026, 10, 13, 23, 0).getTime(), fator: 4.05, ritmo: { pctHora: 2.23, batida: new Date(2026, 10, 12, 16, 0).getTime() } } } } });
assert.strictEqual(elementos.previsao.textContent, "Weekly limit forecast from your usual hours, scaled to this week (4× your usual): you'd hit the limit around Fri 11:00 PM. At the last 6 hours' pace (2.2% an hour): Thu 4:00 PM.");

ouvinte({ data: { type: 'padrao', dados: null } });
assert.strictEqual(elementos.resumo.textContent, 'Still learning: no transcripts read yet.');

console.log('OK: visão completa do padrão (grades, resumo, previsão)');
