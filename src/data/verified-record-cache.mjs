/** Cache validation, never facts: every IDB read must match all payload bytes again. */
function strictJSON(value,onKeys=null,fields=null,counts=null){
 // Invalid count tables remain unset until the original integrity/schema check completes.
 if(onKeys&&(value===null||typeof value!=='object'||Array.isArray(value)))onKeys=null;
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
 let encoded='{',separator='';const keys=Object.keys(value);if(onKeys)onKeys(keys.length);
 for(const key of keys){const capture=fields?.has(key)?size=>{counts[key]=size;}:null;encoded+=separator+JSON.stringify(key)+':'+strictJSON(value[key],capture);separator=',';}
 return encoded+'}';
}
export class VerifiedRecordCache{
 #entries=new Map();#chars=0;
 constructor({maxEntries=2,maxChars=8*1024*1024}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<0||!Number.isSafeInteger(maxChars)||maxChars<0)throw Error('invalid-validation-cache-budget');
  this.maxEntries=maxEntries;this.maxChars=maxChars;
 }
 // Count requested top-level maps during the mandatory full-byte traversal.
 // No extra key arrays or retained metadata; each result belongs to this read.
 readWithCounts(row,context,verify,fields){
  if(!Array.isArray(fields)||fields.length>4||fields.some(field=>typeof field!=='string'||!field.length||field.length>64))throw Error('invalid-cache-count-fields');
  const counts=Object.create(null),payload=this.#read(row,context,verify,new Set(fields),counts);
  if(fields.some(field=>!Object.hasOwn(counts,field)))throw Error('invalid-cache-count-table');
  return {payload,counts};
 }
 read(row,context,verify){return this.#read(row,context,verify);}
 #read(row,context,verify,fields=null,counts=null){
  if(!row||typeof row.key!=='string'||typeof row.checksum!=='string'||typeof context!=='string'||typeof verify!=='function')throw Error('invalid-validation-cache-record');
  const encoded=strictJSON(row.payload,null,fields,counts),key=JSON.stringify([context,row.key]),prior=this.#entries.get(key);
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
