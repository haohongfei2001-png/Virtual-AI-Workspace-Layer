import {sessionContextSchemaIssue} from '../../src/host/session-identity.mjs';
import {digest} from '../../src/data/hash.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
const now=Date.parse('2026-10-14T00:00:00Z'),expiry='2026-10-14T01:00:00Z',origin='https://chatgpt.com';
const session=()=>({user:{id:'user_7',email:'private@example.test',name:'Private'},expires:expiry,accessToken:'SECRET'}),accounts=()=>({accounts:{P:{account:{account_id:'P',structure:'personal',name:'Private'}},O:{account:{account_id:'O',structure:'team'}}},account_order:['O','P']});
function fixture(change=()=>{}){let time=now;const calls=[];const fetch=async(url,options)=>{calls.push({url,options});const state={body:calls.length===1?session():accounts(),status:200,mime:'application/json',url,redirected:false};change(state,calls.length,()=>time+=6000);const r=new Response(JSON.stringify(state.body),{status:state.status,headers:{'content-type':state.mime,...state.headers}});Object.defineProperties(r,{url:{value:state.url},redirected:{value:state.redirected}});return r;};return {calls,provider:createSessionProvider({fetch,now:()=>time,elapsedNow:()=>time})};}
test('fixed GET session then bearer roster returns only minimal identity without selecting first account',async()=>{const f=fixture(),r=await f.provider.read({});assert.deepEqual(r,{principalId:'user_7',expiresAt:expiry,contexts:[{id:'P',kind:'personal'},{id:'O',kind:'organization'}],providerProfile:'chatgpt-session-v1',transport:'worker-fixed-fetch'});assert(!JSON.stringify(r).includes('SECRET'));assert.equal(f.calls[0].url,origin+'/api/auth/session');assert.equal(f.calls[1].url,origin+'/backend-api/accounts/check/v4-2023-04-27');assert.equal(f.calls[0].options.headers.Authorization,undefined);assert.equal(f.calls[1].options.headers.Authorization,'Bearer SECRET');for(const c of f.calls){assert.equal(c.options.method,'GET');assert.equal(c.options.credentials,'include');assert.equal(c.options.cache,'no-store');assert.equal(c.options.redirect,'error');assert.equal(c.options.signal.aborted,false,'completed transports remain completed after owner cleanup');}});
for(const status of [401,403])test('authorization HTTP '+status+' refuses identity',async()=>{const f=fixture(s=>s.status=status);await assert.rejects(f.provider.read(),/unauthorized/);assert.equal(f.calls.length,1);});
for(const [name,change,reason]of [['html',s=>s.mime='text/html','mime'],['redirect',s=>s.redirected=true,'response'],['foreignurl',s=>s.url='https://evil.test/api/auth/session','response'],['expired',s=>s.body.expires='2026-10-13T00:00:00Z','schema'],['missinguser',s=>delete s.body.user,'schema'],['tokenheader',s=>s.body.accessToken='x\r\ny','schema'],['oversize',s=>s.body.padding='x'.repeat(256*1024),'too-large'],['declaredoversize',s=>s.headers={'content-length':'999999999'},'too-large']])test('reject '+name,async()=>{await assert.rejects(fixture((s,n)=>{if(n===1)change(s);}).provider.read(),new RegExp(reason));});
test('unknown structure remains unknown, never inferred personal',async()=>{const f=fixture((s,n)=>{if(n===2)s.body.accounts.P.account.structure='future';});assert.equal((await f.provider.read()).contexts[0].kind,'unknown');});
test('context key and account identity conflict rejects entire roster',async()=>{const f=fixture((s,n)=>{if(n===2)s.body.accounts.P.account.account_id='other';});await assert.rejects(f.provider.read(),/accounts-schema/);});
test('two successful requests still share six-second elapsed deadline',async()=>{const f=fixture((s,n,late)=>{if(n===2)late();});await assert.rejects(f.provider.read(),/request-timeout/);assert.equal(f.calls.length,2);});
test('pre-aborted signal makes no request and caller URLs are rejected',async()=>{const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.provider.read({signal:controller.signal}),/aborted/);await assert.rejects(f.provider.read({url:'https://evil.test'}),/options/);assert.equal(f.calls.length,0);});
test('abort during stream prevents roster fetch',async()=>{const controller=new AbortController(),f=fixture((s,n)=>{if(n===1)controller.abort();});await assert.rejects(f.provider.read({signal:controller.signal}),/aborted/);assert.equal(f.calls.length,1);});
test('explicit loopback composition allowed, nonHTTPS remote rejected',()=>{assert(createSessionProvider({origin:'http://127.0.0.1:3210',fetch:async()=>{}}));assert.throws(()=>createSessionProvider({origin:'http://example.test'}),/invalid-session-provider/);});

