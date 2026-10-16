import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectContextAssociation} from '../../src/host/project-context-association.mjs';
const origin='https://chatgpt.com',P='g-p-11111111111111111111111111111111';
function fixture(changeProfile=profile=>profile){
 let roots=[],owned=new Set();
 const doc={location:{href:origin+'/g/'+P+'/project'},defaultView:{getComputedStyle:node=>node.style},querySelectorAll:selector=>{assert.equal(selector,'#members');return roots;}};
 class Node{
  constructor(id=P){this.isConnected=true;this.ownerDocument=doc;this.attrs={'data-project-id':id};this.style={display:'block',visibility:'visible'};this.rects=[{}];this.parentElement=null;}
  getAttribute(key){return this.attrs[key]??null;}
  getClientRects(){return this.rects;}
  get textContent(){throw Error('must-not-read-native-text');}
  get value(){throw Error('must-not-read-native-value');}
 }
 const root=new Node();roots=[root];
 const profile=changeProfile({regions:{members:'#members'},memberProjectIdAttribute:'data-project-id',urlPolicy:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
 const association=createProjectContextAssociation({document:doc,profile,origin,isOwnedMask:node=>owned.has(node)});
 return {doc,root,Node,association,setRoots:value=>roots=value,own:node=>owned.add(node)};
}
test('explicit current Project region yields only the aligned native ID',()=>{const f=fixture();assert.equal(f.association.scan(),P);assert.deepEqual(Object.keys(f.association),['scan']);});
test('missing explicit route grammar or member profile cannot infer Project identity',()=>{
 for(const change of [p=>({...p,urlPolicy:undefined}),p=>({...p,regions:{}}),p=>({...p,memberProjectIdAttribute:undefined})])assert.equal(fixture(change).association.scan(),null);
});
for(const [name,mutate]of Object.entries({
 missing:f=>f.setRoots([]),duplicate:f=>f.setRoots([f.root,new f.Node()]),hiddenDuplicate:f=>{const other=new f.Node();other.hidden=true;f.setRoots([f.root,other]);},
 detached:f=>f.root.isConnected=false,foreign:f=>f.root.ownerDocument={},noRects:f=>f.root.rects=[],missingId:f=>delete f.root.attrs['data-project-id'],wrongId:f=>f.root.attrs['data-project-id']='g-p-22222222222222222222222222222222',
 home:f=>f.doc.location.href=origin+'/',conversation:f=>f.doc.location.href=origin+'/c/11111111-1111-4111-8111-111111111111',wrongOrigin:f=>f.doc.location.href='https://other.test/g/'+P+'/project',query:f=>f.doc.location.href+='?account=team',fragment:f=>f.doc.location.href+='#project',candidate:f=>f.doc.location.href=origin+'/g/unknown/project',
 }))test('current Project association rejects '+name,()=>{const f=fixture();mutate(f);assert.equal(f.association.scan(),null);});
for(const location of ['root','ancestor'])for(const conceal of ['hidden','aria','display','visibility','collapse','detached','foreign'])test(location+' '+conceal+' cannot associate current Project',()=>{
 const f=fixture(),node=location==='root'?f.root:new f.Node();if(location==='ancestor')f.root.parentElement=node;
 if(conceal==='hidden')node.hidden=true;else if(conceal==='aria')node.attrs['aria-hidden']='true';else if(conceal==='display')node.style.display='none';else if(conceal==='visibility')node.style.visibility='hidden';else if(conceal==='collapse')node.style.visibility='collapse';else if(conceal==='detached')node.isConnected=false;else node.ownerDocument={};
 assert.equal(f.association.scan(),null);
});
test('owned visibility mask exemption cannot excuse native concealment',()=>{
 const f=fixture(),ancestor=new f.Node();f.root.parentElement=ancestor;
 for(const node of [f.root,ancestor]){node.style.visibility='hidden';f.own(node);}
 assert.equal(f.association.scan(),P);
 for(const conceal of ['hidden','aria','display','collapse']){
  if(conceal==='hidden')ancestor.hidden=true;else if(conceal==='aria')ancestor.attrs['aria-hidden']='true';else if(conceal==='display')ancestor.style.display='none';else ancestor.style.visibility='collapse';
  assert.equal(f.association.scan(),null);ancestor.hidden=false;delete ancestor.attrs['aria-hidden'];ancestor.style={display:'block',visibility:'hidden'};
 }
});
test('bounded ancestor traversal and DOM faults fail closed',()=>{
 for(const mode of ['cycle','deep','selector','style']){const f=fixture();if(mode==='cycle')f.root.parentElement=f.root;else if(mode==='deep'){let node=f.root;for(let i=0;i<64;i++){node.parentElement=new f.Node();node=node.parentElement;}}else if(mode==='selector')f.doc.querySelectorAll=()=>{throw Error('invalid-selector');};else f.doc.defaultView.getComputedStyle=()=>{throw Error('unavailable-style');};assert.equal(f.association.scan(),null);}
});
test('route and region are rechecked on every scan without cached association',()=>{
 const f=fixture();assert.equal(f.association.scan(),P);f.root.isConnected=false;assert.equal(f.association.scan(),null);const replacement=new f.Node();f.setRoots([replacement]);assert.equal(f.association.scan(),P);f.doc.location.href=origin+'/';assert.equal(f.association.scan(),null);
});
