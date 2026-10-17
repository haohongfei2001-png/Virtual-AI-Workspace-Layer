# Isolated native visibility experiment

This does not import or modify the production mount/discovery implementation.
It tests a proposed temporary owned-CSS visibility probe on a separate synthetic
page. The production design has not been approved or integrated. A passing run
cannot prove absence of every transient compositor/accessibility observation.

Run `node tests/host/experiments/native-visibility/probe-browser.mjs /tmp/probe.json`
with FREE_CHROME_EXECUTABLE set to an isolated Chromium executable.
