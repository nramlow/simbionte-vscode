# Usage pattern and pattern-aware forecast — design

Date: 2026-11-11 · Status: approved by Nik (cards: measure both, strip + full
view, pattern-aware forecast; design "Approve, go ahead").

## Why

Nik wants Symbiont to learn when he and Claude actually work, hour by hour,
and use it to forecast the weekly limit better than a straight line. His
guess was 11 AM–1 AM; 60 days of transcripts show heavy use 9 AM–4 AM and a
trough at 6–8 AM.

## Data (verified on disk)

`~/.claude/projects/**/*.jsonl` (1.1 GB, 1,075 files since 2026-09-11; full
scan ≈ 5 s). Per line:
- assistant reply: `timestamp`, `message.usage.{input_tokens,
  cache_creation_input_tokens, cache_read_input_tokens, output_tokens}`;
  subagent files and `isSidechain` lines count too (they burn the limit).
- Nik's message: `type: "user"` with `origin.kind === "human"` (not
  `isMeta`); or `origin.kind === "peer"` whose text starts "Nik, by voice"
  (Claude TV dictation). No `origin` (older files): not `isMeta`, not
  sidechain, content is text and has no `tool_result`.

## `padrao.js` (repo root, copied to `lib/`)

- `PESOS` = input 1, cache write 1.25, cache read 0.1, output 5 (price
  ratios; the weekly calibration absorbs the absolute scale).
- `lerLinhas(texto, buckets)` (pure): adds each line to
  `buckets["YYYY-MM-DDTHH"]` (local time) as `{ uso, msgs }`.
- `varrer(raiz, estado)` (async): walks the tree; per file keeps `{ offset,
  tam }`, reads only bytes after `offset` up to the last newline; a file
  that shrank is reread. Drops buckets older than 12 weeks. Returns the new
  estado `{ arquivos, horas, atualizadoEm }`.
- `perfil(horas, agora)` → `semana[7][24]` mean `{uso, msgs}` per weekday ×
  hour over complete past weeks (max 8), `dia[24]` across all, `semanas`
  (count of complete weeks).
- `janelaAtiva(dia)` → `{ inicio, fim }` hours: the longest circular run of
  hours whose msgs ≥ 25% of the peak hour; null with no msgs.
- `previsao({ pct, ts, resetsAt }, horas, perfil)`: k = pct / uso(weekStart
  → ts); remaining = Σ perfil.semana[dow][h].uso for each hour from ts to
  resetsAt (first partial hour prorated); projected = pct + k × remaining.
  Over 100 → the hour the running total crosses 100. Null (→ linear
  fallback) when `semanas < 1` or uso since week start is ~0.

## Extension

- At activation (deferred 5 s) and every 10 min: `varrer` →
  `~/.claude/simbionte/_padrao.json`. Never blocks: async reads; one scan at
  a time; errors are swallowed.
- Each update message adds `padrao: { dia, janela, horaAtual, previsao }`.
- Command `simbionte.mostrarPadrao` ("Symbiont: Show usage pattern") opens a
  webview tab (`media/padrao.html`) with two weekday × hour heat grids
  (Claude usage, your messages), the active window and per-week totals.

## Panel

- Pace line uses `padrao.previsao` when present ("… · from your usual
  hours"), else the linear `ritmoSemanal`.
- Under it, two 24-cell heat strips ("claude", "you"), current hour outlined,
  and "you're usually active 9 AM–4 AM". Click opens the full view.

## Testing

`test/test_padrao.js` (lines → buckets, human detection, weights,
incremental scan with a half-written line and a shrunk file, perfil,
janelaAtiva incl. wrap past midnight, previsao vs hand-computed);
`test/test_padrao_painel.js` (strips, pace text source).
