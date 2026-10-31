import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE as profile} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
// Local structural oracle only; no claim of live-profile certification.
function fixture({candidateCount=600,memberCount=3000,historyCount=3000}={}){
 const document={location:{href:'https://chatgpt.com/g/p1/project'},defaultView:{crypto:{randomUUID},getComputedStyle:n=>n.style}};
 function node(tag='DIV',text='',attrs={},parent=null){return {tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,isConnected:true,ownerDocument:document,children:[],style:{display:'block',visibility:'visible'},getAttribute(k){return this.attrs[k]??null;},getClientRects(){return [{}];},contains(other){return this.children.includes(other);},querySelector(){return null;},closest(){return null;},querySelectorAll(){return this.children;}};}
 const reading=node(),members=node('NAV','',{'data-project-id':'p1'},reading),heading=node('H2','Native project',{},reading),header=node('H1','Native project'),projects=node(),history=node();
 for(let i=0;i<candidateCount;i++){projects.children.push(node('BUTTON','Candidate '+i,{},projects));if(i%4===0)projects.children.push(node('A','Resolved '+i,{href:`/g/p${i+2}/project`},projects));}
 members.children=Array.from({length:memberCount},(_,i)=>node('A','Member '+i,{href:`/c/m${i}`},members));history.children=Array.from({length:historyCount},(_,i)=>node('A','History '+i,{href:`/c/h${i}`},history));
 const selectors=new Map([[profile.regions.projects,[projects]],[profile.regions.history,[history]],[profile.regions.members,[members]],[profile.currentProjectTitle,[heading]],[profile.currentProjectHeader,[header]]]);document.querySelectorAll=s=>selectors.get(s)??[];
 installTreeWalkerDouble(document);const createWalker=document.createTreeWalker,walks=[];document.createTreeWalker=(root,...args)=>{walks.push(root);return createWalker(root,...args);};
 const discovery=createSurfaceDiscovery({document,binding:{documentToken:'doc',routeEpoch:1},profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>container,conversationId:id=>id}})});
 return {document,discovery,members,history,projects,walks};
}
function collect(discovery,method){const rows=[],claims=[];let p=discovery[method](),pages=0;for(;;){assert(++pages<100);assert(p.payload.candidates.length<=256);rows.push(...p.payload.candidates);claims.push(...p.payload.membershipClaims);assert.deepEqual(p.payload.coverageClaims,[]);if(!p.cursor)break;p=discovery[method](p.cursor);}return {rows,claims,pages};}
test('candidate-only traversal preserves exact IDless order across bounded pages without walking large member/history regions',()=>{
 const f=fixture(),result=collect(f.discovery,'scanCandidatePage');assert(result.pages>1);assert.equal(result.rows.length,600);assert.deepEqual(result.rows.map(r=>r.nativeTitle),Array.from({length:600},(_,i)=>'Candidate '+i));assert(result.rows.every(r=>r.entity==='project'&&r.target.kind==='live-control'));assert.equal(new Set(result.rows.map(r=>r.renderKey)).size,600);assert.deepEqual(result.claims,[]);assert(f.walks.length>0);assert(f.walks.every(root=>root===f.projects));
 const ordinary=collect(f.discovery,'scanPage').rows.filter(r=>r.entity==='project'&&r.target.kind==='live-control');assert.deepEqual(ordinary.map(r=>r.nativeTitle),result.rows.map(r=>r.nativeTitle));
});
for(const direction of ['candidate-to-ordinary','ordinary-to-candidate'])test(`surface cursor mode mismatch ${direction} is rejected`,()=>{
 const f=fixture(),from=direction==='candidate-to-ordinary'?'scanCandidatePage':'scanPage',to=direction==='candidate-to-ordinary'?'scanPage':'scanCandidatePage',p=f.discovery[from]();assert(p.cursor);assert.throws(()=>f.discovery[to](p.cursor),/stale-surface-cursor/);
});
for(const change of ['route','stop','foreign','reuse'])test(`candidate-only continuation rejects ${change}`,()=>{
 const f=fixture(),p=f.discovery.scanCandidatePage();assert(p.cursor);if(change==='route')f.document.location.href='https://chatgpt.com/';if(change==='stop')f.discovery.stop();if(change==='reuse')f.discovery.scanCandidatePage(p.cursor);assert.throws(()=>f.discovery.scanCandidatePage(change==='foreign'?{}:p.cursor),/stale-surface-cursor/);
});
test('candidate-only scan leaves independent normal member-title priority and membership claims intact',()=>{
 const f=fixture({candidateCount:600,memberCount:300,historyCount:300});f.members.children[0].textContent='Renamed member';f.history.children[0].attrs.href='/c/m0';f.history.children[0].textContent='Stale history title';collect(f.discovery,'scanCandidatePage');const ordinary=collect(f.discovery,'scanPage');const copies=ordinary.rows.filter(r=>r.renderKey==='conversation:m0');assert.equal(copies.length,1);assert.equal(copies[0].nativeTitle,'Renamed member');assert(copies[0].evidence.fieldPaths.includes('members'));assert(ordinary.claims.some(c=>c.conversationId==='m0'&&c.asserted==='PROJECT'&&c.projectId==='p1'));
});
test('candidate-only empty projects do not expose resolved current Project or unrelated conversations',()=>{
 const f=fixture({candidateCount:0}),result=collect(f.discovery,'scanCandidatePage');assert.deepEqual(result.rows,[]);assert.deepEqual(result.claims,[]);assert(f.walks.every(root=>root===f.projects));
});
