# Native IndexedDB checkpoint

Original 29 repository contracts + 2 native migrations: 31/31 PASS on Chrome 154. Extended final: 39/39 PASS, no mock-IDB. db-original.json and db-final.json contain every result. Initial sandbox launch SIGABRT is separately archived; authorized host run succeeded.

Two stable native failures were saved in db-supplemental-initial.json and db-supplemental-diagnostic.json before repair. Real defect: index cursor.key is the index value (scope), not the operation row primary key. Recovery had left old receipts replayable. Replaced it with cursor.primaryKey. Native recovery now invalidates all old scoped receipts and revokes all evidence; revision exceeds trusted journal high-water. Abort handling now retains its first failure reason instead of overwriting stale-binding with a secondary TransactionInactive exception.

Mock cursor previously conflated index key and primaryKey, masking the defect. It now exposes both with native semantics; intermediary regression failure is retained in mock-cursor-incompatibility.tap. No native assertion reduced. Added real queued-put revoke / postcommit revoke / transaction abort / view schema and checksum corruption / recovery revoke tests. View bytes stay preserved, intact workspace remains 120/604. Recovery remains explicitly lossy.

Command: /private/tmp/vaiwl-pr7-mac-hTNRJ6Mq/venv/bin/python tests/b23/real-browser.py --mode db --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out docs/engineering/b23-mac-2026-10-11/db-final.json
Related Node command: node --test tests/b23/repository.test.mjs tests/b23/audit-regressions.test.mjs tests/b23/view-isolation.test.mjs
