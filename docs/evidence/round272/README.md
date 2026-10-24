# Round272 — Cold first-request timing and native navigation recovery

Base `8e3729f3c76726e2da61104aa76402bfe04adb98`. Production code, formal runner and dependency manifests are unchanged after the experiment.

The original uninstrumented cold20-second gate fails again. The existing verified passive trace records the native conversation request at1792132236778 and C2 listener registration at1792132236814: a36ms registration gap. HELLO subsequently succeeds, refresh sees no receipt and correctly refuses unproven context. This trace establishes missed first-request eligibility; it does not prove all cold failures share this timing.

A temporary offline package bundled121 worker modules using pinned esbuild0.25.12, preserving semantics, origin and permission settings. Its original20-second gate also fails. The candidate was **not adopted**; formal runner and tooling manifests were restored exactly. The diagnostic harness/tooling lock/report are retained for reproducibility. This is not a production build change or formal bundled acceptance; reducing module count alone was insufficient in this run.

The unchanged cold-recovery journey passes its separate recovery scope: initial coldTIMEOUT leaves zero private surfaces and native reading/composer intact; one explicit native-history navigation obtains the new route receipt, binds the authenticated second/team context and mounts the correct Free projection, preserving the original draft. Exactly two native conversation GETs occur across the two user routes; history listing is separate. The report explicitly retains immediateColdSupport=FAIL. Source and runner integrity are unchanged in all four runs, and scoped cleanup reports no failure.

Cold/bootstrap contract tests:36/36 PASS. No full Node rerun was needed because product/test sources and dependency manifests were restored unchanged. Prior full5397/J3 evidence remains at Round271 and is not recounted as this round's run. Next independent investigation is100k progressive ingestion versus native visibility; no guard/deadline was relaxed. Full81, immediate cold, scale reliability, G/U and release readiness remain incomplete.
