#!/usr/bin/env node
// statusLine do Claude Code pro Symbiont: única fonte do limite semanal (e do
// tamanho da janela de contexto por modelo). Grava em
// ~/.claude/simbionte/_uso.json e imprime uma linha curta na barra do
// terminal. Só sessões de terminal chamam o statusLine; as do VS Code não.
const { registrarUso } = require('./simbionte-store');

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(input);
    registrarUso(d);
    const pct = v => (typeof v === 'number' ? `${Math.round(v)}%` : '–');
    const semanal = d.rate_limits && d.rate_limits.seven_day;
    process.stdout.write(`ctx ${pct(d.context_window && d.context_window.used_percentage)} · 7d ${pct(semanal && semanal.used_percentage)}`);
  } catch (e) {
    process.stdout.write(' '); // linha vazia: statusLine nunca pode quebrar a sessão
  }
});
