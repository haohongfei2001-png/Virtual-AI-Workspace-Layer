/** Cache validation, never facts: every IDB read must match all payload bytes again. */
function strictJSON(value){
 const type=typeof value;
 // NumberToString is the same finite-number representation JSON uses, including
 // negative zero. Avoid one native JSON call and one temporary array per scalar.
 if(type==='number'){if(!Number.isFinite(value))throw Error('non-json-value');return String(value);}
 if(type==='string'||type==='boolean'||value===null)return JSON.stringify(value);
 if(type!=='object')throw Error('non-json-value');
 if(Array.isArray(value)){
  let encoded='[';
  for(let index=0;index<value.length;index++)encoded+=(index?',':'')+strictJSON(value[index]);
  return encoded+']';
 }
 if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('non-json-object');
 // Never invoke toJSON or iterators. Preserve every key/value in read order;
 // building the string directly avoids a 100k-element intermediate map/join.
 let encoded='{',separator='';
 for(const key of Object.keys(value)){encoded+=separator+JSON.stringify(key)+':'+strictJSON(value[key]);separator=',';}
 return encoded+'}';
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
