import {createFreeViewSession,initialFreeTimePolicy} from '../../src/data/free-time-policy.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createFreeViewOwner} from '../../src/runtime/free-view-owner.mjs';import {normalizedScope} from '../../src/b1/identity.mjs';
const NOW='2026-10-14T00:00:00Z',scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'A',organizationId:'personal'});
function fixture(extra={}){let allowed=true,revision=1,gate=null,versionDelta=0;const calls={header:0,page:[],version:0};const session={H:30,T:20740,Z:'UTC',policyRevision:0};
const header=()=>({scope:scope.key,revision,workspaceRevision:0,evidenceRevision:'0:0',viewRevision:0,viewMode:'free',manifest:{projectVersions:{p:1},refVersions:{c:revision},activityVersions:{c:'0'}},viewSession:session,preferences:{},view:null});
const read={async freeHeader(_scope,_options,_now,_zone,requestedSession){calls.header++;if(gate)await gate;return {...header(),viewSession:requestedSession??session};},async freePage(s,q){calls.page.push(q.ids);return {scope:s.key,revision,workspaceRevision:0,evidenceRevision:'0:0',projects:q.ids.projects.map(id=>({id,scope:s.key,nativeName:'Native project',nativeUrl:'https://chatgpt.com/g/p/project'})),refs:q.ids.refs.map(id=>({id,scope:s.key,nativeTitle:'Native '+revision,nativeUrl:'https://chatgpt.com/c/c',membership:'NONE',projectId:null,activityDecision:{basis:'provisional',candidateDay:20740,segment:0}}))};},async version(){calls.version++;return {nativeRevision:revision+versionDelta,revision:0,evidenceRevision:'0:0',viewRevision:0};}};
const owner=createFreeViewOwner({readService:read,scope,guard:()=>allowed,clock:()=>NOW,...extra});return {owner,read,calls,header,advance:()=>revision++,deny:()=>allowed=false,conflict:()=>versionDelta=1,pause(){let resolve;gate=new Promise(r=>resolve=r);return ()=>{gate=null;resolve();};}};}
test('MOCK read API composes existing prepared Free projection and single index without seed',async()=>{const h=fixture(),result=await h.owner.refresh();assert.equal(result.snapshot.scope,scope.key);assert.equal(result.snapshot.refs[0].nativeTitle,'Native 1');assert.equal(result.snapshot.noProject.length,1);assert.equal(result,h.owner.current());assert.ok(result.index);assert.equal(h.calls.version,1);});
test('same-query callers share one refresh and unchanged inventory makes zero page calls',async()=>{const h=fixture(),resume=h.pause(),a=h.owner.refresh(),b=h.owner.refresh();assert.equal(a,b);resume();assert.equal(await a,await b);assert.equal(h.calls.header,1);const pages=h.calls.page.length;await h.owner.refresh();assert.equal(h.calls.page.length,pages);assert.equal(h.calls.version,2);});
test('native ref change reads only changed reference and preserves prior published snapshot',async()=>{const h=fixture(),first=await h.owner.refresh();h.advance();const next=await h.owner.refresh();assert.deepEqual(h.calls.page.at(-1),{projects:[],refs:['c']});assert.equal(next.snapshot.refs[0].nativeTitle,'Native 2');assert.equal(first.snapshot.refs[0].nativeTitle,'Native 1');});
test('final version conflict never publishes assembled candidate',async()=>{const h=fixture(),first=await h.owner.refresh();h.advance();h.conflict();await assert.rejects(h.owner.refresh(),/snapshot-revision-changed/);assert.equal(h.owner.current(),first);});
test('guard loss while header awaits clears prior data and prevents publication',async()=>{const h=fixture();await h.owner.refresh();const resume=h.pause(),read=h.owner.refresh();h.deny();resume();await assert.rejects(read,/stale/);assert.equal(h.owner.current(),null);});
test('invalidate cancels prior generation; fresh refresh can succeed while old completion is ignored',async()=>{const h=fixture(),resume=h.pause(),old=h.owner.refresh();h.owner.invalidate();resume();const fresh=await h.owner.refresh();await assert.rejects(old,/stale/);assert.equal(h.owner.current(),fresh);h.owner.stop();assert.equal(h.owner.current(),null);await assert.rejects(h.owner.refresh(),/stale/);});
test('query boundaries reject arbitrary authority and conflicting concurrent controls',async()=>{const h=fixture();for(const q of [{scope:'B'},{pageSize:0},{pageSize:5001},{now:'bad'},{timeZone:'bogus-zone'}])await assert.rejects(h.owner.refresh(q),/invalid-free-view-query/);assert.equal(h.calls.header,0);const resume=h.pause(),a=h.owner.refresh();await assert.rejects(h.owner.refresh({pageSize:1}),/in-progress/);resume();await a;});
test('wrong scope and missing page inventory cannot publish',async()=>{const h=fixture();h.read.freePage=async()=>({scope:'foreign',revision:1,projects:[],refs:[]});await assert.rejects(h.owner.refresh(),/stale/);assert.equal(h.owner.current(),null);});

