# Round242 — bounded shared storage during Host ingestion

CI37, exact source96da3c9aad72dec07902ef5a655607857cd96d2b:
https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/38737804972

4712/4712 Node contracts passed. The original pristine cold case passed this run, but the instrumented cold case failed its unchanged gate. The formal10k scenario still failed original30s startup. Failure-only readonly evidence shows6983 refs/100 projects, native revision140/sourceRevision139, one active source. All169 source/fixture hashes match the exact commit; source, fixture and manifest unchanged flags are false. This inventory is not a complete distinct-ID admission audit, and no10k timing sample exists.

## Independent mechanism

Native admission also registers shared reference anchors. The existing legacy path repeatedly clones, validates, compares and hashes all accumulated shared refs; automatic partition migration only occurred beyond15000 refs. The read path does not migrate monolithic roots. A separate production-composed repository without a synthetic evidence gate also rejected pure storage migration, although it preserved existing data.

An80-reference/8-batch MOCK_IDB counter test exercises actual NativeRepository.apply with explicit offline Host admissions and an existing human workspace. The old implementation clones0,10,20,...70 accumulated shared refs. The candidate performs one checked partition migration and one existing shared-directory migration; each new-reference batch then clones only its bounded partial input (zero previously existing refs in this fixture). Both retain all80 native/shared IDs, exact titles/URLs and human assets. These counters establish reduced repeated work, not browser speed.

## Candidate and safety boundaries

Only Host admission with actual new refs and an existing legacy root requests early migration. A truly fresh first write and no-new-reference writes retain their existing path. The failed native transaction is aborted before migration; one retry keeps the original native expectedRevision and live guard. Existing synthetic capacity behavior remains.

Pure storage migration first clones its input and requires an exact checksum object whose digest equals the entire supplied original state. The existing stored root must match before staging and again at atomic publication. Fresh initialization still requires the original synthetic gate. Human assets and evidence are preserved, not reauthorized. Directory migration reuses the existing full audit and codec; faults/revocation fail closed and preserve the original native operation identity. If directory publication fails after partition migration, later native writes can resume on the valid partitioned format; that retry alone does not certify directory-performance recovery. The existing HEADER path can separately attempt directory migration.

The new10-case contract set is2PASS/8FAIL on the original source and10PASS on the candidate. Existing joint/binding/continuation affected contracts passed64 tests; storage migration, retention and owner-write contracts passed46 tests. Existing joint-owner and SYS02 fault contracts also passed32 tests. These sets overlap and are not added as unique counts. Independent review passed the10 new cases and4 additional concurrency/revocation cases. A competing native commit between migration phases wins; the original operation keeps its revision-conflict rather than overwriting it.

The next actual10k run retains the same30s preparation,6s RPC, one retry, full pre/post admission audit and strict measurement gate. No extra workload or timeout increase. The earlier1k measurements remain single samples with all membership UNKNOWN. FullFree, SYS04/SYS05, immediate cold support and release readiness remain open.
