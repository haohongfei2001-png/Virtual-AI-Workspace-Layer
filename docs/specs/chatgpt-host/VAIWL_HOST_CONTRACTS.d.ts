/**
 * VA-HOST/1, revision 1.1 FINAL — 2026-10-13.
 * Design contract only; not an implementation or a trust credential.
 * Reviewed integration baseline: 8a35843431d5d85ee3092612bf88af6129de482d, PR #16.
 * Runtime exact-schema, browser sender, receipt and authorization checks are mandatory.
 * Element/Event objects stay in their owning realm; only explicitly named DTOs cross RPC.
 */
export type NativeId = string;
export type ISOInstant = string;
export type ProfileId = string;
export type ReasonCode = string;
declare const handleBrand: unique symbol;
export type Handle<K extends string> = string & { readonly [handleBrand]: K };
export type DocumentToken = Handle<'document'>;
export type ProducerToken = Handle<'producer'>;
export type ScopeGrantId = Handle<'scope-grant'>;
export type ReceiptId = Handle<'receipt'>;
export type BodyProofId = Handle<'body-proof'>;
export type LiveHandleId = Handle<'live-control'>;
export type MountId = Handle<'mount'>;
export type UiGrantId = Handle<'ui-grant'>;
export type ActionId = Handle<'action'>;
export type CursorHandle = Handle<'cursor'>;

export type Capability = 'principal' | 'current-context' | 'project-identity'
  | 'conversation-identity' | 'membership' | 'message-metadata'
  | 'self-send' | 'native-navigation' | 'native-create-entry'
  | 'workspace-surface' | 'companion-sidebar' | 'native-search';
export interface CapabilityState {
  state: 'ready' | 'partial' | 'unavailable';
  profileId: ProfileId | null;
  reason: ReasonCode | null;
  /** Readiness is for this source/profile, not universal ChatGPT compatibility. */
  evidence: 'implementation-only' | 'offline-verified' | 'live-verified';
}
export interface SupportProfile {
  id: ProfileId;
  revision: number;
  required: Capability[];
  allowedSourceProfiles: ProfileId[];
  fixtureIds: string[];
  liveReceiptIds: string[];
  fullFreeEligible: boolean; // derived by owner; never supplied by a page
}

/** Safe URL validation and identity extraction are separate operations. */
export type NativeRoute =
  | { kind: 'home' | 'projects-index'; navigationURL: string }
  | { kind: 'conversation'; conversationId: NativeId; containerHint: string | null; navigationURL: string }
  | { kind: 'project'; projectId: NativeId; navigationURL: string }
  | { kind: 'project-candidate'; containerHint: string; navigationURL: string }
  | { kind: 'shared-view' | 'temporary'; navigationURL: string }
  | { kind: 'unsupported'; navigationURL: string | null; reason: ReasonCode };

export interface DocumentBinding {
  documentToken: DocumentToken;
  producerToken: ProducerToken;
  browserDocumentId: string;
  routeEpoch: number;
  origin: string;
  /** This is document transport permission only; it cannot unlock any account cache. */
  expiresAt: ISOInstant;
}
export interface HostContext {
  binding: DocumentBinding;
  route: NativeRoute;
  body: { state: 'unbound' | 'conflict'; reason: ReasonCode }
      | { state: 'bound'; proofId: BodyProofId; conversationId: NativeId; bodyEpoch: number };
  capabilities: Partial<Record<Capability, CapabilityState>>;
}
export interface LiveNativeHandle {
  id: LiveHandleId;
  documentToken: DocumentToken;
  routeEpoch: number;
  regionEpoch: number;
  controlKind: 'project' | 'conversation' | 'new-project' | 'new-chat' | 'native-search';
}
/** A control without an ID remains actionable, but never becomes a fake native ID. */
export type NativeTarget =
  | { kind: 'resolved'; entity: 'project' | 'conversation'; nativeId: NativeId;
      navigationURL: string; liveHandle: LiveNativeHandle | null }
  | { kind: 'live-control'; control: LiveNativeHandle; navigationURL: null };
export interface SurfaceCandidate {
  renderKey: string; // ephemeral view key, never a NativeId
  entity: 'project' | 'conversation';
  nativeTitle: string | null;
  titleState: 'exact' | 'unavailable' | 'over-limit';
  target: NativeTarget;
  evidence: EvidenceLocator;
}

