/** Additive implementation codec clarification. Frozen product contract stays intact. */
import type {HumanCommand,AppliedTransaction,CommittedOverlayPatch,InversePatch,OverlayAssetKind,Digest,ProposalId,TopicId,ConversationId,RevisionVector} from './VAIWL_PRO_CONTRACTS';
export type RuntimeAssetKind=Exclude<OverlayAssetKind,'topic-relation'>|'topic-tombstone'|'proposal-record'|'legacy-primary-resolution';
export type RuntimeCommittedPatch=Omit<CommittedOverlayPatch,'kind'>&{readonly kind:RuntimeAssetKind};
export type RuntimeInversePatch=Omit<InversePatch,'kind'>&{readonly kind:Exclude<RuntimeAssetKind,'proposal-record'>};
export type RuntimeHumanCommand=Exclude<HumanCommand,{readonly type:'RESOLVE_LEGACY_PRIMARY'}>|{
 readonly type:'RESOLVE_LEGACY_PRIMARY';readonly refId:ConversationId;readonly chosenPrimary:TopicId|null;readonly preservedAssetDigest:Digest;readonly planHash:Digest;
}|{readonly type:'ACCEPT_PROPOSAL_BATCH';readonly proposals:readonly {readonly proposalId:ProposalId;readonly planHash:Digest}[]};
export interface RuntimeReadDependency {
 readonly kind:RuntimeAssetKind|'topic-membership-set'|'topic-series-set'|'topic-constraint-set'|'topic-redirect-set'|'reference-placement-set'|'reference-constraint-set';
 readonly key:string;readonly expectedAfterDigest:Digest;
}
export type RuntimeAppliedTransaction=Omit<AppliedTransaction,'patch'|'inverse'>&{
 readonly patch:readonly RuntimeCommittedPatch[];readonly inverse:readonly RuntimeInversePatch[];
 readonly readSet:readonly RuntimeReadDependency[];readonly proposalIds?:readonly ProposalId[];
};
export interface ProposalRegistrationTransaction {
 readonly operationId:string;readonly actor:'system';readonly provenance:'proposal-registration';
 readonly base:RevisionVector;readonly resultRevision:number;readonly planHash:Digest;readonly proposalId:null;
 readonly patch:readonly (RuntimeCommittedPatch&{readonly kind:'proposal-record'})[];
 readonly inverse:readonly [];readonly readSet:readonly [];readonly inverseHash:Digest;readonly status:'applied';
}
/** Internal journal records are not a UI DTO and never convey authority. */
export type RuntimeJournalTransaction=RuntimeAppliedTransaction|ProposalRegistrationTransaction;
