# Round305 — Keep short extension frames usable at actual 200% zoom

Base 6cafb29. Isolated headless packaged MV3, disposable profile and rejecting external-network proxy. No real account or native service writes.

The owned declarative exit previously inherited host-wide button font/padding, consuming 42.5 CSS pixels of a 63.8-pixel history region. Give only that owned direct child explicit system typography and padding (24-pixel minimum height). A short extension frame now scrolls between usable navigation/candidate panes instead of shrinking both below a control. Native regions, handlers, popover masks and authorization remain unchanged.

Opt-in supported-height case uses actual Chrome zoom 2, physical viewport 1200x1000 reduced to 1200x900 (CSS 600x450). Native reading/history regions remain nonzero. The original default CSS600x380 scenario is unchanged and its prior failure is not replaced or counted as passing.

Initial complete `round305-supported-ui-complete.json.gz`: PASS, sourceChangedDuringRun=false, all cleanup fulfilled. Strict full-control clipping and hit checks, settings, native keyboard manual7 selection, native model/tools, retained draft/editor/document, both declarative exits, reading-only unique return and height restore pass. Native select type-ahead `7 → Enter` produces trusted input/change. ArrowDown sequences generated uncancelled trusted keys but no change on this headless platform; retained failures do not establish that interaction as working.

All eight raw attempts and available failure screenshots retained. Initial layout failures precede the two CSS fixes. Later runner corrections reflect actual contracts: sidebar-only exit releases native history while workspace stays open; workspace return count is zero, reading return count one; queued popover toggle is awaited within the existing bounded timeout. Assertions were not replaced by injected select values or weakened clipping.

This is a UI06/UI07/UI10 supported-height slice, not complete UI10, physical IME, live ChatGPT, whole81/profile/scale/cold/J4 or Free release certification. NOT_RELEASE_READY.

Independent review then found an empty candidate container retained minimum height. The final CSS resets both empty roots. `round305-supported-ui-empty-fixed.json.gz` repeats the full supported Host slice: PASS, stable sources, cleanup fulfilled. Actual Host candidate containers are populated; a separate exact-packaged-CSS page verifies genuinely empty candidate height zero, explicitly WEB_MECHANISM_ONLY. No production content is deleted to manufacture the empty condition. The preceding complete browser result remains bound to its own earlier source hashes.

Final complete Node suite **5958/5958 PASS**, zero skips/failures; final log retained separately from the pre-empty-fix run. Independent review correction resolved before commit.
