import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Reuse the existing renderer DOM double without registering its unrelated tests.
const url=new URL('./navigation-frame-calibration-entry.test.mjs',import.meta.url);
const text=await readFile(url,'utf8'),boundary="test('segment calibration waits";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,projection,page,row,tick};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,projection,page,row,tick}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const nativeName='同名原生项目';
function dto(){const value=projection();value.groups.total=2;value.groups.hasMore=false;for(const group of value.groups.items){group.name=nativeName;group.nativeName=nativeName;group.lists.unknown=page([row(group.id+'_unknown')],30);}return value;}
const card=(f,id)=>f.pane().querySelectorAll('[data-theme-id]').find(n=>n.getAttribute('data-theme-id')===id);
const button=(f,id,label)=>card(f,id).querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label);
function owner(n){while(n){if(n.hasAttribute?.('data-theme-id'))return n.getAttribute('data-theme-id');n=n.parentNode;}return null;}
function assertNativeNames(f){assert.deepEqual(f.pane().querySelectorAll('.theme-name').map(n=>n.textContent),[nativeName,nativeName]);}
function setup(t){const requests=[],f=fixture('workspace',query=>{requests.push(query);return null;});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(dto());assertNativeNames(f);return {f,requests};}
test('second same-name native project keeps focus on its old disclosure after expansion',async t=>{
 const {f,requests}=setup(t),label='展开旧窗口 '+nativeName,target=button(f,'P1',label);assert(target);target.focus();target.click();await tick();
 assert.equal(requests.at(-1).groupId,'P1');assert.equal(requests.at(-1).list,'old');assert.equal(button(f,'P1',label).getAttribute('aria-expanded'),'true');assertNativeNames(f);
 assert.equal(owner(f.pane().activeElement),'P1','focus must remain on the second native Project, not the first same-name Project');assert.equal(f.pane().activeElement,button(f,'P1',label));
});
for(const kind of ['current','old','unknown'])for(const direction of ['more','previous'])test(`second same-name project ${kind} ${direction} paging keeps focus after projection repaint`,async t=>{
 const {f,requests}=setup(t);if(kind==='old'){button(f,'P2','展开旧窗口 '+nativeName).click();button(f,'P1','展开旧窗口 '+nativeName).click();await tick();}
 const value=dto();if(direction==='previous')for(const group of value.groups.items)group.lists[kind]=page([row(group.id+'_'+kind)],30,5,5);
 f.nav.updateFrameProjection(value);
 const label=direction==='previous'?'返回前页 '+nativeName:kind==='old'?'显示更多旧窗口 '+nativeName:kind==='unknown'?'显示更多已知窗口':'显示更多近期窗口';
 const target=button(f,'P1',label);assert(target);target.focus();target.click();await tick();assert.equal(requests.at(-1).groupId,'P1');assert.equal(requests.at(-1).list,kind);
 // A valid subsequent projection preserves the requested control. The oracle
 // checks DOM Project identity, not the implementation's chosen focus key.
 f.nav.updateFrameProjection(value);assertNativeNames(f);
 assert.equal(owner(f.pane().activeElement),'P1','paging repaint must preserve the second Project owner');assert.equal(f.pane().activeElement,button(f,'P1',label));
});

test('sidebar same-name projects preserve old disclosure and each simultaneous list previous control',async t=>{
 const requests=[],f=fixture('sidebar',q=>{requests.push(q);return null;});t.after(()=>f.nav.stop());
 const value=dto();value.role='sidebar';for(const group of value.groups.items)for(const kind of ['current','old','unknown'])group.lists[kind]=page([row(group.id+'_'+kind)],30,5,5);
 f.nav.updateFrameProjection(value);
 const block=id=>f.pane().querySelectorAll('.group').find(n=>n.querySelectorAll('button').some(b=>b.dataset.focusKey==='theme:'+id));
 for(const id of ['P2','P1'])block(id).querySelectorAll('button').find(b=>b.dataset.focusKey==='theme:'+id).click();await tick();
 const old=id=>block(id).querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='展开旧窗口 '+nativeName);
 old('P2').click();const second=old('P1');second.focus();second.click();await tick();assert.equal(f.pane().activeElement,old('P1'));assert.equal(old('P1').getAttribute('aria-expanded'),'true');
 // Visual list order is current, old, unknown; no production focus-key decoding.
 const previous=()=>block('P1').querySelectorAll('button').filter(b=>b.getAttribute('aria-label')==='返回前页 '+nativeName);
 assert.equal(previous().length,3);
 for(const [i,kind] of ['current','old','unknown'].entries()){
  const target=previous()[i];target.focus();target.click();await tick();assert.equal(requests.at(-1).groupId,'P1');assert.equal(requests.at(-1).list,kind);
  f.nav.updateFrameProjection(value);assert.equal(f.pane().activeElement,previous()[i],`${kind} previous retains exact sidebar list focus`);assertNativeNames(f);
 }
});

test('scope switch does not transfer old member focus to same native Project ID in another scope',async t=>{
 const {f}=setup(t),label='显示更多近期窗口',oldPane=f.pane(),oldTarget=button(f,'P1',label);oldTarget.focus();assert.equal(oldPane.activeElement,oldTarget);
 const next=dto();next.scope='scopeB';f.nav.updateFrameProjection(next);
 assert.notEqual(f.pane(),oldPane);assert(!f.pane().querySelectorAll('button').includes(oldTarget));assert.notEqual(f.pane().activeElement,button(f,'P1',label),'new scope does not inherit member focus');
 const target=button(f,'P1',label);target.focus();f.nav.updateFrameProjection(next);assert.equal(f.pane().activeElement,button(f,'P1',label));assert.equal(owner(f.pane().activeElement),'P1');assertNativeNames(f);
});
