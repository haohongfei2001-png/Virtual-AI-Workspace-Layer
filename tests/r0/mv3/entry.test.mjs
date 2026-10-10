import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createBroker } from '../../../experiments/r0/mv3/protocol.mjs';
/** Plain Node VM + tiny owned-slot fake. This is NOT browser/DOM/MV3 execution evidence. */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const temp = mkdtempSync(resolve(tmpdir(), 'r0-mv3-entry-source-'));
const output = resolve(temp, 'assembled');
const build = spawnSync(process.execPath, [resolve(root,'experiments/r0/mv3/build-probe.mjs'),output], {encoding:'utf8'});
assert.equal(build.status,0,build.stderr);
const source = readFileSync(resolve(output,'content.js'),'utf8');
after(()=>rmSync(temp,{recursive:true,force:true}));
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function entry({visibility='visible',url='http://127.0.0.1:38407/r0-mv3-fixture/A.html',meta=true,subframe=false}={}) {
  let sends=0,serial=0,time=1000;
  const timers=new Map(), marks=[], native={draft:'SYNTHETIC',selection:[1,3],model:'fixture'};
  const before=JSON.stringify(native), winEvents=new Map(), docEvents=new Map();
  const broker=createBroker({extensionId:'extension-id',workerId:'worker-A',now:()=>time,makeId:()=> 'lease-'+ ++serial});
  const slot={childNodes:marks,append(mark){marks.push(mark);}};
  const window={addEventListener(type,fn){winEvents.set(type,fn);}};
  window.top=subframe?{}:window;
  const document={
    visibilityState:visibility,
    addEventListener(type,fn){docEvents.set(type,fn);},
    querySelector(selector){assert.equal(selector,'meta[name="vawl-r0-synthetic"]');return meta?{content:'mv3-preparation-v1'}:null;},
    querySelectorAll(selector){assert.equal(selector,'[data-vawl-r0-mv3-slot="exclusive"]');return[slot];},
    createElement(tag){
      assert.equal(['section','span'].includes(tag),true);
      return{tag,dataset:{},textContent:'',attachShadow(){return {append(label){this.label=label;}};},
        remove(){const i=marks.indexOf(this);if(i!==-1)marks.splice(i,1);}};
    },
    getElementById(){throw Error('Native island access is outside this probe');}
  };
  const location={href:url};
  const context=vm.createContext({window,document,location,URL,Date:{now:()=>time},crypto:{randomUUID:()=> 'client-A'},
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
    rawReply(serialized){
      sends++;
      return JSON.stringify(broker.handle(JSON.parse(serialized),{id:'extension-id',tab:{id:1},frameId:0,
        documentId:'doc-A',documentLifecycle:'active',url:location.href}));
    }});
  vm.runInContext('globalThis.chrome={runtime:{sendMessage:message=>Promise.resolve(JSON.parse(rawReply(JSON.stringify(message))))}};',context);
  vm.runInContext(source,context,{filename:'source-only-content-bundle.js'});
  return {marks,timers,document,location,native,before,sends:()=>sends,
    emit(target,name,isTrusted){(target==='window'?winEvents:docEvents).get(name)?.({isTrusted});},
    time(value){time=value;}};
}
test('assembled content entry source mounts only its slot and ignores forged lifecycle events',async()=>{
  const h=entry();await settle();assert.equal(h.sends(),1);assert.equal(h.marks.length,1);
  for(const event of ['pageshow','pagehide','popstate','hashchange'])h.emit('window',event,false);
  for(const event of ['freeze','resume','visibilitychange'])h.emit('document',event,false);
  await settle();assert.equal(h.sends(),1);assert.equal(h.marks.length,1);assert.equal(JSON.stringify(h.native),h.before);
  h.emit('window','pagehide',true);assert.equal(h.marks.length,0);assert.equal(h.timers.size,0);
});
test('entry source wires trusted stop/resume/popstate and initial-hidden refusal without native access',async()=>{
  const h=entry({visibility:'hidden'});await settle();assert.equal(h.sends(),0);
  h.emit('document','resume',true);await settle();assert.equal(h.sends(),0);
  h.document.visibilityState='visible';h.emit('document','visibilitychange',true);await settle();
  assert.equal(h.sends(),1);assert.equal(h.marks.length,1);
  h.emit('document','freeze',true);assert.equal(h.marks.length,0);
  h.emit('document','resume',true);await settle();assert.equal(h.sends(),2);assert.equal(h.marks.length,1);
  h.location.href='http://127.0.0.1:38407/r0-mv3-fixture/B.html';h.emit('window','popstate',true);
  assert.equal(h.marks.length,0);assert.equal(h.timers.size,0);assert.equal(JSON.stringify(h.native),h.before);
});
test('entry source refuses wrong host/path, missing fixture switch and subframes before messaging',async()=>{
  for(const config of [{url:'https://chatgpt.com/c/a'},{url:'http://127.0.0.1:38407/other.html'},{meta:false},{subframe:true}]){
    const h=entry(config);await settle();assert.equal(h.sends(),0);assert.equal(h.marks.length,0);assert.equal(h.timers.size,0);
  }
});

