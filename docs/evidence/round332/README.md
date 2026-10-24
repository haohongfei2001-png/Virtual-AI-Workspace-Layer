# Round332 — new native evidence replaces older same-context receipt

A separately completed, independently valid later native current-object request previously disappeared while the old receipt remained valid. The owner now creates a new receipt with its own original request clocks, revokes the old scope capabilities and signals readiness for complete reauthorization. Request IDs, cached/prefetch/extension requests, failed requests and tied/older clocks cannot renew authority. No timer or activity anchor is extended.

Independent old-HEAD reproduction:10/13 PASS,3FAIL. Initial fix exposed oldest-first parallel completion loss. The final fix preserves only independently prepared later requests matching the same document,prior epoch,context,target andURL, without conflict and within their original6s deadline. Other routes/conflicts/expiry cannot inherit selection. The latest successful request wins regardless of completion order.

Final focused browser-context contracts123/123 PASS;19 independent renewal tests cover original6s expiry after migration, later conflict/route invalidation, tied clocks and body/roster reauthorization. Independent review found no blocker. These are Node browser-event contracts, not new actual Chrome renewal acceptance. This does not resolve silent C2 expiry or manufacture C1 proof; Round331 limitations remain.

First full integration6406/6407: obsolete J2 finally-extraction boundary causes a SyntaxError in the test harness; evidence retained and correction pending final integration. NOT_RELEASE_READY.

The old J2 tail-execution test now extracts and executes the actual top-level capture function plus current finally block. All8 secondary failures still preserve the original error and write one report. Necessary source-hash/cleanup evidence failure cannot leave PASS; missing ordinary trace is reported separately.45 focused harness/evidence tests pass. Final full-suite result is added after completion.

Final complete Node regression: **6421/6421 PASS**, zero failures/skips/cancellations, process exit0 (35.65s). Includes final production renewal logic and runner evidence corrections. Actual Chrome renewal acceptance, silent C2 recovery and cold-start consistency remain unproven.
