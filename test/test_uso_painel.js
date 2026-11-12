// Self-check: medidores de uso no rodapé do painel (contexto e semanal).
// Roda o <script> de media/build.html numa VM com DOM mínimo.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'vscode-extension', 'media', 'build.html'), 'utf8');
assert.ok(html.includes('id="medContexto"') && html.includes('id="medSemanal"'), 'os dois medidores existem no HTML');
const elementos = {};
let estadoWebview = null;
const elemento = () => {
  const classes = new Set();
  return {
    innerHTML: '', textContent: '', hidden: false, title: '', style: {}, dataset: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) },
    addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, focus() {},
  };
};
const ctx = {
  document: {
    getElementById: id => (elementos[id] = elementos[id] || elemento()),
    createElementNS: () => elemento(), createElement: () => elemento(),
    querySelector: () => null, querySelectorAll: () => [],
  },
  window: { addEventListener() {} },
  acquireVsCodeApi: () => ({ getState: () => estadoWebview, setState: s => { estadoWebview = s; }, postMessage() {} }),
  CSS: { escape: s => s },
  console, Date, Math, JSON, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);

const agora = Date.now();
const sabado = new Date(2026, 10, 14, 9, 0).getTime();
ctx.renderUso({ contexto: { pct: 41, tokens: 412345, janela: 1000000 }, semanal: { pct: 58, resetsAt: sabado, ts: agora - 60000 } });
assert.strictEqual(elementos.medContextoPct.textContent, '41%');
assert.strictEqual(elementos.medContextoSub.textContent, '412k / 1M');
assert.strictEqual(elementos.medSemanalPct.textContent, '58%');
assert.strictEqual(elementos.medSemanalSub.textContent, 'resets Sat 9:00 AM');
assert.ok(!elementos.medSemanal.classList.contains('alto'));

ctx.renderUso({ contexto: { pct: 96, tokens: 192000, janela: 200000 }, semanal: { pct: 83, resetsAt: sabado, ts: agora - 3 * 3600000 } });
assert.strictEqual(elementos.medContextoSub.textContent, '192k / 200k');
assert.ok(elementos.medContexto.classList.contains('critico'), '≥95%: vermelho');
assert.ok(elementos.medSemanal.classList.contains('alto') && !elementos.medSemanal.classList.contains('critico'), '≥80%: âmbar');
assert.strictEqual(elementos.medSemanalSub.textContent, 'resets Sat 9:00 AM · as of 3h ago', 'dado velho diz a idade');

// Leitura estimada (statusLine/API velhos; padrao.estimativa na extensão).
ctx.renderUso({ contexto: null, semanal: { pct: 78.2, resetsAt: sabado, ts: agora, estimado: true, lido: { pct: 58, ts: agora - 9 * 3600000 } } });
assert.strictEqual(elementos.medSemanalPct.textContent, '~78%', 'estimativa marcada com ~');
assert.strictEqual(elementos.medSemanalSub.textContent, 'est. from 58% 9h ago · resets Sat 9:00 AM');

ctx.renderUso({ contexto: null, semanal: null });
assert.strictEqual(elementos.medContextoPct.textContent, '–');
assert.strictEqual(elementos.medContextoSub.textContent, 'no session yet');
assert.strictEqual(elementos.medSemanalPct.textContent, '–');
assert.strictEqual(elementos.medSemanalSub.textContent, 'run Claude in a terminal');
ctx.renderUso(undefined);
assert.strictEqual(elementos.medSemanalPct.textContent, '–', 'extensão antiga sem uso: não quebra');

// Ritmo da semana ("On track" do Claude): projeção linear do uso desde o
// início da janela (reset − 7 dias), calculada na hora da LEITURA.
const H = 3600000;
const reset = new Date(2026, 10, 14, 9, 0).getTime();
const ini = reset - 168 * H;
const leitura = (pct, horas) => ({ pct, resetsAt: reset, ts: ini + horas * H });
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.ritmoSemanal(leitura(58, 104.9)))), { estado: 'ok', projecao: 93 }, '58% com 62% da semana: ~93% no reset');
assert.strictEqual(ctx.ritmoSemanal(leitura(30, 84)).projecao, 60);
const estouro = ctx.ritmoSemanal(leitura(80, 84));
assert.strictEqual(estouro.estado, 'estoura');
assert.strictEqual(estouro.batida, ini + 105 * H, '80% na metade: bate 100% com 105h de semana');
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.ritmoSemanal(leitura(2, 5)))), { estado: 'cedo' }, 'começo da semana: pouco dado');
assert.strictEqual(ctx.ritmoSemanal(null), null);

ctx.renderUso({ contexto: null, semanal: leitura(30, 84) });
assert.strictEqual(elementos.ritmo.textContent, 'On track · about 60% by reset');
assert.ok(!elementos.ritmo.classList.contains('alto'));
ctx.renderUso({ contexto: null, semanal: leitura(58, 104.9) });
assert.ok(elementos.ritmo.classList.contains('alto'), 'acima de 90% projetado: âmbar');
ctx.renderUso({ contexto: null, semanal: leitura(80, 84) });
assert.strictEqual(elementos.ritmo.textContent, 'Ahead of pace · limit around Wed 6:00 PM', 'Sáb 9h + 105h = Qua 18h');
assert.ok(elementos.ritmo.classList.contains('critico'));
ctx.renderUso({ contexto: null, semanal: null });
assert.strictEqual(elementos.ritmo.hidden, true, 'sem dado semanal: some');

