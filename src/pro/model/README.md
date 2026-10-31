# Pro model and budget integration

## R1 independent closeout (2026-11-01)

Production local mode now uses **local-metadata-rules/1**, through
`organize/local-runner.mjs`. It uses supplied current names and human aliases,
keeps ambiguous or explicitly conflicting versions unassigned, and creates only
reviewed suggestions. It has no model/network dependency and no fixture adapter
in its production import graph. `fixture-rules` remains a separate historical
test adapter; its results are not natural Chinese model quality evidence.

`configuration.mjs` validates an immutable model profile, current matching price
card, declared input kinds and a trusted maximum for a single task. Missing this
maximum means zero. The user's separately saved task/day/month choices also start
at zero. Profile/price configuration does not grant authority or qualify
automatic operations. No real model ID, price, key or user data is bundled.

`jobs/organize-service.mjs` joins the existing billing store and proposal owner:
queue → reserve → fresh authorization → durable dispatch marker → one provider
attempt → usage accounting → strict output/current-source checks → reviewed
proposal registration. The service is disabled unless explicitly supplied with
all approved owner ports. It never supplies a default transport, stores a key,
or automatically retries a paid attempt. The default path registers suggestions.
The packaged `integration/model-bridge.mjs` composes this service through the
existing same-IDB billing and Pro asset owner, including current Native/Evidence/
Workspace/overlay transaction fences. Its production defaults supply no provider.

An optional, trusted `automation` owner port can separately supply the current
policy and atomic apply operation. Complete quality report arithmetic/digest,
the configured quality reference, model/prompt/schema binding, lane floor, first
run, explicit automatic scope and human controls are rechecked. At most one
qualified proposal applies per task; the remaining proposals stay reviewable or
stale after that asset revision. No real approval or natural quality report is
bundled. A successful auto result requires the owner's durable operation ID;
ambiguous commit replies never cause an automatic retry. Frame JSON cannot
supply this policy, quality report or apply port.
The current interface must additionally record the user's explicit automatic
preference for the selected organization range. `automaticEnabled` reports that
preference AND the actual current owner policy, qualified model binding and
available budget; an absent, expired or incomplete approval remains false. A task marked
committed means at least one of its suggestions has a verified durable operation;
other suggestions from that task may still require review.

Its worker-private `preview()` shows the authorized minimized payload, currency,
maximum estimated charge and task ceiling without reserving, getting a key or
sending data. A later task regenerates handles/nonces and rechecks the source;
the preview does not freeze authorization. `run()` returns a bounded task result;
the dispatch authorizer also receives an immutable, exact `payloadPreview` for
that specific request, including current estimated maximum and retention warning.
This object is private to the trusted owner; it is not stored or sent to a frame.
`status()` exposes bounded task states and exact ledger totals, never prompts,
raw replies or keys. The 30-second task limit aborts a hung provider independently
of the short frame RPC; a host starts it as a bounded worker task and returns
immediately. No worker keepalive loop is used.

The production confirmation presents a real minimized example, the fixed
receiver, a versioned retention-policy link and the actual charge/task ceilings.
Its worker-held, one-use review binds the current source and private budget
policy fence. Reusing a consumed review or changing the source, scope, selected
policy or normalized trusted configuration rejects the confirmation. Configured
provider state, a key or Pro membership never substitutes for that user choice.
Cancelling this disclosure performs no credential lookup, reservation or send.

`organize/metadata-batch.mjs` walks the owner's eligible sequence in batches of at
most ten without restarting at its first rows. The cursor binds source/constraint
revisions, processing mode and selected projects. Unknown results still consume
their position. `run` and `preview` accept owner-private `refIds`; one run freezes
its selected IDs across every fresh source check. Large legal alias collections
share the 32 KiB evidence budget fairly without changing saved titles/aliases.
An oversized provider projection omits optional topic summaries, then candidate
tail rows, and reports truncation; it cannot enter an automatic lane.
Identical new-topic seeds within one batch become one proposal with all members;
different names, versions, goals or outcomes stay separate. Rejection and deletion
checks still run per reference before grouping. Group rejection leaves durable
per-reference suppression even when the old proposal row retires.

`run`/`preview({reviewOnly:true,refIds})` implement explicit fine review of one to
ten selected references using the same approved frozen configuration. They use
a distinct job purpose, never enter an automatic lane, and do not silently
advance the ordinary batch. `run({automaticTrigger:true,refIds})` is a separate
incremental purpose: it requires current approved automatic quality before
reservation and immediately before dispatch. Missing qualification leaves a
paused checkpoint with no credential lookup or paid call; it cannot suppress a
later explicit manual suggestion task. It cannot combine with `reviewOnly`.
For these incremental tasks the trusted `automation.isCurrent(context,input)`
also receives `{phase:'dispatch-admission',quality,modelProfile,pack,versions}`
inside every reserve/dispatch authority check. Only a synchronous exact `true`
can authorize that billing transaction; a Promise is denied. The final automatic
asset transaction continues to use the full proposal input and its own check.
The production source observer supplies only newly eligible admitted references;
it does not fetch history, poll the host or repeatedly retry an unchanged batch.
Keeping this work active while viewing Free requires a separate explicit
`backgroundWhileNative` preference; the default is false and the original
organization range is retained. Scope/revocation/budget changes close these
preferences; no grant is restored from a backup or a task checkpoint.

