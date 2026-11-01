import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReturnSlotRect} from '../../src/host/native-return-slot.mjs';
function fixture(){
 const document={defaultView:{innerWidth:1000,innerHeight:700,getComputedStyle:n=>n.style}},node=r=>({isConnected:true,ownerDocument:document,style:{display:'block',visibility:'visible',opacity:'1'},getBoundingClientRect:()=>r,contains(n){for(let p=n;p;p=p.parentElement)if(p===this)return true;return false;}});
 const header=node({x:220,y:0,width:780,height:52}),slot=node({x:228,y:8,width:36,height:36});slot.parentElement=header;header.firstElementChild=slot;document.elementFromPoint=()=>slot;
 return {document,header,slot,node,check:()=>nativeReturnSlotRect({document,header,slot})};
}
test('verified empty native header slot returns a presentation rectangle only',()=>{const f=fixture();assert.deepEqual(f.check(),{x:228,y:8,width:36,height:36});});
for(const kind of ['offscreen','outside-header','nonfinite-header','hidden','inert','transparent','covered','zoom','detached','foreign-document','small-overlapping-sibling','walk-capacity'])test('return slot refuses '+kind,()=>{
 const f=fixture();
 if(kind==='offscreen')f.slot.getBoundingClientRect=()=>({x:-5,y:8,width:36,height:36});
 if(kind==='outside-header')f.slot.getBoundingClientRect=()=>({x:228,y:500,width:36,height:36});
 if(kind==='nonfinite-header')f.header.getBoundingClientRect=()=>({x:NaN,y:0,width:780,height:52});
 if(kind==='hidden')f.header.style.visibility='hidden';
 if(kind==='inert')f.header.inert=true;
 if(kind==='transparent')f.header.style.opacity='0';
 if(kind==='covered')f.document.elementFromPoint=()=>f.header;
 if(kind==='zoom')f.document.defaultView.visualViewport={scale:2,offsetLeft:0,offsetTop:0};
 if(kind==='detached')f.slot.isConnected=false;
 if(kind==='foreign-document')f.slot.ownerDocument={};
 if(kind==='small-overlapping-sibling'){const n=f.node({x:234,y:14,width:2,height:2});n.parentElement=f.header;f.slot.nextElementSibling=n;}
 if(kind==='walk-capacity'){let previous=f.slot;for(let i=0;i<256;i++){const n=f.node({x:500,y:8,width:1,height:1});n.parentElement=f.header;previous.nextElementSibling=n;previous=n;}}
 assert.equal(f.check(),null);
});
