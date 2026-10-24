-- Read-only macOS process/window inventory for explicitly authorized native UI work.
-- Usage: osascript tools/native-process-reference.applescript VERIFIED_PID EXPECTED_BUNDLE_ID
-- Verify the process command line/start time outside this script first. A PID is not
-- a browser Profile: confirm the actual Profile in chrome://version before account work.
-- Do NOT materialize a process object from a whose-query or a unique-ID lookup:
-- System Events can serialize that object by name and re-resolve a same-name sibling.
-- Keep an unevaluated reference rooted in the unique System Events process ID.
on run argv
  if (count of argv) is not 2 then error "Expected verified PID and bundle ID"
  set expectedPID to (item 1 of argv) as integer
  set expectedBundle to item 2 of argv
  if expectedPID < 1 or expectedBundle is "" then error "Invalid target"
  tell application "System Events"
    set targetIDs to id of (application processes whose unix id is expectedPID)
    if (count of targetIDs) is not 1 then error "Target process is not unique"
    set stableID to item 1 of targetIDs
    set targetReference to a reference to application process id stableID
    if unix id of targetReference is not expectedPID then error "Target PID mismatch"
    if bundle identifier of targetReference is not expectedBundle then error "Target application mismatch"
    set windowTitles to name of windows of targetReference
    if unix id of targetReference is not expectedPID then error "Target changed during observation"
    return {expectedPID, stableID, expectedBundle, windowTitles}
  end tell
end run
