// Padrão de uso por hora: aprende, dos transcripts do Claude Code, quando o
// Claude trabalha (tokens, subagentes inclusos — é o que gasta o limite
// semanal) e quando o Nik manda mensagem. Serve a faixa de 24h do rodapé, a
// visão completa (dia da semana × hora) e a previsão do limite semanal.
// Lado da extensão; nada aqui roda em hook.
const fs = require('fs');
const path = require('path');

// Peso por tipo de token ~ razão de preço (cache lido é barato, saída é
// cara). A escala absoluta não importa: a previsão calibra toda semana
// contra o % real do limite.
const PESOS = { input: 1, cacheEscrita: 1.25, cacheLeitura: 0.1, saida: 5 };

const dois = n => String(n).padStart(2, '0');
function chaveHora(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}`;
}

const textoDe = c => (typeof c === 'string' ? c
  : Array.isArray(c) ? c.filter(x => x && x.type === 'text').map(x => x.text || '').join('\n') : '');

// Mensagem do Nik: origin human (sem isMeta, que é anexo/aviso local), ou
// ditado de voz do Claude TV (chega como mensagem de outra sessão).
// Transcript antigo sem origin: texto do usuário fora de sidechain, sem
// tool_result.
function ehMensagemHumana(j) {
  const c = j.message && j.message.content;
  if (j.origin && j.origin.kind) {
    if (j.origin.kind === 'human') return !j.isMeta && !(Array.isArray(c) && c.some(x => x && x.type === 'tool_result'));
    return j.origin.kind === 'peer' && /Nik, by voice/.test(textoDe(c));
  }
  if (j.isMeta || j.isSidechain) return false;
  if (Array.isArray(c) && c.some(x => x && x.type === 'tool_result')) return false;
  return textoDe(c).trim().length > 0;
}

// Soma cada linha do texto (JSONL) nos baldes por hora local. Puro.
function lerLinhas(texto, baldes) {
  for (const linha of String(texto).split('\n')) {
    if (!linha.includes('"timestamp"')) continue;
    const ehResp = linha.includes('"assistant"') && linha.includes('"usage"');
    const ehUser = linha.includes('"user"');
    if (!ehResp && !ehUser) continue;
    let j;
    try { j = JSON.parse(linha); } catch (e) { continue; }
    const ts = Date.parse(j.timestamp);
    if (!ts) continue;
    if (j.type === 'assistant' && j.message && j.message.usage) {
      const u = j.message.usage;
      const uso = (u.input_tokens || 0) * PESOS.input + (u.cache_creation_input_tokens || 0) * PESOS.cacheEscrita
        + (u.cache_read_input_tokens || 0) * PESOS.cacheLeitura + (u.output_tokens || 0) * PESOS.saida;
      if (!uso) continue;
      const k = chaveHora(ts);
      (baldes[k] = baldes[k] || { uso: 0, msgs: 0 }).uso += uso;
    } else if (j.type === 'user' && ehMensagemHumana(j)) {
      const k = chaveHora(ts);
      (baldes[k] = baldes[k] || { uso: 0, msgs: 0 }).msgs += 1;
    }
  }
  return baldes;
}

module.exports = { PESOS, chaveHora, lerLinhas };
