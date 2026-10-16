import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForSnippetCapture} from '../../src/host/snippet-capture-wait.mjs';
// Controlled DOM identities and monotonic scheduler; no browser proof claim.
function fixture({initialReady=false,captureResult={ok:true,selectionId:'captured'},timeoutMs=6000}={}){
 let time=1000,serial=0,ready=initialReady,current=true,captures=0,checks=0,selectionReads=0,readyHook=null;
 const handlers=new Map(),timers=new Map(),replies=[];
 const document={getSelection(){selectionReads++;return selection;},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},removeEventListener(type,fn){handlers.get(type)?.delete(fn);}};
 const root={parentNode:document},parent={parentNode:root};
 const start={isConnected:true,ownerDocument:document,parentNode:parent},end={isConnected:true,ownerDocument:document,parentNode:parent};let text='selected words';
 let range={startContainer:start,endContainer:end,startOffset:2,endOffset:16,toString:()=>text};
 let selection={rangeCount:1,isCollapsed:false,getRangeAt:index=>{assert.equal(index,0);return range;},removeAllRanges(){assert.fail('must not rewrite native selection');},addRange(){assert.fail('must not restore cached Range');}};
 const stop=waitForSnippetCapture({document,timeoutMs,ready:()=>{checks++;readyHook?.();return ready;},capture:()=>{captures++;if(captureResult instanceof Error)throw captureResult;return captureResult;},isCurrent:()=>current,reply:value=>replies.push(value),now:()=>time,schedule:(fn,delay)=>{assert(delay>0&&delay<=50);const id=++serial;timers.set(id,fn);return id;},cancel:id=>timers.delete(id)});
 return {document,root,parent,start,end,replies,timers,stop,get range(){return range;},get selection(){return selection;},get captures(){return captures;},get checks(){return checks;},get selectionReads(){return selectionReads;},setReady:value=>ready=value,setReadyHook:value=>readyHook=value,setCurrent:value=>current=value,setText:value=>text=value,setRange:value=>range=value,setSelection:value=>selection=value,setTime:value=>time=value,handlers:()=>[...handlers.values()].reduce((n,set)=>n+set.size,0),fire(ms=50){time+=ms;const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1]();}},event(type,extra={}){for(const fn of [...(handlers.get(type)??[])])fn({type,...extra});}};
}
function failed(f){assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.captures,0);assert.equal(f.handlers(),0);assert.equal(f.timers.size,0);f.setReady(true);f.fire();f.stop();assert.deepEqual(f.replies,[{ok:false}]);}
test('pending body proof waits with original RAM selection then captures exactly once',()=>{
 const f=fixture();assert.equal(typeof f.stop,'function');assert.equal(f.handlers(),5);assert.equal(f.captures,0);f.fire();assert.deepEqual(f.replies,[]);
 f.setReady(true);f.fire();assert.equal(f.captures,1);assert.deepEqual(f.replies,[{ok:true,selectionId:'captured'}]);assert.equal(f.handlers(),0);assert.equal(f.timers.size,0);f.stop();f.fire();assert.equal(f.captures,1);assert.equal(f.replies.length,1);
});
for(const [name,change]of [
 ['Range identity',f=>f.setRange({...f.range})],['Selection identity',f=>f.setSelection({...f.selection})],
 ['start node',f=>{f.range.startContainer={...f.start};}],['end node',f=>{f.range.endContainer={...f.end};}],
 ['start offset',f=>{f.range.startOffset++;}],['end offset',f=>{f.range.endOffset++;}],
 ['selected text',f=>f.setText('changed words')],['start disconnected',f=>{f.start.isConnected=false;}],['end disconnected',f=>{f.end.isConnected=false;}],
 ['foreign document',f=>{f.start.ownerDocument={};}],['collapsed',f=>{f.selection.isCollapsed=true;}],['extra Range',f=>{f.selection.rangeCount=2;}],
 ['missing selection',f=>f.setSelection(null)],['read throws',f=>{f.selection.getRangeAt=()=>{throw Error('unavailable');};}]
])test('pending selection change cancels capture: '+name,()=>{const f=fixture();change(f);f.setReady(true);f.fire();failed(f);});
for(const type of ['pointerdown','keydown','focusin','wheel','beforetoggle'])test('trusted '+type+' cancels capture before readiness',()=>{const f=fixture();f.event(type,{isTrusted:true,newState:'open'});failed(f);});
test('untrusted interactions and closing toggle do not cancel unchanged selection',()=>{const f=fixture();for(const type of ['pointerdown','keydown','focusin','wheel','beforetoggle'])f.event(type,{isTrusted:false,newState:'open'});f.event('beforetoggle',{isTrusted:true,newState:'closed'});f.setReady(true);f.fire();assert.equal(f.captures,1);assert.equal(f.replies[0].ok,true);assert.equal(f.handlers(),0);});
test('returned cancellation callback stops wait and cleans temporary listeners',()=>{const f=fixture();f.stop();failed(f);});
test('revoked binding cannot capture even when proof becomes ready',()=>{const f=fixture();f.setCurrent(false);f.setReady(true);f.fire();failed(f);});
test('absolute six-second deadline refuses ready proof at boundary',()=>{const f=fixture();f.setTime(6999);f.fire(0);assert.deepEqual(f.replies,[]);f.setReady(true);f.fire(1);failed(f);});
test('clock earlier than initial request cancels permanently',()=>{const f=fixture();f.setTime(999);f.fire(0);failed(f);});
test('clock rollback after progress also cancels before capture',()=>{const f=fixture();f.fire(100);f.setTime(1050);f.setReady(true);f.fire(0);failed(f);});
test('nonfinite elapsed clock fails closed',()=>{const f=fixture();f.setTime(NaN);f.setReady(true);f.fire(0);failed(f);});
test('one hundred twenty polls cap even if scheduler clock stops advancing',()=>{const f=fixture();for(let i=0;i<120;i++)f.fire(0);assert.equal(f.checks,120);failed(f);});
test('already-ready proof captures immediately without acquiring or caching selection',()=>{const f=fixture({initialReady:true});assert.equal(f.captures,1);assert.equal(f.selectionReads,0);assert.equal(f.timers.size,0);assert.equal(f.handlers(),0);assert.deepEqual(f.replies,[{ok:true,selectionId:'captured'}]);f.stop();assert.equal(f.replies.length,1);});
for(const captureResult of [{ok:false},Error('capture failed')])test('ready capture failure is terminal and never retried '+String(captureResult),()=>{const f=fixture({captureResult});f.setReady(true);f.fire();assert.equal(f.captures,1);assert.deepEqual(f.replies,[{ok:false}]);assert.equal(f.handlers(),0);assert.equal(f.timers.size,0);f.fire();f.stop();assert.equal(f.captures,1);assert.equal(f.replies.length,1);});