function clock(){let time=0,id=0;const timers=new Map();return {timers,options:{elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key)},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}for(let i=0;i<30;i++)await Promise.resolve();},elapse(ms){time+=ms;}};}
for(const method of ['freeHeader','freePage','version'])test(`MOCK permanent ${method} deadline releases singleflight and rejects late publication`,async()=>{const c=clock(),h=fixture(c.options),original=h.read[method];let resolve,opts;h.read[method]=(...args)=>{opts=method==='freePage'?args[2]:args[1];return new Promise(r=>resolve=r);};const pending=h.owner.refresh(),failed=assert.rejects(pending,/request-timeout/);for(let i=0;i<40;i++)await Promise.resolve();await c.advance(6000);await failed;assert.equal(opts.signal.aborted,true);assert.equal(opts.guard(),false);h.read[method]=original;const next=await h.owner.refresh();resolve(await original(scope,...(method==='freePage'?[{ids:{projects:[],refs:[]}}]:[])));for(let i=0;i<20;i++)await Promise.resolve();assert.equal(h.owner.current(),next);assert.equal(c.timers.size,0);});
test('MOCK successful sub-six-second requests still share one total thirty-second budget',async()=>{const c=clock(),h=fixture(c.options),original=h.read.freeHeader;let stage=0;h.read.freeHeader=async(...args)=>{c.elapse(5000);return stage<4?{preparing:{scope:scope.key,stage:['native-bootstrap','native-index','shared-directory','evidence-directory'][stage++]}}:original(...args);};const page=h.read.freePage;h.read.freePage=async(...args)=>{c.elapse(5000);return page(...args);};await assert.rejects(h.owner.refresh(),/read-budget-exhausted/);assert.equal(h.owner.current(),null);assert.equal(h.calls.version,0);assert.equal(c.timers.size,0);});
test('default-now callers share the first evaluation instant despite ticking wall clock',async()=>{let time=Date.parse(NOW);const h=fixture({clock:()=>new Date(time++).toISOString()}),resume=h.pause(),a=h.owner.refresh(),b=h.owner.refresh();assert.equal(a,b);resume();await a;});
for(const reason of ['native-page-too-large','free-evidence-page-too-large','free-page-too-large'])test(`MOCK ${reason} refines page without aborting shared read budget`,async()=>{const c=clock(),h=fixture(c.options),original=h.read.freePage,requests=[];h.read.freePage=async(s,q,o)=>{requests.push(structuredClone(q.ids));assert.equal(o.guard(),true);assert.equal(o.signal.aborted,false);c.elapse(1000);if(q.ids.projects.length+q.ids.refs.length>1)throw Error(reason);return original(s,q,o);};const result=await h.owner.refresh();assert.equal(result.snapshot.refs.length,1);assert.equal(result.snapshot.projects.length,1);assert.deepEqual(requests,[{projects:['p'],refs:['c']},{projects:['p'],refs:[]},{projects:[],refs:['c']}]);assert.equal(h.calls.version,1);assert.equal(c.timers.size,0);});

