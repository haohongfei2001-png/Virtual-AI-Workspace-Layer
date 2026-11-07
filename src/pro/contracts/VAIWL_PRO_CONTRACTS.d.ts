/**
 * VAIWL Pro contract VAIWL-PRO/1.0 — DESIGN ONLY, no runtime implementation.
 * Read-only baseline: PR16 / 2fa94ba303273dd56d74d4c66950a093e7b8038c
 * Existing DB version = 4; Workspace state schema = 2.
 * Do not reserve a future IDB version here. Shared owner allocates it at integration.
 *
 * Runtime requirements:
 * - All external DTOs pass strict schemas, byte bounds and live owner verification.
 * - Type brands are compile-time aids, never authentication or storage authority.
 * - Grants/tickets live in owner RAM; persisted descriptors cannot recreate them.
 * - No API, scope permission, source capability or native writer is implied.
 * - Current Browser-Local has no body/message-ID source or positive NONE route
 *   in its observed production profile. Missing capability blocks that operation.
 */
export type Brand<T, K extends string> = T & { readonly __brand: K };
export type ScopeKey = Brand<string, "ScopeKey">;
export type ConversationId = Brand<string, "ConversationId">;
export type NativeProjectId = Brand<string, "NativeProjectId">;
export type TopicId = Brand<string, "TopicId">; // Preserve legacy Workspace ID.
export type SeriesId = Brand<string, "SeriesId">;
export type ProposalId = Brand<string, "ProposalId">;
export type OperationId = Brand<string, "OperationId">;
export type JobId = Brand<string, "JobId">;
export type SourceId = Brand<string, "SourceId">;
export type Digest = Brand<string, "Digest">;
export type ISODate = Brand<string, "ISODate">;
export type Revision = Brand<number, "Revision">; // Non-negative safe integer.
export type Milliseconds = Brand<number, "Milliseconds">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type ModelProfileId = Brand<string, "ModelProfileId">;

/** A registered model profile is a configuration, not a quality approval. */
export interface ModelProfile {
  readonly id: ModelProfileId;
  readonly providerProfileId: string;
  readonly frozenModelVersion: string;
  readonly promptVersion: string;
  readonly outputSchemaVersion: "vaiwl-pro-model-output/1";
  readonly inputKinds: readonly ("metadata" | "selected-text" | "sent-user-input")[];
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxUtf8Bytes: number;
  readonly priceCardVersion: string | null; // Paid execution requires a current card.
  readonly qualityGateReference: string | null; // Null means suggestions only.
}

declare const modelExecutionTicketBrand: unique symbol;
export interface ModelExecutionTicket {
  readonly [modelExecutionTicketBrand]: true;
  readonly jobId: JobId;
  readonly modelProfileId: ModelProfileId;
  readonly reservationId: string | null;
}
// The existing owner verifies current consent/capability/budget before minting
// this one-use RAM ticket. It is never serialized to the provider or backup.
export type ModelTransportReply =
  | { readonly state: "complete"; readonly json: unknown;
      readonly providerRequestId: string | null;
      readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null }
  | { readonly state: "refusal" | "truncated"; readonly providerRequestId: string | null }
  | { readonly state: "not-dispatched"; readonly reason: string }
  | { readonly state: "outcome-unknown"; readonly providerRequestId: string | null };
export interface ModelExecutionPort {
  execute(ticket: ModelExecutionTicket, payload: ProviderPayload,
    signal: AbortSignal): Promise<ModelTransportReply>;
}
// This port lives behind the controlled worker/service adapter. Pure planners
// cannot fetch arbitrary endpoints, access secrets, or commit model JSON.
export type PolicyVersion = Brand<string, "PolicyVersion">;
export type Currency = Brand<string, "Currency">;
export type MicroUnits = Brand<number, "MicroCurrencyUnits">; // Non-negative safe integer, scale=6.
export declare const MONEY_SCALE: 6;

export type SourceScope =
  | { readonly kind: "browser-local-session"; readonly key: ScopeKey;
      readonly serverIdentity: "not-established"; readonly persistence: "memory" }
  | { readonly kind: "browser-local-personal"; readonly key: ScopeKey;
      readonly serverIdentity: "not-established"; readonly persistence: "same-idb";
      readonly selectionRequired: true }
  | { readonly kind: "verified-scope"; readonly key: ScopeKey;
      readonly serverIdentity: "established"; readonly persistence: "same-idb" };

export interface SourceCapabilitySnapshot {
  readonly scope: SourceScope;
  readonly metadata: "available" | "unavailable";
  readonly positiveNone: "available" | "unavailable";
  readonly selectedText: "available" | "unavailable";
  readonly sentUserInput: "available" | "unavailable";
  readonly historicalCompleteness: "partial" | "known-domain-complete";
  readonly reasonCodes: readonly string[];
}
// Current Browser-Local must report selectedText/sentUserInput unavailable.
// It must not synthesize message IDs or silently enable a new provider.

