/** Packaged route configuration only. This parser never establishes membership or scope. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token=value=>typeof value==='string'&&value.length>0&&value.length<=128&&/^[A-Za-z0-9_-]+$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const unsupported=(reason,navigationURL=null)=>({kind:'unsupported',navigationURL,reason});
export function createURLPolicy({origin='https://chatgpt.com',profile={}}={}){
 const base=new URL(origin),local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
 if(base.origin!==origin||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!(base.protocol==='https:'&&!base.port||local&&base.protocol==='http:'))throw Error('invalid-host-origin');
 const conversationId=profile.conversationId??(segment=>uuid.test(segment)?segment:null),projectId=profile.projectId??(()=>null),queries=profile.query??{},indexPath=profile.projectsIndexPath??'/projects';
 if(typeof conversationId!=='function'||typeof projectId!=='function'||!queries||typeof queries!=='object'||Array.isArray(queries))throw Error('invalid-url-profile');
 const queryRules=new Map();for(const [key,rule]of Object.entries(queries)){
  if(!key||!rule||!['temporary','identity','display'].includes(rule.semantic)||!Array.isArray(rule.values)||!rule.values.length||rule.values.some(v=>typeof v!=='string'))throw Error('invalid-url-query-profile');
  queryRules.set(key,{semantic:rule.semantic,values:new Set(rule.values)});
 }
 function checked(input){
  if(typeof input!=='string'||!input||input.length>8192||input.trim()!==input||/[\u0000-\u0020\u007f\\]/.test(input))return {error:'invalid-native-url'};
  if(!(input.startsWith('/')&&!input.startsWith('//')||/^https?:\/\//i.test(input)))return {error:'invalid-native-scheme'};
  let url;try{url=new URL(input,origin);}catch{return {error:'invalid-native-url'};}
  if(url.origin!==origin||url.username||url.password||url.protocol!==base.protocol)return {error:'foreign-native-origin'};
  // URL normalizes explicit :443 away; inspect original authority as well.
  const authority=input.match(/^https?:\/\/([^/?#]*)/i)?.[1];if(authority&&!local&&authority.includes(':'))return {error:'native-port-not-allowed'};
  const rawPath=input.replace(/^https?:\/\/[^/?#]*/i,'').split(/[?#]/,1)[0]||'/';
  if(/%(?![0-9a-f]{2})/i.test(input)||/%(?:2f|5c|25|00)/i.test(rawPath))return {error:'ambiguous-native-encoding'};
  let segments;try{segments=rawPath.split('/').map(decodeURIComponent);}catch{return {error:'invalid-native-encoding'};}
  if(segments.some(s=>s==='.'||s==='..'||/[\u0000-\u001f\u007f\\/]/.test(s)))return {error:'ambiguous-native-path'};
  if(url.hash)return {error:'unsupported-native-fragment'};
  const seen=new Set(),identity=[];let temporary=false;
  for(const [key,value]of url.searchParams){const rule=queryRules.get(key);if(!rule||!rule.values.has(value)||seen.has(key))return {error:'unsupported-native-query'};seen.add(key);if(rule.semantic==='temporary')temporary=true;if(rule.semantic==='identity')identity.push([key,value]);}
  identity.sort(([a],[b])=>a<b?-1:a>b?1:0);
  return {url,segments:segments.slice(1),temporary,identity};
 }
 function parse(input){
  const value=checked(input);if(value.error)return unsupported(value.error);
  const {url,segments:s,temporary}=value,navigationURL=url.href;
  const result=route=>temporary?{kind:'temporary',navigationURL}:route;
  if(url.pathname==='/')return result({kind:'home',navigationURL});
  if(url.pathname===indexPath)return result({kind:'projects-index',navigationURL});
  if(s.length===2&&s[0]==='share'&&token(s[1]))return result({kind:'shared-view',navigationURL});
  const ordinary=s.length===2&&s[0]==='c',container=s.length===4&&s[0]==='g'&&token(s[1])&&s[2]==='c';
  if(ordinary||container){let id;try{id=conversationId(s.at(-1));}catch{return unsupported('conflicting-conversation-grammar',navigationURL);}if(!token(id))return unsupported('unknown-conversation-grammar',navigationURL);return result({kind:'conversation',conversationId:id,containerHint:container?s[1]:null,navigationURL});}
  if(s.length===3&&s[0]==='g'&&token(s[1])&&s[2]==='project'){
   let id;try{id=projectId(Object.freeze({container:s[1],segments:Object.freeze([...s])}));}catch{return unsupported('conflicting-project-grammar',navigationURL);}
   if(id===null||id===undefined)return result({kind:'project-candidate',containerHint:s[1],navigationURL});
   if(!token(id))return unsupported('invalid-project-grammar-result',navigationURL);
   return result({kind:'project',projectId:id,navigationURL});
  }
  return unsupported('unsupported-native-route',navigationURL);
 }
 function nativeHref(input){const route=parse(input);return route.kind==='unsupported'?null:route.navigationURL;}
 function sameTarget(a,b){const left=parse(a),right=parse(b);if(left.kind==='unsupported'||left.kind!==right.kind)return false;
  if(JSON.stringify(checked(a).identity)!==JSON.stringify(checked(b).identity))return false;
  if(left.kind==='conversation')return left.conversationId===right.conversationId;
  if(left.kind==='project')return left.projectId===right.projectId;
  // Unidentified candidates/shared/temporary routes cannot collapse by a label.
  return left.navigationURL===right.navigationURL;
 }
 return Object.freeze({parse,nativeHref,sameTarget});
}