test('bounded stream rejects excess bytes without trusting missing length header',async()=>{let cancelled=false;const provider=createSessionProvider({now:()=>now,fetch:async url=>{let n=0;const body=new ReadableStream({pull(c){if(n++<100)c.enqueue(new Uint8Array(65536));else c.close();},cancel(){cancelled=true;}}),r=new Response(body,{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}});await assert.rejects(provider.read(),/session-response-too-large/);assert(cancelled);});
test('malformed JSON and fetch diagnostics cannot disclose response text or token',async()=>{for(const mode of ['json','fetch']){const provider=createSessionProvider({now:()=>now,fetch:async url=>{if(mode==='fetch')throw Error('SECRET response text');const r=new Response('SECRET private body',{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}});await assert.rejects(provider.read(),error=>!error.message.includes('SECRET')&&error.message===(mode==='json'?'invalid-session-json':'session-transport-failed'));}});

test('wall clock rollback cannot hide an elapsed deadline overrun',async()=>{let wall=now,elapsed=0;const base=fixture(),provider=createSessionProvider({now:()=>wall,elapsedNow:()=>elapsed,fetch:async(...args)=>{const response=await (async()=>{const n=base.calls.length;const body=n===0?session():accounts();base.calls.push(args);const r=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:args[0]});return r;})();if(base.calls.length===2){wall-=3600000;elapsed=6001;}return response;}});await assert.rejects(provider.read(),/request-timeout/);});
const C='12345678-1234-4234-8234-123456789abc',currentOptions={conversationId:C,expectedPrincipalKey:'principal_'+digest(['chatgpt-principal-v1','user_7']),expectedContextKey:'context_'+digest(['chatgpt-context-v1','user_7','P'])};
test('owner abort cancels the in-flight request but not a previously consumed response',async()=>{
 const owner=new AbortController(),calls=[];let releaseAccount,accountStarted;
 const started=new Promise(resolve=>accountStarted=resolve);
 const response=(url,body)=>{const r=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;};
 const provider=createSessionProvider({now:()=>now,fetch:async(url,options)=>{calls.push({url,options});if(calls.length===1)return response(url,session());accountStarted();return new Promise(resolve=>releaseAccount=()=>resolve(response(url,accounts())));}});
 const pending=provider.read({signal:owner.signal});await started;assert.equal(calls.length,2);assert.equal(provider.isIdle(),false);
 owner.abort();await assert.rejects(pending,/session-aborted/);
 const states=calls.map(c=>c.options.signal.aborted);assert.equal(provider.isIdle(),false,'late transport work is still counted');
 releaseAccount();await new Promise(resolve=>setImmediate(resolve));assert.equal(provider.isIdle(),true);assert.equal(calls.length,2);
 assert.deepEqual(states,[false,true],'only the live transport receives cancellation');
});
test('unknown metadata schema rejects after consuming the body without aborting that completed transfer',async()=>{
 const owner=new AbortController(),f=currentFixture((state,n)=>{if(n===3)state.body={protocol:'future-99',payload:{opaque:true}};});
 await assert.rejects(f.provider.readCurrentConversation({...currentOptions,signal:owner.signal}),/invalid-conversation-metadata/);
 assert.equal(f.calls.length,3);assert.equal(f.provider.isIdle(),true);
 assert.deepEqual(f.calls.map(c=>c.options.signal.aborted),[false,false,false]);
 owner.abort();assert.deepEqual(f.calls.map(c=>c.options.signal.aborted),[false,false,false],'later scope cleanup cannot change completed transfers');
});
function currentFixture(change=()=>{},profile={currentConversationReadEnabled:true},clock=()=>now){
 const calls=[];let elapsed=0;const fetch=async(url,options)=>{calls.push({url,options});const n=calls.length,state={body:n===1?session():n===2?{accounts:{P:accounts().accounts.P}}:{conversation_id:C,mapping:{n:{id:'n',parent:null,message:{id:'m',author:{role:'user',id:'user_7'},create_time:1700000000,content:{parts:['PRIVATE_CONVERSATION_BODY']}}}}},status:200,mime:'application/json',url,redirected:false};change(state,n,()=>elapsed=6000);const response=new Response(typeof state.body==='string'?state.body:JSON.stringify(state.body),{status:state.status,headers:{'content-type':state.mime,...state.headers}});Object.defineProperties(response,{url:{value:state.url},redirected:{value:state.redirected}});return response;};
 return {calls,provider:createSessionProvider({fetch,now:clock,elapsedNow:()=>elapsed,profile})};
}
test('current conversation is disabled by default and malformed ID is refused before fetch',async()=>{
 for(const profile of [{},{currentConversationReadEnabled:false},{currentConversationReadEnabled:'true'}]){const f=currentFixture(()=>{},profile);await assert.rejects(f.provider.readCurrentConversation(currentOptions),/disabled/);assert.equal(f.calls.length,0);}
 for(const patch of [{conversationId:'../other'},{conversationId:'c1'},{expectedContextKey:''},{url:'https://evil.test'}]){const f=currentFixture();await assert.rejects(f.provider.readCurrentConversation({...currentOptions,...patch}),/options/);assert.equal(f.calls.length,0);}
});
test('current fixed GET reauthenticates personal context and returns candidates without body/token',async()=>{
 const f=currentFixture(()=>{},{currentConversationReadEnabled:true,currentConversationContextHeader:true}),result=await f.provider.readCurrentConversation(currentOptions);
 assert.equal(f.calls.length,3);assert.equal(f.calls[2].url,origin+'/backend-api/conversation/'+C);assert.equal(f.calls[2].options.headers.Authorization,'Bearer SECRET');assert.equal(f.calls[2].options.headers['ChatGPT-Account-ID'],'P');assert.equal(result.principalKey,currentOptions.expectedPrincipalKey);assert.equal(result.contextKey,currentOptions.expectedContextKey);assert.equal(result.principalId,undefined);assert.equal(result.contextId,undefined);assert.equal(result.transport,'worker-fixed-fetch');assert.equal(result.metadata.messages[0].messageId,'m');assert.equal(result.metadata.messages[0].actorVerified,undefined);assert(!/SECRET|PRIVATE_CONVERSATION_BODY|private@example/.test(JSON.stringify(result)));assert(f.calls.every(c=>c.options.signal.aborted===false));
});
test('principal conflict prevents roster and context ambiguity prevents conversation fetch',async()=>{
 const f=currentFixture();await assert.rejects(f.provider.readCurrentConversation({...currentOptions,expectedPrincipalKey:'principal_'+digest(['chatgpt-principal-v1','other'])}),/principal-conflict/);assert.equal(f.calls.length,1);
 for(const patch of [s=>s.body=accounts(),s=>s.body.accounts.P.account.structure='team',s=>s.body.accounts.P.account.structure='unknown']){const x=currentFixture((s,n)=>{if(n===2)patch(s);});await assert.rejects(x.provider.readCurrentConversation(currentOptions),/context-conflict/);assert.equal(x.calls.length,2);}
 const mismatch=currentFixture();await assert.rejects(mismatch.provider.readCurrentConversation({...currentOptions,expectedContextKey:'context_'+digest(['chatgpt-context-v1','user_7','other'])}),/context-conflict/);assert.equal(mismatch.calls.length,2);
});
for(const [label,mutate,reason]of [['wrong-C',s=>s.body.conversation_id='other','metadata'],['mime',s=>s.mime='text/html','mime'],['redirect',s=>s.redirected=true,'response'],['foreign-url',s=>s.url='https://evil.test','response'],['unauthorized',s=>s.status=403,'unauthorized'],['bad-json',s=>s.body='PRIVATE_INVALID_BODY','metadata'],['declared-byte-limit',s=>s.headers={'content-length':String(8*1024*1024+1)},'too-large'],['stream-byte-limit',s=>s.body.padding='界'.repeat(3*1024*1024),'too-large']])test('current conversation rejects '+label+' without disclosing data',async()=>{
 const f=currentFixture((s,n)=>{if(n===3)mutate(s);});await assert.rejects(f.provider.readCurrentConversation(currentOptions),e=>new RegExp(reason).test(e.message)&&!e.message.includes('PRIVATE'));assert.equal(f.calls.length,3);
});
test('current entire chain shares six-second budget and never starts detail after deadline',async()=>{
 const f=currentFixture((s,n,late)=>{if(n===2)late();});await assert.rejects(f.provider.readCurrentConversation(currentOptions),/request-timeout/);assert.equal(f.calls.length,2);
 const g=currentFixture((s,n,late)=>{if(n===3)late();});await assert.rejects(g.provider.readCurrentConversation(currentOptions),/request-timeout/);
});
test('current abort settles even when fetch ignores abort and late response cannot trigger next fetch',async()=>{
 let resolve;const calls=[],controller=new AbortController(),provider=createSessionProvider({profile:{currentConversationReadEnabled:true},now:()=>now,fetch:(url,options)=>{calls.push({url,options});return new Promise(r=>resolve=r);}});
 const pending=provider.readCurrentConversation({...currentOptions,signal:controller.signal});controller.abort();await assert.rejects(pending,/aborted/);assert.equal(calls.length,1);const response=new Response(JSON.stringify(session()),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:calls[0].url});resolve(response);await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);assert.equal(calls[0].options.signal.aborted,true);
});

