# Pro model and budget integration

This candidate runs a deterministic **fixture-rules** adapter for the independent
offline product journey. It has no live model configuration, price, key, model
quality approval, or production network activation. Existing `experiments/d12`
remains an unchanged historical rule baseline; its synthetic send grammar is not
relabelled as a real metadata source.

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

Protocol reference checked on 2026-10-31:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

The adapter implements the documented Responses `text.format`, completed output,
refusal and incomplete branches. No live call or account-specific model selection
has been performed. `store:false` does not assert zero retention or override the
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

Remaining external conditions are real source capability and shared owner
integration; current model/account availability; explicit purpose/destination/
budget approval; approved credential storage and optional host permission; an
independently annotated natural dataset; and actual provider/real-host acceptance.
These conditions do not block the implemented offline manual/suggestion journey.
