/** Cache validation, never facts: every IDB read must match all payload bytes again. */
function strictJSON(value){
 const type=typeof value;
 if(['undefined','function','symbol','bigint'].includes(type)||type==='number'&&!Number.isFinite(value))throw Error('non-json-value');
 if(value&&type==='object'){
  if(Array.isArray(value)){const parts=[];for(let index=0;index<value.length;index++)parts.push(strictJSON(value[index]));return '['+parts.join(',')+']';}
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('non-json-object');
  // Do not invoke toJSON. Preserve key order for a cheap exact-byte signature;
  // reordered but equivalent objects simply take the normal verification path.
  return '{'+Object.keys(value).map(key=>JSON.stringify(key)+':'+strictJSON(value[key])).join(',')+'}';
 }
 return JSON.stringify(value);
}
export class VerifiedRecordCache{
 #entries=new Map();#chars=0;
 constructor({maxEntries=2,maxChars=8*1024*1024}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<0||!Number.isSafeInteger(maxChars)||maxChars<0)throw Error('invalid-validation-cache-budget');
  this.maxEntries=maxEntries;this.maxChars=maxChars;
 }
 read(row,context,verify){
  if(!row||typeof row.key!=='string'||typeof row.checksum!=='string'||typeof context!=='string'||typeof verify!=='function')throw Error('invalid-validation-cache-record');
  const encoded=strictJSON(row.payload),key=JSON.stringify([context,row.key]),prior=this.#entries.get(key);
  if(prior&&prior.checksum===row.checksum&&prior.encoded===encoded){this.#entries.delete(key);this.#entries.set(key,prior);return row.payload;}
  // No checksum-only or revision-only shortcut: corrupted bytes or a new schema
  // always reenter the original checksum and contextual validation functions.
  verify(row.payload,row);
  if(prior){this.#entries.delete(key);this.#chars-=prior.encoded.length;}
  if(this.maxEntries&&encoded.length<=this.maxChars){
   while(this.#entries.size&&(this.#entries.size>=this.maxEntries||this.#chars+encoded.length>this.maxChars)){
    const oldest=this.#entries.keys().next().value;this.#chars-=this.#entries.get(oldest).encoded.length;this.#entries.delete(oldest);
   }
   this.#entries.set(key,{encoded,checksum:row.checksum});this.#chars+=encoded.length;
  }
  return row.payload;
 }
}
