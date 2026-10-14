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
 const optional=['editorKinds','draftEditorsSelector'].filter(key=>value&&Object.hasOwn(value,key));
 if(!record(value,['formSelector','editorSelector','filesSelector','risks','complete',...optional])||!['formSelector','editorSelector','filesSelector'].every(key=>selector(value[key]))||!record(value.complete,flags)||flags.some(key=>value.complete[key]!==true)||!record(value.risks,risks))return null;
 const declared=Object.hasOwn(value,'editorKinds')?value.editorKinds:['textarea'];
 if(!Array.isArray(declared)||Object.getPrototypeOf(declared)!==Array.prototype)return null;
 const length=Object.getOwnPropertyDescriptor(declared,'length')?.value;
 if(!Number.isSafeInteger(length)||length<1||length>2||Reflect.ownKeys(declared).length!==length+1)return null;
 const kinds=[];for(let i=0;i<length;i++){const item=Object.getOwnPropertyDescriptor(declared,String(i));if(!item||!Object.hasOwn(item,'value'))return null;kinds.push(item.value);}
 if(new Set(kinds).size!==kinds.length||!kinds.every(kind=>['textarea','contenteditable'].includes(kind)))return null;
 if(Object.hasOwn(value,'draftEditorsSelector')&&!selector(value.draftEditorsSelector))return null;
 const copy={formSelector:value.formSelector,editorSelector:value.editorSelector,filesSelector:value.filesSelector,editorKinds:[...kinds],draftEditorsSelector:value.draftEditorsSelector,risks:{}};
 for(const key of risks){const entry=value.risks[key];if(!record(entry,['rootSelector','activeSelector'])||!selector(entry.rootSelector)||!selector(entry.activeSelector))return null;copy.risks[key]={...entry};}
 return copy;
}
export function createNativeInputRisk({document:doc,profile}={}){
 let config;try{config=configuration(profile);}catch{return unknown;}
 if(!config||typeof doc?.querySelectorAll!=='function')return unknown;
 const connected=node=>node?.isConnected===true&&node.ownerDocument===doc;
 const one=selector=>{const matches=doc.querySelectorAll(selector);if(matches.length!==1||!connected(matches[0]))throw Error('unknown-boundary');return matches[0];};
 const kind=node=>{
  if(config.editorKinds.includes('textarea')&&node.tagName==='TEXTAREA')return 'textarea';
  if(config.editorKinds.includes('contenteditable')&&node.tagName==='DIV'&&node.getAttribute('role')==='textbox'&&['true','plaintext-only'].includes(node.getAttribute('contenteditable'))&&node.isContentEditable===true&&node.parentElement?.isContentEditable!==true)return 'contenteditable';
  throw Error('unknown-editor');
 };
 const editors=(form,active)=>{
  const nodes=config.draftEditorsSelector?[...doc.querySelectorAll(config.draftEditorsSelector)]:[active];
  if(!nodes.length||nodes.length>32||new Set(nodes).size!==nodes.length||!nodes.includes(active)||nodes.some(node=>!connected(node)||!form.contains(node)))throw Error('unknown-draft-boundary');
  // An inactive editor may still own a draft. Uncovered sibling editors are
  // unknown; descendants are already covered by their editor's content check.
  const candidates=form.querySelectorAll('textarea,[contenteditable]');
  if(candidates.length>256)throw Error('unknown-editor-capacity');
  for(const node of candidates){
   if(!connected(node)||!form.contains(node))throw Error('unknown-editor-boundary');
   if(node.tagName!=='TEXTAREA'&&node.getAttribute('contenteditable')==='false')continue;
   if(!nodes.some(editor=>editor===node||kind(editor)==='contenteditable'&&editor.contains?.(node)===true))throw Error('uncovered-editor');
  }
  return nodes;
 };
 return ()=>{try{
  const form=one(config.formSelector),editor=one(config.editorSelector),files=one(config.filesSelector);
  if(form.tagName!=='FORM'||files.tagName!=='INPUT'||files.type!=='file'||!form.contains(editor)||!form.contains(files))return unknown();
  const draftNodes=editors(form,editor),kinds=draftNodes.map(kind),values=[];let draft=false;
  for(let i=0;i<draftNodes.length;i++){
   const node=draftNodes[i],rich=kinds[i]==='contenteditable',text=rich?node.textContent:node.value,children=rich?node.childElementCount:0;
   if(typeof text!=='string'||!Number.isSafeInteger(children)||children<0)return unknown();
   if(text.length||children)draft=true;
  }
  const selected=files.files;
  if(!selected||!Number.isSafeInteger(selected.length)||selected.length<0)return unknown();
  if(draft)values.push('composer');if(selected.length)values.push('attachment');
  const roots=[];
  for(const key of risks){const rule=config.risks[key],root=one(rule.rootSelector),active=root.querySelectorAll(rule.activeSelector);roots.push([rule.rootSelector,root]);if(active.length>256)return unknown();for(const node of active)if(!connected(node)||!root.contains(node))return unknown();if(active.length)values.push(key);}
  // Getter or DOM replacement during reading cannot certify an old boundary.
  if(one(config.formSelector)!==form||one(config.editorSelector)!==editor||one(config.filesSelector)!==files||roots.some(([query,node])=>one(query)!==node))return unknown();
  const currentEditors=editors(form,editor);
  if(currentEditors.length!==draftNodes.length||currentEditors.some((node,i)=>node!==draftNodes[i]||kind(node)!==kinds[i])||form.tagName!=='FORM'||files.tagName!=='INPUT'||files.type!=='file'||!form.contains(files))return unknown();
  return result(values.length?'unsaved':'clear',values);
 }catch{return unknown();}};
}
