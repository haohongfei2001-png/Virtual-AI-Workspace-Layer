# Return-gap viewport overlap: bounded integration fixture

Current source base: `9509be1448d52fab46d8fc983131df8944a7f844`.
This supersedes the old `4958125` reproducer. Local `10eaf6c` already added readingRoot, full bounded descendant/text checks and the small-control regression; those fixes are not reported again as missing.

Only these three test/handoff files change. No production, workflow, acceptance gate or new PR is involved.

## Remaining model counterexample

```sh
node --test tests/host/return-gap-reading-overlap.model-repro.mjs
```

Actual new production helper + explicit geometry/style/hit doubles: **11 PASS / 1 intentional RED / 0 skip**.

The model has the declared background containing a pointer-active viewport, which contains reading and composer as separate branches. Reading crosses the header. It supplies the new exact `readingRoot`, with `isOwnedMask` true only for the active reading mask, not the viewport. Unmasked reading now passes. While reading is masked, a hit on the still-visible viewport is rejected because the helper accepts only exact background or readingRoot. Changing only the modeled hit to exact background succeeds with the same mask proof/geometry, isolating the refusal.

This is a **synthetic compatibility gap**, not proof of the current real-profile `_blank`/surface-close cause. Current production's refusal remains safe. Do not accept arbitrary ancestors or change the selector blindly. A supported implementation needs a verified empty rectangle under each actual presentation state.

The source of the modeled structure is the committed `query-live-gap-blocker.json.gz`: background contains the long reading DIV; the viewport has role/tabindex attributes and pointer-events auto. The masked hit is an explicit model assumption, not a recorded live hit. Dimensions and role values are synthetic.

The existing small-control, identity replacement, ancestor hidden/inert/aria-hidden and portal controls now pass on the updated API. No obsolete 2px alert should be sent for `10eaf6c`.

## Browser counterpart: NOT_RUN

```sh
node --test tests/host/return-gap-reading-overlap.repro.mjs
```

It uses the **actual** `createMountSurface.mount`, `showWorkspace`, `showReading`, and `isMasked` with the actual gap helper. No custom mask implementation is substituted. It asserts reading is an owned mask root and viewport is not, and measures the expected synthetic hit sequence reading -> viewport -> reading. Production ownership currently checks exact marker identity, original style/attributes, connected owned style and `:popover-open` (`mount-surface.mjs:105–109`); the browser fixture consumes that code directly.

The only URL is a locally fulfilled `https://example.invalid/return-gap-fixture`; every other page request is aborted. Fresh isolated headless Profile, synthetic frame URLs/content, no real account or native request. Optional environment variables `VAIWL_PLAYWRIGHT_MODULE` and `VAIWL_CHROMIUM_EXECUTABLE` select already installed tooling.

Syntax check passed. Earlier Chromium launch attempts failed before any assertions at `process_singleton_posix.cc:297 socket() failed: Operation not permitted`, including one supported escalation. No further browser attempt was made. Browser geometry, CSS hit transitions and MV3 are **NOT_RUN**, never counted as Node evidence.

The local writer already has browser tooling and the active geometry implementation. This optional fixture is for a natural checkpoint; it does not request a stop, a new CI run or mandatory integration. The real current-row failure and PR22 renewal seam cannot be equated without a recorded invalid-document renewal response.

Source SHA256:
- native-return-gap.mjs: `df86eff3a91dbe0757eb6ae968a31af39d3a499302303e52c0752a2f7f43cccd`
- mount-surface.mjs: `16d3ab29ead8fef96cb26c11341af1f2fb8bf2478cbc7cee210c8389690521ee`
