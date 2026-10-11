# B4 failure feedback / bounded request checkpoint

4/4 core journeys PASS before final timeout fix: 65s active run with >=3 distinct actual20s leases, stopped worker automatic wake/rebind, multi-tab draft conflict and explicit retry, bounded disconnect and command/undo committed reply loss without auto replay. Existing page17/MV319/Node121/DOM49 regressions PASS. Raw results retained, not accumulated.

Final additional actual counterexample: held real CHECK reply never settles; retries alone cannot recover while that promise is pending. held-reply-before.json records FAIL. Add a6s request deadline; late read reply cannot update state, timed-out writes remain UNKNOWN and are never replayed. Synthetic provider delay is bounded at3s. Terminal feedback appears only after5 failed reconnect attempts; unknown/hidden retains zero derived roots. Full final core suite now includes this counterexample and is pending. No repository/IDB/CAS/undo logic changed.