export type NativeMembership =
  | { readonly state: "PROJECT"; readonly projectId: NativeProjectId;
      readonly evidenceId: EvidenceId; readonly revision: Revision }
  | { readonly state: "NONE"; readonly evidenceId: EvidenceId;
      readonly revision: Revision }
  | { readonly state: "UNKNOWN"; readonly reason: string; readonly revision: Revision };

export interface NativeRefReadModel {
  readonly id: ConversationId;
  readonly nativeTitle: string;
  readonly nativeUrl: string | null; // Validated by existing NavigationPort.
  readonly membership: NativeMembership;
  readonly available: boolean;
  readonly freshness: "current" | "last-known" | "revalidation-needed";
  readonly nativeRevision: Revision;
  readonly sourceIds: readonly SourceId[];
}
// ActivityDecision is an existing shared DTO. The adapter must retain its
// original precision/provisional/undated semantics, never rederive it from AI.
export interface SharedActivityRef {
  readonly conversationId: ConversationId;
  readonly decisionId: string;
  readonly decisionRevision: Revision;
}
export interface RevisionVector {
  readonly scopeKey: ScopeKey;
  readonly authorizationEpoch: Revision;
  readonly sourceGeneration: Readonly<Record<string, Revision>>;
  readonly nativeFields: Readonly<Record<string, Revision>>;
  readonly overlayRevision: Revision;
  readonly targets: Readonly<Record<string, Revision>>;
  readonly constraintRevision: Revision;
  readonly policyVersion: PolicyVersion;
  readonly evidenceDigest: Digest;
}

declare const semanticGrantBrand: unique symbol;
export interface SemanticGrant {
  readonly [semanticGrantBrand]: true;
  readonly scope: SourceScope;
  readonly epoch: Revision;
  readonly allowedInputs: readonly ("metadata" | "selected-text" | "sent-user-input")[];
  readonly expiresAt: ISODate;
}
// Only the existing owner can mint/validate this RAM object; model/UI JSON
// cannot specify it, and persisted grant fields are not rehydration authority.
declare const humanIntentBrand: unique symbol;
export interface HumanIntentReceipt {
  readonly [humanIntentBrand]: true;
  readonly intentId: string;
  readonly scopeKey: ScopeKey;
  readonly generation: Revision;
}
declare const automatedTicketBrand: unique symbol;
export interface AutomatedApplicationTicket {
  readonly [automatedTicketBrand]: true;
  readonly scopeKey: ScopeKey;
  readonly proposalId: ProposalId;
  readonly policyVersion: PolicyVersion;
  readonly qualityGateVersion: string;
}

export type ModelProcessingConsent =
  | { readonly mode: "off"; readonly revision: Revision }
  | { readonly mode: "local"; readonly revision: Revision;
      readonly inputKinds: readonly ("metadata" | "selected-text" | "sent-user-input")[];
      readonly maxMemoryMiB: number; readonly maxDownloadMiB: number }
  | { readonly mode: "cloud"; readonly revision: Revision;
      readonly providerProfileId: string;
      readonly modelProfileIds: readonly ModelProfileId[];
      readonly allowedEndpointProfile: string; // Packaged allowlisted endpoint.
      readonly inputKinds: readonly ("metadata" | "selected-text" | "sent-user-input")[];
      readonly retentionDisclosureVersion: string;
      readonly approvedBudgetId: string;
      readonly approvedAt: ISODate };

export interface EvidencePackBase {
  readonly format: "vaiwl-pro-evidence/1";
  readonly packId: string;
  readonly scope: SourceScope;
  readonly versions: RevisionVector;
  readonly references: readonly NativeRefReadModel[];
  readonly knownCandidateTopicIds: readonly TopicId[];
  readonly missing: readonly ("membership" | "body" | "author" | "history" | "continuation")[];
  readonly truncated: boolean;
  readonly evidenceIds: readonly EvidenceId[];
}
export type EvidencePack =
  | (EvidencePackBase & {
      readonly inputLevel: "metadata-only";
      readonly metadata: readonly { readonly refId: ConversationId;
        readonly nativeTitle: string; readonly humanAliases: readonly string[] }[];
      readonly content?: never;
    })
  | (EvidencePackBase & {
      readonly inputLevel: "authorized-content";
      readonly metadata: readonly { readonly refId: ConversationId;
        readonly nativeTitle: string; readonly humanAliases: readonly string[] }[];
      readonly content: readonly (
        | { readonly kind: "explicit-selected-text"; readonly evidenceId: EvidenceId;
            readonly refId: ConversationId; readonly text: string;
            readonly role: "user" | "unknown";
            readonly anchor: { readonly kind: "verified-message"; readonly messageId: string;
              readonly branchId: string; readonly bodyHash: Digest }
              | { readonly kind: "unanchored"; readonly reason: string } }
        | { readonly kind: "verified-sent-user-input"; readonly evidenceId: EvidenceId;
            readonly refId: ConversationId; readonly text: string;
            readonly messageId: string; readonly sourceId: SourceId;
            readonly originalAuthorVerified: true }
      )[];
    });
