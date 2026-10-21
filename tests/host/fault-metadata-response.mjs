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
