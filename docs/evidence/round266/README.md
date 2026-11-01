# Round266 — Bounded return-stage scheduling diagnosis

Base `51d9ef2714fccd54fa5079281f2b3efa48b91aab`, original local branch / Draft PR16, 2026-10-16. No production change. The existing isolated scale diagnostic now optionally continues through native tail/project/member/return navigation using `FREE_HOST_SCALE_TRACE_RETURN=1` together with `FREE_HOST_SCALE_TRACE=1`. Default initial-only behavior remains. Both modes stop before performance measurement and cannot produce accepted timing samples.

The instrumented copy adds window reserve/refusal/expiry/release and snapshot-version restart events. Window identities are anonymous WeakMap ordinals; fields are fixed numeric/boolean values, with no native titles, content, scope, grant, document identifiers or arbitrary strings. Original1000ms scheduling and all guards remain. The original package is untouched and both original/instrumented hashes are verified. The ring stays1024events/131072bytes and declares dropped history.

## Actual evidence

One isolated Chrome10k/single-project run completed through the return/search entry: `DIAGNOSTIC_ONLY_RETURN_COMPLETE`. First two tab observations were11.339s/10.800s, but these instrumented numbers are not product performance samples. There was no exact before/after index audit or timing measurement in this diagnostic mode.

The retained worker tail shows a shared window and two final reads: attempt2 at24.942s and attempt3 at25.484s into their preparations, completing at26.133s/26.672s. The reads themselves took about1.19s. Those late attempts followed26 write-busy observations each. This proves progress and late completion in this run, not a general root cause or reliability fix. The worker ring dropped2451 earlier rows; report merge dropped102 more. Earlier window expiry/version-restart history is therefore unavailable and cannot be inferred from absence. Prior uninstrumented10k failures remain valid.

Independent27-case trace tests execute original and instrumented helper branches side by side, covering identity/generation release, shared deadline, clock/deadline/no-reader expiry, used/capacity refusal, all five version/freshness restart causes and secret-field rejection. Runner tests execute both diagnostic stop branches and prove neither reaches measurement. Full Node result is recorded in STATUS and `node.log.gz`.

## Next work within the existing plan

Read-only inspection found a separate B2.F3/C3 user-visible gap: formal Free-frame construction does not wire navigation's calibration-entry callback, and frame history arrows bypass it. Existing current metadata and historical owners already enforce authenticated current-body evidence and shared budgets. The next functional slice should reuse those owners for a bounded foreground/history entry; UI must not supply proof IDs or broaden reading to arbitrary conversations. No second runtime, schema or plan is introduced here.

10k return reliability, other scale/cold cases, complete81/profile matrix, actual G/U and release gates remain open. **Free NOT_RELEASE_READY.**