test('unpublished current-reader API rejects raw identity parameters rather than maintaining a second authority path',async()=>{
 const f=currentFixture();await assert.rejects(f.provider.readCurrentConversation({conversationId:C,expectedPrincipalId:'user_7',expectedContextId:'P'}),/options/);await assert.rejects(f.provider.readCurrentConversation({...currentOptions,expectedPrincipalId:'user_7'}),/options/);assert.equal(f.calls.length,0);
});

const ackProfile=()=>({id:'offline_ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}});
test('ACK readback association belongs to exact provider result and never crosses serialization or provider',async()=>{
 const profile={currentConversationReadEnabled:true,sendAckProfile:ackProfile()},f=currentFixture((s,n)=>{if(n===3)s.body.mapping.n.message.status='fixture-accepted';},profile);
 const result=await f.provider.readCurrentConversation(currentOptions),accepted=f.provider.acceptanceFor(result);
 assert.equal(accepted.messages.length,1);assert.equal(accepted.messages[0].authorPrincipalKey,currentOptions.expectedPrincipalKey);assert.equal(accepted.conversationId,C);assert.equal(accepted.contextKey,currentOptions.expectedContextKey);assert(Object.isFrozen(accepted));
 assert.equal(f.provider.acceptanceFor(structuredClone(result)),null);assert.equal(currentFixture().provider.acceptanceFor(result),null);assert.equal(f.provider.acceptanceFor(null),null);
 assert.equal(result.messages,undefined);assert.equal(result.profile,undefined);assert(!/SECRET|PRIVATE_CONVERSATION_BODY|user_7/.test(JSON.stringify(accepted)));
 profile.sendAckProfile.ack.acceptedStates[0]='changed';assert.equal(accepted.profile.ack.acceptedStates[0],'fixture-accepted');
 result.principalKey='changed';assert.equal(accepted.principalKey,currentOptions.expectedPrincipalKey);
});
test('unconfigured ACK never emits readback association and profile mismatch refuses construction',async()=>{
 const f=currentFixture((s,n)=>{if(n===3)s.body.mapping.n.message.status='fixture-accepted';});assert.equal(f.provider.acceptanceFor(await f.provider.readCurrentConversation(currentOptions)),null);
 assert.throws(()=>currentFixture(()=>{},{sendAckProfile:ackProfile()}),/ack-profile/);
 assert.throws(()=>currentFixture(()=>{},{id:'different',currentConversationReadEnabled:true,sendAckProfile:ackProfile()}),/ack-profile/);
});
test('explicit ACK profile still cannot accept missing status',async()=>{
 const f=currentFixture(()=>{},{currentConversationReadEnabled:true,sendAckProfile:ackProfile()});assert.deepEqual(f.provider.acceptanceFor(await f.provider.readCurrentConversation(currentOptions)).messages,[]);
});

test('expired private ACK association is discarded and clock rollback cannot revive it',async()=>{
 let wall=now;const f=currentFixture((s,n)=>{if(n===3)s.body.mapping.n.message.status='fixture-accepted';},{currentConversationReadEnabled:true,sendAckProfile:ackProfile()},()=>wall);const result=await f.provider.readCurrentConversation(currentOptions);assert(f.provider.acceptanceFor(result));wall=Date.parse(expiry);assert.equal(f.provider.acceptanceFor(result),null);wall=now;assert.equal(f.provider.acceptanceFor(result),null);
});

test('explicit context-header profile reads a matched authenticated nonfirst organization',async()=>{const f=currentFixture((s,n)=>{if(n===2)s.body=accounts();},{currentConversationReadEnabled:true,currentConversationRosterContext:true,currentConversationContextHeader:true}),options={...currentOptions,expectedContextKey:'context_'+digest(['chatgpt-context-v1','user_7','O'])};const r=await f.provider.readCurrentConversation(options);assert.equal(r.contextKey,options.expectedContextKey);assert.equal(f.calls[2].options.headers['ChatGPT-Account-ID'],'O');assert(!JSON.stringify(r).includes('SECRET'));});
for(const [label,profile]of [['no-header',{currentConversationRosterContext:true}],['no-roster-profile',{currentConversationContextHeader:true}]])test('multi-context detail still refuses '+label,async()=>{const f=currentFixture((s,n)=>{if(n===2)s.body=accounts();},{currentConversationReadEnabled:true,...profile});await assert.rejects(f.provider.readCurrentConversation(currentOptions),/context-conflict/);assert.equal(f.calls.length,2);});
test('explicit workspace grammar and context selection remain separate',async()=>{const f=currentFixture((s,n)=>{if(n===2){s.body=accounts();s.body.accounts.O.account.structure='workspace';}},{currentConversationReadEnabled:true,currentConversationRosterContext:true,currentConversationContextHeader:true,structures:{personal:'personal',workspace:'organization'}});const r=await f.provider.readCurrentConversation({...currentOptions,expectedContextKey:'context_'+digest(['chatgpt-context-v1','user_7','O'])});assert.equal(r.metadata.messages[0].messageId,'m');assert.equal(f.calls[2].options.headers['ChatGPT-Account-ID'],'O');});

test('fixed worker provider admits canonical active roster through a native default alias without selecting it',async()=>{
 const f=fixture((s,n)=>{if(n!==2)return;const p={account:{account_id:'P',structure:'personal',is_deactivated:false},can_access_with_session:true};s.body={accounts:{O:{account:{account_id:'O',structure:'team',is_deactivated:true},can_access_with_session:true},default:structuredClone(p),P:p}};});
 const identity=await f.provider.read();assert.deepEqual(identity.contexts,[{id:'P',kind:'personal'}]);assert.equal(identity.activeContext,undefined);assert.equal(f.calls.length,2);assert(!JSON.stringify(identity).includes('SECRET'));
});

const pluralProfile={currentConversationReadEnabled:true,currentConversationContextHeader:true,conversationRequestContext:'conversation-detail-plural-v1'};
test('explicit plural fixed reader uses only selected endpoint and retains private candidate result',async()=>{
 const f=currentFixture(()=>{},pluralProfile),result=await f.provider.readCurrentConversation(currentOptions);
 assert.equal(f.calls.length,3);assert.equal(f.calls[2].url,origin+'/backend-api/conversations/'+C);
 assert.equal(f.calls[2].options.headers['ChatGPT-Account-ID'],'P');assert.equal(result.metadata.conversationId,C);
 assert(!/SECRET|PRIVATE_CONVERSATION_BODY/.test(JSON.stringify(result)));
});
for(const dialect of ['plural','conversation-detail-plural-v2','https://evil.test/',true,{}])test('unknown fixed reader dialect fails before any request '+JSON.stringify(dialect),()=>{
 assert.throws(()=>currentFixture(()=>{},{...pluralProfile,conversationRequestContext:dialect}),/conversation-context-profile/);
});
for(const [label,change,reason]of [
 ['403',s=>s.status=403,'session-unauthorized'],
 ['legacy response URL',s=>s.url=origin+'/backend-api/conversation/'+C,'invalid-session-response'],
 ['wrong conversation',s=>s.body.conversation_id='other','invalid-conversation-metadata'],
 ['HTML',s=>s.mime='text/html','invalid-session-mime']
])test('plural fixed reader rejects '+label+' without fallback or extra requests',async()=>{
 const f=currentFixture((s,n)=>{if(n===3)change(s);},pluralProfile);
 await assert.rejects(f.provider.readCurrentConversation(currentOptions),new RegExp(reason));assert.equal(f.calls.length,3);
 assert.equal(f.calls[2].url,origin+'/backend-api/conversations/'+C);
});
test('plural dialect alone never enables a current read',async()=>{
 const f=currentFixture(()=>{},{conversationRequestContext:pluralProfile.conversationRequestContext});
 await assert.rejects(f.provider.readCurrentConversation(currentOptions),/disabled/);assert.equal(f.calls.length,0);
});
test('plural fixed reader preserves the six second chain deadline',async()=>{
 const f=currentFixture((s,n,late)=>{if(n===2)late();},pluralProfile);
 await assert.rejects(f.provider.readCurrentConversation(currentOptions),/request-timeout/);assert.equal(f.calls.length,2);
});

const listProfile={...pluralProfile,conversationMetadataFormat:'message-list-v1'};
test('explicit message-list reader binds scope and returns partial IDs without ACK or body',async()=>{
 const f=currentFixture((s,n)=>{if(n===3)s.body={conversation_id:C,messages:[{id:'m',author:{role:'user',id:'user_7'},create_time:1700000000,content:{parts:['PRIVATE_CONVERSATION_BODY']}}],current_node:'m',page_info:{has_next_page:false}};},listProfile);
 const r=await f.provider.readCurrentConversation(currentOptions);
 assert.equal(f.calls.length,3);assert.equal(f.calls[2].url,origin+'/backend-api/conversations/'+C);
 assert.equal(r.metadata.state,'partial');assert.equal(r.metadata.messages[0].messageId,'m');assert.equal(r.metadata.messages[0].lineage,null);assert.equal(r.metadata.messages[0].mappingNodeId,null);
 assert.equal(f.provider.acceptanceFor(r),null);assert.equal(f.provider.historyFor(r),null);assert(!/SECRET|PRIVATE_CONVERSATION_BODY/.test(JSON.stringify(r)));
});
for(const patch of [{conversationRequestContext:null},{conversationMetadataFormat:'auto'},{sendAckProfile:{}},{historicalSendProfile:{}}])test('message-list configuration refuses unsupported or attribution profile '+JSON.stringify(patch),()=>{assert.throws(()=>currentFixture(()=>{},{...listProfile,...patch}),/invalid-conversation-metadata-profile/);});
test('explicit list schema does not silently fall back to legacy mapping',async()=>{const f=currentFixture(()=>{},listProfile);await assert.rejects(f.provider.readCurrentConversation(currentOptions),/invalid-conversation-metadata/);assert.equal(f.calls.length,3);});

for(const mode of ['identity','current'])test(`provider preserves only parser-owned schema category for ${mode}`,async()=>{
 const change=(s,n)=>{if(n===2)s.body={accounts:{default:{account:{account_id:null,structure:'personal',is_deactivated:false},can_access_with_session:true}}};};
 const f=mode==='identity'?fixture(change):currentFixture(change);
 await assert.rejects(mode==='identity'?f.provider.read():f.provider.readCurrentConversation(currentOptions),e=>e.message==='invalid-accounts-schema'&&sessionContextSchemaIssue(e)==='default-null-context-id');
 assert.equal(f.calls.length,2);
});
test('transport errors cannot forge parser-owned schema details',async()=>{
 const fake=Object.assign(Error('invalid-accounts-schema'),{schemaIssue:'PRIVATE_RESPONSE',body:'PRIVATE_BODY'});
 const provider=createSessionProvider({fetch:async()=>{throw fake;}});
 await assert.rejects(provider.read(),e=>e!==fake&&e.message==='invalid-accounts-schema'&&sessionContextSchemaIssue(e)===null&&Object.keys(e).length===0);
});
