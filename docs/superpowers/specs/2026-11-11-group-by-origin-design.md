# Group project cards by origin — design

Date: 2026-11-11 · Status: approved by Nik (card answer "Approve, go ahead")

## Problem

The panel shows one card per project. Git worktrees and sub-folders with their
own `package.json` each become a project, so one repository can fill the panel:
on Nik's machine, 7 of 8 cards (Communication-Intelligence, 5 worktrees and
`ui`) come from the same remote.

## Goal

Cards that share an origin render as one collapsible group card. A repo with a
single card renders exactly as today.

## Origin of a project (`origem.js`, new, repo root)

`origemDoProjeto(projectPath)` → `{ chave, raiz } | null`. Reads git's files
directly; never spawns `git` (no console windows on Windows, no PATH needs).

1. Walk up from `projectPath` to the first `.git`.
   - Directory → it is the common git dir.
   - File (`gitdir: <path>`) → worktree; the common dir is
     `<gitdir>/commondir` resolved against `<gitdir>` when that file exists,
     else `<gitdir>` itself.
2. `raiz` = parent of the common dir (the main checkout's folder).
3. `chave` = normalized `remote "origin"` url from `<common>/config`, or, with
   no origin remote, the common dir path (lower-cased on Windows).
4. Path missing or no `.git` found → `null`.

URL normalization: drop the scheme (`https://`, `ssh://`, `git@` form
`host:path` → `host/path`), drop `user@`, drop a trailing `.git` and `/`,
lower-case. So `https://PingCoDEV@dev.azure.com/Org/P/_git/repo` and
`git@dev.azure.com:Org/P/_git/repo.git` collide on purpose. (Azure's
`v3/` ssh paths are not unified — YAGNI until seen.)

`agruparProjetos(projetos, origemDe)` → same projects, each with
`grupo: { chave, nome }`:

- `origemDe(p.projectPath)` non-null → `chave`, `nome = basename(raiz)`.
- null → if `projectPath` is inside the `raiz` of another project's group,
  join that group (a deleted worktree stays with its repo); else a group of its
  own keyed by its `projectId`, `nome = projectName`.

`origemDe` is injected so the test can pass the real function and the
extension can pass a memoized one (origin of a path never changes during a
session).

## Extension (`extension.js`)

Where the project list is posted to the webview, run it through
`agruparProjetos(projetos, origemMemo)`. `prepare.js` copies `origem.js` into
`lib/` with the other shared modules.

## Panel (`media/build.html`)

`renderStatusList` buckets by `grupo.chave`; buckets keep the existing
recency ordering (by newest member), members ordered by recency.

- 1 member → today's card, unchanged.
- 2+ members → group card:
  - Header: dot + time of the newest member, `nome` (newest member's
    `grupo.nome`), fold arrow (▾ open / ▸ folded), ⚠ if any member has
    `progress.viaBash`. Header is a button: click / Enter / Space toggles.
  - Unfolded: one compact row per member — dot, name, time, `infoLinha`,
    `%` when it has progress. The member whose `projectPath` equals the group
    root shows as "main checkout". Row click keeps today's behavior (mapped URL,
    else last edited file).
  - Folded: one summary line, `N projects · <newest name>: <its infoLinha>`.
  - Fold state per `chave` via `vscode.getState/setState`; default unfolded.
  - Current window's project in the group → group card and that row get the
    existing `atual` highlight.
- The "open" arrow on clickable rows is fixed to point right (was rotated to
  look like ^, which read as "collapse").
- "Today" section unchanged.

## Testing

- `test/test_origem.js` with real temp repos (`git init`, `git worktree add`):
  main checkout; worktree; sub-folder with `package.json` inside a worktree;
  second clone whose origin is the ssh form of the same url; worktree folder
  deleted after its project was recorded (prefix fallback); folder outside git;
  repo without an origin remote (keyed by common dir).
- Webview rendering: no browser test available (playwright not installed);
  checked with a stub-DOM smoke script and a screenshot from Nik.

## Out of scope

Grouping the "Today" section; renaming groups; merging separate repos by hand.
