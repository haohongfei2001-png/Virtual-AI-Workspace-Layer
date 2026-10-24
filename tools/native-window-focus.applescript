-- Native-only acceptance helper. Requires explicit authorization for this PID.
-- Never activates by application name (multiple Chrome processes can coexist).
-- argv: exact PID, bundle ID, approved window-title prefix, profile-title suffix.
use framework "AppKit"
use scripting additions
on run argv
  if (count of argv) is not 4 then error "Expected four target arguments"
  set targetPID to item 1 of argv as integer
  set expectedBundle to item 2 of argv
  set titlePrefix to item 3 of argv
  set titleSuffix to item 4 of argv
  if targetPID < 1 or titlePrefix is "" or titleSuffix is "" then error "Incomplete target"
  set targetApp to current application's NSRunningApplication's runningApplicationWithProcessIdentifier:targetPID
  if targetApp is missing value then error "Process unavailable"
  if (targetApp's bundleIdentifier() as text) is not expectedBundle then error "AppKit bundle mismatch"
  tell application "System Events"
    set targets to id of (application processes whose unix id is targetPID)
    if (count of targets) is not 1 then error "Ambiguous process"
    set stableID to item 1 of targets
    set p to a reference to application process id stableID
    if unix id of p is not targetPID or bundle identifier of p is not expectedBundle then error "Process mismatch"
    if (count of (windows of p whose name starts with titlePrefix and name ends with titleSuffix)) is not 1 then error "Ambiguous window"
    set w to a reference to (first window of p whose name starts with titlePrefix and name ends with titleSuffix)
    -- `set frontmost of p` can select another same-named Chrome process.
    if not ((targetApp's activateWithOptions:0) as boolean) then error "PID activation failed"
    perform action "AXRaise" of w
    set value of attribute "AXMain" of w to true
    delay 0.2
    set actualApp to current application's NSWorkspace's sharedWorkspace()'s frontmostApplication()
    if (actualApp's processIdentifier() as integer) is not targetPID then error "AppKit foreground mismatch"
    if (unix id of application processes whose frontmost is true) is not {targetPID} then error "AX foreground mismatch"
    if unix id of p is not targetPID or value of attribute "AXMain" of w is not true then error "Window mismatch"
    return "EXACT_PID_WINDOW_FOCUSED"
  end tell
end run
