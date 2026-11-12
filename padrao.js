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

const DOZE_SEMANAS_MS = 12 * 7 * 24 * 3600000;

async function listarJsonl(dir, saida) {
  let entradas;
  try { entradas = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return saida; }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await listarJsonl(p, saida);
    else if (e.name.endsWith('.jsonl')) saida.push(p);
  }
  return saida;
}

// Varredura incremental de ~/.claude/projects. Por arquivo guarda até onde
// leu (offset) e os baldes que ele gerou: arquivo que encolheu (reescrito)
// é relido sem somar em dobro, e transcript que o Claude Code apagou
// (cleanupPeriodDays) deixa o histórico. Só lê até a última quebra de linha
// — a linha sendo escrita espera a próxima rodada. Assíncrona: roda no
// processo da extensão, não pode travar o VS Code.
async function varrer(raiz, estado, agora = Date.now()) {
  const arquivos = (estado && estado.arquivos) || {};
  for (const f of await listarJsonl(raiz, [])) {
    let st;
    try { st = await fs.promises.stat(f); } catch (e) { continue; }
    let reg = arquivos[f] || { offset: 0, baldes: {} };
    if (st.size < reg.offset) reg = { offset: 0, baldes: {} };
    if (st.size === reg.offset) continue;
    let fh;
    try {
      fh = await fs.promises.open(f, 'r');
      const buf = Buffer.alloc(st.size - reg.offset);
      await fh.read(buf, 0, buf.length, reg.offset);
      const fim = buf.lastIndexOf(0x0a);
      if (fim < 0) continue; // nem uma linha inteira ainda
      lerLinhas(buf.subarray(0, fim + 1).toString('utf8'), reg.baldes);
      reg.offset += fim + 1;
      arquivos[f] = reg;
    } catch (e) { /* arquivo sumiu/travado: tenta na próxima */ }
    finally { if (fh) await fh.close().catch(() => {}); }
  }
  const limite = chaveHora(agora - DOZE_SEMANAS_MS);
  const horas = {};
  for (const [f, reg] of Object.entries(arquivos)) {
    for (const k of Object.keys(reg.baldes)) {
      if (k < limite) { delete reg.baldes[k]; continue; }
      const h = horas[k] = horas[k] || { uso: 0, msgs: 0 };
      h.uso += reg.baldes[k].uso;
      h.msgs += reg.baldes[k].msgs;
    }
    if (!Object.keys(reg.baldes).length && !fs.existsSync(f)) delete arquivos[f];
  }
  return { arquivos, horas, atualizadoEm: agora };
}

module.exports = { PESOS, chaveHora, lerLinhas, varrer };
