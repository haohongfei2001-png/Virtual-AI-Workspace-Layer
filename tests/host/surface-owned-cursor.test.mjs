import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE as profile} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
// L-only DOM double: cursor retention is traversal state, never member authority.
function fixture({candidateButtons=0}={}){
 let masked=false;const visited=[];
 const document={location:{href:'https://chatgpt.com/g/p1/project'}};
 function node(tag='DIV',text='',attrs={},parent=null){const n={tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,isConnected:true,ownerDocument:document,children:[],style:{display:'block'},getAttribute(k){return this.attrs[k]??null;},getClientRects(){return [{}];},contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false;},querySelectorAll(){return this.children;},matches(s){return s==='a[href],button'?this.tagName==='A'||this.tagName==='BUTTON':s==='a[href]'&&this.tagName==='A';}};parent?.children.push(n);return n;}
 const main=node(),reading=node('SECTION','',{},main),members=node('NAV','',{'data-project-id':'p1'},reading),heading=node('H2','Native project',{},reading),headerRoot=node('HEADER','',{},main),header=node('H1','Native project',{},headerRoot),projects=node(),history=node();
 for(let i=0;i<603;i++)node('A','Member '+i,{href:'/c/m'+i},members);
 for(let i=0;i<candidateButtons;i++)node('BUTTON','Unresolved '+i,{},projects);
 const selectors=new Map([[profile.regions.projects,[projects]],[profile.regions.history,[history]],[profile.regions.members,[members]],[profile.currentProjectTitle,[heading]],[profile.currentProjectHeader,[header]],[profile.currentConversationReading,[reading]]]);
 document.querySelectorAll=s=>selectors.get(s)??[];
 document.defaultView={crypto:{randomUUID},getComputedStyle(n){let visibility;for(let p=n;p&&!visibility;p=p.parentElement){visibility=p.style.visibility;if(!visibility&&masked&&p===reading)visibility='hidden';}return {display:n.style.display,visibility:visibility??'visible'};}};
 document.createTreeWalker=root=>{let i=0;return {nextNode(){const n=root.children[i++]??null;if(n)visited.push(n);return n;}};};
 const discovery=createSurfaceDiscovery({document,binding:{documentToken:'doc',routeEpoch:1},profile,isOwnedMask:n=>masked&&n===reading,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container,conversationId:id=>id}})});
 return {document,discovery,visited,selectors,reading,members,heading,header,projects,node,mask:()=>masked=true};
}
const mark=(f,p)=>{assert.equal(typeof f.discovery.preservePresentationCursor,'function');assert.equal(f.discovery.preservePresentationCursor(p.cursor),true);};
test('marked owned mask retains 603-member traversal without revisiting the first 255 or granting hidden membership',()=>{
 const f=fixture(),first=f.discovery.scanPage();assert.equal(first.payload.membershipClaims.length,255);assert(first.payload.membershipClaims.every(c=>c.asserted==='PROJECT'));
 mark(f,first);f.mask();const before=f.visited.length,packets=[];let p=f.discovery.scanPage(first.cursor);
 while(true){packets.push(p.payload);if(!p.cursor)break;p=f.discovery.scanPage(p.cursor);assert(packets.length<10);}
 assert(f.visited.slice(before).every(n=>!f.members.children.slice(0,255).includes(n)),'owned presentation change must not rewind walker');
 const claims=packets.flatMap(p=>p.membershipClaims);assert.deepEqual(claims.map(c=>c.conversationId).sort(),Array.from({length:348},(_,i)=>'m'+(i+255)).sort());assert(claims.every(c=>c.asserted==='UNKNOWN'&&c.projectId===null));
 for(const payload of packets){assert(payload.candidates.length<=256);assert.deepEqual(payload.coverageClaims,[]);}
 assert.throws(()=>f.discovery.scanPage(first.cursor),/stale-surface-cursor/);
});
test('unmarked inherited mask still invalidates the current Project cursor',()=>{const f=fixture(),p=f.discovery.scanPage();f.mask();assert.throws(()=>f.discovery.scanPage(p.cursor),/stale-surface-cursor/);});
for(const change of ['route','members-root','header-node','title-node','header-title','matching-titles','member-id','reading-node'])test('marked cursor rejects native structural change '+change,()=>{
 const f=fixture(),p=f.discovery.scanPage();mark(f,p);f.mask();
 if(change==='route')f.document.location.href='https://chatgpt.com/g/p2/project';
 if(change==='members-root')f.selectors.set(profile.regions.members,[f.node('NAV','',{'data-project-id':'p1'},f.reading)]);
 if(change==='header-node')f.selectors.set(profile.currentProjectHeader,[f.node('H1','Native project',{},f.header.parentElement)]);
 if(change==='title-node')f.selectors.set(profile.currentProjectTitle,[f.node('H2','Native project',{},f.reading)]);
 if(change==='header-title')f.header.textContent='Other';
 if(change==='matching-titles')f.header.textContent=f.heading.textContent='Renamed';
 if(change==='member-id')f.members.attrs['data-project-id']='p2';
 if(change==='reading-node'){const replacement=f.node('SECTION');f.members.parentNode=f.members.parentElement=replacement;f.heading.parentNode=f.heading.parentElement=replacement;f.selectors.set(profile.currentConversationReading,[replacement]);}
 assert.throws(()=>f.discovery.scanPage(p.cursor),/stale-surface-cursor/);
});
test('native hidden remaining member never receives PROJECT after preserving a visible cursor',()=>{
 const f=fixture(),first=f.discovery.scanPage();mark(f,first);f.members.children[300].style.visibility='hidden';const claims=[];let p=f.discovery.scanPage(first.cursor);while(true){claims.push(...p.payload.membershipClaims);if(!p.cursor)break;p=f.discovery.scanPage(p.cursor);}
 assert.equal(claims.find(c=>c.conversationId==='m300').asserted,'UNKNOWN');assert(claims.filter(c=>c.conversationId!=='m300').every(c=>c.asserted==='PROJECT'));assert.equal(claims.length,348);
});
test('candidate-only traversal stays independent of ordinary marked Project cursor',()=>{
 const f=fixture({candidateButtons:300}),ordinary=f.discovery.scanPage();mark(f,ordinary);const first=f.discovery.scanCandidatePage();assert(first.cursor);f.mask();const next=f.discovery.scanCandidatePage(first.cursor);assert.equal(next.payload.candidates.length,44);assert.deepEqual(next.payload.membershipClaims,[]);assert(next.payload.candidates.every(c=>c.target.kind==='live-control'));
 const resumed=f.discovery.scanPage(ordinary.cursor);assert(resumed.payload.membershipClaims.every(c=>c.asserted==='UNKNOWN'));
});
test('presentation marker is consumed by next page even when visibility did not change',()=>{
 const f=fixture(),first=f.discovery.scanPage();mark(f,first);const second=f.discovery.scanPage(first.cursor);assert(second.cursor);
 assert(second.payload.membershipClaims.every(c=>c.asserted==='PROJECT'));
 f.mask();assert.throws(()=>f.discovery.scanPage(second.cursor),/stale-surface-cursor/,'later visibility change requires its own exact marker');
});
test('consumed foreign and candidate-only cursors cannot receive presentation preservation',()=>{
 const f=fixture({candidateButtons:300}),other=fixture(),first=f.discovery.scanPage(),foreign=other.discovery.scanPage(),candidate=f.discovery.scanCandidatePage();
 assert.equal(f.discovery.preservePresentationCursor({}),false);assert.equal(f.discovery.preservePresentationCursor(null),false);assert.equal(f.discovery.preservePresentationCursor(foreign.cursor),false);
 assert.equal(f.discovery.preservePresentationCursor(candidate.cursor),false);assert.equal(f.discovery.scanCandidatePage(candidate.cursor).payload.candidates.length,44,'rejected marking must not consume candidate cursor');
 f.discovery.scanPage(first.cursor);assert.equal(f.discovery.preservePresentationCursor(first.cursor),false,'consumed cursor cannot be revived');
});
