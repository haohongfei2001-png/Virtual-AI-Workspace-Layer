# Follow-on CI coverage

The first run on 5ecd367 uses the actual packaged C2 conversation slice. The
next test-only update additionally executes continuous J1 candidate restoration,
J2/J4 prerequisites, and an isolated visibility proposal experiment. A successful
workflow means its bounded assertions passed; J1/J2/J4 intentionally remain
PARTIAL and return 2. CI requires both that exit code and the precise partial
status; a crash or failure cannot be converted into a passing prerequisite step.

The visibility experiment lives only under tests/host/experiments. It does not
change production mount/discovery. It retains an explicit NOT_PROVEN claim for
absence of transient paint/accessibility observations. The product design still
requires a decision after inspecting actual evidence.

Targeted added/related Node checks: 13/13 PASS, no skips. Browser assertions are
pending CI, not local S success. C2 browser startup errors now say NOT_RUN and
still return a failing exit code. Its runner hash is captured and rechecked.

Second run 38664192347 at 9279d1c2: full Node and all guard steps passed.
Warm C2 mounted the real UI, then the read-only test oracle failed because
Chrome disallows dynamic import inside ServiceWorkerGlobalScope. J2/J4 had the
same oracle error. This is not yet a complete C2 pass or a resolution of the
first immediate-load startup failure. Follow-on runners inspect the same
extension-origin database from an already existing extension iframe and retain
a separate immediate-load cold-start regression, without replaying native requests.

J1 reached candidate promotion and offset 32 but failed canonical-card focus.
The assertion is retained. The isolated visibility experiment passed three
mechanism checks in Chromium 156.0.8078.4; absence of transient paint/AX effects
remains NOT_PROVEN. Production mask/discovery remain unchanged. Raw bounded
reports are retained alongside this note, including each failure.