// Content is transient. An independent, explicit retention policy is needed
// to persist text. Default logs only retain evidence IDs/hashes.
// EvidencePack is an INTERNAL envelope. It is NEVER a provider request body.
export type ProviderHandle = Brand<string, "JobScopedProviderHandle">;
export interface ProviderPayload {
  readonly schema: "vaiwl-pro-provider-input/1";
  readonly requestNonce: string; // Random, job-scoped, not native/job/scope ID.
  readonly items: readonly {
    readonly handle: ProviderHandle;
    readonly approvedTitle: string;
    readonly approvedAliases: readonly string[];
    readonly approvedText: readonly { readonly evidenceHandle: ProviderHandle;
      readonly kind: "selected-text" | "sent-user-input"; readonly text: string }[];
  }[];
  readonly candidateTopics: readonly {
    readonly handle: ProviderHandle; readonly approvedName: string;
    readonly approvedIntentSummary: string | null;
  }[];
  readonly allowedOperations: readonly ("classify" | "name" | "propose-topic" | "propose-series"
    | "propose-split" | "propose-merge" | "propose-topic-relation")[];
  readonly outputSchemaVersion: string;
}
export interface InternalProviderHandleMap {
  readonly requestNonce: string;
  readonly scopeKey: ScopeKey;
  readonly inputDigest: Digest;
  readonly handles: ReadonlyMap<ProviderHandle,
    { readonly kind: "conversation"; readonly id: ConversationId }
    | { readonly kind: "topic"; readonly id: TopicId }
    | { readonly kind: "evidence"; readonly id: EvidenceId }>;
}
// Handle map and SemanticGrant stay owner-private. Model sees no native IDs,
// native URLs, scope keys, tokens, account/workspace proof or actionable grants.
// Provider result begins as unknown, passes a strict schema, and resolves only
// handles in THIS job's current map before it can become an internal Proposal.

export type ControlMode = "automatic" | "human";
export interface FieldControl {
  readonly mode: ControlMode;
  readonly locked: boolean;
  readonly revision: Revision;
  readonly lastHumanOperation: OperationId | null;
}
// Unsetting locked does not change mode. RELEASE_TO_AUTO is a distinct command.
export interface TopicIntent {
  readonly object: string;
  readonly objective: string;
  readonly expectedOutcome: string | null;
  readonly evidenceIds: readonly EvidenceId[];
}
export interface VirtualTopic {
  readonly id: TopicId;
  readonly scopeKey: ScopeKey;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly icon: string;
  readonly intent: TopicIntent | null;
  readonly nameControl: FieldControl;
  readonly membershipControl: FieldControl;
  readonly lifecycle: "proposed" | "active" | "redirected" | "trashed";
  readonly createdBy: "human" | "automation" | "legacy";
  readonly revision: Revision;
}
export interface TopicTombstone {
  readonly topicId: TopicId;
  readonly deletedBy: OperationId;
  readonly intentDigest: Digest | null;
  readonly evidenceDigest: Digest | null;
  readonly proposalFingerprints: readonly Digest[];
  readonly revision: Revision;
}
// Tombstone is a deletion/suppression record, not another visible lifecycle.
// Empty/dormant/history are derived projection conditions, not archiving states.
export interface DerivedTitleBase {
  readonly conversationId: ConversationId; // One global derived identity per C.
  readonly aliases: readonly string[];
  readonly control: FieldControl;
  readonly evidenceIds: readonly EvidenceId[];
  readonly revision: Revision;
}
export type DerivedTitle = DerivedTitleBase & (
  | { readonly displayPreference: "derived"; readonly title: string }
  | { readonly displayPreference: "native"; readonly title: string | null }
);
// RESTORE_NATIVE_TITLE preserves manual title control as displayPreference=native and
// follows current nativeTitle. It does not freeze a copied old native title,
// erase protection, or invite the next AI run to overwrite the user's choice.
// A retained derived title remains available for SET_TITLE_DISPLAY=derived;
// switching to derived with no retained value is rejected, not fabricated.
export interface VirtualPlacement {
  readonly conversationId: ConversationId;
  readonly topicId: TopicId;
  readonly role: "primary" | "related";
  readonly activityContribution: "primary-only" | "none";
  readonly state: "included" | "dormant-native-membership" | "revalidation-needed";
  readonly control: FieldControl;
  readonly constraintRefs: readonly string[];
  readonly evidenceIds: readonly EvidenceId[];
  readonly revision: Revision;
}
// Exactly <= 1 included primary placement per C in a scope, across view modes.
// Multiple related placements never duplicate DerivedTitle or native facts.
// v1: primary => primary-only; related => none. No inferred topic-specific
// activity. Renaming, reclassification, Series and merge do not create activity.
export type ProjectionEligibility =
  | { readonly mode: "pro-default-none"; readonly membership: Extract<NativeMembership, { state: "NONE" }> }
  | { readonly mode: "pro-cross-project"; readonly membership: Exclude<NativeMembership, { state: "UNKNOWN" }> }
  | { readonly mode: "pending-reference"; readonly membership: Extract<NativeMembership, { state: "UNKNOWN" }> };
