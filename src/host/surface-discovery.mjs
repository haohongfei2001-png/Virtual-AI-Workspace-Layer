// Private cross-discovery identity witnesses. Tokens carry neither a handle nor authority.
const candidateIdentities=new WeakMap();

/** DOM proposals only: a locator is never an authenticated receipt or scope grant. */
export const LEGACY_SURFACE_PROFILE = Object.freeze({
  id:'chatgpt-legacy-reconstruction',revision:1,reconstruction:true,liveVerified:false,
  regions:Object.freeze({projects:'aside section[aria-label="Projects"]',history:'aside nav[aria-label="Chat history"]',members:'main #reading nav[aria-label="Project conversations"]',moveMenu:'dialog#move-dialog[open]'}),
  sendIntent:Object.freeze({formSelector:'main > form#composer',editorSelector:'#prompt-textarea',sendButtonSelector:'main > form#composer > button[type="submit"]',enterSends:false}),
  currentBody:Object.freeze({rootSelector:'main > #reading',conversationIdAttribute:'data-conversation-id',messageSelector:'[data-message-id]',messageIdAttribute:'data-message-id'}),
  currentConversationHeader:'main > header > h1',currentConversationReading:'main > #reading',currentConversationIdAttribute:'data-conversation-id',
  currentProjectTitle:'main > #reading > h2',currentProjectHeader:'main > header > h1',
  memberProjectIdAttribute:'data-project-id',menuConversationIdAttribute:'data-conversation-id',
  controls:'a[href],button',conversationControls:'a[href]',noneLabel:'No project',maxCandidates:256,
});

