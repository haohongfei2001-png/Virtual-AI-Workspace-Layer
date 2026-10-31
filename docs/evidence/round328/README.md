# Round328 — validated intermediate root capture

Parent HEAD: `4b031949cd7a3a37bf1978cdbb1c01342c41817f`.

The directory adapter now captures the existing partition writer's validated payload before it constructs an unused checksummed legacy root. Default writes and recovery still publish their original checksummed root. Structure, JSON/16 MiB limits, bucket verification, same-transaction pieces/locators, retention and authority are unchanged. Legacy injected writers remain supported through the existing proxy; missing, duplicate or mismatched captures fail.

Independent new contracts: original production 6 PASS / 5 FAIL; implementation 11/11 PASS. Related storage/recovery regression: 286/286 PASS, zero skips, terminal exit 0. Independent read-only review found no blocking issue. This is not a measured browser speedup or 100k acceptance.

Authorized cleanup recovery remains intact: development branch restored; external main cleanup stash `42c887720b672c53c2a29232685d848d2a0bc319` retained. Unrelated duplicate files and pending J3 fixture changes were not included in this commit. Full Free, MODERN J3 cold startup and 100k acceptance remain open; NOT_RELEASE_READY.