// UNKNOWN references remain reachable in Free/working sets; neither default
// Pro grouping nor cross-project AI classifies them. A human checkbox is not NONE.
export type Constraint =
  | { readonly kind: "exclude-topic"; readonly refId: ConversationId;
      readonly topicId: TopicId; readonly revision: Revision; readonly operationId: OperationId }
  | { readonly kind: "exclude-ai-processing"; readonly refId: ConversationId;
      readonly revision: Revision; readonly operationId: OperationId }
  | { readonly kind: "reject-proposal"; readonly proposalFingerprint: Digest;
      readonly evidenceDigest: Digest; readonly targetDigest: Digest;
      readonly revision: Revision; readonly operationId: OperationId }
  | { readonly kind: "forbid-merge"; readonly topicIds: readonly [TopicId, TopicId];
      readonly revision: Revision; readonly operationId: OperationId };
// exclude-topic / forbid-merge are hard human constraints. Only a new explicit
// human command can remove them. New evidence can reopen a dismissed proposal,
// but can never override a hard pair exclusion.
export interface LegacyPrimaryResolution {
  readonly refId: ConversationId;
  readonly originalPlacementIds: readonly string[];
  readonly preservedAssetDigest: Digest;
  readonly candidates: readonly TopicId[];
  readonly status: "primary-resolution-required" | "resolved";
  readonly chosenPrimary: TopicId | null;
}
// Legacy one active relation -> primary. Existing explicit primary intent wins.
// Legacy multiple human placements without such intent stay preserved/read-only
// until a one-time plan resolves them; no first-match or silent all-related map.
// The uncollected set is refs with NO eligible primary, even if related edges exist.
export interface TopicRelation {
  readonly fromTopicId: TopicId;
  readonly toTopicId: TopicId;
  readonly kind: "related";
  readonly control: FieldControl;
  readonly activityContribution: "none";
  readonly revision: Revision;
}
// Topic-to-topic relation is a separate optional later feature. It is not a
// Conversation Placement and must not be implied by a "also related" chat menu.
export interface Redirect {
  readonly fromTopicId: TopicId;
  readonly toTopicId: TopicId;
  readonly operationId: OperationId;
  readonly revision: Revision;
}
// Redirects and Series parent/continuation relations must be acyclic.

export interface Series {
  readonly id: SeriesId;
  readonly topicId: TopicId;
  readonly title: string;
  readonly entries: readonly ConversationId[];
  readonly edges: readonly (
    | { readonly kind: "continuation"; readonly from: ConversationId; readonly to: ConversationId }
    | { readonly kind: "branch"; readonly from: ConversationId; readonly to: ConversationId }
  )[];
  readonly labels: readonly {
    readonly refId: ConversationId;
    readonly sequence: readonly number[] | null; // Integers, never float versions.
    readonly source: "human-confirmed" | "evidence-confirmed";
  }[];
  readonly revision: Revision;
}
export interface ManualSeriesPlan {
  readonly kind: "manual-series-plan";
  readonly seriesId: SeriesId | null; // New stable ID is allocated by owner.
  readonly topicId: TopicId;
  readonly title: string;
  readonly entries: readonly ConversationId[];
  readonly edges: Series["edges"];
  readonly labels: Series["labels"];
  readonly expected: RevisionVector;
  readonly planHash: Digest;
}
export interface ManualSeriesPlanBuilder {
  // Pure domain function; this method creates no authority and writes nothing.
  build(input: Omit<ManualSeriesPlan, "kind" | "planHash">, snapshot: {
    readonly knownRefs: readonly ConversationId[];
    readonly topicId: TopicId;
    readonly currentSeries: Series | null;
    readonly versions: RevisionVector;
  }): Result<ManualSeriesPlan>;
}
// Similarity is a related-topic relation, not a continuation edge.
// Product version, document version and Series sequence are separate values.