export type CoverageDomain =
  | { kind: 'projects-index' | 'recent-list'; filter: string; sort: string }
  | { kind: 'project-members'; projectId: NativeId; filter: string; sort: string }
  | { kind: 'conversation-messages'; conversationId: NativeId; branchScope: 'observed' | 'all' };
/** A locator is not proof that an HTTP response or a native action occurred. */
export interface EvidenceLocator {
  profileId: ProfileId;
  profileVersion: number;
  sourceKind: 'native-dom' | 'loaded-json' | 'loaded-metadata' | 'response-tap';
  regionEpoch: number;
  fieldPaths: string[];
  /** Can refer to an owner-issued receipt; unknown or mismatched IDs are rejected. */
  receiptId: ReceiptId | null;
}
export type MembershipClaim =
  | { conversationId: NativeId; asserted: 'PROJECT'; projectId: NativeId;
      upstreamRevision: string | null; evidence: EvidenceLocator }
  | { conversationId: NativeId; asserted: 'NONE'; projectId: null;
      upstreamRevision: string | null; evidence: EvidenceLocator }
  | { conversationId: NativeId; asserted: 'UNKNOWN'; projectId: null;
      reason: ReasonCode; evidence: EvidenceLocator };
export interface CoverageClaim {
  domain: CoverageDomain;
  scanId: string;
  pageOrdinal: number;
  loadedIds: NativeId[];
  previousCursor: string | null;
  nextCursor: string | null;
  terminalObserved: boolean;
  upstreamSnapshotRevision: string | null;
  gaps: ReasonCode[];
  evidence: EvidenceLocator;
}
export interface SurfaceDelta {
  candidates: SurfaceCandidate[];
  membershipClaims: MembershipClaim[];
  coverageClaims: CoverageClaim[];
  detachedHandles: LiveHandleId[]; // invalidate controls, never delete native objects
}
export interface CurrentBodyClaim {
  conversationId: NativeId | null;
  messageIds: NativeId[];
  association: 'explicit-body-id' | 'response-message-intersection' | 'unproven';
  regionEpoch: number;
  evidence: EvidenceLocator;
}
export interface TimeCandidate {
  raw: string | number;
  fieldPath: string;
  declaredUnit: 'unix-seconds' | 'unix-milliseconds' | 'iso-8601' | 'unknown';
  meaning: 'message-created' | 'message-updated' | 'unknown';
}
export interface MessageMetadata {
  conversationId: NativeId;
  messageId: NativeId;
  mappingNodeId: NativeId | null;
  parentNodeId: NativeId | null;
  claimedRole: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
  claimedActorId: string | null;
  createTime: TimeCandidate | null;
  updateTime: TimeCandidate | null;
  nativeState: string | null;
  evidence: EvidenceLocator;
  // No complete message content, attachment body, authentication token or request body.
}
export interface MessageMetadataBatch {
  body: CurrentBodyClaim;
  messages: MessageMetadata[];
  coverage: CoverageClaim | null;
}
export interface SendCandidate {
  intentId: ActionId;
  conversationId: NativeId | null;
  messageId: NativeId | null;
  operationId: string | null;
  stage: 'intent' | 'correlated' | 'native-ack' | 'failed' | 'cancelled';
  observedAt: ISOInstant;
  evidence: EvidenceLocator;
}
export interface RecencyObservation {
  domain: Extract<CoverageDomain, { kind: 'projects-index' | 'recent-list' }>;
  nativeOrder: NativeId[];
  change: 'baseline' | 'new-visible-id' | 'order-changed' | 'title-changed';
  previousDigest: string | null;
  nextDigest: string;
  observedAt: ISOInstant;
  carriesSendTime: false;
}
interface ProposalEnvelope {
  protocol: 'vaiwl-host-observation/1';
  documentToken: DocumentToken;
  producerToken: ProducerToken;
  localSeq: number;
  routeEpoch: number;
  profileId: ProfileId;
  profileVersion: number;
  bodyProofId: BodyProofId | null;
}
export type ObservationProposal = ProposalEnvelope & (
  | { kind: 'surface-delta'; payload: SurfaceDelta }
  | { kind: 'current-object'; payload: CurrentBodyClaim }
  | { kind: 'message-metadata'; payload: MessageMetadataBatch }
  | { kind: 'send-candidate'; payload: SendCandidate }
  // Sequenced loss barrier; retires send causality, never admits activity.
  | { kind: 'send-gap'; payload: { reason: 'send-intent-capacity' } }
  | { kind: 'recency-change'; payload: RecencyObservation }
  | { kind: 'capability-change'; payload: Partial<Record<Capability, CapabilityState>> }
);
export type ObservationAck =
  | { state: 'accepted' | 'duplicate'; localSeq: number; receiptId: ReceiptId }
  | { state: 'retry-after'; localSeq: number; delayMs: number }
  | { state: 'rejected'; localSeq: number; reason: ReasonCode };

