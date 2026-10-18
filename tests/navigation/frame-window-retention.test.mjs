import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('../host/navigation-frame-calibration-entry.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('segment calibration waits";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,projection,page,row,tick};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,projection,page,row,tick}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// Independent owner oracle materializes every requested presentation window in
// one fresh DTO. It never reuses previous DTO rows and does not grant authority.
function response(query={},scope='scopeA',stamp='fresh'){
 const value=projection();value.scope=scope;value.groups.total=2;value.groups.hasMore=false;
 const make=(id,kind,offset=0,limit=5)=>page(Array.from({length:Math.min(limit,30-offset)},(_,n)=>({...row(`${id}_${kind}_${offset+n}`),nativeTitle:`${stamp} ${id} ${kind} ${offset+n}`,displayTitle:`${stamp} ${id} ${kind} ${offset+n}`})),30,offset,limit);
 for(const group of value.groups.items){group.name=group.nativeName=group.id;for(const kind of ['current','old','unknown'])group.lists[kind]=make(group.id,kind);}
 for(const w of query.rowWindows??[]){if(w.groupId===null)value.entries[w.list]={...make('entry',w.list,w.rowOffset,w.rowLimit),inventoryTotal:30};else value.groups.items.find(g=>g.id===w.groupId).lists[w.list]={...make(w.groupId,w.list,w.rowOffset,w.rowLimit),...(w.paged?{paged:true}:{})};}
 if(query.list){const groupId=query.groupId??null,p=make(groupId??'entry',query.list,query.rowOffset??0,query.rowLimit??5);value.selection={...p,groupId,list:query.list};if(groupId===null)value.entries[query.list]={...p,inventoryTotal:30};else value.groups.items.find(g=>g.id===groupId).lists[query.list]=p;}
 return value;
}
const card=(f,id)=>f.pane().querySelectorAll('[data-theme-id]').find(n=>n.getAttribute('data-theme-id')===id);
const control=(f,id,label)=>card(f,id).querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label);
const rows=(f,id,kind)=>card(f,id).querySelectorAll('[data-ref-id]').filter(n=>n.getAttribute('data-ref-id').startsWith(id+'_'+kind+'_'));
function setup(t){const calls=[];let hold=null,stamp='initial';const f=fixture('workspace',q=>{calls.push(structuredClone(q));return hold?hold(q):response(q,'scopeA',stamp);});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(response());return {f,calls,setStamp:v=>{stamp=v;},setHold:v=>{hold=v;}};}
async function expandRecent(f,id){control(f,id,'显示更多近期窗口').click();await tick();assert.equal(rows(f,id,'current').length,17);}
test('opening old five retains all seventeen recent rows from the same fresh response',async t=>{
 const {f,calls,setStamp}=setup(t);await expandRecent(f,'P2');setStamp('after-old');control(f,'P2','展开旧窗口 P2').click();await tick();assert.equal(rows(f,'P2','old').length,5);assert.equal(rows(f,'P2','current').length,17);
 assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith('after-old')),'retained capacity must be freshly materialized, not cached rows');assert(calls.at(-1).rowWindows.some(w=>w.groupId==='P2'&&w.list==='current'&&w.rowLimit===17));
});
test('another Project expansion and reading return preserve both earlier visible windows',async t=>{
 const {f,setStamp}=setup(t);await expandRecent(f,'P2');control(f,'P2','展开旧窗口 P2').click();await tick();setStamp('after-other');await expandRecent(f,'P1');assert.equal(rows(f,'P2','current').length,17);assert.equal(rows(f,'P2','old').length,5);assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith('after-other')));
 f.nav.enterReading();f.nav.showWorkspace();await tick();assert.equal(rows(f,'P2','current').length,17);assert.equal(rows(f,'P2','old').length,5);assert.equal(rows(f,'P1','current').length,17);
});
test('scope replacement rejects delayed old windows without mixing old rows or carrying their capacity',async t=>{
 const {f,calls,setHold}=setup(t);await expandRecent(f,'P2');let release;setHold(q=>new Promise(resolve=>{release=()=>resolve(response(q,'scopeA','late-A'));}));control(f,'P2','展开旧窗口 P2').click();await tick();
 f.nav.updateFrameProjection(response({},'scopeB','new-B'));release();await tick();assert.equal(rows(f,'P2','current').length,5);assert.equal(rows(f,'P2','old').length,0);assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith('new-B')));
 setHold(()=>null);control(f,'P1','显示更多近期窗口').click();await tick();assert(!(calls.at(-1).rowWindows??[]).some(w=>w.groupId==='P2'&&w.list==='current'&&w.rowLimit===17));
});


test('Project page away and back restores seventeen rows freshly from the owner',async t=>{
 let stamp='initial';const requests=[];
 const owner=q=>{const value=response(q,'scopeA',stamp);value.groups={...value.groups,items:value.groups.items.slice(q.offset??0,(q.offset??0)+1),total:2,offset:q.offset??0,limit:1,hasMore:(q.offset??0)===0};return value;};
 const f=fixture('workspace',q=>{requests.push(q);return owner(q);});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(owner({offset:0}));await expandRecent(f,'P2');
 f.button('显示更多项目').click();await tick();assert(card(f,'P1'));assert.equal(card(f,'P2'),undefined);stamp='returned-fresh';f.button('返回前页项目').click();await tick();
 assert.equal(rows(f,'P2','current').length,17);assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith(stamp)));assert(requests.at(-1).rowWindows.some(w=>w.groupId==='P2'&&w.list==='current'&&w.rowLimit===17));
});

test('successful paged five fallback survives another list then preserves next and previous offsets',async t=>{
 const calls=[];let fallback=false;
 const f=fixture('workspace',q=>{
  calls.push(structuredClone(q));let effective=q;
  if(!fallback&&q.groupId==='P2'&&q.list==='current'&&q.rowLimit===17){fallback=true;effective={...q,rowLimit:5};}
  const value=response(effective,'scopeA','fresh-page');
  if(value.selection&&q.groupId==='P2'&&q.list==='current'&&(fallback||q.rowWindows?.some(w=>w.groupId==='P2'&&w.list==='current'&&w.paged)))value.selection.paged=true;
  return value;
 });t.after(()=>f.nav.stop());f.nav.updateFrameProjection(response());
 control(f,'P2','显示更多近期窗口').click();await tick();assert.equal(rows(f,'P2','current').length,5);assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');
 control(f,'P2','展开旧窗口 P2').click();await tick();assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');assert(calls.at(-1).rowWindows.some(w=>w.groupId==='P2'&&w.list==='current'&&w.paged===true&&w.rowLimit===5));
 control(f,'P2','显示更多近期窗口').click();await tick();assert.equal(calls.at(-1).rowOffset,5);assert.equal(calls.at(-1).rowLimit,5);assert.equal(rows(f,'P2','current')[0].getAttribute('data-ref-id'),'P2_current_5');
 control(f,'P2','返回前页 P2').click();await tick();assert.equal(calls.at(-1).rowOffset,0);assert.equal(calls.at(-1).rowLimit,5);assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');assert.equal(rows(f,'P2','current')[0].getAttribute('data-ref-id'),'P2_current_0');
});
