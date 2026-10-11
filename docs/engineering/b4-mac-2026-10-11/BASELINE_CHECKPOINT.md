# B4 baseline / scope checkpoint

2026-10-11. GitHub PR #7 live head dc73231d498d244e8b7bd14dfe95ba981b977537 verified; base branch feat/vaiwl-b2-b3-persistent-20261011. Independent local clone, new branch codex/vaiwl-b4-lifecycle-20261011; PR #7/main unchanged. Existing accepted repository CAS, idempotence, undo and IDB remain the sole implementation.

Remaining observed code gaps: client lease expiry clears derived UI without reconnect; transient retry list omits stale-binding after worker cold start; no multi-tab version observation; editor.update populates fields unconditionally and can overwrite unsaved drafts; commands use mutable latest client revision instead of draft version. Existing hidden/visible and SPA generation fences will be reused and tested, not rebuilt. B4 user scope controls stale historical B1-only authorization in AGENTS/AUTHORITY; no B5/C1/C2 or real account work.

Planned real counterexamples: actual 20s lease expiry, observed stopped worker then automatic same-document reconnect, cross-tab manual edits with dirty draft/conflict preservation, actual hidden/visible/frozen/SPA lifecycle, bounded transport failure and ambiguous write feedback, unknown isolation and 120/604 sample/native ownership.

New profiles only, headless first; no existing debug ports/daily Chrome/private data/PAIA/paid services/Actions. Use existing isolated Playwright1.63 venv and Chrome154. Raw tests and stage records are committed to the new stacked Draft PR. GitHub Git API publication checks parent twice and uses force=false (HTTPS Git failed in preceding round).
