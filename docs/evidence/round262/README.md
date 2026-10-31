# Round262 — Native composer reachable after owned workspace frames

Base `f6ac8a25894ce1e65567ef917b877f086128b689` (Round261), 2026-10-16, original local branch / Draft PR16. Product change is confined to `src/navigation/mount-surface.mjs`.

Both owned manual surfaces previously appeared after the entire native document in DOM order. Forward Tab out of the sidebar therefore traversed the document-end/browser focus boundary before it could reach the composer. Round261 retains the exact formal failure and diagnostic results; no assertion or delay in the formal J3 was changed.

Mount now inserts only the owned workspace/sidebar siblings before the body's top-level child containing the composer. Native nodes retain their parents, order relative to other native nodes, handlers and content. Geometry, manual-popover behavior, native masks, authority, focus surrender and closed iframe layout are unchanged; no positive tabindex, Tab interception or explicit composer focus was added. Existing fallback append remains for a composer without a body ancestor, not a new supported-profile claim.

## Actual validation

- Unmodified formal packaged J3 **16/16 steps PASS**, including its UI06 subcase. Open backward reaches composer in13 keys; closed backward/forward reach history/composer in7/7; open forward reaches composer in18. Original64-key/15-second bounds and atomic observations remain. Parent AX positive/negative mask checks, unique return, native controls, both original drafts/File, SPA Back/Forward, actual200% Chrome zoom, older-window navigation, UNKNOWN access, saved snippet save/search/locate and native search pass. Final screenshot inspected. Source/script/helper hashes stay stable.
- Actual isolated packaged Chrome disable **5/5** and uninstall **4/4** pass. Each separately asserts nativeOperable/privateProjectionAbsent/cleanLayout; old frames detach and owned nodes disappear. Uninstall retains the hidden-private positive control and uses no manual close. This is actual disable/uninstall, not stop substitution.
- Placement/geometry/surrender/closed-layout Node contracts **25/25** pass. New direct/nested composer structure cases assert owned insertion order, original native parent/children/handler/draft identity, same-frame reentry, native focus surrender and disposal restoration. These counts are included in the full regression, not added to it.
- Actual packaged immediate exit **4/4 PASS**, covering workspace and reading-sidebar immediate clicks, original drafts,21-second grant boundary/native SPA, and new-document fresh grants. Final full Node **5207/5207 PASS, zero skipped**.

## Scope limits

The passing keyboard S is the LEGACY/J3 fixture geometry. When a real host wraps header/history/composer in one application root, the owned surfaces precede that entire root; a backward route may still cross the document-start/browser boundary. The nested DOM unit test verifies preservation only, not real keyboard behavior. Other normal-profile keyboard/visual matrix cases remain necessary. Full UI06/UI10/J3-v2.7 acceptance, real ChatGPT, physical keyboard/IME, actual PAIA and G/U are not inferred.

The Round26110k success and earlier CI failures retain their own source/environment. This mount-only change does not establish p95,100k/cold reliability or clear all81 cases, SYS02/J4 or release gates. Free remains **NOT_RELEASE_READY**.