// Padrão de uso: faixas de 24h (Claude / você) e previsão pelo padrão.
const diaP = Array.from({ length: 24 }, (_, h) => ({ uso: h === 12 ? 50 : 10, msgs: h === 16 ? 3 : (h >= 8 || h < 6 ? 1 : 0) }));
const padrao = { dia: diaP, janela: { inicio: 8, fim: 6, pico: 16 }, horaAtual: 16, semanas: 8, dias: 56, previsao: { projecao: 71, batida: null } };
ctx.renderUso({ contexto: null, semanal: leitura(58, 104.9) }, padrao);
assert.strictEqual(elementos.ritmo.textContent, 'On track · about 71% by reset · from your usual hours', 'previsão pelo padrão ganha da linha reta');
assert.ok(!elementos.ritmo.classList.contains('alto'), '71%: sem âmbar');
assert.strictEqual(elementos.faixas.hidden, false);
assert.strictEqual((elementos.faixaClaude.innerHTML.match(/class="fx/g) || []).length, 24);
assert.strictEqual((elementos.faixaVoce.innerHTML.match(/class="fx/g) || []).length, 24);
assert.strictEqual((elementos.faixaVoce.innerHTML.match(/ agora/g) || []).length, 1, 'hora atual marcada');
assert.ok(elementos.faixaClaude.innerHTML.includes('title="12 PM'), 'célula diz a hora');
assert.strictEqual(elementos.faixaResumo.textContent, 'usually active 8 AM–6 AM · peak 4 PM');
ctx.renderUso({ contexto: null, semanal: leitura(58, 104.9) }, { ...padrao, previsao: { projecao: 130, batida: new Date(2026, 10, 13, 15, 0).getTime() } });
assert.strictEqual(elementos.ritmo.textContent, 'Ahead of pace · limit around Fri 3:00 PM · from your usual hours');
// Semana de prazo: o fator aparece; o ritmo das últimas 6h avisa quando bate antes.
const qui16 = new Date(2026, 10, 12, 16, 0).getTime();
const sex23 = new Date(2026, 10, 13, 23, 0).getTime();
ctx.renderUso({ contexto: null, semanal: leitura(72, 114) }, { ...padrao, previsao: { projecao: 113, batida: sex23, fator: 4.05, ritmo: { pctHora: 2.2, batida: qui16 } } });
assert.strictEqual(elementos.ritmo.textContent, 'Ahead of pace · limit around Fri 11:00 PM · this week runs 4× your usual · at the last 6h pace: Thu 4:00 PM');
assert.ok(elementos.ritmo.classList.contains('critico'));
ctx.renderUso({ contexto: null, semanal: leitura(50, 84) }, { ...padrao, previsao: { projecao: 88, batida: null, fator: 1.5, ritmo: { pctHora: 1.5, batida: qui16 } } });
assert.strictEqual(elementos.ritmo.textContent, 'On track · about 88% by reset · this week runs 1.5× your usual · at the last 6h pace: Thu 4:00 PM');
assert.ok(elementos.ritmo.classList.contains('critico'), 'o ritmo recente estoura: vermelho mesmo com projeção ok');
ctx.renderUso({ contexto: null, semanal: leitura(50, 84) }, { ...padrao, previsao: { projecao: 88, batida: sex23, fator: 1, ritmo: { pctHora: 0.5, batida: new Date(2026, 10, 14, 1, 0).getTime() } } });
assert.strictEqual(elementos.ritmo.textContent, 'Ahead of pace · limit around Fri 11:00 PM · from your usual hours', 'ritmo recente mais tarde que a previsão: não repete');
ctx.renderUso({ contexto: null, semanal: leitura(30, 84) }, { ...padrao, previsao: null });
assert.strictEqual(elementos.ritmo.textContent, 'On track · about 60% by reset', 'sem previsão pelo padrão: linha reta');
ctx.renderUso({ contexto: null, semanal: leitura(30, 84) }, null);
assert.strictEqual(elementos.faixas.hidden, true, 'sem padrão ainda: faixas somem');

// Rodapé fixo: os medidores ficam visíveis com a lista rolando.
assert.ok(/\.uso-rodape\{[^}]*position:sticky[^}]*bottom:0/.test(html), 'rodapé de uso grudado embaixo');
assert.ok(html.indexOf('class="uso-rodape"') > html.indexOf('id="hojeList"'), 'rodapé é o último bloco');

// "today" dobrável, lembrado no estado do webview.
assert.strictEqual(elementos.hojeList.hidden, false, 'começa aberto');
ctx.alternarHoje();
assert.strictEqual(elementos.hojeList.hidden, true);
assert.strictEqual(elementos.hojeSeta.textContent, '▸');
assert.strictEqual(estadoWebview.hojeDobrado, true, 'salvo pro reload');
ctx.alternarHoje();
assert.strictEqual(elementos.hojeList.hidden, false);

console.log('OK: medidores de uso (contexto e semanal) no rodapé');