/** Owner-only records below. Serialization of a record never transfers its authority. */
export interface BrowserFrameContext {
  tabId: number;
  frameId: number;
  documentId: string;
  parentDocumentId: string | null;
  actualURL: string;
  documentLifecycle: string;
  incognito: boolean;
}
export interface PrincipalProof {
  id: ReceiptId;
  principalKey: string;
  sessionGeneration: number;
  providerProfile: ProfileId;
  transport: 'worker-fixed-fetch' | 'isolated-fixed-fetch';
  verifiedAt: ISOInstant;
  expiresAt: ISOInstant;
}
export type ContextProof =
  | { kind: 'server-active-context'; receiptId: ReceiptId; contextKey: string;
      documentId: string; selectionEpoch: number }
  | { kind: 'browser-request-context'; requestReceiptId: ReceiptId;
      authorizedContextReceiptId: ReceiptId; pageAssociationReceiptId: ReceiptId;
      contextKey: string; documentId: string; selectionEpoch: number }
  | { kind: 'single-personal-context'; rosterReceiptId: ReceiptId;
      bindingProfile: ProfileId; contextKey: string; documentId: string; selectionEpoch: number };
export interface ScopeGrant {
  id: ScopeGrantId;
  scopeKey: string;
  principal: PrincipalProof;
  context: ContextProof;
  scopeEpoch: number;
  issuedAt: ISOInstant;
  expiresAt: ISOInstant;
}
export type ScopeResolution =
  | { state: 'verified'; grant: ScopeGrant }
  | { state: 'pending'; retryAt: ISOInstant }
  | { state: 'unverified' | 'ambiguous' | 'signed-out'; reason: ReasonCode };
export interface ScopeAuthority {
  /** No network; hot-path fence used by repository/broker guards. */
  peek(frame: BrowserFrameContext): ScopeResolution;
  /** Deduplicated finite refresh, never awaited inside an IDB transaction. */
  refresh(frame: BrowserFrameContext, reason: 'bind' | 'focus' | 'expiry' | 'auth-change', signal: AbortSignal): Promise<ScopeResolution>;
  invalidate(documentId: string, reason: ReasonCode): void;
}
export interface OwnerReceipt {
  id: ReceiptId;
  documentToken: DocumentToken;
  routeEpoch: number;
  scopeGrantId: ScopeGrantId;
  kind: 'dom-observed' | 'browser-request' | 'authenticated-object' | 'local-send-ack';
  profileId: ProfileId;
  semanticFingerprint: string;
  observedAt: ISOInstant;
  /** Observation receipt is not automatically a self-send proof. */
  evidenceClass: 'surface' | 'corroborated' | 'authenticated';
}
export type Membership =
  | { state: 'PROJECT'; projectId: NativeId; witnessId: ReceiptId; fieldRevision: number }
  | { state: 'NONE'; projectId: null; witnessId: ReceiptId; fieldRevision: number }
  | { state: 'UNKNOWN'; projectId: null; reason: ReasonCode; fieldRevision: number;
      lastConfirmed: { state: 'PROJECT' | 'NONE'; projectId: NativeId | null; witnessId: ReceiptId } | null };
