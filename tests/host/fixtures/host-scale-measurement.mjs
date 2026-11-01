/** Test-only gate: diagnostic ingestion never becomes admitted-index timing. */
export async function measureAtAdmittedScale({audit,measure}){
 const result={status:'NOT_RUN_INDEX_NOT_READY',performanceAcceptance:'NOT_ESTABLISHED',samples:null};
 result.before=await audit();
 const admitted=value=>value?.status==='PASS_INDEX_AUDIT_ONLY'&&Number.isSafeInteger(value.revision)&&value.revision>=0&&value.distinctRefs===value.requestedRefs&&value.missingRefs===0&&value.unexpectedRefs===0&&value.duplicateRefs===0;
 if(!admitted(result.before))return result;
 let sample,error;
 try{sample=await measure();}catch(failure){error=failure;}
 // Even a failed action must not leave a stale pre-audit attached to its timing.
 try{result.after=await audit();}catch(failure){result.after={status:'FAIL_INDEX_AUDIT',error:failure?.message??String(failure)};}
 const keys=['revision','requestedRefs','distinctRefs','distinctProjects','missingRefs','unexpectedRefs','duplicateRefs','projectMembership','nativeNoneObserved','unknownMembership','wrongProjectMembership','wrongNoneMembership'];
 const stable=admitted(result.after)&&keys.every(key=>result.before[key]===result.after[key]);
 if(error){result.status='FAIL_MEASUREMENT_ACTION';result.error=error?.stack??String(error);result.indexStable=stable;return result;}
 if(!stable){result.status='INVALIDATED_INDEX_CHANGED';result.diagnosticSamples=sample;return result;}
 result.status='MEASURED_AT_STABLE_ADMITTED_INDEX';result.revision=result.before.revision;result.samples=sample;return result;
}
