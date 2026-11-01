import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostScaleServer} from './fixtures/host-scale-server.mjs';
import {scaleConversationId} from './fixtures/host-scale-world.mjs';
import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE as profile} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
// L contract: actual application-owned HTTP responses -> explicit native DOM
// reconstruction -> real finite discovery. Not browser or authenticated owner evidence.
function nativeDOM(origin,html){
 const selectors=new Map(),document={location:{href:origin+'/'},querySelectorAll:s=>selectors.get(s)??[],defaultView:{crypto,getComputedStyle:n=>n.style}};
 function node(tag,text='',attrs={},parent=null){const n={tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,ownerDocument:document,isConnected:true,children:[],style:{display:'block',visibility:'visible'},getAttribute:k=>attrs[k]??null,getClientRects:()=>[{}],contains(other){for(let p=other;p;p=p.parentElement)if(p===n)return true;return false;},querySelectorAll(){return n.children;}};parent?.children.push(n);return n;}
 const main=node('MAIN'),header=node('HEADER','',{},main),h1=node('H1','New chat',{},header),reading=node('SECTION','',{},main),projects=node('SECTION'),history=node('NAV');
 const decode=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
 const addAnchors=(markup,root)=>{for(const match of markup.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g))node('A',decode(match[2]),{href:decode(match[1])},root);};
 addAnchors(html.match(/<section aria-label="Projects">([\s\S]*?)<\/section>/)[1],projects);
 addAnchors(html.match(/<nav aria-label="Chat history">([\s\S]*?)<\/nav>/)[1],history);
 selectors.set(profile.regions.projects,[projects]);selectors.set(profile.regions.history,[history]);selectors.set(profile.currentConversationReading,[reading]);selectors.set(profile.currentConversationHeader,[h1]);
 installTreeWalkerDouble(document);
 const discovery=createSurfaceDiscovery({document,binding:{documentToken:'mixed-contract',routeEpoch:1},profile,urlPolicy:createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}})});
 return {document,discovery,projects,history,exposeProject(path,view){
  document.location.href=origin+path;h1.textContent=view.title;reading.children=[];
  const heading=node('H2',view.project.name,{},reading),members=node('NAV','',{'data-project-id':view.project.id},reading);
  for(const item of view.conversations)node('A',item.title,{href:item.href},members);
  selectors.set(profile.regions.members,[members]);selectors.set(profile.currentProjectTitle,[heading]);selectors.set(profile.currentProjectHeader,[h1]);
 }};
}
function scan(discovery){const packets=[];let cursor=null;for(let i=0;i<20;i++){const page=discovery.scanPage(cursor);packets.push(page.payload);assert(page.payload.candidates.length<=256);assert.deepEqual(page.payload.coverageClaims,[]);if(!page.cursor)return packets;cursor=page.cursor;}assert.fail('finite loaded world failed to terminate');}
test('mixed native world exposes only naturally opened Project members, leaving other known chats UNKNOWN',async t=>{
 const server=await createHostScaleServer({size:1000,distribution:'project-mixed',longTitles:false});t.after(()=>server.close());
 const response=await fetch(server.url),html=await response.text(),headers={cookie:response.headers.get('set-cookie').split(';')[0]},f=nativeDOM(server.origin,html);t.after(()=>f.discovery.stop());
 assert.equal(f.projects.children.length,10);assert.equal(f.history.children.length,1000);
 const first=scan(f.discovery),initial=first.flatMap(p=>p.membershipClaims);
 assert.equal(initial.length,1000);assert(initial.every(c=>c.asserted==='UNKNOWN'&&c.projectId===null),'project links and plain history URLs supply no membership');
 const path='/g/g-p-00000000000000000000000000000001/project';
 const project=await(await fetch(server.origin+'/native/route?path='+encodeURIComponent(path),{headers})).json();
 assert.equal(project.conversations.length,80);f.exposeProject(path,project);
 const second=scan(f.discovery),claims=second.flatMap(p=>p.membershipClaims),byId=new Map(claims.map(c=>[c.conversationId,c]));
 assert.equal(byId.size,1000);assert.equal(claims.length,1000,'member/history duplicate must not overwrite or double count confirmed members');
 const expectedMembers=new Set(Array.from({length:100},(_,i)=>i).filter(i=>i%5!==4).map(scaleConversationId));
 assert.deepEqual(new Set(claims.filter(c=>c.asserted==='PROJECT').map(c=>c.conversationId)),expectedMembers);
 for(let i=0;i<1000;i++){
  const claim=byId.get(scaleConversationId(i));assert(claim);
  if(expectedMembers.has(claim.conversationId)){assert.equal(claim.projectId,project.project.id);assert(claim.evidence.fieldPaths.includes('members'));}
  else {assert.equal(claim.asserted,'UNKNOWN');assert.equal(claim.projectId,null);}
 }
 assert.equal(byId.get(scaleConversationId(100)).asserted,'UNKNOWN','another Project real member remains unobserved');
 assert.equal(byId.get(scaleConversationId(4)).asserted,'UNKNOWN','native ungrouped truth is not a NONE grant');
 assert(!claims.some(c=>c.asserted==='NONE'));
 const refs=second.flatMap(p=>p.candidates).filter(c=>c.entity==='conversation');assert.equal(new Set(refs.map(c=>c.target.nativeId)).size,1000);
 for(const item of project.conversations)assert.equal(refs.find(c=>c.target.nativeId===item.id).nativeTitle,item.title);
 const requests=server.snapshot().requests;assert.equal(requests['/native/route'],1);assert.equal(requests['/native/move-menu']??0,0);assert.equal(requests['/backend-api/conversation/:id']??0,0);
});