export interface ProposalBase {
  readonly id: ProposalId;
  readonly fingerprint: Digest;
  readonly planHash: Digest;
  readonly versions: RevisionVector;
  readonly evidenceIds: readonly EvidenceId[];
  readonly model: { readonly profileId: ModelProfileId; readonly modelVersion: string;
    readonly promptVersion: string; readonly outputSchemaVersion: string } | null;
  readonly summary: string;
  readonly rationale: readonly string[]; // User-facing evidence, not hidden reasoning.
  readonly qualityBand: "eligible-auto" | "review" | "insufficient";
}
// fingerprint identifies semantic action + real evidence/intent, excluding
// run ID, model update, clock and display reorder. Rejected work does not return
// merely because a new model/prompt produced a different wording.
// planHash seals exact versions/read-write set for confirmation and CAS.
export type Proposal =
  | (ProposalBase & { readonly kind: "existing-topic";
      readonly refId: ConversationId; readonly topicId: TopicId;
      readonly role: "primary" | "related" })
  | (ProposalBase & { readonly kind: "new-topic";
      readonly draftKey: string; readonly name: string; readonly intent: TopicIntent;
      readonly members: readonly ConversationId[] })
  | (ProposalBase & { readonly kind: "multi-topic";
      readonly refId: ConversationId; readonly primary: TopicId | null;
      readonly related: readonly TopicId[] })
  | (ProposalBase & { readonly kind: "derived-title"; readonly refId: ConversationId;
      readonly title: string })
  | (ProposalBase & { readonly kind: "topic-relation"; readonly from: TopicId;
      readonly to: TopicId; readonly requiresHumanConfirmation: true })
  | (ProposalBase & { readonly kind: "series-plan"; readonly plan: Series;
      readonly requiresHumanConfirmation: true })
  | (ProposalBase & { readonly kind: "merge-plan"; readonly keepId: TopicId;
      readonly sourceIds: readonly TopicId[]; readonly memberPlan: readonly VirtualPlacement[];
      readonly constraintPlan: readonly Constraint[];
      readonly requiresHumanConfirmation: true })
  | (ProposalBase & { readonly kind: "split-plan"; readonly retainId: TopicId;
      readonly children: readonly { readonly draftKey: string; readonly name: string;
        readonly members: readonly ConversationId[] }[];
      readonly requiresHumanConfirmation: true })
  | (ProposalBase & { readonly kind: "unknown";
      readonly reason: "missing-capability" | "unknown-membership" | "ambiguous-intent"
        | "insufficient-evidence" | "constraint-conflict" });
export interface ProposalRecord {
  readonly proposal: Proposal;
  readonly state: "proposed" | "validated" | "awaiting-review" | "rejected" | "stale" | "applied";
  readonly missingEvidence: readonly string[];
  readonly appliedOperationId: OperationId | null;
}
// The operation tracks subsequent undo. Proposal acceptance and undo status
// do not mutate its sealed plan or restore an expired confirmation receipt.

export type ProjectionMode = "native" | "pro-default-none" | "pro-cross-project";
export interface ViewSession {
  readonly H: 7 | 14 | 30 | 60 | 90;
  readonly T: number;
  readonly Z: string;
  readonly policyRevision: Revision;
}
export interface SurfaceAnchor {
  readonly cardId: TopicId | NativeProjectId | null;
  readonly refId: ConversationId | null;
  readonly segment: number;
  readonly scrollOffset: number;
  readonly openOldItems: readonly string[];
  readonly sidebarChoices: readonly string[];
}
export interface LaunchContext {
  readonly id: string;
  readonly scopeKey: ScopeKey;
  readonly sourceMode: ProjectionMode;
  readonly topicId: TopicId | null;
  readonly seriesId: SeriesId | null;
  readonly referenceId: ConversationId;
  readonly nativeProjectId: NativeProjectId | null;
  readonly viewSession: ViewSession;
  readonly returnAnchor: SurfaceAnchor;
  readonly origin: "topic" | "native-project" | "search" | "working-set" | "direct";
  readonly documentEpoch: Revision;
}
// A route does not choose the first topic as return context.
// Validated inheritance to a new tab is explicit; otherwise open a fresh context.

