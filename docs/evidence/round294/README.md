# Round294 — Preserve finite directory traversal across owned popover toggles

Base0402a2a. Fresh fetch and GitHub PR API confirm local/remote identical, Draft PR16 and original base unchanged. dot d1872d9 and Pro72ca068 are ancestors. No tracked work was discarded.

The adapter previously treated every document toggle as native directory invalidation. Its own workspace/sidebar transitions therefore discarded pending directory fragments and restarted traversal. The mount now exposes exact connected same-document surface identity from its private registry; content-session supplies that live callback to the adapter. Owned toggles use the existing cursor-preserving scan path, still invalidating independent loaded iterators and rechecking current body. Native, unknown, forged, throwing and nonboolean ownership results retain full invalidation. Pending real DOM changes cannot be consumed by this path. No wire/schema, authorization, CAS, retry or deadline changes.

Independent adapter tests against original HEAD through a temporary source mirror:6PASS/4FAIL; candidate10/10PASS. Ownership tests also reject cloned markers, descendants, detached/wrong-document and disposed-then-reattached nodes. Final complete Node5767/5767PASS, zero skip. Independent production diff review found no blocker.

Actual isolated headless packaged MV3100k diagnostic before/after both complete native-tail/return with stable source/fixture and no browser errors. Instrumented pass-start counts7→4; before inventory196refs/1000Projects and candidate278refs/1000Projects are point-in-time diagnostics, NOT a throughput benchmark or full cardinality acceptance. View preparation still repeatedly alternates with native publication. All original trace JSON is retained losslessly compressed.

Uninstrumented1000 mixed formal run still FAIL_INDEX_CARDINALITY:244/1000refs,10Projects,756missing, zero unexpected/duplicates, all244UNKNOWN as membership remains unproven. Measurement correctly refuses with NOT_RUN_INDEX_NOT_READY. Initial dual surfaces approximately359/233ms are partial-ingestion observations, not admitted-scale performance. No extra wait or changed oracle was used to manufacture success.

Continue remaining ingestion/publication coordination and independent cold-start work. Full81/profile matrix,100k, general cold/reenable, actual ChatGPT/PAIA/physicalIME/cross-device G/U remain incomplete. Free NOT_RELEASE_READY.