test('manual session reconfiguration preserves historical T/Z and hides old-H publication until refresh',async()=>{
 const h=fixture(),initial=await h.owner.refresh(),old=structuredClone(initial.snapshot.viewSession);
 const next=h.owner.reconfigureSession({H:7,policyRevision:1});assert.deepEqual(next,{...old,H:7,policyRevision:1});assert(Object.isFrozen(next));assert.equal(h.owner.current(),null);
 const refreshed=await h.owner.refresh();assert.deepEqual(refreshed.snapshot.viewSession,next);assert.equal(refreshed.index.byId('c').id,'c');assert.deepEqual(initial.snapshot.viewSession,old);
 assert.equal(h.owner.reconfigureSession({H:7,policyRevision:1}),refreshed.snapshot.viewSession);assert.equal(h.owner.current(),refreshed,'idempotent config does not hide current view');
});
test('midnight and ordinary refresh preserve explicitly configured history session',async()=>{
 let now=NOW;const h=fixture({clock:()=>now});await h.owner.refresh();const session=h.owner.reconfigureSession({H:60,policyRevision:2});await h.owner.refresh();
 now='2026-10-15T09:00:00Z';const refreshed=await h.owner.refresh({timeZone:'Asia/Shanghai'});assert.deepEqual(refreshed.snapshot.viewSession,session);assert.equal(refreshed.snapshot.viewSession.T,20740);assert.equal(refreshed.snapshot.viewSession.Z,'UTC');
});
test('late old-H header completion cannot overwrite reconfigured session or new publication',async()=>{
 const h=fixture();await h.owner.refresh();const original=h.read.freeHeader;let release;
 const held=new Promise(resolve=>release=resolve);h.read.freeHeader=async(...args)=>{await held;return original(...args);};
 const old=h.owner.refresh(),rejected=assert.rejects(old,/stale-free-view/);
 const session=h.owner.reconfigureSession({H:14,policyRevision:1});assert.equal(h.owner.current(),null);h.read.freeHeader=original;
 const current=await h.owner.refresh();await rejected;assert.deepEqual(current.snapshot.viewSession,session);
 release();for(let i=0;i<30;i++)await Promise.resolve();assert.equal(h.owner.current(),current);assert.deepEqual(h.owner.current().snapshot.viewSession,session);
});
test('session reconfiguration rejects missing publication, revoked authority and invalid or regressing controls',async()=>{
 const h=fixture();assert.throws(()=>h.owner.reconfigureSession({H:7,policyRevision:1}),/session-unavailable/);await h.owner.refresh();
 for(const value of [null,{},[],{H:1,policyRevision:1},{H:7,policyRevision:-1},{H:7,policyRevision:0},{H:7,policyRevision:1.5},{H:7,policyRevision:1,scope:'other'}])assert.throws(()=>h.owner.reconfigureSession(value),/invalid-free-session-reconfiguration/);
 h.owner.reconfigureSession({H:7,policyRevision:2});await h.owner.refresh();assert.throws(()=>h.owner.reconfigureSession({H:30,policyRevision:1}),/invalid-free-session-reconfiguration/);
 h.deny();assert.throws(()=>h.owner.reconfigureSession({H:14,policyRevision:3}),/stale-free-view/);assert.equal(h.owner.current(),null);
 const stopped=fixture();await stopped.owner.refresh();stopped.owner.stop();assert.throws(()=>stopped.owner.reconfigureSession({H:7,policyRevision:1}),/stale-free-view/);
});

// Node's TZ config supplies the real execution-environment IANA zone; no Intl hooks.
for(const zone of ['Asia/Shanghai','America/Los_Angeles'])test('default owner uses local IANA calendar: '+zone,async()=>{
 const priorTZ=process.env.TZ;process.env.TZ=zone;
 try{
  const at='2026-10-14T23:30:00Z',h=fixture({clock:()=>at});const calls=[];
  h.read.freeHeader=async(_scope,_options,now,timeZone,requested)=>{calls.push({now,timeZone,requested});return {...h.header(),viewSession:requested??createFreeViewSession({now,timeZone})};};
  const first=await h.owner.refresh(),expected=createFreeViewSession({now:at,timeZone:zone});assert.equal(calls[0].timeZone,zone);assert.equal(first.snapshot.viewSession.Z,zone);assert.equal(first.snapshot.viewSession.T,expected.T);
  const old=structuredClone(first.snapshot.viewSession);h.owner.reconfigureSession({H:7,policyRevision:1});const later=await h.owner.refresh({now:'2026-10-17T10:00:00Z',timeZone:'UTC'});assert.equal(later.snapshot.viewSession.H,7);assert.equal(later.snapshot.viewSession.T,old.T);assert.equal(later.snapshot.viewSession.Z,old.Z);assert.equal(calls.at(-1).requested.Z,zone);h.owner.stop();
 }finally{if(priorTZ===undefined)delete process.env.TZ;else process.env.TZ=priorTZ;}
});
test('explicit owner timezone overrides environment; explicit refresh timezone initializes first session',async()=>{
 const priorTZ=process.env.TZ;process.env.TZ='Asia/Shanghai';
 try{for(const [options,query,zone]of [[{timeZone:'UTC'},{},'UTC'],[{timeZone:'UTC'},{timeZone:'America/Los_Angeles'},'America/Los_Angeles']]){
  const h=fixture(options);h.read.freeHeader=async(_s,_o,now,timeZone,requested)=>({...h.header(),viewSession:requested??createFreeViewSession({now,timeZone})});const view=await h.owner.refresh(query);assert.equal(view.snapshot.viewSession.Z,zone);assert.equal(view.snapshot.viewSession.T,createFreeViewSession({now:NOW,timeZone:zone}).T);h.owner.stop();
 }}finally{if(priorTZ===undefined)delete process.env.TZ;else process.env.TZ=priorTZ;}
});

