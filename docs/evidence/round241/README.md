# Round241 — same-identity renewal must not starve native directory ingestion

CI36 at f39f3764d7ca330cb96d00d69ee7206df52345ca: https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38735742627

## Actual diagnostic evidence

Node4703/4703 and guard contracts passed. Original cold failed its20s gate; other implemented browser slices passed their existing limited scopes. The10k diagnostic scenario still failed original30s initial preparation, without full admission audit or timing.

The bounded readonly root snapshots now establish progress rather than merely frame absence:
- Approximately0.35s:55 refs,100 projects,revision4.
- Approximately10s:4679 refs,revision96.
- Approximately20s:5133 refs,revision199.
- Failure snapshot near30s:5273 refs,revision303.

Each root had one unrevoked source. These are point-in-time directory inventory counts, not distinct-ID admission audits. This explicitly observed run is diagnostic and provides no performance sample. All169 source/fixture hashes match the exact official commit.

## Confirmed mechanism and candidate

A separate deterministic real-adapter test advances the clock by10s for each valid same-identity renewal. The original implementation repeatedly resets the finite directory cursor. With1000 native controls, the no-renewal control reaches1000 IDs with1256 visits and16 packets; repeated legitimate renewal reaches only138 IDs with51456 visits and200 packets. When renewal injection stops, the same unchanged fixture drains completely.

The minimal adapter correction preserves an already-progressing private finite pass across same-identity renewal only when no genuine surface invalidation is pending. Renewal does not queue another full pass behind that active pass. A previously requested actual scan remains pending. Idle renewal still requests a fresh pass. Every renewal still advances the external loaded-read epoch, rechecks body proof, and preserves existing expiry/6s/request rules. Real DOM/title changes and route/document/producer changes keep their original invalidation behavior; synthetic toggle event properties cannot request preservation.

The corrected deterministic case reaches1000 IDs with3304 visits and16 packets across8 renewals. The extra bounded visits include body reobservation, not repeated full directory restarts. Further ticks after the final fragment produce no additional visits or packets.138 targeted adapter/candidate/controller tests pass. Independent review is recorded with the frozen candidate.

The CI command now removes FREE_HOST_SCALE_PROGRESS=1 and restores an unobserved formal10k attempt. The same original30s startup,6s RPC,5-minute fault limit, full pre/post distinct admission audit and strict measurement gate remain. No candidate browser success or sole explanation of all10k failures is assumed.

Prior1k membership is allUNKNOWN and timings are single samples. Full Free/SYS04/SYS05/J4, real ChatGPT and release readiness remain unestablished.
