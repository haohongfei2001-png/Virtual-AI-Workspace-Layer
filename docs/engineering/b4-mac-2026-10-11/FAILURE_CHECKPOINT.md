# B4 real failure checkpoint

Fresh headless Chrome154, real MV3, original accepted PR7 runtime hashes verified against dc73231d. Three stable failures: actual 22.5 seconds after the 20s lease gives WAITING/lease-expired; observed worker stopped event but no automatic wake/rebind (driver sent no probe or reload to wake it); another tab manual edit not automatically observed after 3.5s. Raw JSON/log retained. CAS/IDB are not failing and are not being replaced.

New implementation is currently under regression, not yet certified: fenced CHECK version metadata every2s, actual lease renewal/new BIND, bounded reconnect, no write replay, versioned editor drafts retained across updates and transient suspension. Initial existing Node regression118/118 PASS; actual full B4 native outcomes still pending.