export type HumanCommand =
  | { readonly type: "CREATE_TOPIC"; readonly name: string }
  | { readonly type: "SET_TOPIC_NAME"; readonly topicId: TopicId; readonly name: string }
  | { readonly type: "SET_DERIVED_TITLE"; readonly refId: ConversationId; readonly title: string }
  | { readonly type: "RESTORE_NATIVE_TITLE"; readonly refId: ConversationId }
  | { readonly type: "SET_TITLE_DISPLAY"; readonly refId: ConversationId;
      readonly displayPreference: "native" | "derived" }
  | { readonly type: "SET_PLACEMENT"; readonly refId: ConversationId; readonly topicId: TopicId;
      readonly role: "primary" | "related" }
  | { readonly type: "MOVE_PRIMARY"; readonly refId: ConversationId;
      readonly from: TopicId; readonly to: TopicId }
  | { readonly type: "EXCLUDE_TOPIC"; readonly refId: ConversationId; readonly topicId: TopicId }
  | { readonly type: "REMOVE_TOPIC_EXCLUSION"; readonly refId: ConversationId; readonly topicId: TopicId }
  | { readonly type: "REMOVE_RELATED"; readonly refId: ConversationId; readonly topicId: TopicId }
  | { readonly type: "SET_AI_PROCESSING"; readonly refId: ConversationId;
      readonly policy: "excluded" | "allowed" }
  | { readonly type: "SET_LOCK"; readonly target:
        { readonly kind: "title"; readonly refId: ConversationId }
        | { readonly kind: "topic-name" | "topic-membership"; readonly topicId: TopicId }
        | { readonly kind: "placement"; readonly refId: ConversationId; readonly topicId: TopicId };
      readonly locked: boolean }
  | { readonly type: "RELEASE_TO_AUTO"; readonly target:
        { readonly kind: "title"; readonly refId: ConversationId }
        | { readonly kind: "topic-name" | "topic-membership"; readonly topicId: TopicId }
        | { readonly kind: "placement"; readonly refId: ConversationId; readonly topicId: TopicId } }
  | { readonly type: "ACCEPT_PROPOSAL"; readonly proposalId: ProposalId; readonly planHash: Digest }
  | { readonly type: "REJECT_PROPOSAL"; readonly proposalId: ProposalId }
  | { readonly type: "APPLY_SERIES_PLAN"; readonly plan: ManualSeriesPlan }
  | { readonly type: "RESOLVE_LEGACY_PRIMARY"; readonly refId: ConversationId;
      readonly chosenPrimary: TopicId; readonly preservedAssetDigest: Digest; readonly planHash: Digest }
  | { readonly type: "UNDO_TRANSACTION"; readonly targetOperationId: OperationId;
      readonly reviewedInverseHash: Digest }
  | { readonly type: "APPLY_COMPENSATION_PLAN"; readonly plan: ManualCompensationPlan }
  | { readonly type: "RESTORE_TOPIC"; readonly topicId: TopicId }
  | { readonly type: "DELETE_TOPIC"; readonly topicId: TopicId; readonly reviewedPlanHash: Digest }
  | { readonly type: "REMOVE_AI_ARTIFACTS"; readonly refIds: readonly ConversationId[];
      readonly reviewedPlanHash: Digest };
export type ProCommand =
  | { readonly actor: "human"; readonly intent: HumanIntentReceipt; readonly command: HumanCommand }
  | { readonly actor: "automation"; readonly ticket: AutomatedApplicationTicket;
      readonly command: { readonly type: "APPLY_LOW_RISK_PROPOSAL";
        readonly proposalId: ProposalId; readonly planHash: Digest } };

export type OverlayAssetKind =
  "topic" | "placement" | "derived-title" | "constraint" | "series" | "redirect"
    | "topic-relation" | "presentation-policy";
export interface InversePatch {
  readonly kind: OverlayAssetKind; // Native table, auth and model task are excluded.
  readonly key: string;
  readonly expectedAfterDigest: Digest;
  readonly restoreValue: unknown; // Strict kind-specific schema before apply.
}
export interface CommittedOverlayPatch {
  readonly kind: OverlayAssetKind;
  readonly key: string;
  readonly before: unknown; // Strict kind-specific data schema; no executable effect.
  readonly after: unknown;
  readonly beforeDigest: Digest;
  readonly afterDigest: Digest;
}
export interface ManualCompensationPlan {
  readonly kind: "manual-compensation-plan";
  readonly sourceOperationId: OperationId;
  readonly expected: RevisionVector;
  readonly patch: readonly CommittedOverlayPatch[];
  readonly planHash: Digest;
}
// Built by a pure, deterministic conflict planner. Owner validates that every
// change is reviewed and within the source operation's allowed overlay domain;
// it cannot relax scope/model consent or replay an external/native effect.
// Inverse schema rejects scope/model permissions and exclude-ai-processing
// relaxations even when nested under constraint. Processing can be re-enabled
// only by a fresh explicit SET_AI_PROCESSING command with current consent checks.
export interface AppliedTransaction {
  readonly operationId: OperationId;
  readonly actor: "human" | "automation";
  readonly provenance: "explicit-user-command" | "accepted-proposal" | "quality-gated-auto";
  readonly base: RevisionVector;
  readonly planHash: Digest;
  readonly resultRevision: Revision;
  readonly proposalId: ProposalId | null;
  readonly inverse: readonly InversePatch[];
  readonly patch: readonly CommittedOverlayPatch[];
  readonly inverseHash: Digest;
  readonly status: "applied" | "undone" | "needs-revalidation";
}
// Original inverse is atomic over its complete read/write set: one conflict =>
// zero writes. A user-approved compensation is a NEW sealed plan/transaction,
// never a partially applied inverse. All committed machine + human data patches
// participate in recovery order; evidence/jobs are then revalidated.
// Recovery replays data patches only. It never replays the original model call,
// native create/send, credential, grant, or external processing consent.

