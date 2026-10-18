import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReturnGapRect} from '../../src/host/native-return-gap.mjs';

// Algorithm-level only: real production helper, explicit geometry/style/hit doubles.
// Browser hit testing and CSS mask execution are NOT established by these tests.
function fixture(){
 const rect=(x,y,width,height)=>({x,y,width,height,right:x+width,bottom:y+height});
 const document={defaultView:{innerWidth:1000,innerHeight:700,visualViewport:{scale:1,offsetLeft:0,offsetTop:0},getComputedStyle:(node,pseudo)=>pseudo?{content:'none'}:node.style}};
 class Node{
  constructor(name,box,style={}){Object.assign(this,{name,tagName:'DIV',nodeType:1,box,style:{display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto',zIndex:'auto',...style},parentElement:null,children:[],childNodes:[],attrs:{},ownerDocument:document,isConnected:true,hidden:false,inert:false});}
  append(node){if(node.parentElement){const old=node.parentElement;old.children=old.children.filter(n=>n!==node);old.childNodes=old.childNodes.filter(n=>n!==node);}node.parentElement=this;this.children.push(node);this.childNodes.push(node);}
  contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;}
  getBoundingClientRect(){return this.box;}
  getAttribute(key){return this.attrs[key]??null;}
  matches(selector){return selector.split(',').some(s=>s.startsWith('[')?Object.hasOwn(this.attrs,s.slice(1,-1)):this.tagName===s.toUpperCase());}
  get localName(){return this.tagName.toLowerCase();}
  get firstElementChild(){return this.children[0]??null;}
  get nextElementSibling(){const siblings=this.parentElement?.children??[];return siblings[siblings.indexOf(this)+1]??null;}
 }
 const body=new Node('body',rect(0,0,1000,700));body.tagName='BODY';document.body=body;
 const background=new Node('background',rect(220,0,780,700)),header=new Node('header',rect(220,0,780,52),{pointerEvents:'none',zIndex:'30'}),slot=new Node('slot',rect(220,0,780,52),{pointerEvents:'none'});
 const viewport=new Node('viewport',rect(220,0,780,700)),reading=new Node('reading',rect(220,-600,780,1800)),history=new Node('history',rect(0,52,200,648)),composer=new Node('composer',rect(220,1200,780,100));
 viewport.attrs={role:'region',tabindex:'0'};
 for(const node of [background,header,history])body.append(node);background.append(viewport);header.append(slot);viewport.append(reading);viewport.append(composer);
 document.createTreeWalker=root=>{const nodes=[];const visit=n=>{for(const child of n.children){nodes.push(child);visit(child);}};visit(root);let index=0;return {nextNode:()=>nodes[index++]??null};};
 let masked=false,legacy=false,tiny=null,portal=null;
 document.elementsFromPoint=(x,y)=>{
  const inside=n=>n&&x>=n.box.x&&x<n.box.right&&y>=n.box.y&&y<n.box.bottom;
  if(inside(portal))return [portal,background,body];
  if(!masked&&inside(tiny))return [tiny,reading,viewport,background,body];
  return legacy?[background,body]:masked?[viewport,background,body]:[reading,viewport,background,body];
 };
 const args=()=>({document,header,slot,hitRoot:background,readingRoot:reading,isOwnedMask:node=>masked&&node===reading,excluded:[history,composer],excludedRects:[rect(220,52,780,648)]});
 return {document,header,slot,background,viewport,reading,body,args,check:()=>nativeReturnGapRect(args()),mask(value){masked=value;reading.style.visibility=value?'hidden':'visible';},legacy(){legacy=true;},tiny(){tiny=new Node('tiny',rect(234,14,2,2));tiny.tagName='BUTTON';reading.append(tiny);return tiny;},portal(){portal=new Node('portal',rect(228,8,36,36));portal.tagName='BUTTON';body.append(portal);}};
}

test('model inputs explicitly distinguish reading, owned-mask viewport and restored reading',()=>{
 const f=fixture(),hit=()=>f.document.elementsFromPoint(246,26)[0].name;
 assert.equal(hit(),'reading');f.mask(true);assert.equal(hit(),'viewport');f.mask(false);assert.equal(hit(),'reading');
 assert(f.reading.box.y<0&&f.reading.box.bottom>52);assert.equal(f.viewport.getAttribute('role'),'region');
});
for(const masked of [false,true])test(`current API: readingRoot proof with pointer-active viewport, mask=${masked} [regression]`,()=>{
 const f=fixture();f.mask(masked);const actual=f.check();
 if(masked){const hit=f.document.elementsFromPoint;f.document.elementsFromPoint=()=>[f.background,f.body];assert.notEqual(f.check(),null,'same owned-mask proof/geometry succeeds when only the exact hit changes');f.document.elementsFromPoint=hit;}
 assert.deepEqual(actual,{x:228,y:8,width:36,height:36});
});
test('legacy empty-background positive control',()=>{const f=fixture();f.legacy();assert.notEqual(f.check(),null);});
test('original profile rejects tiny native control between all five hit samples',()=>{
 const f=fixture();f.tiny();for(const [x,y]of [[229,9],[263,9],[229,43],[263,43],[246,26]])assert.equal(f.document.elementsFromPoint(x,y)[0],f.reading);
 assert.equal(f.document.elementsFromPoint(235,15)[0].tagName,'BUTTON');assert.equal(f.check(),null);
});
test('current readingRoot proof rejects tiny control even under owned mask',()=>{
 const f=fixture();f.tiny();f.mask(true);assert.equal(f.check(),null);
});
for(const mutation of ['replace-root','hidden-ancestor','inert-ancestor','aria-hidden-ancestor','native-header-control','native-portal'])test(`existing safe-background refusal: ${mutation}`,()=>{
 const f=fixture();f.legacy();
 if(mutation==='replace-root')f.background.isConnected=false;
 if(mutation==='hidden-ancestor')f.body.hidden=true;
 if(mutation==='inert-ancestor')f.body.inert=true;
 if(mutation==='aria-hidden-ancestor')f.body.attrs['aria-hidden']='true';
 if(mutation==='native-header-control')f.slot.append(f.tiny());
 if(mutation==='native-portal')f.portal();
 assert.equal(f.check(),null);
});
