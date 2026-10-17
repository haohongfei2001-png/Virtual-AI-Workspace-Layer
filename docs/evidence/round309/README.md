# Round309 — Page-read diagnosis and rejected concurrency experiment

Source baseline149ae7d. Initial isolated instrumented10k retains the original30s member-deadline FAIL:6031refs/revision203 is a point snapshot, not complete membership acceptance. The retained14.731s tail contains52 successful pages; native median128.10ms / sum6515.10ms, shared/evidence wait median172.75ms / sum7183.40ms, projection/DTO median18.30ms / sum765.60ms. Worker producerDropped1259 and merged dropped95 disclose truncation. Sums overlap across owners and are not CPU or whole-run wall time.

A bounded experiment extracted the existing native query validator, copied explicit selection and started native/shared/evidence readonly calls concurrently with allSettled and stable error priority. Independent23 contracts and a final whole Node run6022/6022 passed. The first whole run loaded old serial-order assertions before the test writer froze; its failures are retained separately, not concealed or counted as final passing evidence.

The ordinary uninstrumented10k experiment still failed the original deadline, point snapshot5266refs/revision197. The one follow-up bounded trace also failed,5356refs/revision196. Retained Project-page read median381.20ms versus333.90ms in the initial serial diagnostic; sample sizes and selected counts differ, so this is not a controlled performance certification. There is no evidence of benefit and possible additional contention. The production and concurrency-test changes were therefore NOT ADOPTED; the exact patch, successful tests and all browser outputs are preserved here. Production returns byte-for-byte to149ae7d. No deadlines, budgets, visibility or freshness checks were relaxed.

Final diagnostic tool retains a fixed-schema pageReadsMs/pageProjectionMs terminal with selected counts; source package remains unmodified. Original native-first then shared/evidence settlement is preserved. Earlier finer diagnostic fields are retained in their original raw JSON, not reinterpreted as parallel times.

All three browser runs used isolated headless local fixtures; source/fixture/manifest hashes stayed stable and temporary directories were removed. No private account, native real write, paid API, PAIA or deployment was used. Full81/profile/scale/cold/J4/G/U remain open; Free NOT_RELEASE_READY.

Remote fetch confirmed149ae7d is3 commits ahead and0 behindc0152fe, with Dotd1872d9 and Pro72ca068 retained. Normal push again failed the low-speed limit; local commits remain intact and the original Draft PR16/base is unchanged.

Final retained trace contracts57/57PASS on restored serial production. This is a targeted tool run; production retains Round3065973 whole-suite baseline. The experimental6022 run is not claimed for the final restored tree.
