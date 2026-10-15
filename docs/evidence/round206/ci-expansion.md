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