Cancellation, scope revocation, a lost dispatch response and a timeout preserve
uncertain liabilities. A valid usage report is accounted before a semantic
rejection. A response missing usage, or a price card containing non-token charges
whose actual amount cannot be inferred, remains held for explicit reconciliation.
Expiring a price card prevents new work while old task status, cancellation and
recovery remain available, including after the service is recreated.
Explicit recovery can consult `getProposalReceipt` for at most twenty tasks per
call, verify their actual owner operation, and finish a lost task receipt without
applying a proposal again or releasing an unknown charge. Ending an old review
task preserves its independently saved suggestions. Task pages clamp to the last
current page when terminal job archival shrinks the list.
The bridge retains a scope-bound receipt cursor across explicit recovery calls,
so twenty genuinely pending tasks cannot hide a later completed one. Applying
another item from a multi-suggestion job is accepted only with the trusted
registration receipt proving both the tracked and actually applied proposal IDs.

The strict model output checks now also reject explicit disjoint source/target
versions. Queue deduplication survives reserved/dispatched stages. Evaluation
requires the whole declared eligible final cohort; omitted incorrect decisions
cannot improve reported precision/coverage. These are engineering guards, not
semantic accuracy evidence.

`tests/pro/closeout-ai-service.test.mjs` uses original synthetic Chinese metadata,
the actual same-IDB billing adapter with MockIDB, and an injected synthetic
Responses transport. It covers consent changes, malformed settings/output,
uncertain charges, a lost durable dispatch reply, timeout, no late registration,
no implicit replay, exact preview boundaries and expiry recovery. The source
and billing integration tests cover the owner callbacks separately. Optional
automation tests fabricate report arithmetic solely to exercise the real reducer
and one-use owner port. They are not natural measurements or an approval. No actual
provider call or fee is incurred by these tests.

Existing `experiments/d12` remains an unchanged historical rule baseline; its
synthetic send grammar is not relabelled as a real metadata source.

## Flow and owner boundary

`prepareMetadataEvidence` selects at most ten already authorized current
references, excludes UNKNOWN, enforces positive NONE or an explicitly selected
Project range, removes AI-processing exclusions, and records missing body
evidence. It does not create an identity, grant, source receipt, or membership.
`recallTopics` provides a local Chinese n-gram/Latin entity/version/alias/confirmed
Series-neighbor top twenty. No pairwise cloud scan or history fetching exists.

`buildProviderPayload` exposes only approved metadata/text and random job handles.
The scope, native URLs/IDs, source/authorization revisions, key and handle map stay
private. Handles do not anonymize the text. A conversation handle may cite that
item's own approved title/aliases as metadata evidence. This is a narrow
clarification of VAIWL-PRO/1.0: the frozen input shape otherwise has no separate
metadata evidence handle. Another conversation's handle cannot serve as evidence;
explicit content has its own same-reference evidence handle. No outbound field
or fake selected-text record was added.

The response passes bounded strict JSON/schema checks, nonce and handle mapping,
same-reference citation checks, conservative lexical entity/version checks,
current reference/version fences and hard constraints. `planSuggestions` creates
sealed contract proposals only. Proposal fingerprints omit model version, nonce,
clock and UI order. Rejected metadata actions stay suppressed on unrelated title
changes. The commit owner must check the current grant, source/Native/Evidence
roots, complete read/write set and current policy again inside its atomic commit.

The lexical support checks are deliberately conservative. They are neither
semantic proof nor model quality measurement. No rule or schema test opens an
automatic lane. First runs are previews; NEW_TOPIC, existing membership, related
membership and first-title automatic lanes require independent quality and
one-use owner tickets. Stable titles, primary relationships and structural
operations retain review requirements.

## OpenAI adapter

`createOpenAIResponsesAdapter()` is disabled by default and has **no implicit
fetch or key fallback**. A future shared owner supplies the transport, frozen
profile and `authorizeDispatch` callback. Immediately before dispatch that
callback must verify current scope/source/consent and the installation billing
budget, persist the dispatch marker, and consume its one-use RAM ticket. It may
then return a session-only key to the adapter. The callback is trusted owner code,
never a caller-provided UI field. Concurrent/repeated uses of the same ticket are
also rejected inside this adapter.

