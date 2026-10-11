# Preserved failure interpretation

- baseline/ execution: confined Chrome SIGABRT/EPERM; no product assertion executed. Native runs use explicitly authorized unconfined execution and fresh Profiles; no system/browser policy change.
- baseline-corrected/: untouched PR #8 runtime, corrected real UI driver: 30-day/stress screenshot journey PASS; keyboard old disclosure focus, current L127 outside preview, theme-local action/search FAIL. These are the three stable C1 product counterexamples repaired in the shared navigation.
- ui-first/ui-second: initial test picked the sidebar old disclosure while checking home focus, then assumed initially collapsed state despite persisted view. Fixed scoped locator and relative toggle check. Original outputs remain. A stale success status was also repaired at the existing editor action boundary by clearing it before awaiting a new save.
- ui-third: extra driver BIND competes with the running client's single document binding; actual broker denies stale-after-workspace. Final long-history preparation uses ordinary UI PLACE commands. It uses only records with reliable old evidence, excluding the genuinely unknown/stale-coverage themes.
- ui-final: the previous journey's historical segment had actually persisted. Corrected driver sets its explicit start via adjacent up-arrow clicks, not database writes or fake projection.
- dom-first D28: newly paginated search renders 24 initially. Both original DOM D28 drivers now expand every actual batch, still require all604 and the final T11903, with no skipped records.
- ui-delivery (parallel heavy final batch): long-history setup stopped because its requested saved feedback was absent; actual screenshot reports write-result-unknown, no success and no automatic replay. This is a retained observed run FAIL, not erased or relabeled PASS. Exact same source and same assertions are rerun alone after the other Chrome jobs. Do not claim heavy parallel writes always acknowledge successfully or that an unknown acknowledgement itself proves lost data.

Runtime repair scope is navigation/editor only. Existing data, broker, lease renewal, worker and projection engines are unchanged. Final ledger selects final executions individually and does not add intermediate successes.

- dom-product/D16: column measurement cleared preserved scroll; original targeted scroll-fixed assertion passes after retaining scroll around measurement.
- ui-layout-final: assumed W7 is in another column, but native desktop sidebar collapse creates four columns. Corrected geometry compares a later card with the actual second card x-column; original failure is retained.
- far-route-before: 8/9, actual Meta tab T11903 fails MV3 activation; synthetic adapter omitted mode and scale on fallback URLs. Guarded same-origin href retains test-only mode/size, stored URL and production adapter untouched; host initializes explicit size120. Final normal/new-tab path requires native conversation/input and return.

- current-position-before: current T11903 exists but is outside the owned sidebar viewport. Final route-only owned-list positioning preserves manual scroll and passes the same actual rectangle assertion; it does not scroll native content or take focus.
