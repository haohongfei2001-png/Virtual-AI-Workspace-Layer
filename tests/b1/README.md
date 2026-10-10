# Reproduce B1 tests without a private account

Prerequisites: Node 20+ and a locally installed Google Chrome supporting MV3. The recorded Mac environment was Chrome 154.0.8037.99, Node 26.8.2, Playwright 1.64.0. Run in a disposable directory **starting with /tmp/vaiwl-b1-**; never point this runner to a daily Chrome profile.

From the B1 checkout:

1. \`node --test tests/b1/broker.test.mjs\` (no dependencies; fixture-unit tests).
2. \`export B1_WORKDIR="$(mktemp -d /tmp/vaiwl-b1-XXXXXX)"\`
3. \`mkdir -p "$B1_WORKDIR/tools" && cp tests/b1/tooling/package*.json "$B1_WORKDIR/tools/"\`
4. \`npm ci --prefix "$B1_WORKDIR/tools" --ignore-scripts --no-audit --no-fund\`
5. \`node experiments/b1/fixture/build.mjs "$B1_WORKDIR/built-extension"\`
6. \`B1_WORKDIR="$B1_WORKDIR" node tests/b1/chrome-mv3.mjs\`

The Chrome test builds its own fresh profile and starts a \`127.0.0.1\` loopback server with synthetic data; it does not visit chatgpt.com. It uses \`Extensions.loadUnpacked\` and real extension-origin IndexedDB, not \`page.set_content\`. The CDP capability requires a compatible Chrome. Chrome executable path is the macOS application path in this targeted runner; replace only for explicitly recorded other environments.

Evidence emitted to \`$B1_WORKDIR/chrome-b1.json\`. A nonzero runner exit means at least one case failed (or a fatal error). Do not add test results from different runs or call these genuine ChatGPT passes.

No account credentials, cookies, user-profile paths, document text or private snapshots are used. The fixtures and provider label \`synthetic_fixture\` are not production identity proofs.