function currentFixture(){let at='2026-10-14T15:30:00Z',policy=null;const h=fixture({clock:()=>at,timeZone:'Asia/Shanghai'});h.read.freeHeader=async(_s,_o,now,zone,requested)=>({...h.header(),preferences:policy===null?{}:{freeTimePolicy:{value:policy}},viewSession:requested??createFreeViewSession({now,timeZone:zone})});return {...h,now:v=>at=v,policy:v=>policy=v};}
test('explicit current entry advances local midnight while ordinary refresh and manual H freeze history',async()=>{
 const h=currentFixture(),first=await h.owner.refresh(),old=first.snapshot.viewSession;h.now('2026-10-14T16:30:00Z');await h.owner.refresh();assert.deepEqual(h.owner.current().snapshot.viewSession,old);h.owner.reconfigureSession({H:7,policyRevision:1});await h.owner.refresh();const next=h.owner.enterCurrentSession();assert(Object.isFrozen(next));assert.equal(next.T,old.T+1);assert.equal(next.Z,'Asia/Shanghai');assert.equal(next.H,7);assert.equal(next.policyRevision,1);assert.equal(h.owner.current(),null);const updated=await h.owner.refresh();assert.deepEqual(updated.snapshot.viewSession,next);assert.equal(h.owner.enterCurrentSession(),next);assert.equal(h.owner.current(),updated);
});
test('only explicit current entry adopts a newly published valid policy; prior snapshot remains unchanged',async()=>{
 const h=currentFixture(),first=await h.owner.refresh(),old=structuredClone(first.snapshot.viewSession);h.policy({...initialFreeTimePolicy(),H:60,revision:2});await h.owner.refresh();assert.deepEqual(h.owner.current().snapshot.viewSession,old);const next=h.owner.enterCurrentSession();assert.equal(next.H,60);assert.equal(next.policyRevision,2);assert.equal(next.T,old.T);await h.owner.refresh();assert.deepEqual(first.snapshot.viewSession,old);
});
test('explicit current entry aborts old in-flight publication and preserves replica for fresh guarded refresh',async()=>{
 const h=currentFixture();await h.owner.refresh();const original=h.read.freeHeader;let release;h.read.freeHeader=async(...args)=>{await new Promise(r=>release=r);return original(...args);};const pending=h.owner.refresh(),rejected=assert.rejects(pending,/stale-free-view/);for(let i=0;i<10;i++)await Promise.resolve();h.now('2026-10-15T16:30:00Z');const next=h.owner.enterCurrentSession();h.read.freeHeader=original;const fresh=await h.owner.refresh();await rejected;release();for(let i=0;i<20;i++)await Promise.resolve();assert.equal(h.owner.current(),fresh);assert.deepEqual(fresh.snapshot.viewSession,next);
});
test('current entry refuses external fields, missing publication, malformed or regressing policy, guard loss and stop',async()=>{
 const empty=currentFixture();assert.throws(()=>empty.owner.enterCurrentSession(),/unavailable/);await empty.owner.refresh();assert.throws(()=>empty.owner.enterCurrentSession({H:7}),/invalid-free-current-session/);
 for(const policy of [{}, {...initialFreeTimePolicy(),H:1},{...initialFreeTimePolicy(),H:7,revision:0}]){const h=currentFixture();await h.owner.refresh();h.policy(policy);await h.owner.refresh();const before=h.owner.current();assert.throws(()=>h.owner.enterCurrentSession(),/invalid-free/);assert.equal(h.owner.current(),before);}
 const older=currentFixture();await older.owner.refresh();older.owner.reconfigureSession({H:7,policyRevision:2});await older.owner.refresh();older.policy({...initialFreeTimePolicy(),H:7,revision:1});await older.owner.refresh();assert.throws(()=>older.owner.enterCurrentSession(),/policy-revision/);
 const denied=currentFixture();await denied.owner.refresh();denied.deny();assert.throws(()=>denied.owner.enterCurrentSession(),/stale/);assert.equal(denied.owner.current(),null);const stopped=currentFixture();await stopped.owner.refresh();stopped.owner.stop();assert.throws(()=>stopped.owner.enterCurrentSession(),/stale/);
});

