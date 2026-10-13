/** Mount geometry only. UI authorization and projection transport belong to the owner. */
export function createMountSurface({document:doc,createFrameURL,hasNativeLayer=()=>false}){
 const mounts=new Map();
 const lookup=handle=>{const m=mounts.get(handle?.id);if(!m||m.handle!==handle)throw Error('stale-mount');return m;};
 const hide=m=>{for(const surface of m.surfaces)if(surface.node.matches(':popover-open'))surface.node.hidePopover();};
 return {
  async mount(context,inspection){
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
    const frame=doc.createElement('iframe');frame.src=urls.get(role);frame.title=role==='workspace'?'工作空间':'导航';frame.style.cssText='border:0;width:100%;height:calc(100% - 28px)';node.append(button,frame);surfaces.push({role,node,frame});
    for(const root of maskRoots){const attr='data-va-mask-'+role;markers.push({root,attr,previous:root.getAttribute(attr)});root.setAttribute(attr,id);}
    style.textContent+=`${allowed}:has(#${node.id}:popover-open) [data-va-mask-${role}="${id}"]{visibility:hidden;interactivity:inert;}body:has(${nativeOpen}) #${node.id}{visibility:hidden;interactivity:inert;}\n`;
   }
   const m={handle,surfaces,markers,style};mounts.set(id,m);doc.head.append(style);for(const s of surfaces)doc.body.append(s.node);
   const inspectLayer=()=>{if(hasNativeLayer()||doc.querySelector(nativeOpen))hide(m);};
   const observer=new win.MutationObserver(inspectLayer);observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','style','hidden','aria-expanded']});
   const beforeToggle=e=>{if(e.newState==='open'&&!e.target.closest?.('[data-va-owned]'))hide(m);};doc.addEventListener('beforetoggle',beforeToggle,true);
   const nativeInput=e=>{if(protectedNodes.some(n=>n===e.target||n.contains(e.target)))hide(m);};doc.addEventListener('pointerdown',nativeInput,true);doc.addEventListener('focusin',nativeInput,true);
   m.cleanup=()=>{observer.disconnect();doc.removeEventListener('beforetoggle',beforeToggle,true);doc.removeEventListener('pointerdown',nativeInput,true);doc.removeEventListener('focusin',nativeInput,true);};return handle;
  },
  showWorkspace(handle){const m=lookup(handle);if(hasNativeLayer()||doc.querySelector('dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])')){hide(m);return;}for(const s of m.surfaces)if(!s.node.matches(':popover-open'))s.node.showPopover();},
  showReading(handle){const m=lookup(handle);for(const s of m.surfaces)if(s.role==='workspace'&&s.node.matches(':popover-open'))s.node.hidePopover();},
  suspend(handle){hide(lookup(handle));},
  frames(handle){return lookup(handle).surfaces.map(({role,frame})=>({role,frame}));},
  dispose(handle){const m=lookup(handle);m.cleanup();hide(m);for(const s of m.surfaces)s.node.remove();m.style.remove();for(const {root,attr,previous} of m.markers)if(root.getAttribute(attr)===handle.id){if(previous===null)root.removeAttribute(attr);else root.setAttribute(attr,previous);}mounts.delete(handle.id);},
 };
}
