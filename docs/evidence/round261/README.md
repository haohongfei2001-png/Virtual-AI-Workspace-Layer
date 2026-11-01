# Round261 — Resume dot progress and remove redundant Project tail writes

2026-10-16. Sole local branch and Draft PR16 were both `8fe97c936edd0df1a546a8f9a0d80c863830c4e8` after fetch; neither merge nor replay was needed. `72ca068` and the earlier local `d1872d9` remain ancestors. PR base remains `docs/vaiwl-v28-core-mechanisms-20261012`. Existing untracked duplicate files are retained and excluded from this change.

## Product change

A finite Project scan kept emitting the canonical parent on continuation pages that only traversed already-deduplicated history. Each such packet caused an unnecessary native write/notification. Discovery now omits a continuation's lone repeated parent when there are no other candidates or membership claims. The adapter drains empty continuation pages without RPC, while preserving the initial empty-surface handshake and every detached-handle publication. Actual member pages retain their parent, including after an earlier rejected fragment. Fragment byte bounds, CAS, source freshness, visibility checks and partial coverage are unchanged.

The first implementation tried first-page-only parent publication. Independent review found that later member fragments should remain self-contained after a rejected first packet, so the final implementation is deliberately limited to empty tails. The initial before log belongs to the earlier broader test and is not claimed as a failing run of the final seven tests; its adapter exact-one-parent assertion was also corrected because fragment splitting legitimately repeats a parent. Final tests cover limits 1/2/256, exact members, fresh rename/route passes, no empty/parent-only tail RPC, and rejected-first-fragment cancellation without false completion.

## Exact local checks

- Final seven tail contracts pass; existing 114 adapter/fragment/member-mask contracts pass. These are overlapping targeted runs, not extra aggregate acceptance counts.
- The first full Node run was 5202 PASS / 3 FAIL / 0 skipped. Two module-hook tests compared a macOS `/var` temporary path against Node's canonical `/private/var` URL, missing all instrumentation. Canonicalizing the newly created test directory restores the original positive heavy-module and listener-order assertions. The third test's exact source regex was updated to also require detached handles to satisfy the new nonempty gate. No product checks were removed. Targeted 40/40 pass.
- Final full Node: **5205/5205 PASS, zero skipped**. This includes the seven new tail cases, not added again to the total.
- One actual isolated packaged MV3 10k single-project run returns `PARTIAL_SYS04_NOT_ACCEPTED`. Both initial surfaces, exact native tail navigation, complete native member rendering and workspace return succeed within the original deadlines. Before and after measurement, the paged audit finds exactly 10000 distinct refs, one Project, 10000 correct memberships, zero missing/extra/duplicate/wrong/UNKNOWN memberships at revision994.
- Single wall-clock samples: exact-tail search 78.82ms, broad first page 181.22ms, next page 205.48ms. They are not p95 or full search-order/performance acceptance. This Mac Chrome155 run is not a controlled before/after comparison against CI Chrome156; no causal timing improvement or CI recovery is claimed. Product, fixture and manifest hashes remain unchanged during the run. `sourceCommit` in its original report is null because FREE_SOURCE_COMMIT was not set; its complete source hash manifest identifies the dirty tree based on 8fe97c9. The original report is preserved without relabeling.

## Keyboard and remote failures remain open

CI56 [38849345363](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38849345363), exact source8fe97c9, finishes FAIL: J3 observes parent focus changing from none to sidebar during its strict cross-document observation; formal10k fails initial preparation at the unchanged30s boundary. Extracted reports and failed-step logs are preserved.

The unchanged formal J3 run locally reaches composer with Shift+Tab (7 keys), closed history with Shift+Tab (7), and closed composer with Tab (7), but open-forward fails after64 trusted keys. Parent AX positive/negative masking checks and native document/drafts/File identities pass their executed subcases. This is not full UI06 or J3 acceptance.

A separate static extension-origin iframe probe using the production MountSurface, without renderer or business authority, reproduces one document-end focus bounce but reaches composer by key13. Appending a native tail input for the diagnostic control reaches it by key5. This is WEB_MECHANISM_ONLY, not the formal Host acceptance.

A temporary transparent focus-call diagnostic preserves the J3 failure. After the last settings-seed render there are no HTMLElement.focus calls during the forward loop, excluding renderer focus restoration in that run. A separate temporary two-parent-RAF-per-key diagnostic retains the original64-key/15s gate and still fails forward at64 keys (~2122ms). Neither diagnostic changes the formal runner, oracle or production mount, and neither resolves the browser boundary. Temporary runner/helper snapshots are archived for attribution, not production execution.

Owned-mask inherited visibility remains an explicit unresolved gap: the separate diagnostic L test still fails its positive descendant case; native-hidden negative cases remain necessary. No descendant hidden bypass or temporary stylesheet unmask was integrated.

Free remains **NOT_RELEASE_READY**. Full81 subscenarios, keyboard/visual matrix, SYS02/J4, SYS04/SYS05, cold reliability, real ChatGPT/PAIA/physical IME/cross-device G/U and release gates remain open. Continue the existing DEVELOPMENT_PLAN; no new execution plan or external permission is implied.
