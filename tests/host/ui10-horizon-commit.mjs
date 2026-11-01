/** Read-only event receipt: observes the single real selectOption change. */
export function observeUi10HorizonChange(){
 const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot;if(!root)throw Error('ui10-horizon-root-missing');
 const receipt={target:null,changes:0};
 const listener=event=>{const target=event.composedPath().find(n=>n?.getAttribute?.('aria-label')==='工作空间时间范围');if(target){receipt.target=target;receipt.changes++;}};
 root.addEventListener('change',listener,true);receipt.dispose=()=>root.removeEventListener('change',listener,true);return receipt;
}
/** A fresh renderer node, not the native select's optimistic value, is required. */
export function ui10HorizonCommitted({changes,replaced,value,expected,ariaDisabled,failed}){return changes===1&&replaced===true&&value===expected&&ariaDisabled==='false'&&failed===false;}
export function inspectUi10Horizon({receipt,expected}){
 const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,n=root?.querySelector('select[aria-label="工作空间时间范围"]');
 return {expected,changes:receipt.changes,replaced:!!n&&!!receipt.target&&n!==receipt.target,value:n?.value??null,ariaDisabled:n?.getAttribute('aria-disabled')??null,disabled:n?.disabled??null,failed:!!root?.textContent.includes('时间范围更新失败'),pending:!!root?.textContent.includes('正在更新时间范围…')};
}
export async function selectUi10Horizon(frame,select,value,completed=[]){
 const receipt=await frame.evaluateHandle(observeUi10HorizonChange);
 try{
  await select().selectOption(value);
  // The actual serialized predicate also has direct control-flow tests.
  await frame.waitForFunction(({receipt,expected})=>{
   const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,n=root?.querySelector('select[aria-label="工作空间时间范围"]');
   return receipt.changes===1&&!!n&&!!receipt.target&&n!==receipt.target&&n.value===expected&&n.getAttribute('aria-disabled')==='false'&&!root.textContent.includes('时间范围更新失败');
  },{receipt,expected:value},{timeout:6000});
 }catch(error){try{error.ui10HorizonDiagnostics={...await frame.evaluate(inspectUi10Horizon,{receipt,expected:value}),completed:[...completed]};}catch{}throw error;}
 finally{try{await receipt.evaluate(r=>r.dispose());}finally{await receipt.dispose();}}
}
