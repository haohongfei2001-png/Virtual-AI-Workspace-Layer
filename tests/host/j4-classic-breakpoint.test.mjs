import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {packageHost} from '../../extension/package.mjs';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {pauseJointDrain,locateClassicJointBoundaries} from './j4-joint-interruption.mjs';
const dir=await mkdtemp(join(tmpdir(),'j4-classic-breakpoint-'));
after(()=>rm(dir,{recursive:true,force:true}));
const built=packageHost(join(dir,'package'),{offlineOrigin:'http://127.0.0.1:43210',offlineContext:true}),packageRoot=built.unpacked;
const source=await readFile(join(packageRoot,'extension/classic-runtime.js'),'utf8');
assert.equal(source,compileClassicWorker(packageRoot).runtime);
function fixture({afterEvidence=false,actualSource=source,duplicate=false,legacy=false,missing=false,moved=false}={}){
 const cdp=new EventEmitter(),calls=[],at=locateClassicJointBoundaries(source,{afterEvidence});
 const owner={scriptId:'bundle',lineNumber:at.owner,columnNumber:at.ownerColumn},entry={scriptId:'bundle',lineNumber:at.entry,columnNumber:afterEvidence?at.entryColumn:source.split('\n')[at.entry].indexOf('this.base.scopeOrThrow')};
 const receive=message=>cdp.emit('Target.receivedMessageFromTarget',{sessionId:'session',message:JSON.stringify(message)});
 cdp.send=async(method,params)=>{calls.push({method,params});if(method==='Target.getTargets')return {targetInfos:[{type:'service_worker',targetId:'worker',url:'chrome-extension://test/extension/worker.mjs'}]};if(method==='Target.attachToTarget')return {sessionId:'session'};if(method==='Target.sendMessageToTarget'){
  const request=JSON.parse(params.message);queueMicrotask(()=>{
   if(request.method==='Debugger.enable')for(let i=0;i<(duplicate?2:1);i++)receive({method:'Debugger.scriptParsed',params:{scriptId:i?'duplicate':'bundle',url:'chrome-extension://test/'+(legacy?'src/runtime/host-continuation-owner.mjs':'extension/classic-runtime.js')}});
   const repository=(request.params?.start??request.params?.location)?.lineNumber===at.entry;
   const result=request.method==='Debugger.getScriptSource'?{scriptSource:actualSource}:request.method==='Debugger.getPossibleBreakpoints'?{locations:missing?[]:[repository?entry:{...owner,type:'call'}]}:request.method==='Debugger.setBreakpoint'?{breakpointId:repository?'repository':'owner',actualLocation:moved?{...(repository?entry:owner),columnNumber:999}:repository?entry:owner}:{};
   receive({id:request.id,result});
  });}return {};};
 return {cdp,calls,owner,entry,emit:(ids,location)=>receive({method:'Debugger.paused',params:{reason:'other',hitBreakpoints:ids,callFrames:[{location}]}})};
}
for(const afterEvidence of [false,true])test('formal classic bundle preserves exact owner and repository boundaries: afterEvidence='+afterEvidence,async()=>{
 const f=fixture({afterEvidence}),pause=await pauseJointDrain(f.cdp,'test',{packageRoot,afterEvidence});try{
  f.emit(['owner'],f.owner);assert.equal((await pause.wait()).boundary,afterEvidence?'continuation-owner-complete-call':'continuation-owner-call');
  f.emit(['repository'],f.entry);assert.equal((await pause.wait()).boundary,afterEvidence?'native-repository-completion-entry':'evidence-repository-continuation-entry');
  f.emit(['repository'],f.owner);await assert.rejects(pause.wait(),/wrong-callsite/);
  f.emit(['unrelated'],f.entry);await assert.rejects(pause.wait(),/unrelated-pause/);
  const commands=f.calls.filter(c=>c.method==='Target.sendMessageToTarget').map(c=>JSON.parse(c.params.message));assert(!commands.some(c=>c.method.includes('evaluate')));assert(commands.filter(c=>c.method==='Debugger.getScriptSource').every(c=>c.params.scriptId==='bundle'));
 }finally{await pause.close();}
});
for(const [name,options,error]of [['different executed bytes',{actualSource:source+'\n'},/source-mismatch/],['duplicate script',{duplicate:true},/script-required/],['ESM fallback',{legacy:true},/script-required/],['missing executable location',{missing:true},/breakpoint-unresolved/],['moved breakpoint',{moved:true},/breakpoint-moved/]])test('classic debugger rejects '+name,async()=>{
 const f=fixture(options);await assert.rejects(pauseJointDrain(f.cdp,'test',{packageRoot}),error);assert(f.calls.some(c=>c.method==='Target.detachFromTarget'));assert.equal(f.cdp.listenerCount('Target.receivedMessageFromTarget'),0);
});
test('formal caller requires packageRoot and never selects module fixture automatically',async()=>{const f=fixture();await assert.rejects(pauseJointDrain(f.cdp,'test'),/package-root-required/);assert.equal(f.calls.length,0);});
for(const afterEvidence of [false,true])test('compiled locator refuses missing duplicate and shifted first-statement anchors: '+afterEvidence,()=>{
 const positions=locateClassicJointBoundaries(source,{afterEvidence}),lines=source.split('\n'),anchor=lines[positions.owner];
 assert.throws(()=>locateClassicJointBoundaries(source.replace(anchor,''),{afterEvidence}),/unique-anchor/);
 assert.throws(()=>locateClassicJointBoundaries(source+'\n'+anchor,{afterEvidence}),/unique-anchor/);
 lines[positions.entry]='      unexpectedSideEffect();';assert.throws(()=>locateClassicJointBoundaries(lines.join('\n'),{afterEvidence}),/first-statement/);
});
