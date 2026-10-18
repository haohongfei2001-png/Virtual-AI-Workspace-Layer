import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('./host-view-service.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('MOCK_IDB actual host binding";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,ready,drain};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,ready,drain}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const windows=()=>[{groupId:'p1',list:'current',rowOffset:0,rowLimit:17},{groupId:'p1',list:'old',rowOffset:0,rowLimit:5},{groupId:'p2',list:'current',rowOffset:0,rowLimit:17},{groupId:null,list:'unknown',rowOffset:0,rowLimit:17}];
async function setup(t){const planned=[],h=await fixture(t,{prepareNavigation:async({targets})=>{planned.push(structuredClone(targets));return [];}});await h.bind();await h.observe(['p1','p2']);await h.mount();assert.equal((await ready(h)).state,'ready');return {h,planned};}
test('actual HOST_UI_VIEW outer handle admits multiple row windows through real binding and repository owner',async t=>{
 const {h,planned}=await setup(t),reads=h.providerReads;const result=await h.view('workspace',{rowWindows:windows(),groupId:'p1',list:'old',rowOffset:0,rowLimit:5});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.state,'ready');assert.deepEqual(result.page.groups.items.map(g=>g.id),['p1','p2']);assert.equal(result.page.groups.items[0].lists.current.limit,17);assert.equal(result.page.groups.items[1].lists.current.limit,17);assert.equal(result.page.selection.list,'old');assert.equal(result.page.selection.limit,5);assert.equal(result.page.entries.unknown.limit,17);assert.equal(result.page.entries.unknown.items[0].id,'c1');assert.equal(result.page.entries.unknown.items[0].nativeTitle,'Native conversation');assert.equal(h.providerReads,reads,'local VIEW cannot request new authentication');assert(planned.at(-1).length<=200);
});
test('actual outer handle rejects malformed row-window records without preparing navigation',async t=>{
 const {h,planned}=await setup(t);for(const rowWindows of [[{...windows()[0],rowLimit:6}],[windows()[0],windows()[0]],[{...windows()[0],groupId:null,list:'current'}],[{...windows()[0],scope:'foreign'}],Array.from({length:75},(_,i)=>({...windows()[0],groupId:'p'+i}))]){
  const count=planned.length,result=await h.view('workspace',{rowWindows});assert.equal(result.ok,false);assert.equal(planned.length,count);
 }
});
test('row-window VIEW remains behind original sender/grant boundary',async t=>{
 const {h,planned}=await setup(t),count=planned.length;
 assert.equal((await h.view('workspace',{rowWindows:windows()},{grantId:'forged'})).ok,false);
 assert.equal((await h.view('workspace',{rowWindows:windows()},{},{...h.children.workspace,documentId:'foreign'})).ok,false);assert.equal(planned.length,count);
});
