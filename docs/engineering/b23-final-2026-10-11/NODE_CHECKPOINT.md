# Actual full Node rerun

Source snapshot: `5997ec072f2f97c8127f41f05b9f375a786b6f10`. Tested in the current isolated Linux container, Node v22.16.0. Source was restored via GitHub connector and matching Git blob hashes, because direct GitHub DNS access was unavailable; it was not a newly implemented copy.

Command: `node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs`

Result: 116 tests, 116 PASS, 0 FAIL, 0 cancelled/skipped/todo; exit 0. Runtime 22552.912373 ms. This includes the 29 repository cases already independently checkpointed; do NOT count them twice. Database tests use the explicitly labelled mock-IDB and are not disk persistence or MV3 evidence.

`node-baseline.tap.gz` decompresses to the complete 22655-byte raw TAP stdout. SHA256 of the decompressed bytes: `aa16cf094ba7bbbea481bec4470d1bbb9fc9d7f8ca59fbede1eb647f7c8bdcf7`. Uploaded gzip Git blob verified equal to local: `45663b222a6450f776b0c0aa1fddb130ea5eebbd`. Node stderr was empty; the outer terminal wrapper emitted `TERM environment variable not set` after execution, outside the Node log.

This checkpoint preserves actual executed evidence; full DOM, native environment checks and final engineering verdict are still pending in this continuation. No product source changed in this checkpoint, no other branch or repository written, no Mac/Actions/real account used.