export interface InventoryCoverage {
  domain: CoverageDomain;
  extent: 'unknown' | 'partial' | 'exhausted-observed-scan' | 'complete-snapshot';
  consistency: 'unknown' | 'non-atomic' | 'snapshot';
  scanId: string;
  setRevision: number;
  observedAt: ISOInstant;
  completeThrough: ISOInstant | null;
  cursorDigest: string;
  terminalWitnessId: ReceiptId | null;
  gaps: ReasonCode[];
}
export interface FieldWitness {
  receiptId: ReceiptId;
  fieldRevision: number;
  producerGeneration: string;
  upstreamRevision: string | null;
  verificationEpoch: number;
  observedAt: ISOInstant;
  freshnessUntil: ISOInstant;
  revoked: boolean;
}
export interface LocalSendAnchor {
  kind: 'observed-self-send';
  eventKey: string; // scope + conversation + message, NOT current branch leaf
  conversationId: NativeId;
  messageId: NativeId;
  ackReceiptId: ReceiptId;
  firstObservedAt: ISOInstant;
  interval: { from: ISOInstant; through: ISOInstant };
  clockBasis: 'local-observation';
  clockQuality: 'bounded-local';
  semantics: 'acknowledged-local-send';
  calibrationDueAt: ISOInstant;
  revoked: boolean;
  // No sentAt/serverTime. Freshness expiry does not erase the acknowledged activity.
}
export interface ObservationContinuation<EvidenceBatch> {
  operationId: string;
  scopeKey: string;
  nativeRevision: number;
  semanticFingerprint: string;
  evidencePayloadDigest: string;
  evidencePayload: EvidenceBatch; // instantiate with the EXISTING owner-validated evidence batch codec
  state: 'pending-evidence' | 'complete' | 'needs-revalidation' | 'cancelled';
  requiredReceiptIds: ReceiptId[];
  admission: {
    scopeKey: string;
    profileId: ProfileId;
    profileVersion: number;
    sourceGeneration: string;
    semanticFingerprint: string;
    evidenceClass: OwnerReceipt['evidenceClass'];
    acceptedAt: ISOInstant;
  }; // persisted atomically; RAM receipt IDs alone cannot survive a worker restart
  // Must be persisted with native apply in native_operations, under the same CAS.
  // No bearer tokens, authority objects or replayable native actions.
}

export interface NativeRef { id: NativeId; nativeUrl: string; nativeTitle: string | null }
export type NativeAction =
  | { kind: 'new-project' }
  | { kind: 'new-chat'; context: { kind: 'global' } | { kind: 'project'; projectId: NativeId } }
  | { kind: 'native-search' };
/** Plans are prepared before pointer activation, then checked again at dispatch. */
export type NavigationPlan =
  | { mode: 'native-control'; target: NativeTarget; control: LiveNativeHandle; planRevision: number }
  | { mode: 'same-target'; target: Extract<NativeTarget, { kind: 'resolved' }>; bodyProofId: BodyProofId; planRevision: number }
  | { mode: 'href'; target: Extract<NativeTarget, { kind: 'resolved' }>;
      disposition: 'same-tab' | 'new-tab-preserve-current'; planRevision: number }
  | { mode: 'unavailable'; reason: ReasonCode; planRevision: number };
export interface NavigationCommandDTO {
  actionId: ActionId;
  uiGrantId: UiGrantId;
  mountId: MountId;
  planRevision: number;
  /** Identifier of an owner-issued plan, not arbitrary URL / JS / selector. */
  targetKey: string;
}
export type NavigationResult =
  | { state: 'already-current' | 'dispatched'; actionId: ActionId }
  | { state: 'blocked' | 'unconfirmed'; reason: ReasonCode };
export type ActionResult =
  | { state: 'entry-opened'; actionId: ActionId }
  | { state: 'blocked' | 'unconfirmed'; reason: ReasonCode };
export interface InputRisk {
  state: 'clear' | 'unsaved' | 'unknown';
  flags: Array<'composer' | 'attachment' | 'upload' | 'generation' | 'voice' | 'canvas'>;
}

/** EXACT existing snippet representation retained; do not migrate it by accident. */
export interface SnippetAnchor {
  refId: NativeId;
  messageId: NativeId;
  branchId: string; // real branch ID or explicitly labelled stable lineage-to-message key
  text: string; // explicit user selection only, existing length cap
  bodyHash: string;
}
export type SnippetCandidate = SnippetAnchor;
export type AnchorResult = { ok: true } | { ok: false; reason: ReasonCode };

export interface RectDTO { x: number; y: number; width: number; height: number }
/** DOM-only inspection: legacy property names retained for the shim / extracted view. */
export type MountInspection =
  | { ok: false; reason: ReasonCode; profileId: ProfileId | null }
  | { ok: true; reason: null; profileId: ProfileId;
      history: Element; header: Element; reading: Element; navigationSlot: Element | null;
      composer: Element; protectedRegions: Element[]; historyMaskRoots: Element[];
      returnSlot: RectDTO; readingRect: RectDTO; sidebarRect: RectDTO | null;
      viewMask: 'declarative-css'; regionEpoch: number };