export interface BudgetPolicy {
  readonly id: string;
  readonly billingProfileId: string; // Local key alias/provider billing config, no secret.
  readonly appliesTo: { readonly kind: "installation-total" }
    | { readonly kind: "scope-sublimit"; readonly scopeKey: ScopeKey };
  readonly currency: Currency;
  readonly scale: 6;
  readonly ceiling: MicroUnits;
  readonly window: { readonly from: ISODate; readonly through: ISODate };
  readonly providerProfileId: string;
  readonly pricingVersion: string;
  readonly revision: Revision;
}
export interface BudgetReservationBase {
  readonly billingProfileId: string;
  readonly currency: Currency;
  readonly scale: 6;
  readonly priceCardVersion: string;
  readonly policyIds: readonly [string, ...string[]];
}
export type BudgetReservation = BudgetReservationBase & (
  | { readonly status: "reserved"; readonly id: string; readonly jobId: JobId;
      readonly maxCharge: MicroUnits; readonly policyIds: readonly string[]; readonly revision: Revision }
  | { readonly status: "sent-uncertain"; readonly id: string; readonly jobId: JobId;
      readonly heldCharge: MicroUnits; readonly policyIds: readonly string[];
      readonly providerRequestId: string | null; readonly revision: Revision }
  | { readonly status: "settled"; readonly id: string; readonly jobId: JobId;
      readonly actualCharge: MicroUnits; readonly reportedExactChargeDecimal: string | null;
      readonly policyIds: readonly string[]; readonly revision: Revision }
  | { readonly status: "released"; readonly id: string; readonly jobId: JobId;
      readonly reason: "not-dispatched" | "provider-confirmed-no-charge";
      readonly revision: Revision });
// Compute token/rate products in exact decimal or rational arithmetic. Reserve
// and account conservatively at 10^-6 currency scale (ceil, never nearest-cent
// rounding). Keep provider exact decimal charge for reconciliation.
// A reservation atomically checks installation totals and all relevant scope
// sublimits. Account/workspace changes never reset the same billing budget.
// Other apps/devices using the same key are outside a local hard-cap guarantee.

export interface JobModelBinding {
  readonly modelProfileId: ModelProfileId;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly outputSchemaVersion: string;
  readonly priceCardVersion: string | null;
}
export interface JobDescriptor {
  readonly inputFingerprint: Digest;
  readonly modelBinding: JobModelBinding | null; // Null only for a no-provider local rule job.
}
export type JobCheckpoint = JobDescriptor & (
  | { readonly state: "queued"; readonly id: JobId; readonly dedupeKey: Digest;
      readonly inputVersions: RevisionVector }
  | { readonly state: "reserved"; readonly id: JobId; readonly reservationId: string;
      readonly inputVersions: RevisionVector }
  | { readonly state: "dispatched"; readonly id: JobId; readonly reservationId: string | null;
      readonly inputVersions: RevisionVector; readonly dispatchRecorded: true }
  | { readonly state: "result-ready"; readonly id: JobId; readonly resultDigest: Digest;
      readonly inputVersions: RevisionVector }
  | { readonly state: "validated" | "awaiting-review"; readonly id: JobId; readonly proposalId: ProposalId }
  | { readonly state: "committed"; readonly id: JobId; readonly operationId: OperationId }
  | { readonly state: "paused"; readonly id: JobId;
      readonly reason: "budget" | "foreground-priority" | "capability" | "consent" }
  | { readonly state: "stale" | "cancelled" | "failed"; readonly id: JobId; readonly reason: string }
  | { readonly state: "outcome-unknown"; readonly id: JobId; readonly reservationId: string });
// Memory-only Browser-Local data must not become durable job payload. v1 requires
// explicit persistent scope selection before a paid/restartable model job.
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string; readonly committed?: boolean };

