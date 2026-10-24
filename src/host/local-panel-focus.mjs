/** Focus only inside the owning extension document; never focus a background frame. */
export function localPanelActiveElement(panel){
 let active=panel?.getRootNode?.().activeElement??panel?.ownerDocument?.activeElement;
 while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
 return active??null;
}
export function localPanelOwnsFocus(panel){return !!panel?.contains?.(localPanelActiveElement(panel));}
export function focusLocalPanel(panel,target){
 const doc=panel?.ownerDocument;
 if(!panel?.isConnected||!target?.isConnected||!panel.contains(target)||doc?.hasFocus?.()!==true||doc.visibilityState==='hidden')return false;
 target.focus?.({preventScroll:true});return localPanelActiveElement(panel)===target;
}
