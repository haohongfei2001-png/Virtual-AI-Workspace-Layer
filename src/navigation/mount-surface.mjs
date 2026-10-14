/** Mount geometry only. UI authorization and projection transport belong to the owner. */
export function createMountSurface({document:doc,createFrameURL,hasNativeLayer=()=>false}){
 const mounts=new Map();
 const lookup=handle=>{const m=mounts.get(handle?.id);if(!m||m.handle!==handle)throw Error('stale-mount');return m;};
 const hide=m=>{for(const surface of m.surfaces)if(surface.node.matches(':popover-open'))surface.node.hidePopover();};
 const surrender=m=>{const opened=m.surfaces.some(surface=>surface.node.matches(':popover-open'));hide(m);if(opened)try{m.onSurrender({reason:'native-change'});}catch{/* Closure remains effective even if its consumer has stopped. */}};
 const refreshGeometry=(m,inspection)=>{
  try{
   const prior=m.inspection,same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((node,i)=>node===b[i]);
   if(!inspection?.ok||inspection.viewMask!=='declarative-css'||inspection.regionEpoch!==m.handle.regionEpoch||['reading','header','composer'].some(key=>inspection[key]!==prior[key])||!same(inspection.historyMaskRoots,prior.historyMaskRoots)||!same(inspection.protectedRegions,prior.protectedRegions))throw Error('stale-mount-geometry');
   const protectedNodes=[inspection.header,inspection.composer,...inspection.protectedRegions];
   if([...protectedNodes,inspection.reading,...inspection.historyMaskRoots].some(node=>!node?.isConnected||node.ownerDocument!==doc))throw Error('stale-mount-geometry');
   const updates=m.surfaces.map(surface=>({surface,rect:inspection[surface.role==='workspace'?'readingRect':'sidebarRect']}));
   for(const {rect}of updates){
    if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0)throw Error('invalid-mount-rect');
    if(protectedNodes.some(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&rect.x<r.right&&rect.x+rect.width>r.left&&rect.y<r.bottom&&rect.y+rect.height>r.top;}))throw Error('unsafe-mask-geometry');
   }
   // Validate the complete layout before changing either owned surface.
   for(const {surface,rect}of updates)Object.assign(surface.node.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
   return true;
  }catch{surrender(m);return false;}
 };
 return {
  refreshGeometry(handle,inspection){return refreshGeometry(lookup(handle),inspection);},
  async mount(context,inspection,{onSurrender=()=>{}}={}){
   const win=doc.defaultView;if(!win.CSS?.supports('interactivity','inert')||!win.HTMLElement.prototype.showPopover)throw Error('unsupported-mount-surface');
   if(!inspection?.ok||inspection.viewMask!=='declarative-css'||!context?.binding?.documentToken)throw Error('invalid-mount-inspection');
   if(!Array.isArray(inspection.historyMaskRoots)||!Array.isArray(inspection.protectedRegions))throw Error('invalid-mount-inspection');
   const roots=[inspection.reading,...inspection.historyMaskRoots],protectedNodes=[inspection.composer,inspection.header,...inspection.protectedRegions];
   if(roots.some(root=>!root?.isConnected||root.ownerDocument!==doc||protectedNodes.some(node=>!node||root===node||root.contains(node)))||new Set(roots).size!==roots.length||roots.some((root,i)=>roots.some((other,j)=>i!==j&&root.contains(other))))throw Error('unsafe-mask-region');
   const id='va_'+win.crypto.randomUUID().replaceAll('-',''),handle=Object.freeze({id,documentToken:context.binding.documentToken,regionEpoch:inspection.regionEpoch}),surfaces=[],markers=[];
   const specifications=[['workspace',inspection.readingRect,[inspection.reading]],['sidebar',inspection.sidebarRect,inspection.historyMaskRoots]].filter(([,rect])=>rect);
   const urls=new Map();for(const [role,rect] of specifications){
    if(!['x','y','width','height'].every(k=>Number.isFinite(rect[k]))||rect.width<=0||rect.height<=0)throw Error('invalid-mount-rect');
    if(protectedNodes.some(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&rect.x<r.right&&rect.x+rect.width>r.left&&rect.y<r.bottom&&rect.y+rect.height>r.top;}))throw Error('unsafe-mask-geometry');
    const url=new URL(createFrameURL({role,mountId:id}));if(url.protocol!=='chrome-extension:')throw Error('invalid-ui-frame-origin');urls.set(role,url.href);
   }
   const style=doc.createElement('style');style.dataset.vaOwned=id;
   const nativeOpen=`dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])`;
   const allowed=`body:not(:has(${nativeOpen}))`;
   for(const [role,rect,maskRoots] of specifications){
    if(!rect)continue;if(!['x','y','width','height'].every(k=>Number.isFinite(rect[k]))||rect.width<=0||rect.height<=0)throw Error('invalid-mount-rect');
    const node=doc.createElement('section');node.id=id+'_'+role;node.dataset.vaOwned=id;node.setAttribute('popover','manual');node.style.cssText=`position:fixed;inset:auto;margin:0;box-sizing:border-box;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;padding:0;border:0;background:Canvas;color:CanvasText;`;
    const button=doc.createElement('button');button.type='button';button.setAttribute('popovertarget',node.id);button.setAttribute('popovertargetaction','hide');button.textContent=role==='workspace'?'返回原生阅读':'显示原生列表';
    const frame=doc.createElement('iframe');frame.src=urls.get(role);frame.title=role==='workspace'?'工作空间':'导航';frame.style.cssText='border:0;width:100%;min-height:0;flex:1;display:block';node.append(button,frame);surfaces.push({role,node,frame});
    for(const root of maskRoots){const attr='data-va-mask-'+role;markers.push({root,attr,previous:root.getAttribute(attr),nativeClass:root.getAttribute('class'),nativeStyle:root.getAttribute('style'),nativeHidden:root.getAttribute('hidden'),nativeAriaHidden:root.getAttribute('aria-hidden'),wasVisible:win.getComputedStyle?.(root).visibility==='visible'});root.setAttribute(attr,id);}
    style.textContent+=`#${node.id}:popover-open{display:flex;flex-direction:column}#${node.id}>button{flex:none;align-self:flex-start}\n`;
    style.textContent+=`${allowed}:has(#${node.id}:popover-open) [data-va-mask-${role}="${id}"]{visibility:hidden;interactivity:inert;}body:has(${nativeOpen}) #${node.id}{visibility:hidden;interactivity:inert;}\n`;
   }
   const m={handle,surfaces,markers,style,styleText:style.textContent,onSurrender,inspection:{...inspection,historyMaskRoots:[...inspection.historyMaskRoots],protectedRegions:[...inspection.protectedRegions]}};mounts.set(id,m);
   const workspace=surfaces.find(s=>s.role==='workspace')?.node;
   const workspaceClosed=e=>{if(e.target!==workspace||e.newState!=='closed'||mounts.get(id)!==m||!workspace.isConnected||workspace.matches(':popover-open'))return;try{onSurrender({reason:'native-reading'});}catch{}};
   workspace?.addEventListener('toggle',workspaceClosed);doc.head.append(style);for(const s of surfaces)doc.body.append(s.node);
   const inspectLayer=()=>{if(hasNativeLayer()||doc.querySelector(nativeOpen)||markers.some(({root,nativeClass,nativeStyle,nativeHidden,nativeAriaHidden})=>!root.isConnected||root.ownerDocument!==doc||root.getAttribute('class')!==nativeClass||root.getAttribute('style')!==nativeStyle||root.getAttribute('hidden')!==nativeHidden||root.getAttribute('aria-hidden')!==nativeAriaHidden))surrender(m);};
   const observer=new win.MutationObserver(inspectLayer);observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','style','hidden','aria-hidden','aria-expanded']});
   const beforeToggle=e=>{if(e.newState==='open'&&!e.target.closest?.('[data-va-owned]'))hide(m);};doc.addEventListener('beforetoggle',beforeToggle,true);
   const nativeInput=e=>{if(protectedNodes.some(n=>n===e.target||n.contains(e.target))){hide(m);try{onSurrender({reason:'native-input'});}catch{}}};doc.addEventListener('pointerdown',nativeInput,true);doc.addEventListener('focusin',nativeInput,true);
   m.cleanup=()=>{workspace?.removeEventListener('toggle',workspaceClosed);observer.disconnect();doc.removeEventListener('beforetoggle',beforeToggle,true);doc.removeEventListener('pointerdown',nativeInput,true);doc.removeEventListener('focusin',nativeInput,true);};return handle;
  },
  // Only directory-relevant records reach this method from the adapter. Release
  // an affected mask before discovery; never treat cached visibility as evidence.
  surrenderChanged(records){
   if(!Array.isArray(records)||!records.length)return false;let changed=false;
   const contains=(parent,child)=>parent===child||parent?.contains?.(child)===true;
   for(const m of mounts.values()){
    const affected=m.markers.some(({root,attr})=>m.surfaces.some(s=>attr==='data-va-mask-'+s.role&&s.node.matches(':popover-open'))&&records.some(record=>
     contains(root,record.target)||record.type==='attributes'&&contains(record.target,root)||record.type==='childList'&&[...(record.addedNodes??[]),...(record.removedNodes??[])].some(node=>contains(node,root))));
    if(affected){surrender(m);changed=true;}
   }return changed;
  },
  isMasked(root){
   for(const m of mounts.values()){
    const marker=m.markers.find(value=>value.root===root);if(!marker)continue;
    const role=marker.attr==='data-va-mask-workspace'?'workspace':'sidebar',surface=m.surfaces.find(value=>value.role===role);
    return marker.wasVisible&&root.isConnected&&m.style.isConnected&&m.style.textContent===m.styleText&&root.getAttribute(marker.attr)===m.handle.id&&root.getAttribute('class')===marker.nativeClass&&root.getAttribute('style')===marker.nativeStyle&&surface.node.isConnected&&surface.node.matches(':popover-open');
   }return false;
  },
  showWorkspace(handle){const m=lookup(handle);if(hasNativeLayer()||doc.querySelector('dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])')){hide(m);return;}// Re-entry follows the controller's fresh inspection. Capture only presently
   // visible native roots while their own mask is closed, never hidden history.
   const closed=m.surfaces.filter(s=>!s.node.matches(':popover-open'));
   const markers=m.markers.filter(marker=>closed.some(s=>marker.attr==='data-va-mask-'+s.role));
   if(markers.some(({root})=>!root.isConnected||root.ownerDocument!==doc||root.hidden||root.getAttribute('aria-hidden')==='true'||doc.defaultView.getComputedStyle(root).visibility!=='visible'||doc.defaultView.getComputedStyle(root).display==='none')){hide(m);return false;}
   for(const marker of markers){marker.nativeClass=marker.root.getAttribute('class');marker.nativeStyle=marker.root.getAttribute('style');marker.nativeHidden=marker.root.getAttribute('hidden');marker.nativeAriaHidden=marker.root.getAttribute('aria-hidden');marker.wasVisible=true;}
   for(const s of closed)s.node.showPopover();return true;},
  showReading(handle){const m=lookup(handle);for(const s of m.surfaces)if(s.role==='workspace'&&s.node.matches(':popover-open'))s.node.hidePopover();},
  suspend(handle){hide(lookup(handle));},
  frames(handle){return lookup(handle).surfaces.map(({role,frame})=>({role,frame}));},
  dispose(handle){const m=lookup(handle);m.cleanup();hide(m);for(const s of m.surfaces)s.node.remove();m.style.remove();for(const {root,attr,previous} of m.markers)if(root.getAttribute(attr)===handle.id){if(previous===null)root.removeAttribute(attr);else root.setAttribute(attr,previous);}mounts.delete(handle.id);},
 };
}