export interface SurfaceLayoutDTO {
  revision: number;
  readingRect: RectDTO;
  sidebarRect: RectDTO | null;
  mode: 'workspace' | 'reading' | 'suspended';
  theme: 'light' | 'dark';
  direction: 'ltr' | 'rtl';
  /** Safe, bounded typography tokens; never a full computed-style dump. */
  fontFamily: string;
  baseFontSize: number;
}
export interface MountHandle { id: MountId; documentToken: DocumentToken; regionEpoch: number }
export interface UiDocumentGrant {
  id: UiGrantId;
  mountId: MountId;
  parentDocumentId: string;
  uiDocumentId: string;
  scopeGrantId: ScopeGrantId;
  role: 'workspace' | 'sidebar';
  expiresAt: ISOInstant;
}
export interface MountSurface {
  mount(context: HostContext, inspection: Extract<MountInspection, { ok: true }>): Promise<MountHandle>;
  showWorkspace(handle: MountHandle): void;
  showReading(handle: MountHandle): void;
  suspend(handle: MountHandle, reason: ReasonCode): void;
  dispose(handle: MountHandle): void;
}
export interface PublicAdapterStatus {
  state: 'WAITING' | 'ACTIVE' | 'PARTIAL' | 'NATIVE_LAYER' | 'NATIVE_ONLY' | 'STOPPED';
  reason: ReasonCode | null;
  profileId: ProfileId | null;
  // No private titles, IDs, raw account scope or credentials in host DOM/status logs.
}
export type AdapterStartOptions = {
  binding: DocumentBinding; // document handshake happens BEFORE adapter start
} & ({
  // Local bounded observation only; no ACK, transport, action or account cache.
  // Discard on expiry/revocation and restart without this phase after verified.
  phase: 'observation';
  emit?: never;
} | {
  phase?: never;
  emit: (proposal: ObservationProposal) => Promise<ObservationAck>;
});
export interface HostAdapter {
  readonly kind: 'synthetic' | 'chatgpt';
  start(options: AdapterStartOptions): Promise<HostContext>;
  stop(): void;
  inspect(): MountInspection;
  hasNativeLayer(): boolean;
  currentURL(): string;
  isCurrent(url: string): boolean; // navigation identity only; body proof is independent
  nativeHref(url: string): string | null;
  planNavigation(target: NativeTarget, risk: InputRisk): NavigationPlan;
  dispatchNative(command: NavigationCommandDTO): Promise<NavigationResult>;
  activateNative(action: NativeAction, command: NavigationCommandDTO): Promise<ActionResult>;
  readLoaded(target: NativeTarget | CoverageDomain, signal: AbortSignal): Promise<ObservationProposal[]>;
  selectedSnippet(ref: NativeRef): SnippetCandidate | null;
  restoreSnippet(ref: NativeRef, anchor: SnippetAnchor): AnchorResult;
  status(value: PublicAdapterStatus): void;
}
/**
 * Transitional shim for the real navigation.mjs call shapes.
 * New iframe RPC MUST NOT serialize MouseEvent or call openNative after allowing default href.
 * The shim synchronously decides preventDefault and adapts into one precomputed plan.
 */
export interface LegacyNavigationStatus {
  state: string;
  reason?: string;
  mode?: string;
  scope?: string; // accepted only by the legacy shim; NEVER written into public host DOM
}
export interface LegacyNavigationAdapter {
  inspect(): MountInspection;
  hasNativeLayer(): boolean;
  currentURL(): string;
  isCurrent(url: string): boolean;
  nativeHref(url: string): string | null;
  projectCreateHref(project: { id: NativeId }): string | null;
  openNative(url: string, event: MouseEvent): void;
  selectedSnippet(ref: NativeRef): SnippetCandidate | null;
  restoreSnippet(ref: NativeRef, anchor: SnippetAnchor): AnchorResult;
  status(value: LegacyNavigationStatus): void;
}

/** Explicit user-approved 2026-10-19 temporary mode. Never an authority/Host DTO. */
export type TemporaryNativeListRequest = { v: 1; type: 'HOST_TEMPORARY_NATIVE_LIST' };
export type TemporaryNativeInvalidation = { v: 1; type: 'HOST_TEMPORARY_NATIVE_INVALIDATED' };
export type TemporaryNativeListResponse =
  | { v: 1; mode: 'temporary-native-navigation'; unavailable: true }
  | { v: 1; mode: 'temporary-native-navigation'; route: string; partial: boolean;
      items: Array<{ kind: 'project' | 'conversation'; title: string; href: string }> };
// Exact private status.html sender, topframe, current document/route and URL checks
// remain runtime requirements. No scope/receipt/membership, body or persistence.