test('private resumed history session is detached and frozen through fresh replica reads',async()=>{
 const session={H:7,T:20700,Z:'Asia/Shanghai',policyRevision:2},expected=structuredClone(session),h=fixture({initialSession:session});session.T=20800;session.H=30;
 const first=await h.owner.refresh();assert.deepEqual(first.snapshot.viewSession,expected);h.advance();const next=await h.owner.refresh();assert.deepEqual(next.snapshot.viewSession,expected);assert.equal(next.snapshot.refs[0].nativeTitle,'Native 2');h.owner.stop();
});
test('private resumed session rejects invalid horizon day timezone revision and extra authority',()=>{
 const base={H:7,T:20700,Z:'UTC',policyRevision:2};for(const session of [{...base,H:1},{...base,T:NaN},{...base,T:100000001},{...base,Z:'invalid-zone'},{...base,policyRevision:-1},{...base,scope:'foreign'}])assert.throws(()=>fixture({initialSession:session}),/invalid-free-view-session/);
});

for(const change of ['revoked','generation','removed-ref'])test('trusted header withdraws prior projection before failing replacement: '+change,async()=>{
 const h=fixture(),header=h.read.freeHeader,page=h.read.freePage;let authorities={source:'generation-1'},remove=false,release;
 h.read.freeHeader=async(...args)=>{const value=await header(...args);return {...value,sourceAuthorities:authorities,...(remove?{manifest:{...value.manifest,refVersions:{},activityVersions:{}}}:{})};};
 await h.owner.refresh();assert(h.owner.current());
 if(change!=='generation')h.advance();authorities=change==='revoked'?{}:change==='generation'?{source:'generation-2'}:authorities;remove=change==='removed-ref';
 h.read.freePage=async()=>{await new Promise(resolve=>release=resolve);throw Error('request-timeout');};
 // Ensure the removal case also requires a project replacement page.
 if(remove){const next=h.read.freeHeader;h.read.freeHeader=async(...args)=>{const value=await next(...args);value.manifest.projectVersions.p=2;return value;};}
 const pending=h.owner.refresh(),rejected=assert.rejects(pending,/request-timeout/);for(let i=0;i<60&&!release;i++)await Promise.resolve();
 assert(release);assert.equal(h.owner.current(),null);assert.equal(h.owner.projectionWithdrawn(),true);release();await rejected;assert.equal(h.owner.projectionWithdrawn(),true);
 h.read.freePage=page;await h.owner.refresh();assert(h.owner.current()?.index,'replacement must rebuild a usable index even with unchanged row revisions');assert.equal(h.owner.projectionWithdrawn(),false);h.owner.stop();
});
test('source addition and ordinary visibility renewal retain valid last-known on read failure',async()=>{
 const h=fixture(),header=h.read.freeHeader;let authorities={source:'generation-1'},visibility='ttl-1';
 h.read.freeHeader=async(...args)=>({...await header(...args),sourceAuthorities:authorities,visibilityRevision:visibility});const first=await h.owner.refresh();
 h.advance();authorities={...authorities,other:'generation-2'};visibility='ttl-2';h.read.freePage=async()=>{throw Error('request-timeout');};
 await assert.rejects(h.owner.refresh(),/request-timeout/);assert.equal(h.owner.current(),first);assert.equal(h.owner.projectionWithdrawn(),false);h.owner.stop();
});
