import {stable} from '../../src/data/hash.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const type=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const own=(v,k)=>record(v)&&Object.hasOwn(v,k);
const fieldType=(v,k)=>own(v,k)?type(v[k]):'missing';
const increment=(hist,category)=>{hist[category]=(hist[category]??0)+1;};
function idCategory(v,present=true){
 if(!present)return 'missing';
 if(typeof v!=='string')return type(v);
 if(!v.length)return 'empty';
 if(v.length>256)return 'too-long';
 if(/[\s\u0000-\u001f\u007f]/.test(v))return 'whitespace-control';
 if(['__proto__','constructor','prototype'].includes(v))return 'reserved';
 return 'valid-string';
}
const idField=(v,k)=>idCategory(v?.[k],own(v,k));
const equal=(a,b)=>idCategory(a)==='valid-string'&&idCategory(b)==='valid-string'?(a===b?'equal':'different'):'incomparable';
function structure(v){
 const t=fieldType(v,'structure');if(t!=='string')return t;
 const s=v.structure;if(s.length>128)return 'too-long';
 return ['personal','workspace','team'].includes(s)?s:'other-string';
}
const flag=(v,k)=>fieldType(v,k)==='boolean'?(v[k]?'true':'false'):fieldType(v,k);
const group=()=>({entries:0,keyFormat:{},entryType:{},accountType:{},account_id:{},id:{},keyEqualsAccountId:{},keyEqualsId:{},fieldsEqual:{},structure:{},isDeactivated:{},sessionAccess:{},duplicateAccountIds:0,duplicateIds:0});
function alias(entries,value,field,check){
 const id=value?.account?.[field];if(idCategory(id)!=='valid-string')return {relation:'incomparable'};
 if(!Object.hasOwn(entries,id))return {relation:'canonical-missing'};
 const canonical=entries[id];let wholeEntryEqual='uncomparable';
 check();try{wholeEntryEqual=stable(value)===stable(canonical)?'equal':'different';}catch{}check();
 return {relation:'canonical-present',canonicalType:type(canonical),sameKey:id==='default',wholeEntryEqual};
}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
// Called only on bounded JSON in the explicitly authorized diagnostic. Every
// output key/category is fixed; input IDs, property names and values stay local.
export function summarizeAccountsStructure(body,{check=()=>{}}={}){
 check();const result={rootType:type(body),accountsType:fieldType(body,'accounts'),entryCount:null,overLimit:false,groups:{default:group(),ordinary:group()},defaultAlias:null};
 if(!record(body)||!record(body.accounts))return freeze(result);
 const entries=Object.entries(body.accounts);result.entryCount=entries.length;
 if(entries.length>1000){result.overLimit=true;return freeze(result);}
 const seenAccount=new Set(),seenId=new Set();
 try{for(const [key,value]of entries){
  check();const g=result.groups[key==='default'?'default':'ordinary'],a=record(value)?value.account:undefined;
  g.entries++;increment(g.keyFormat,idCategory(key));increment(g.entryType,type(value));increment(g.accountType,fieldType(value,'account'));
  increment(g.account_id,idField(a,'account_id'));increment(g.id,idField(a,'id'));
  increment(g.keyEqualsAccountId,equal(key,own(a,'account_id')?a.account_id:undefined));increment(g.keyEqualsId,equal(key,own(a,'id')?a.id:undefined));
  increment(g.fieldsEqual,equal(own(a,'account_id')?a.account_id:undefined,own(a,'id')?a.id:undefined));
  increment(g.structure,structure(a));increment(g.isDeactivated,flag(a,'is_deactivated'));increment(g.sessionAccess,flag(value,'can_access_with_session'));
  if(key==='default')result.defaultAlias={account_id:alias(body.accounts,value,'account_id',check),id:alias(body.accounts,value,'id',check)};
  else for(const [field,seen,count]of [['account_id',seenAccount,'duplicateAccountIds'],['id',seenId,'duplicateIds']])if(idField(a,field)==='valid-string'){if(seen.has(a[field]))g[count]++;seen.add(a[field]);}
 }}finally{seenAccount.clear();seenId.clear();}
 check();return freeze(result);
}
