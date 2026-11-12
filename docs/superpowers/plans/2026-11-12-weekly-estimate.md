# Weekly meter: estimate when stale, forecast at this week's pace

Date: 2026-11-12 · Nik chose "Estimate + live pace" (card).

**Problem (seen 2026-11-12 03:30):** panel said 58%, "about 72% by reset";
Claude said 72% and "you'll run out tomorrow night". Two causes:

1. The weekly % only arrives through the terminal statusLine; VS Code sessions
   never send it. The reading was 9.5 h old (17:54 the day before).
2. The forecast multiplied the 8-week average hour profile, but this week ran
   ~4× that average (last 6 h ~7×), so it predicted 82% even from the real 72%.

**Design**

- `padrao.estimativa(s, horas, agora)`: when the reading is > 30 min old,
  `pct ≈ s.pct + k × usage since the reading`, k = s.pct ÷ usage this week up
  to the reading. Crosses a reset: new week from 0 with the same k. Returns
  `{ pct, resetsAt, ts, estimado: true, lido: { pct, ts } }`.
  On real data it gave 78% vs the real 72% (runs high; shown with "~").
- `previsao`: future hours = profile × f, f = this week's actual usage ÷ the
  profile's expected usage for the same hours (only after 24 h of week; else
  1). Also `ritmo`: % per hour over the last 6 complete hours and when that
  pace hits 100% (if before reset). Returns `{ projecao, batida, fator, ritmo }`.
- Extension: the panel and the full pattern view get the estimated reading.
- Panel: estimated meter shows `~78%`, sub `est. from 58% 9h ago · resets …`;
  forecast line names the week factor and appends the 6 h pace warning when it
  runs out sooner; red when either runs out.

## Task 1: estimate from tokens since the reading

- [x] Test `estimativa` in `test/test_padrao.js` (fresh → null, stale → scaled, crosses reset, no usage → null)
- [x] Implement `estimativa` in `padrao.js`

## Task 2: forecast at this week's pace + recent pace

- [x] Tests in `test/test_padrao.js`: factor scales the profile, recent pace batida, existing cases still pass
- [x] Implement in `previsao`

## Task 3: extension wiring

- [x] `usoAtual`/`enviar` and `mostrarPadrao` pass the estimated reading

## Task 3b: real weekly % from the API every 5 min (Nik: "most important")

Nik approved (card, 2026-11-12) polling `GET api.anthropic.com/api/oauth/usage`,
the endpoint Claude Code's /usage uses, with the stored OAuth token, read-only.
Test call returned 72% (matches the app) and Fable-scoped 40%.

- [x] `usoDaApi(json)` in `store.js` → statusLine shape; tests in `test/test_uso.js`
- [x] Extension polls at start + every 5 min; skips when another window wrote < 4.5 min ago; skips expired token

## Task 4: panel text

- [x] Tests in `test/test_uso_painel.js` and `test/test_padrao_painel.js`
- [x] `build.html` meter + forecast line; `padrao.html` forecast text

## Task 5: verify and ship

- [x] `node test-all.js` green; real-data check against Claude's numbers (2026-11-12 03:50: API 72%; forecast limit Fri 1:54 AM, factor 4.1×; 6 h pace Thu 7:28 PM; Claude said "tomorrow night")
- [x] Commit, push, package, install
