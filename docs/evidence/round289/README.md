# Round289 — Same-identity authentication source renewal

Base2634304. ScopeAuthority permits the two supported authenticated transports to renew the same principal/context/profile with a fresh immutable source proof, preserving scope/session/grant identity. Existing C2 receipt and expiry/current/deadline checks remain mandatory. Unknown transports and identity/context/profile changes still reject. Observation work captures transport/profile and rejects completion while these differ; same-source receipt renewal remains usable. An additional rapid source round-trip (ABA) review is pending, not certified by this slice.

Independent16 tests: original9PASS/7FAIL, final16PASS. Full Node5692/5692PASS, zero skipped; losslessly compressed complete logs retained. Independent review of this slice found no blocker.

Actual isolated headless packaged MV3 C3 fixture PASS. Initial worker transport failure uses real isolated session/accounts; genuine hidden/visible trusted tab transitions then authenticate isolated→worker→isolated. Both HOST_FOCUS replies reach verified. Exactly one HELLO and REFRESH remain, original private frames/mount/editor and draft are retained. Worker session/accounts each1, isolated each2, worker aborted2. Package/fixture/source hashes stable; reject proxy closed and cleanup fulfilled. No real account or native service writes; cold start and first-party service worker remain unverified.

Round288 normal push failed low-speed timeout; both checkpoints will use normal non-force synchronization. Full81/profile, cold reliability,100k, realG/U and Free release acceptance remain open. NOT_RELEASE_READY.
