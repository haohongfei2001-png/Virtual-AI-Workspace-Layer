/** DOM proposals only: a locator is never an authenticated receipt or scope grant. */
export const LEGACY_SURFACE_PROFILE = Object.freeze({
  id:'chatgpt-legacy-reconstruction',revision:1,reconstruction:true,liveVerified:false,
  regions:Object.freeze({projects:'aside section[aria-label="Projects"]',history:'aside nav[aria-label="Chat history"]',members:'main #reading nav[aria-label="Project conversations"]',moveMenu:'dialog#move-dialog[open]'}),
  memberProjectIdAttribute:'data-project-id',menuConversationIdAttribute:'data-conversation-id',
  controls:'a[href],button',conversationControls:'a[href]',noneLabel:'No project',maxCandidates:256,
});

export function createSurfaceDiscovery({document,binding,urlPolicy,profile=LEGACY_SURFACE_PROFILE}={}) {
  if(!document?.defaultView || typeof binding?.documentToken !== 'string' || !Number.isSafeInteger(binding.routeEpoch) || typeof urlPolicy?.parse !== 'function') throw Error('invalid-surface-discovery-context');
  const instance=document.defaultView.crypto.randomUUID();
  let stopped=false,routeEpoch=binding.routeEpoch,regionEpoch=0,sequence=0;
  let routeURL=document.location.href;
  let byNode=new WeakMap(); const byId=new Map(),detached=new Set();
  const roots=new Map();
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
  function scan() {
    if(stopped) return {candidates:[],membershipClaims:[],coverageClaims:[],detachedHandles:[]};
    refreshRoute();refreshRoots();
    for(const [id,entry] of byId) if(!valid(entry)) { byId.delete(id);const node=entry.node.deref();if(node)byNode.delete(node);detached.add(id); }
    const route=urlPolicy.parse(document.location.href),candidates=[],claims=new Map();
    const limit=Math.max(1,Math.min(256,Number.isInteger(profile.maxCandidates)?profile.maxCandidates:256));
    function candidate(node,root,regionKind,entity) {
      const href=node.getAttribute('href'),parsed=href?urlPolicy.parse(href):null;
      if(parsed?.kind==='unsupported'||parsed&&parsed.kind!==entity&&!(entity==='project'&&parsed.kind==='project-candidate')) return null;
      if(!parsed&&!(entity==='project'&&node.tagName==='BUTTON')) return null;
      const handle=control(node,root,regionKind,entity);
      const id=parsed?.kind===entity?(entity==='project'?parsed.projectId:parsed.conversationId):null;
      const target=id?{kind:'resolved',entity,nativeId:id,navigationURL:parsed.navigationURL,liveHandle:handle}:{kind:'live-control',control:handle,navigationURL:null};
      const result={renderKey:id?`${entity}:${id}`:`candidate:${handle.id}`,entity,...title(node),target,evidence:evidence(regionKind,'textContent',href?'href':'button')};
      candidates.push(result);return result;
    }
    const projects=roots.get('projects');
    if(projects) for(const node of projects.querySelectorAll(profile.controls)) { if(candidates.length>=limit) break;candidate(node,projects,'projects','project'); }
    for(const regionKind of ['history','members']) {
      const root=roots.get(regionKind);if(!root) continue;
      for(const node of root.querySelectorAll(profile.conversationControls)) {
        if(candidates.length>=limit) break;
        const item=candidate(node,root,regionKind,'conversation');if(!item||item.target.kind!=='resolved')continue;
        const conversationId=item.target.nativeId;
        if(regionKind==='members'&&route.kind==='project'&&root.getAttribute(profile.memberProjectIdAttribute)===route.projectId) claims.set(conversationId,{conversationId,asserted:'PROJECT',projectId:route.projectId,upstreamRevision:null,evidence:evidence('members','current-project-route')});
        else if(!claims.has(conversationId)) claims.set(conversationId,{conversationId,asserted:'UNKNOWN',projectId:null,reason:'membership-not-observed',evidence:evidence(regionKind)});
      }
    }
    const menu=roots.get('moveMenu');
    if(route.kind==='conversation'&&menu&&menu.getAttribute(profile.menuConversationIdAttribute)===route.conversationId) {
      const checked=[...menu.querySelectorAll('input[type="radio"]:checked')];
      if(checked.length===1&&checked[0].closest('label')?.textContent.trim()===profile.noneLabel) claims.set(route.conversationId,{conversationId:route.conversationId,asserted:'NONE',projectId:null,upstreamRevision:null,evidence:evidence('moveMenu','checked-no-project')});
    }
    const detachedHandles=[...detached];detached.clear();
    // A visible DOM slice is not an account-wide or terminal snapshot.
    return {candidates,membershipClaims:[...claims.values()],coverageClaims:[],detachedHandles};
  }
  return Object.freeze({scan,getNode(handle) {
    if(stopped)return null;refreshRoute();refreshRoots();
    const entry=byId.get(typeof handle==='string'?handle:handle?.id);
    if(!entry)return null;
    if(!valid(entry)){byId.delete(entry.handle.id);const node=entry.node.deref();if(node)byNode.delete(node);detached.add(entry.handle.id);return null;}
    if(typeof handle==='object'&&['documentToken','routeEpoch','regionEpoch','controlKind'].some(key=>handle[key]!==entry.handle[key]))return null;
    return entry.node.deref();
  },invalidate({routeEpoch:nextEpoch}={}) {
    if(stopped)return;routeEpoch=Number.isSafeInteger(nextEpoch)&&nextEpoch>routeEpoch?nextEpoch:routeEpoch+1;clearHandles();roots.clear();routeURL=document.location.href;
  },stop() {stopped=true;clearHandles();roots.clear();}});
}