export interface ReadSnapshotPort {
  read(grant: SemanticGrant, query: {
    readonly refs: readonly ConversationId[]; readonly maxItems: number;
  }, signal: AbortSignal): Promise<Result<{
    readonly references: readonly NativeRefReadModel[];
    readonly activities: readonly SharedActivityRef[];
    readonly versions: RevisionVector;
    readonly partial: boolean;
  }>>;
}
export interface EvidencePackPort {
  prepare(grant: SemanticGrant, query: {
    readonly refs: readonly ConversationId[];
    readonly requestedInputLevel: "metadata-only" | "authorized-content";
    readonly processingConsentReference: { readonly id: string; readonly expectedRevision: Revision };
    readonly maxUtf8Bytes: number;
  }, signal: AbortSignal): Promise<Result<EvidencePack>>;
}
// Owner resolves the current consent itself. A caller-supplied description of
// consent cannot authorize disclosure or revive a revoked grant.
export interface OverlayCommitPort {
  commit(grant: SemanticGrant, request: {
    readonly operationId: OperationId;
    readonly expected: RevisionVector;
    readonly command: ProCommand;
  }, signal: AbortSignal): Promise<Result<AppliedTransaction>>;
  previewUndo(grant: SemanticGrant, targetOperationId: OperationId,
    signal: AbortSignal): Promise<Result<
      | { readonly state: "ready"; readonly inverseHash: Digest; readonly inverse: readonly InversePatch[] }
      | { readonly state: "conflict"; readonly inverseHash: Digest;
          readonly conflicts: readonly { readonly kind: OverlayAssetKind;
            readonly key: string; readonly reason: string }[] }
    >>;
}
// Implementation must use SAME shared CAS/journal + atomic input version fence.
// The port does not authorize a second DB, generic JSON patches or native writes.
// Membership/source/evidence root versions must be compared inside the SAME
// IDB transaction as the overlay write. A prior async snapshot read is not an
// atomic cross-repository guarantee. This narrow fence is a shared-owner change.
export interface ProConversationRowDTO {
  readonly refId: ConversationId;
  readonly displayTitle: string;
  readonly membership: NativeMembership;
  readonly context: "primary-topic" | "related-topic" | "uncollected" | "pending";
  readonly available: boolean;
  readonly titleDisplayPreference: "native" | "derived";
}
export interface ProFrameDTO {
  readonly protocol: "vaiwl-pro-frame/1";
  readonly mode: Exclude<ProjectionMode, "native">;
  readonly role: "workspace" | "sidebar";
  readonly versions: RevisionVector;
  readonly viewSession: ViewSession;
  readonly segment: number;
  readonly cards: readonly {
    readonly kind: "topic";
    readonly topicId: TopicId;
    readonly name: string;
    readonly rows: readonly ProConversationRowDTO[];
    readonly hasMore: boolean;
  }[];
  readonly uncollected: readonly ProConversationRowDTO[];
  readonly launchContext: LaunchContext | null;
  readonly partial: boolean;
}
export type ExistingFreeFrameDTO = Readonly<{
  readonly protocol: "vaiwl-free-frame/1";
} & Record<string, unknown>>;
// Adapter forwards the existing shared Free DTO unchanged after its existing
// strict validator; this reference type does not redefine the Free wire schema.
export type FrameProjectionDTO =
  | { readonly mode: "native"; readonly native: ExistingFreeFrameDTO }
  | { readonly mode: Exclude<ProjectionMode, "native">;
      readonly native: ExistingFreeFrameDTO; readonly overlay: ProFrameDTO };
export interface ViewProjectionPort {
  project(grant: SemanticGrant, query: {
    readonly mode: ProjectionMode;
    readonly role: "workspace" | "sidebar";
    readonly session: ViewSession;
    readonly segment: number;
    readonly offset: number;
    readonly limit: number;
    readonly rowLimit: number;
    readonly launchContext: LaunchContext | null;
  }, signal: AbortSignal): Promise<Result<FrameProjectionDTO>>;
}
// Enforce existing paging/byte limits; UI must never receive authority objects.
// Mode changes select a strategy over the same owner snapshot, not another DB,
// index, source reader, mount, or independently resumed navigation session.
export interface NavigationPort {
  prepare(grant: SemanticGrant, refId: ConversationId, context: LaunchContext,
    signal: AbortSignal): Promise<Result<{ readonly existingPlanHandle: string }>>;
  dispatch(existingPlanHandle: string, actionId: string): Promise<Result<{
    readonly state: "arrived" | "dispatched" | "unknown" | "blocked";
  }>>;
}
export interface BackgroundWorkPort {
  enqueue(grant: SemanticGrant, checkpoint: JobCheckpoint): Promise<Result<JobId>>;
  cancelScope(scopeKey: ScopeKey, reason: string): Promise<void>;
  reserveBudget(grant: SemanticGrant, jobId: JobId, maximum: MicroUnits,
    expectedBudgetRevisions: Readonly<Record<string, Revision>>): Promise<Result<BudgetReservation>>;
}
export interface ProIntegrationPorts {
  readonly sharedSnapshot: ReadSnapshotPort;
  readonly evidence: EvidencePackPort;
  readonly commit: OverlayCommitPort;
  readonly view: ViewProjectionPort;
  readonly navigation: NavigationPort;
  readonly background: BackgroundWorkPort;
}