export function createSurfaceDiscovery({document,binding,urlPolicy,profile=LEGACY_SURFACE_PROFILE,isOwnedMask=()=>false}={}) {
  if(!document?.defaultView || typeof binding?.documentToken !== 'string' || !Number.isSafeInteger(binding.routeEpoch) || typeof urlPolicy?.parse !== 'function') throw Error('invalid-surface-discovery-context');
  const instance=document.defaultView.crypto.randomUUID();
  let stopped=false,routeEpoch=binding.routeEpoch,regionEpoch=0,sequence=0;
  let routeURL=document.location.href;
  let byNode=new WeakMap(); const byId=new Map(),detached=new Set();
  const roots=new Map(),pages=new WeakMap();let watched=[];
  const unique = (selector) => { const nodes=document.querySelectorAll(selector);return nodes.length===1?nodes[0]:null; };
  const fingerprint = (node) => JSON.stringify([node.tagName,node.getAttribute('href'),node.getAttribute('aria-label'),node.getAttribute('role'),node.textContent,node.disabled===true]);
  const title = (node) => { const text=(node.textContent??'').trim();return text.length>200?{nativeTitle:null,titleState:'over-limit'}:text?{nativeTitle:text,titleState:'exact'}:{nativeTitle:null,titleState:'unavailable'}; };
  const evidence = (...fieldPaths) => ({profileId:profile.id,profileVersion:profile.revision,sourceKind:'native-dom',regionEpoch,fieldPaths,receiptId:null});
  function clearHandles() { for(const id of byId.keys()) detached.add(id);byId.clear();byNode=new WeakMap();regionEpoch++; }
  function refreshRoute() { if(document.location.href!==routeURL) { routeURL=document.location.href;routeEpoch++;clearHandles();roots.clear(); } }
  function refreshRoots() {
    for(const [kind,selector] of Object.entries(profile.regions)) {
      const root=unique(selector),old=roots.get(kind);
      if(old!==undefined&&old!==root) clearHandles();
      roots.set(kind,root);
    }
  }
  function valid(entry) {
    const node=entry.node.deref(),root=entry.root.deref();
    return node&&root&&node.isConnected&&root.isConnected&&node.ownerDocument===document&&root.contains(node)&&node.parentNode===entry.parent.deref()&&entry.handle.routeEpoch===routeEpoch&&entry.handle.regionEpoch===regionEpoch&&fingerprint(node)===entry.fingerprint&&roots.get(entry.regionKind)===root;
  }
  function control(node,root,regionKind,controlKind) {
    let entry=byNode.get(node);
    if(entry&&!valid(entry)) { detached.add(entry.handle.id);byId.delete(entry.handle.id);entry=null; }
    if(!entry) {
      const handle={id:`live-${instance}-${++sequence}`,documentToken:binding.documentToken,routeEpoch,regionEpoch,controlKind};
      entry={handle,node:new WeakRef(node),root:new WeakRef(root),parent:new WeakRef(node.parentNode),regionKind,fingerprint:fingerprint(node)};
      byNode.set(node,entry);byId.set(handle.id,entry);
    }
    return {...entry.handle};
  }
  function scanPage(cursor=null) {
    const empty=()=>({candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]});
    if(stopped){if(cursor)throw Error('stale-surface-cursor');return {payload:empty(),cursor:null};}
    refreshRoute();refreshRoots();
    if(!cursor)for(const [id,entry] of byId) if(!valid(entry)) { byId.delete(id);const node=entry.node.deref();if(node)byNode.delete(node);detached.add(id); }
    const route=urlPolicy.parse(document.location.href),candidates=[],claims=new Map();
    let currentConversationId=null,currentProjectId=null;
    const visible=node=>{
      if(!node?.isConnected||!node.getClientRects().length)return false;
      for(let parent=node;parent;parent=parent.parentElement){const style=document.defaultView.getComputedStyle(parent);if(parent.hidden||parent.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'&&isOwnedMask(parent)!==true||style.visibility==='collapse')return false;}
      return true;
    };
    const oneVisible=selector=>{const nodes=selector?[...document.querySelectorAll(selector)].filter(visible):[];return nodes.length===1?nodes[0]:null;};
    if(route.kind==='conversation'&&profile.currentConversationIdAttribute){
      const reading=oneVisible(profile.currentConversationReading),heading=oneVisible(profile.currentConversationHeader);
      // URL alone cannot bind an old reading surface during an SPA transition.
      // This profile requires a native-rendered current-object association.
      if(reading&&heading&&heading.parentElement?.parentElement===reading.parentElement&&reading.getAttribute(profile.currentConversationIdAttribute)===route.conversationId){
        currentConversationId=route.conversationId;const label=title(heading);
        candidates.push({renderKey:`conversation:${route.conversationId}`,entity:'conversation',...label,target:{kind:'resolved',entity:'conversation',nativeId:route.conversationId,navigationURL:route.navigationURL,liveHandle:null},evidence:evidence('current-conversation-route','current-conversation-header','current-conversation-reading-id')});
        claims.set(route.conversationId,{conversationId:route.conversationId,asserted:'UNKNOWN',projectId:null,reason:'membership-not-observed',evidence:evidence('current-conversation-reading-id')});
      }
    }
    const limit=Math.max(1,Math.min(256,Number.isInteger(profile.maxCandidates)?profile.maxCandidates:256));
    function candidate(node,root,regionKind,entity) {
      const href=node.getAttribute('href'),parsed=href?urlPolicy.parse(href):null;
      if(entity==='conversation'&&parsed?.kind==='conversation'&&parsed.conversationId===currentConversationId)return null;
      if(entity==='project'&&parsed?.kind==='project'&&parsed.projectId===currentProjectId)return null;
      if(parsed?.kind==='unsupported'||parsed&&parsed.kind!==entity&&!(entity==='project'&&parsed.kind==='project-candidate')) return null;
      if(!parsed&&!(entity==='project'&&node.tagName==='BUTTON')) return null;
      const handle=control(node,root,regionKind,entity);
      const id=parsed?.kind===entity?(entity==='project'?parsed.projectId:parsed.conversationId):null;
      const target=id?{kind:'resolved',entity,nativeId:id,navigationURL:parsed.navigationURL,liveHandle:handle}:{kind:'live-control',control:handle,navigationURL:null};
      const result={renderKey:id?`${entity}:${id}`:`candidate:${handle.id}`,entity,...title(node),target,evidence:evidence(regionKind,'textContent',href?'href':'button')};
      candidates.push(result);return result;
    }
    // A canonical current Project needs route identity and the explicitly scoped
    // member surface; an IDless sidebar label never supplies that identity.
    const members=roots.get('members');
    if(route.kind==='project'&&members&&members.getAttribute(profile.memberProjectIdAttribute)===route.projectId&&profile.currentProjectTitle&&profile.currentProjectHeader){
      const heading=unique(profile.currentProjectTitle),header=unique(profile.currentProjectHeader);
      if(heading&&header&&visible(heading)&&visible(header)&&visible(members)&&heading.parentNode===members.parentNode&&heading.textContent.trim()===header.textContent.trim()){
        // The confirmed current title wins over a sidebar label that may lag a rename.
        currentProjectId=route.projectId;
        candidates.push({renderKey:`project:${route.projectId}`,entity:'project',...title(heading),target:{kind:'resolved',entity:'project',nativeId:route.projectId,navigationURL:route.navigationURL,liveHandle:null},evidence:evidence('current-project-route','current-project-title','members')});
      }
    }
    // A confirmed open Project must not lose its member evidence to a full sidebar.
    const order=currentProjectId?['members','projects','history']:['projects','history','members'];
    let page=cursor&&pages.get(cursor);
    if(cursor){
      pages.delete(cursor);
      if(!page||page.routeEpoch!==routeEpoch||page.regionEpoch!==regionEpoch||page.currentProjectId!==currentProjectId||page.currentConversationId!==currentConversationId)throw Error('stale-surface-cursor');
    }else page={routeEpoch,regionEpoch,currentProjectId,currentConversationId,memberIds:new Set(),region:0,regions:order.map(kind=>({kind,root:roots.get(kind),walker:null,finished:false}))};
    // Walk loaded DOM lazily: never allocate a whole-region NodeList. Each page
    // bounds inspected elements, including non-controls, and rechecks identity.
    if(cursor&&candidates.length>=limit){candidates.length=0;claims.clear();}
    let inspected=0;
    while(page.region<page.regions.length&&candidates.length<limit&&inspected<256){
      const region=page.regions[page.region],{kind:regionKind,root}=region;
      if(!root||region.finished){page.region++;continue;}
      if(!region.walker)region.walker=document.createTreeWalker(root,1);
      const node=region.walker.nextNode();
      if(!node){region.finished=true;region.walker=null;page.region++;continue;}
      inspected++;
      if(!node.matches(regionKind==='projects'?profile.controls:profile.conversationControls))continue;
      if(!node.isConnected||node.ownerDocument!==document||!root?.contains(node))continue;
      if(regionKind==='history'&&page.memberIds.size){const parsed=urlPolicy.parse(node.getAttribute('href'));if(parsed.kind==='conversation'&&page.memberIds.has(parsed.conversationId))continue;}
      const item=candidate(node,root,regionKind,regionKind==='projects'?'project':'conversation');
      if(regionKind==='projects'||!item||item.target.kind!=='resolved')continue;
      const conversationId=item.target.nativeId;
      if(regionKind==='members'&&visible(root)&&visible(node)&&route.kind==='project'&&root.getAttribute(profile.memberProjectIdAttribute)===route.projectId){claims.set(conversationId,{conversationId,asserted:'PROJECT',projectId:route.projectId,upstreamRevision:null,evidence:evidence('members','current-project-route')});if(currentProjectId===route.projectId)page.memberIds.add(conversationId);}
      else if(!claims.has(conversationId)) claims.set(conversationId,{conversationId,asserted:'UNKNOWN',projectId:null,reason:'membership-not-observed',evidence:evidence(regionKind)});
    }

    const menu=roots.get('moveMenu');
    if(route.kind==='conversation'&&menu&&visible(menu)&&menu.getAttribute(profile.menuConversationIdAttribute)===route.conversationId) {
      const checked=[...menu.querySelectorAll('input[type="radio"]:checked')];
      if(checked.length===1&&visible(checked[0])&&visible(checked[0].closest('label'))&&checked[0].closest('label')?.textContent.trim()===profile.noneLabel) claims.set(route.conversationId,{conversationId:route.conversationId,asserted:'NONE',projectId:null,upstreamRevision:null,evidence:evidence('moveMenu','checked-no-project')});
    }
    const detachedHandles=[];for(const id of detached){if(detachedHandles.length===512)break;detachedHandles.push(id);detached.delete(id);}
    // A visible DOM slice is not an account-wide or terminal snapshot.
    let next=null;if(page.region<page.regions.length||detached.size){next=Object.freeze(Object.create(null));pages.set(next,page);}
    return {payload:{candidates,membershipClaims:[...claims.values()],coverageClaims:[],detachedHandles},cursor:next};
  }
  const scan=()=>scanPage().payload;
  function watchSurface(){
    const selectors=[...Object.values(profile.regions),profile.currentConversationHeader,profile.currentProjectTitle,profile.currentProjectHeader].filter(Boolean);
    const next=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]);
    const reading=profile.currentConversationReading?[...document.querySelectorAll(profile.currentConversationReading)]:[];
    const prior=watched;watched=[...next.map(node=>({node,subtree:true})),...reading.map(node=>({node,subtree:false}))];return [...prior,...watched];
  }
  function affectsSurface(records){
    const nodes=watchSurface();
    if(!records?.length)return true;
    const contains=(parent,child)=>parent===child||parent?.contains?.(child)===true;
    return records.some(record=>nodes.some(({node,subtree})=>{
      if(subtree&&(contains(node,record.target)||contains(record.target,node)))return true;
      if(record.type==='attributes'&&contains(record.target,node))return true;
      return record.type==='childList'&&[...record.addedNodes,...record.removedNodes].some(changed=>contains(changed,node));
    }));
  }
  watchSurface();
  function dispatchable(node) {
    if(!node?.getClientRects().length||node.disabled===true||node.matches(':disabled'))return false;
    let depth=0;
    for(let parent=node;parent;parent=parent.parentElement){
      if(++depth>64||parent.hidden||parent.inert||parent.getAttribute('aria-hidden')==='true'||parent.getAttribute('aria-disabled')==='true')return false;
      const style=document.defaultView.getComputedStyle(parent);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
    }
    return true;
  }
  function getNode(handle,{forDispatch=false}={}) {
    if(stopped)return null;refreshRoute();refreshRoots();
    const entry=byId.get(typeof handle==='string'?handle:handle?.id);
    if(!entry)return null;
    if(!valid(entry)){byId.delete(entry.handle.id);const node=entry.node.deref();if(node)byNode.delete(node);detached.add(entry.handle.id);return null;}
    if(typeof handle==='object'&&['documentToken','routeEpoch','regionEpoch','controlKind'].some(key=>handle[key]!==entry.handle[key]))return null;
    const node=entry.node.deref();return forDispatch&&!dispatchable(node)?null:node;
  }
  function candidateEntry(handle){
    if(!handle||typeof handle!=='object'||handle.controlKind!=='project'||!getNode(handle))return null;
    const entry=byId.get(handle.id);if(entry?.regionKind!=='projects')return null;
    const node=entry.node.deref(),href=node.getAttribute('href'),parsed=href?urlPolicy.parse(href):null;
    return ((!parsed&&node.tagName==='BUTTON')||parsed?.kind==='project-candidate')?entry:null;
  }
  function captureCandidateIdentity(handle){
    const entry=candidateEntry(handle);if(!entry)return null;
    const token=Object.freeze(Object.create(null));
    candidateIdentities.set(token,{node:entry.node,root:entry.root,parent:entry.parent,document:new WeakRef(document),fingerprint:entry.fingerprint,profileId:profile.id,profileVersion:profile.revision});
    return token;
  }
  function matchesCandidateIdentity(token,handle){
    const identity=token&&typeof token==='object'?candidateIdentities.get(token):null;if(!identity)return false;
    const entry=candidateEntry(handle);if(!entry)return false;
    return identity.document.deref()===document&&identity.profileId===profile.id&&identity.profileVersion===profile.revision&&identity.node.deref()===entry.node.deref()&&identity.root.deref()===entry.root.deref()&&identity.parent.deref()===entry.parent.deref()&&identity.fingerprint===entry.fingerprint;
  }
  return Object.freeze({scan,scanPage,affectsSurface,getNode,captureCandidateIdentity,matchesCandidateIdentity,invalidate({routeEpoch:nextEpoch}={}) {
    if(stopped)return;routeEpoch=Number.isSafeInteger(nextEpoch)&&nextEpoch>routeEpoch?nextEpoch:routeEpoch+1;clearHandles();roots.clear();routeURL=document.location.href;
  },stop() {stopped=true;clearHandles();roots.clear();}});
}