for(const endpoint of ['start','end'])test('same connected '+endpoint+' endpoint reparented under a different ancestor cancels pending capture',()=>{
 const f=fixture();f[endpoint].parentNode={parentNode:f.root};f.setReady(true);f.fire();failed(f);
});
test('changing shared higher ancestor cancels even with unchanged immediate parents and endpoints',()=>{
 const f=fixture();f.parent.parentNode={parentNode:f.document};f.setReady(true);f.fire();failed(f);
});
test('remaining 100ms budget expires without acquiring a new six-second window',()=>{
 const f=fixture({timeoutMs:100});f.fire(50);assert.deepEqual(f.replies,[]);f.setReady(true);f.fire(50);failed(f);assert.equal(f.checks,2);
});
test('proof ready before remaining 100ms budget expires captures once',()=>{
 const f=fixture({timeoutMs:100});f.fire(50);f.setReady(true);f.fire(49);assert.equal(f.captures,1);assert.deepEqual(f.replies,[{ok:true,selectionId:'captured'}]);assert.equal(f.timers.size,0);
});
for(const timeoutMs of [0,-1,6001,Infinity,NaN,null,'100',{},true])test('invalid remaining budget fails before readiness or capture: '+String(timeoutMs),()=>{
 const f=fixture({timeoutMs,initialReady:true});failed(f);assert.equal(f.checks,0);assert.equal(f.selectionReads,0);
});

for(const [name,change]of [
 ['remaining deadline consumed',f=>f.setTime(1100)],
 ['binding revoked',f=>f.setCurrent(false)],
 ['Range replaced',f=>f.setRange({...f.range})]
])test('ready callback '+name+' must be rechecked before capture',()=>{
 const f=fixture({timeoutMs:100});f.setReady(true);f.setReadyHook(()=>change(f));f.fire(50);failed(f);
});
