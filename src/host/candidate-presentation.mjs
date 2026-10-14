import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Display metadata only. Neither schema establishes scope, identity or authority. */
export function validateCandidatePresentation(value){
 if(!exactHostRecord(value,['offset','scrollTop','focused'])||!Number.isSafeInteger(value.offset)||value.offset<0||value.offset>224||value.offset%32!==0||!Number.isFinite(value.scrollTop)||value.scrollTop<0||value.scrollTop>1e7||typeof value.focused!=='boolean')throw Error('invalid-candidate-presentation');
 return Object.freeze({offset:value.offset,scrollTop:value.scrollTop,focused:value.focused});
}
export function validateCandidateMigration(value){
 if(!exactHostRecord(value,['id','projectId','presentation','ready','focusAllowed'])||!tokenOK(value.id)||!tokenOK(value.projectId)||['__proto__','prototype','constructor'].includes(value.projectId)||typeof value.ready!=='boolean'||typeof value.focusAllowed!=='boolean')throw Error('invalid-candidate-migration');
 const presentation=validateCandidatePresentation(value.presentation);
 if(value.focusAllowed&&(!value.ready||!presentation.focused))throw Error('invalid-candidate-migration');
 return Object.freeze({id:value.id,projectId:value.projectId,presentation,ready:value.ready,focusAllowed:value.focusAllowed});
}
