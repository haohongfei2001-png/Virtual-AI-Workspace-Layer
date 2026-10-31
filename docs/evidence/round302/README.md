# Round302 — Native input wins during initial surface authorization

Base c9decb8. PR16 API confirms the same draft/base and head; dot d1872d9 and Pro 72ca068 remain ancestors. Existing branch/directory retained.

Production controller now remembers native-input surrender while initial grants are pending and checks connected current-document protected focus, including the shadow focus chain, before choosing initial presentation. It keeps native reading with one authorized return entry instead of opening private surfaces over an already-focused native control. Both grants and all original authority checks remain required. An already-open native layer enters suspended mode, so closing it restores the return entry without reopening the workspace. No native handler/content changes or early grant bypass.

Independent regression file covers pre-mount focus, delayed adapter/registration/either grant, neutral focus after native intent, expired/revoked/replaced-window denial, disconnected/foreign focus, native portal closure and shadow focus. Original production failed 8 of the first 15 cases; final surface/geometry group 77/77 PASS. New independent Project-card oracle tests exact original names/URLs/member IDs/order and expansion without importing production projection or fixture generation. Scale group 196/196 PASS.

Actual isolated headless MV3 single-Project 1k final run: exact 1000 refs, one Project, all 1000 PROJECT memberships, zero UNKNOWN/wrong/duplicate/missing refs. Existing bounded preparation and stable before/after revision audit retained. Actual card renders original name, first five members then expands to seventeen; clicks a validated member through its existing safe href-new-tab path, verifies the target native body/title, focuses native textarea before mount readiness, obtains exactly one return button, and returns to both workspace surfaces. Original Project document/editor/route remain intact. Final source/fixture/build hashes unchanged and no page errors.

Failure history is retained: initial closure assumed same-tab navigation incorrectly; corrected test reached the native target but lost return entry. Diagnostic captured two open private surfaces and zero return buttons, with no shared metadata budget rows. Initial and final production fixes both close that actual browser race. Raw reports include all preliminary passes/failures and are losslessly compressed.

Limits: report remains PARTIAL_SYS04_NOT_ACCEPTED. This is 1k single-Project correctness with bounded preparation, not complete scale/performance p95, cold C2 receipt certification, full profile/81/J4 or Free acceptance. Existing 10k/100k, real G/U and other gates remain open. Free NOT_RELEASE_READY.

Final full Node suite **5937/5937 PASS**, no skip. First full attempt retained: 5936 PASS, one historical tar extraction EPIPE (tar exit0); isolated archived-owner retry 2/2 PASS, then the complete final suite passed. No assertion weakened or archive/version fence bypassed.
