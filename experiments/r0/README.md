# R0 live guest experiment — no production authority

This independently stacked experiment uses the original DocumentBindingBroker with an exact official-origin guard and an always-null scope resolver. It cannot grant an account lease, access derived records, open a database or write native content. There is no automatic content script, page-world bridge or duplicate navigation. `chrome.scripting` injection is explicit and limited to this turn's newly owned tab. The small build includes the exact existing dependency graph, not the synthetic host runtime.

The taskbook is `docs/experiments/R0_CAPABILITY_SPIKE.md`; current anonymous authorization and results are recorded in `docs/experiments/results/r0-live-2026-10-12/REPORT.md`. Do not interpret the older taskbook's NOT_STARTED marker as revoking the user's subsequent authorization.

## Executed checks

- `node --test tests/r0/policy.test.mjs`: isolated experiment security contracts, no live identity claim.
- `node tests/r0/verify-evidence.mjs`: immutable live receipt/source/build consistency and preserved failures, no additional browser sends.
- `node experiments/r0/build.mjs <NEW dedicated build directory>`: copied experiment graph only; permissions scripting/webNavigation and official chatgpt.com only.

`guest-session.py` starts standard visible Chrome with a brand-new private directory and connects only to that Profile's own newly created CDP endpoint. It pauses on stdin, does not automate sign-in and has no send command. The optional proxy uses an already configured loopback proxy; it does not edit system settings or ignore TLS. `live-session.py` is the earlier clean-account/manual-login gate and is not required for anonymous testing.

The live Python test drivers are bounded, turn-specific receipts: they pin the owned session directory and refuse to overwrite existing result directories. They are **not** portable wrappers for an existing debug browser. Future live verification must configure another newly owned session/result directory and verify its anonymous scope. Never point them at a daily Chrome Profile/port. The first-message driver sends one fixed synthetic math question; the journey sends at most two additional fixed questions. Further sends require current authorization and should not be repeated merely to make native refresh pass. The no-send supplement uses one synthetic unsent draft, removes only its own draft and opens no accounts or tools.

The exact originally executed journey driver/structure observer are archived alongside the failed receipts. Current journey adds proper popover waits and assertions, but its old two native history failures remain FAIL. Do not silently overwrite or merge old/live runs into an all-green claim.

## Exit

The probe's isolated-world `stop()` deletes only its own singleton; then the test driver uses `Extensions.uninstall` for its exact unpacked extension. The owner controller accepts `{"command":"close"}` and closes only its fresh-profile Chrome process. Both were actually executed; no active background test remains. Profile/cookies/private Chrome logs are outside Git and must never be added to evidence or a bundle.

`sync-git.py` is a single experiment-branch exact Git-object fallback retained from the accepted local recovery method. It was **not used** in R0: ordinary nonforced HTTPS pushes succeeded. It must not update accepted branches/main or manufacture replacement commit histories.
