# Return-gap overlap: bounded integration fixture

Base: `495812531289755c5e50f2b0ca3bd66dc92acc2b` (still latest at 08:04 UTC).
Production helper `src/host/native-return-gap.mjs` SHA256:
`aaa1de46d2625f64184ef0500a837ba07d9b9bd1336bb0a5213c8c1bcbd4d68f`.
This delivery changes no production source, profile, workflow or ordinary test list.

The existing browser fixture places reading below y=52/60, so its empty return gap hits the background. The committed live diagnostic instead reports a long reading DIV extending across the header and a pointer-active viewport with role/tabindex attributes. The new synthetic fixture models those structural facts, not private DOM/content. Its dimensions and attribute values are synthetic. Masked-hit behavior still needs actual browser verification; it is not claimed as an observed live fact.

## Actual Node result

Run from the repository root:

```sh
node --test tests/host/return-gap-reading-overlap.model-repro.mjs
```

The unchanged actual production function gives **9 PASS / 3 intentional RED / 0 skip**:

1. Two support-gap expectations fail: the configured background cannot establish an empty slot when the hit is the overlapping reading or (in the explicit masked model) the viewport. These are safe refusals, not permission bypasses. The test describes the desired supported geometry, not an instruction to accept arbitrary descendants.
2. The third failure is a **config-only candidate negative**, not the currently configured product: replacing only `hitRoot` with reading allows a 2x2 native button between all five sample points. The helper walks header descendants, but not reading descendants. Merely changing the selector or accepting `root.contains(hit)` is not a safe fix.
3. Legacy empty-background success and root replacement, ancestor hidden/inert/aria-hidden, native header obstacle and portal refusal controls pass.

Keep the existing exact node/scope/presentation boundaries. A local fix needs a current empty-rectangle proof across its actual mask states, including small native descendants outside the header. This fixture does not prescribe that implementation and does not reopen authorization.

## Browser fixture: NOT_RUN

```sh
node --test tests/host/return-gap-reading-overlap.repro.mjs
```

Uses the repository Playwright installation, a new isolated headless browser, synthetic local HTML and aborted page networking. An optional `VAIWL_CHROMIUM_EXECUTABLE` selects an existing approved Chromium; `VAIWL_PLAYWRIGHT_MODULE` selects its installed module. No install, real Profile or native request is needed.

Syntax check passed. Chromium 154.0.8037.57 could not launch here: `process_singleton_posix.cc:297 socket() failed: Operation not permitted`. The normal sandbox and one supported escalation both failed before any geometry assertion. Therefore browser cases are **NOT_RUN**, not RED/PASS. The CSS uses a real manual popover predicate to mask reading, leaving the pointer-active viewport unmasked; its expected synthetic hit sequence is reading -> viewport -> reading.

Exact files:
- Model SHA256: `fa3cb6382554a0ad3a1fa6a56edbf6bcc297f460358e5b5c4604120fc7bc9e9e`.
- Browser fixture SHA256: `fd6c78005ec0303db390e02ac4c2a46a37042c8bb7778dfc6db72462e0489751`.

This is optional input for the sole local writer's existing geometry work. No new CI run, PR, acceptance gate, real-host claim or requirement to stop/integrate it is introduced.
