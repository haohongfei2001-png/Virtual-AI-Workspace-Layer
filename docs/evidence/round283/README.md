# Round283 — Reject ineffective document-start wake candidate

Base d213dc5. Production remains byte-for-byte at that checkpoint. The previous turn is progress: two actual scheduling defects were fixed, tested and committed. This round tests a distinct cold-start hypothesis rather than retrying the previously unsuccessful121-module bundle experiment.

The candidate adds one top-frame document_start script sending only an unrecognized constant HOST_WORKER_WAKE packet, with no page observation, authority, retry or delay of native requests. The normal document_idle HELLO/refresh/bind remains intact. Existing strict broker rejects the wake, while the browser may start the worker earlier. Build hashes include the script; package verifier checks both exact declarations; permissions/CSP/WAR remain unchanged. The initial verifier expected one script and correctly failed, then candidate verifier was updated without loosening scope boundaries.

Candidate build/bootstrap40/40 and four independent wake contracts PASS. The latter check a single packet, quiet sync throw/rejection, no DOM/storage/network/timer touches and zero binding/scope/provider/storage changes for rejected wake in cold and already verified states. Independent review found no new authority/replay path. These are candidate-only results, not current production changes.

Actual fresh isolated headless Chrome immediate-cold mode still FAILS original20000ms mount gate. Exactly one natural conversation GET occurs, authenticated session/roster reads occur, zero owned surfaces remain. Source/script remain stable. No successful projection, cold reliability or full profile claim is made. No native request was replayed or fixture delayed.

Candidate was not adopted. Build/package sources restored exactly from d213dc5; new wake and candidate tests removed from active source and preserved as .txt files here, alongside candidate.patch and full logs/report. To reproduce only in an isolated experiment, apply candidate.patch and restore wake.js.txt to extension/wake.js and wake.test.mjs.txt to tests/host/host-worker-wake.test.mjs. No full Node rerun after exact restoration; previous5478 remains its own run.

Immediate cold remains unresolved; safe explicit navigation recovery is separately evidenced inRound272 and not recounted. Continue SYS07 actual production-package failure-path privacy evidence, whose present coverage lacks raw eight-store and message/log scans. No established production leak, and no implemented backup authentication path is inferred. Free NOT_RELEASE_READY.
