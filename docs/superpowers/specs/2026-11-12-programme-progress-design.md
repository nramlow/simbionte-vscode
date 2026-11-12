# Programme progress in the top ring — design

Date: 2026-11-12 · Status: approved by Nik (card "Yes, after pattern work");
requested by the Governance Reconciliation session, which owns the file.

## Problem

A session runs one programme (governance redesign: 8 sub-projects, one plan
each, each built in its own worktree, merged, worktree removed). The ring
follows the window's project (the main checkout) and shows whatever plan was
last named there — unrelated — instead of overall progress.

## Programme file (owned by the session)

`<main checkout>/.symbiont/programme.json`:
`{ "name", "spec"?, "subprojects"?: number, "plans": [relative plan paths] }`

## `programa.js` (repo root, copied to `lib/`)

- `lerPrograma(raiz)` → parsed file or null (missing/invalid/no plans).
- `copiaMaisNova(raiz, rel)` → the newest existing copy of `rel` among the
  main checkout and `<raiz>/.worktrees/*`: `{ arquivo, worktree | null }`.
  In-progress plans count from their worktree; merged ones from main.
- `progressoPrograma(prog, raiz, lerPlano)` (lerPlano = store's
  `progressoDoPlano`, injected) → `{ nome, subprojetos: { feitos, total },
  passos: { feitos, total }, atual: { rel, worktree, progresso } | null }`.
  A plan at 100% is a finished sub-project; `total` = `subprojects` or the
  number of plans; `atual` = the first unfinished listed plan, preferring
  one whose worktree has live agents (injected predicate).

## Extension

When the window's project belongs to a group whose root has a programme
file, each update carries `programa` (with `atual.agentes` from that
worktree's row). Read on every update (cheap: a few files).

## Panel (ring)

With `programa`: % = steps done / total; line `<name> · sub-project n/N ·
f/t steps` (n = finished + 1 while one is running); label `building:
<worktree> › Task 10/20 · implementing › Step 1/5: …`. Listed plans all
done: "next sub-project not planned yet" (subprojects > plans) or
"programme complete". Without `programa`, unchanged.

## Testing

`test/test_programa.js` (temp repo with main + worktrees: newest copy,
sums, finished count, current plan preference, missing plan skipped,
invalid file); `test/test_programa_painel.js` (ring text).
