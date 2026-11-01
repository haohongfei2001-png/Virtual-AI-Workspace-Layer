# Round209: actual natural revocation, historical projection and deeper journeys

Fourth CI tested b954abc2a0841e1576c106d07fa2e8f4efb1e287:
https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38666470613

Node 4054/4054 and guard mutations 12/12 pass. Warm/cold C2 and the existing J1
slice pass again. Overall workflow remains FAIL; raw browser reports are retained.

J4 natural authentication loss now has actual browser evidence: removal at
50251.7ms after document origin, 48124.8ms after the silent change; both tabs
lose private projection, original draft survives, and restoration does not replay
the failed send. This passes the unchanged conservative 60s proof bound. The new
foreground case fails before activation because headless Chrome tabs.update does
not produce hidden visibility in this run. It is not a foreground acceptance.
The next run uses standard Ubuntu's Xvfb with headed Chrome for this runner only,
keeping native tab changes and trusted visibility assertions, with no synthetic
events or visibility override.

J3 still failed the old-window enabled assertion after the SVG-label correction.
The concrete production cause is now found: FreeReadService default source
admission rejects all host evidence because the host composition never supplied
its explicitly configured profiles. New admission is limited to exact owner
profile, source identity, generation and codec; no profile remains deny-all.
The first admission version exposed a cross-store collision: shared synthetic
coverage could borrow a same-ID stored host source. Independent review reproduced
that failure. The corrected read composition admits each store's sources and rows
before merging, refuses inconsistent admitted collisions, and never mutates
either store. Historical positives without complete coverage remain provisional;
the test proves real frame hasOlder without manufacturing completeness.
Legacy shared events remain diagnostic with unverified authorship when unadmitted.
J3 adds read-only failure diagnostics; these do not substitute for UI assertions.

J1 now tests 40 real native Project identities with an independent oracle, target
P2 at canonical offset32/eighth card, distinct candidate pagination, actual
nonzero workspace scroll and accepted SAVE_VIEW, native C/unique return/Back.
Original assertions are retained. New browser outcomes are pending, not accepted.

Source-scoped and offline only. Free remains NOT_RELEASE_READY; full81/J1–J4,
production ChatGPT semantics, G/U and remaining performance are not established.
