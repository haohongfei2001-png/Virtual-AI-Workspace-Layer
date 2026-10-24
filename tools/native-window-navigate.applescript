-- Native UI only. No browser scripting, CDP or page evaluation.
-- Requires explicit native process-control authorization and verified PID/Profile.
-- argv: PID, bundle ID, exact current title, current document URL,
--       exact address input, expected document URL, window-title suffix.
use framework "AppKit"
use scripting additions
on sameText(a, b)
  -- AppleScript default equality treats ASCII ':' and fullwidth '：' as equal.
  return (id of (a as text)) is (id of (b as text))
end sameText
-- Preserve every existing pasteboard type in RAM; never log or persist it.
-- If another actor changes the pasteboard, leave their newer value untouched.
on stageClipboard(addressText)
  set board to current application's NSPasteboard's generalPasteboard()
  set priorRevision to (board's changeCount()) as integer
  set savedItems to current application's NSMutableArray's array()
  repeat with oldItem in (board's pasteboardItems() as list)
    set savedItem to current application's NSPasteboardItem's alloc()'s init()
    repeat with dataType in (oldItem's types() as list)
      set payload to oldItem's dataForType:dataType
      if payload is missing value then error "Cannot preserve pasteboard type"
      if not ((savedItem's setData:payload forType:dataType) as boolean) then error "Cannot preserve pasteboard"
    end repeat
    savedItems's addObject:savedItem
  end repeat
  if (board's changeCount() as integer) is not priorRevision then error "Pasteboard changed during snapshot; no staging"
  board's clearContents()
  if not ((board's setString:addressText forType:(current application's NSPasteboardTypeString)) as boolean) then
    board's writeObjects:savedItems
    error "Cannot stage native paste"
  end if
  return {savedItems, (board's changeCount()) as integer}
end stageClipboard
on restoreClipboard(savedState)
  set board to current application's NSPasteboard's generalPasteboard()
  if (board's changeCount() as integer) is not item 2 of savedState then return false
  board's clearContents()
  if (item 1 of savedState)'s |count|() > 0 then board's writeObjects:(item 1 of savedState)
  return true
end restoreClipboard
on run argv
  if (count of argv) is not 7 then error "Expected seven target arguments"
  set targetPID to (item 1 of argv) as integer
  set bundleID to item 2 of argv
  set oldTitle to item 3 of argv
  set oldURL to item 4 of argv
  set inputText to item 5 of argv
  set targetURL to item 6 of argv
  set titleSuffix to item 7 of argv
  if (length of inputText) < 1 or (length of inputText) > 256 then error "Invalid address length"
  repeat with charID in id of inputText
    if charID < 33 or charID > 126 then error "Non-ASCII input rejected"
  end repeat
  tell application "System Events"
    set targets to id of (application processes whose unix id is targetPID)
    if (count of targets) is not 1 then error "Ambiguous process"
    set stableID to item 1 of targets
    set p to a reference to application process id stableID
    if unix id of p is not targetPID or not my sameText(bundle identifier of p, bundleID) then error "Process mismatch"
    if (count of (windows of p whose name is oldTitle)) is not 1 then error "Ambiguous window"
    set w to a reference to window oldTitle of p
    if not my sameText(name of w, oldTitle) or not my sameText(value of attribute "AXDocument" of w, oldURL) then error "Current document mismatch"
    if name of w does not end with titleSuffix then error "Profile suffix mismatch"
    set targetApp to current application's NSRunningApplication's runningApplicationWithProcessIdentifier:targetPID
    if not ((targetApp's activateWithOptions:0) as boolean) then error "Native activation failed"
    perform action "AXRaise" of w
    delay 0.5
    if (unix id of application processes whose frontmost is true) is not {targetPID} or value of attribute "AXMain" of w is not true then error "Target not foreground"
    tell p to keystroke "l" using command down
    delay 0.5
    set bar to a reference to UI element 1 of UI element 1 of UI element 1 of UI element 1 of UI element 1 of UI element 1 of w
    if role of bar is not "AXToolbar" then error "Toolbar mismatch"
    set found to false
    repeat with i from 1 to count of UI elements of bar
      if role of UI element i of bar is "AXGroup" then
        repeat with j from 1 to count of UI elements of UI element i of bar
          set field to a reference to UI element j of UI element i of bar
          if role of field is "AXTextField" and my sameText(name of field, "地址和搜索栏") then
            if value of attribute "AXFocused" of field is not true then error "Address not focused"
            set clipboardState to my stageClipboard(inputText)
            try
              tell p to keystroke "v" using command down
              delay 0.2
              if not my sameText(value of field, inputText) then error "Exact code-point readback mismatch; no submit"
            on error messageText number messageNumber
              my restoreClipboard(clipboardState)
              error messageText number messageNumber
            end try
            my restoreClipboard(clipboardState)
            if value of attribute "AXFocused" of field is not true or value of attribute "AXMain" of w is not true then error "Focus changed; no submit"
            if (unix id of application processes whose frontmost is true) is not {targetPID} then error "Process changed; no submit"
            tell p to key code 36
            set found to true
            exit repeat
          end if
        end repeat
      end if
      if found then exit repeat
    end repeat
    if not found then error "Address unavailable"
    repeat 20 times
      delay 0.25
      if unix id of p is not targetPID or not my sameText(bundle identifier of p, bundleID) then return "NAVIGATION_NOT_CONFIRMED: process changed; no replay"
      if (unix id of application processes whose frontmost is true) is not {targetPID} then return "NAVIGATION_NOT_CONFIRMED: foreground changed; no replay"
      repeat with k from 1 to count of windows of p
        try
        if value of attribute "AXMain" of window k of p is true and name of window k of p ends with titleSuffix then
          if my sameText(value of attribute "AXDocument" of window k of p, targetURL) then return "ARRIVED: " & targetURL
        end if
        end try -- transient native menus/windows may disappear during arrival
      end repeat
    end repeat
    return "NAVIGATION_NOT_CONFIRMED: no replay"
  end tell
end run
