/** Read-only, local input risk. Absence of a verified complete profile never
 * means an empty composer. Text and file names never leave this reader. */
const risks=['upload','generation','voice','canvas'];
const flags=['composer','attachment',...risks];
const result=(state,values=[])=>Object.freeze({state,flags:Object.freeze(values)});
const unknown=()=>result('unknown');
function record(value,keys){return value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));}
const selector=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
function configuration(profile){
 const value=profile?.inputRisk;
 if(!record(value,['formSelector','editorSelector','filesSelector','risks','complete'])||!['formSelector','editorSelector','filesSelector'].every(key=>selector(value[key]))||!record(value.complete,flags)||flags.some(key=>value.complete[key]!==true)||!record(value.risks,risks))return null;
 const copy={formSelector:value.formSelector,editorSelector:value.editorSelector,filesSelector:value.filesSelector,risks:{}};
 for(const key of risks){const entry=value.risks[key];if(!record(entry,['rootSelector','activeSelector'])||!selector(entry.rootSelector)||!selector(entry.activeSelector))return null;copy.risks[key]={...entry};}
 return copy;
}
export function createNativeInputRisk({document:doc,profile}={}){
 let config;try{config=configuration(profile);}catch{return unknown;}
 if(!config||typeof doc?.querySelectorAll!=='function')return unknown;
 const connected=node=>node?.isConnected===true&&node.ownerDocument===doc;
 const one=selector=>{const matches=doc.querySelectorAll(selector);if(matches.length!==1||!connected(matches[0]))throw Error('unknown-boundary');return matches[0];};
 return ()=>{try{
  const form=one(config.formSelector),editor=one(config.editorSelector),files=one(config.filesSelector);
  if(form.tagName!=='FORM'||editor.tagName!=='TEXTAREA'||files.tagName!=='INPUT'||files.type!=='file'||!form.contains(editor)||!form.contains(files))return unknown();
  const values=[],text=editor.value,selected=files.files;
  if(typeof text!=='string'||!selected||!Number.isSafeInteger(selected.length)||selected.length<0)return unknown();
  if(text.length)values.push('composer');if(selected.length)values.push('attachment');
  const roots=[];
  for(const key of risks){const rule=config.risks[key],root=one(rule.rootSelector),active=root.querySelectorAll(rule.activeSelector);roots.push([rule.rootSelector,root]);if(active.length>256)return unknown();for(const node of active)if(!connected(node)||!root.contains(node))return unknown();if(active.length)values.push(key);}
  // Getter or DOM replacement during reading cannot certify an old boundary.
  if(one(config.formSelector)!==form||one(config.editorSelector)!==editor||one(config.filesSelector)!==files||roots.some(([query,node])=>one(query)!==node))return unknown();
  return result(values.length?'unsaved':'clear',values);
 }catch{return unknown();}};
}
