/** Observe the actual Playwright response body. Never re-fetch or substitute fixture bytes. */
export async function observeFaultMetadataResponse(response,row){
 row.method=response.request().method();row.bodyRead='PENDING';row.jsonParse='NOT_RUN';row.unknownSchema=false;row.invalidJSON=false;
 let bytes;
 try{bytes=await response.body();row.bodyRead='COMPLETE';row.bodyBytes=bytes.length;}
 catch(error){row.bodyRead='FAILED';const message=String(error?.message??'');row.bodyReadError=error?.name==='TimeoutError'?'TimeoutError':/No (?:resource|data).*identifier/i.test(message)?'BrowserBodyEvicted':/Target.*closed|context.*closed|page.*closed/i.test(message)?'TargetClosed':'ResponseBodyUnavailable';const failure=response.request().failure?.()?.errorText;row.requestFailure=typeof failure==='string'&&/^net::ERR_[A-Z_]+$/.test(failure)?failure:'NONE_OR_UNCLASSIFIED';return;}
 let body;
 try{body=JSON.parse(bytes.toString('utf8'));row.jsonParse='VALID';}
 catch(error){row.jsonParse=error?.name==='SyntaxError'?'INVALID_JSON':'FAILED';row.invalidJSON=row.jsonParse==='INVALID_JSON';return;}
 row.protocolClass=body?.protocol==='future-99'?'EXPECTED_UNKNOWN_PROTOCOL':typeof body?.protocol==='string'?'OTHER_PROTOCOL':'NO_PROTOCOL';
 row.mappingPresent=!!body&&typeof body==='object'&&Object.hasOwn(body,'mapping');
 row.unknownSchema=row.method==='GET'&&row.status===200&&row.protocolClass==='EXPECTED_UNKNOWN_PROTOCOL'&&!row.mappingPresent;
}

/** Request-start order, never response arrival order, defines the explicit action cohort. */
export function createFaultMetadataRequestTracker({origin,path}){
 let sequence=0;const requests=new WeakMap(),rows=[];
 return {start(request){const url=new URL(request.url());if(url.origin!==origin||url.pathname!==path)return;const row={requestStart:++sequence,path,method:request.method(),worker:!!request.serviceWorker(),bodyRead:'NO_RESPONSE',unknownSchema:false};requests.set(request,row);rows.push(row);},row:request=>requests.get(request),boundary:()=>sequence,rows:()=>rows};
}
export function unknownCalibrationCohort(rows,start,end){
 if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(end)||end<=start)return [];
 return rows.filter(r=>r.worker&&r.method==='GET'&&Number.isSafeInteger(r.requestStart)&&r.requestStart>start&&r.requestStart<=end);
}
export function validUnknownCalibrationCohort(rows,start,end){
 if(!Array.isArray(rows)||rows.some(r=>!Number.isSafeInteger(r.requestStart)||r.requestStart<1)||new Set(rows.map(r=>r.requestStart)).size!==rows.length)return false;
 const cohort=unknownCalibrationCohort(rows,start,end);
 return cohort.length>0&&cohort.every(r=>r.status===200&&r.bodyRead==='COMPLETE'&&r.jsonParse==='VALID'&&r.protocolClass==='EXPECTED_UNKNOWN_PROTOCOL'&&r.mappingPresent===false&&r.unknownSchema===true);
}
