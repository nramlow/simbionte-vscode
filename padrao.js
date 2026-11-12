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

const H_MS = 3600000;
const DIA_MS = 24 * H_MS;
const vazio = () => ({ uso: 0, msgs: 0 });
const deChave = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), +k.slice(11, 13)).getTime();

// Média por dia da semana × hora (semana[0..6][0..23], 0 = domingo) e por
// hora do dia (dia[0..23]), sobre os dias INTEIROS antes de hoje — do
// primeiro dia com dado (até 8 semanas atrás). Hora sem dado conta como 0:
// é a média do que costuma acontecer naquela hora, não só quando há uso.
function perfil(horas, agora) {
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const fimJanela = hoje.getTime();
  const chaves = Object.keys(horas).filter(k => deChave(k) < fimJanela).sort();
  const semana = Array.from({ length: 7 }, () => Array.from({ length: 24 }, vazio));
  const dia = Array.from({ length: 24 }, vazio);
  if (!chaves.length) return { semanas: 0, dias: 0, semana, dia };
  const primeiro = new Date(deChave(chaves[0])); primeiro.setHours(0, 0, 0, 0);
  const inicio = Math.max(primeiro.getTime(), fimJanela - 56 * DIA_MS);
  const vezes = Array(7).fill(0);
  let dias = 0;
  for (let d = new Date(inicio); d.getTime() < fimJanela; d.setDate(d.getDate() + 1)) { vezes[d.getDay()]++; dias++; }
  for (const k of chaves) {
    const t = deChave(k);
    if (t < inicio) continue;
    const d = new Date(t);
    const s = semana[d.getDay()][d.getHours()];
    s.uso += horas[k].uso; s.msgs += horas[k].msgs;
    dia[d.getHours()].uso += horas[k].uso; dia[d.getHours()].msgs += horas[k].msgs;
  }
  semana.forEach((horasDoDia, dow) => horasDoDia.forEach(s => {
    if (vezes[dow]) { s.uso /= vezes[dow]; s.msgs /= vezes[dow]; }
  }));
  dia.forEach(s => { s.uso /= dias; s.msgs /= dias; });
  return { semanas: Math.floor(dias / 7), dias, semana, dia };
}

// Horas em que o Nik costuma estar ativo: horas com mensagens ≥ 25% da
// hora de pico; pausa de 1h entre horas ativas é emendada (jantar
// não parte o dia em dois — achado nos dados reais, 2026-11-11); fica a
// maior sequência circular. fim é exclusivo (21–3 = das 21h até as 3h);
// pico = hora com mais mensagens dentro da janela.
function janelaAtiva(dia) {
  const max = Math.max(...dia.map(s => s.msgs));
  if (!(max > 0)) return null;
  const ativa = dia.map(s => s.msgs >= max * 0.25);
  for (let i = 0; i < 24; i++) {
    if (ativa[i] || !ativa[(i + 23) % 24]) continue; // começo de uma pausa
    let n = 0;
    while (!ativa[(i + n) % 24] && n < 24) n++;
    if (n <= 1) ativa[i] = true;
  }
  let inicio = 0, n = 24;
  if (!ativa.every(Boolean)) {
    let melhor = null;
    for (let i = 0; i < 24; i++) {
      if (!ativa[i] || ativa[(i + 23) % 24]) continue; // começo de sequência
      let m = 0;
      while (ativa[(i + m) % 24]) m++;
      if (!melhor || m > melhor.m) melhor = { i, m };
    }
    inicio = melhor.i; n = melhor.m;
  }
  let pico = inicio;
  for (let k = 0; k < n; k++) if (dia[(inicio + k) % 24].msgs > dia[pico].msgs) pico = (inicio + k) % 24;
  return { inicio, fim: (inicio + n) % 24, pico };
}

// Uso da semana até a leitura e o k que converte uso em % do limite
// (k = % lido ÷ uso desde reset − 7 dias). Balde da hora conta se começou
// antes da leitura.
function calibrar(s, horas) {
  const inicio = s.resetsAt - 7 * DIA_MS;
  let usoSemana = 0;
  for (let t = Math.floor(inicio / H_MS) * H_MS; t < s.ts; t += H_MS) {
    const b = horas[chaveHora(t)];
    if (b) usoSemana += b.uso;
  }
  return usoSemana > 0 ? { inicio, usoSemana, k: s.pct / usoSemana } : null;
}

