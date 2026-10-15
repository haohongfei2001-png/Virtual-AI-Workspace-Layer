/** Test-only unpacked update check. Disabling/enabling is not proof Chrome re-read the manifest. */
export function runtimeManifestContract(m){return Object.fromEntries(['manifest_version','version','permissions','host_permissions','background','content_scripts','web_accessible_resources','content_security_policy'].map(k=>[k,m[k]??null]));}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export async function ensureUpdatedRuntime({expected,read,reload,report,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}){
 const same=value=>JSON.stringify(canonical(runtimeManifestContract(value)))===JSON.stringify(canonical(runtimeManifestContract(expected)));
 const before=await read();report.before=runtimeManifestContract(before);report.reloadRequested=false;
 if(!same(before)){report.reloadRequested=true;await reload();}
 let after;for(let n=0;n<attempts;n++){try{after=await read();if(same(after))break;}catch(error){report.lastReadError=String(error.message).slice(0,300);}if(n+1<attempts)await wait(100);}
 if(!after)throw Error('historical-host-runtime-unavailable');report.after=runtimeManifestContract(after);report.matchesExpected=same(after);
 if(!report.matchesExpected)throw Error('historical-host-runtime-manifest-not-updated');
}