The sole packaged endpoint is `https://api.openai.com/v1/responses`, POST only,
redirects rejected, browser credentials omitted. The request disables storage,
streaming, background response execution and tools, and uses strict
`text.format` JSON Schema. Input estimation conservatively includes the exact
prompt, payload, schema and framing. Refusal/truncation are separate states;
HTTP/transport/parse failures after dispatch are outcome-unknown. There is no
automatic retry. A valid result is still untrusted until local validation and a
fresh owner commit check.

Protocol reference checked again on 2026-11-01:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Create a model response](https://developers.openai.com/api/reference/resources/responses/methods/create)

The adapter implements the documented Responses `text.format`, completed output,
refusal and incomplete branches. No live call or account-specific model selection
has been performed. Output limits enforce the documented minimum of 16 tokens;
the local frozen schema remains authoritative after the transport schema. The
selected future model must support this schema subset; fine-tuned model support
is not assumed. `store:false` does not assert zero retention or override the
provider's current policy. Public enablement requires the current official model,
price and retention disclosures to be verified again.

## Budget and jobs

`src/pro/jobs/budget.mjs` is a pure ledger reducer. It allocates no database. The
shared owner persists ledger state using its existing atomic transaction and
compares the read revision. Installation-total and all relevant scope sublimits
are checked together. Distinct time windows are explicit policies; account
switching does not reset the billing profile. Amounts use six-decimal integer
micro-units and exact rational token prices with ceiling, never floating-money
rounding. Policies/price currency must agree. No active installation policy means
budget zero.

`integration/model-budget.mjs` is the production user-budget owner. The interface
lets the user preview and confirm three exact micro-currency amounts: per task,
per UTC day and per UTC month. Dates and policy IDs are generated only by the
worker. The task amount cannot exceed the trusted provider configuration's
maximum. Queue availability is the smaller remaining day/month amount and every
additional applicable installation/scope ceiling, including current reservations
and unresolved charges. It is read-only, not a fourth adjustable allowance.
Near-limit and depleted states expose pause/adjust controls in the model panel.
The interface cannot select arbitrary providers, keys, policies or time windows.

`budgetSettings(session,signal)` returns safe configuration, periods, usage and
remaining amounts. `configureBudget(session,{limits,expectedRevision,operationId},
signal)` commits the exact reviewed three-limit choice under the current owner
and full billing-root revision; the operation ID provides durable exact replay.
Only these narrow user-choice and period-continuation commands are admitted by
the production bridge. General `CONFIGURE_POLICIES` and charge reconciliation
remain trusted administration operations and are not frame capabilities.

Choices live in the existing installation billing root/3, with minimum reader
`vaiwl-pro-billing-storage/3`; this is not a new database or a scope-local budget.
It preserves the root/2 journal segments, archival totals and immutable earlier
receipts. Current user choices independently constrain the atomic reservation,
even if another trusted owner raises a lower-level policy. A legacy archive
whose known charges overlap a newly requested historical window cannot silently
reset that allowance; the existing archived-window guard rejects it.
Daily/monthly continuation uses the already chosen limits and fixed UTC periods;
it never discards unknown liability, selects a model or starts a task itself.

Every production run carries a private digest of current user choices and all
applicable budget policies. It is rechecked on fresh task phases and inside the
same transaction as dispatch, proposal registration and automatic asset changes.
Consequently an external trusted budget change cannot race a late proposal or
automatic commit. User adjustments close current cloud/automatic preferences,
cancel unsent reservations, and preserve dispatched/settled liability. Ordinary
spending does not alter the policy digest or falsely revoke an independent task.

Dispatch immediately converts a reservation to held uncertain liability. A
timeout/restart cannot release or redispatch it. Unknown liabilities remain held
across time-window rollover. Only verified usage settlement or provider-confirmed
no-charge reconciliation releases that uncertainty. Unexpected actual overrun is
recorded, and further billing is frozen rather than hiding the charge. The ledger
controls this installation only; other apps/devices using the same key remain
outside its hard limit.

`lifecycle.mjs` implements bounded queue admission, deduplication and explicit
queued/reserved/dispatched/result/validation/review/commit states. Recovery never
dispatches or revives authorization. A memory-only Browser-Local session permits
temporary local rules only and discards its jobs on restart; paid/restartable work
requires an explicitly persistent scope.

## Evaluation and remaining conditions

`organize/evaluation.mjs` calculates Wilson intervals, separate automatic lanes,
pre-registered eligible coverage, annotation disagreement and split leakage, and
findability median/error outcomes. Synthetic tests never count toward the natural
1000-sample requirement or the 200 decisions per automatic lane. The arithmetic
tests fabricate rows only to prove threshold behavior; they are not a natural
benchmark. No natural quality report, human acceptance rate, billing estimate or
findability gain is claimed by this candidate.

Remaining external conditions are real source capability; current
model/account availability; the actual user's purpose/destination/spending choices
through the implemented confirmation and budget interface; a reviewed session
credential/transport owner with the packaged optional fixed host permission; an
independently annotated natural dataset; and actual provider/real-host acceptance.
These conditions do not block the implemented offline manual/suggestion journey.