// Previsão do limite semanal pelo padrão: soma o uso médio de cada hora
// restante (dia da semana × hora) até o reset, converte por k (calibrar).
// O perfil é a média de até 8 semanas; semana de prazo roda bem acima disso
// (achado 2026-11-12: 4× a média, a previsão dizia 82% e o limite estourava
// antes do reset). Por isso o perfil é escalado pelo fator desta semana =
// uso real ÷ uso que o perfil esperava nas mesmas horas — só depois de 24h
// de semana, antes disso o fator é ruído. ritmo: % por hora nas últimas 6
// horas inteiras e quando esse ritmo bate 100% (null se não bate antes do
// reset). Null quando ainda não dá (sem semana completa no perfil, ou sem
// uso nesta semana) — aí o painel usa a linha reta.
const HORAS_RITMO = 6;
function previsao(s, horas, p) {
  if (!s || typeof s.pct !== 'number' || !s.resetsAt || !s.ts || !p || p.semanas < 1) return null;
  const cal = calibrar(s, horas);
  if (!cal) return null;
  const { inicio, usoSemana, k } = cal;
  const perfilDe = t => { const d = new Date(t); return p.semana[d.getDay()][d.getHours()].uso; };
  let esperado = 0;
  for (let t = Math.floor(inicio / H_MS) * H_MS; t < s.ts; t += H_MS) esperado += perfilDe(t);
  const fator = s.ts - inicio >= DIA_MS && esperado > 0 ? usoSemana / esperado : 1;
  let pct = s.pct;
  let batida = null;
  let t = s.ts;
  while (t < s.resetsAt) {
    const d = new Date(t);
    const fimHora = Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime(), s.resetsAt);
    const fracao = (fimHora - t) / H_MS;
    const ganho = k * fator * perfilDe(t) * fracao;
    if (batida == null && pct < 100 && pct + ganho >= 100) batida = t + ((100 - pct) / ganho) * (fimHora - t);
    pct += ganho;
    t = fimHora;
  }
  const horaDaLeitura = Math.floor(s.ts / H_MS) * H_MS;
  let usoRecente = 0;
  for (let h = horaDaLeitura - HORAS_RITMO * H_MS; h < horaDaLeitura; h += H_MS) {
    const b = horas[chaveHora(h)];
    if (b) usoRecente += b.uso;
  }
  const pctHora = (k * usoRecente) / HORAS_RITMO;
  const batidaRitmo = s.pct < 100 && pctHora > 0 ? s.ts + ((100 - s.pct) / pctHora) * H_MS : null;
  return {
    projecao: Math.round(pct), batida, fator,
    ritmo: { pctHora, batida: batidaRitmo != null && batidaRitmo < s.resetsAt ? batidaRitmo : null },
  };
}

// O statusLine só roda em terminal; sessões do VS Code nunca atualizam o %
// (achado 2026-11-12: leitura de 9,5h, painel 58%, real 72%). Leitura com
// mais de 30 min: % ≈ lido + k × uso desde a leitura (k de calibrar).
// Passou do reset: semana nova a partir de 0, mesmo k. No dado real deu 78%
// contra 72% (o peso dos tokens não é o do limite), por isso o painel
// marca com "~". Teto de 100%.
const ESTIMA_APOS_MS = 30 * 60000;
function estimativa(s, horas, agora) {
  if (!s || typeof s.pct !== 'number' || !s.resetsAt || !s.ts || agora - s.ts <= ESTIMA_APOS_MS) return null;
  const cal = calibrar(s, horas);
  if (!cal) return null;
  let resetsAt = s.resetsAt;
  let desde = s.ts;
  let base = s.pct;
  while (agora >= resetsAt) { desde = resetsAt; resetsAt += 7 * DIA_MS; base = 0; }
  let uso = 0;
  for (let t = Math.floor(desde / H_MS) * H_MS; t < agora; t += H_MS) {
    if (t < desde && desde === s.ts) continue; // balde da leitura já entrou na calibragem
    const b = horas[chaveHora(t)];
    if (b) uso += b.uso;
  }
  return { pct: Math.min(100, base + cal.k * uso), resetsAt, ts: agora, estimado: true, lido: { pct: s.pct, ts: s.ts } };
}

module.exports = { PESOS, chaveHora, lerLinhas, varrer, perfil, janelaAtiva, previsao, estimativa };
