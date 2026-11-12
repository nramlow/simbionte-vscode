# Claude usage meters — design

Date: 2026-11-11 · Status: Nik chose "Context + weekly only" (card); asked for
meters "on the bottom, in one row, like the top meter".

## What Claude Code provides (verified)

- `statusLine` stdin JSON (terminal sessions only; VS Code sessions never call
  it): `context_window.{context_window_size, used_percentage, current_usage}`,
  `model.id` (e.g. `claude-opus-5-5[1m]`), `rate_limits.seven_day.
  {used_percentage, resets_at}` (epoch seconds). Probe on Nik's machine:
  weekly present before the first reply; no `five_hour`, no per-model (Fable)
  limit.
- Session transcripts (every session, VS Code included): each main-thread
  assistant line has `message.usage` and `message.model` (no `[1m]` marker).
  Context used = `input_tokens + cache_creation_input_tokens +
  cache_read_input_tokens` (matches the status line's `total_input_tokens`).

## Design

**Store (`store.js`)**
- `registrarHeartbeat` also keeps `transcript` (= `transcript_path`) per session.
- `aplicarUso(estado, data, agora)` (pure) → `{ semanal: {pct, resetsAt, ts} | null,
  janelas: { [model without "[…]"]: context_window_size } }`; `registrarUso`
  writes `~/.claude/simbionte/_uso.json` under a lock.
- `contextoDoTranscript(texto)` (pure) → last main-thread assistant usage:
  `{ tokens, modelo, ts }`; skips sidechain, `<synthetic>`, unparsable lines.

**Status line (`claude-hooks/simbionte-statusline.js`)** — records via
`registrarUso`, prints `ctx 6% · 7d 58%`. Installed by "Install/Update hooks"
only if the user has no status line (or has the temporary probe); never
replaces someone else's. "Remove hooks" removes it only if it's ours.

**Extension** — `uso` in each update: context of the session the panel already
follows (`sessaoAtual`): tail (512 KB) of its transcript → tokens; window =
`janelas[model]`, else 1M when tokens > 200k, else 200k. Weekly from `_uso.json`.

**Panel** — bottom section "claude usage": two small bead rings in one row,
same style as the top ring. Context: `%`, `412k / 1M`. Weekly: `%`,
`resets Sat 9:00 AM`, plus `as of 2h ago` when older than 30 min; no data →
`–` and "run Claude in a terminal". Amber at ≥80%, red at ≥95%.

## Testing

`test/test_uso.js`: `aplicarUso`, `contextoDoTranscript` (cut first line,
sidechain, synthetic), status line end to end in a temp HOME, statusLine
install/remove rules in `hooks-settings`, panel `renderUso` in a VM.
