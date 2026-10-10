import { ScopeRepository } from '../src/b1/scope-repository.mjs';
import { createDocumentBindingBroker } from '../src/b1/document-binding-broker.mjs';
import { dataset, routeInfo, syntheticURL, scopeOf } from './data.mjs';
/** Privileged test service. Real MV3 injects real Chrome getFrame; page harness labels its fake sender. */
export function createFixtureService({indexedDB,extensionId,getFrame}) {
  const repository=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),seeds=new Map(),origins=new Map();
  let readDelay=0;
  async function seed(scope,origin){
    const key=scope.accountId+':'+origin;origins.set(scope.accountId,origin);
    if(!seeds.has(key))seeds.set(key,(async()=>{
      for(const r of dataset(scope.accountId,origin,120).refs){const result=await repository.upsert({scope,operationId:'seed-'+scope.accountId+'-'+r.id,expectedRevision:0,ref:{conversationId:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId}});if(!result.ok)throw Error(result.reason);}
    })().catch(e=>{seeds.delete(key);throw e;}));return seeds.get(key);
  }
  const broker=createDocumentBindingBroker({extensionId,getFrame,allowedURL:syntheticURL,leaseMs:20000,
    resolveScope:async({currentFrame})=>{const info=routeInfo(currentFrame.url);if(!info||info.account==='unknown')return null;const scope=scopeOf(info.account);await seed(scope,info.origin);return scope;},
    repository:{get:(...a)=>repository.get(...a),upsert:x=>repository.upsert(x),list:async scope=>{
      if(readDelay)await new Promise(r=>setTimeout(r,readDelay));
      // Enumerate the fixed synthetic manifest through B1 get(); no second data store or truncated 50-item list.
      return (await Promise.all(dataset(scope.accountId,origins.get(scope.accountId),120).refs.map(r=>repository.get(scope,r.id)))).filter(Boolean);
    }}
  });
  return {broker,repository,setDelay:ms=>readDelay=Math.min(3000,Math.max(0,Number(ms)||0)),close:()=>repository.close()};
}
