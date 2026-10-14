import {exactHostRecord} from './contract.mjs';
const fields=['theme','direction','fontFamily','baseFontSize'];
const generics=['system-ui','serif','sans-serif','monospace'];
/** Presentation only: none of these page-derived values can authorize a read. */
export function validateFrameAppearance(value){
 if(!exactHostRecord(value,fields)||Object.getPrototypeOf(value)!==Object.prototype||!['light','dark'].includes(value.theme)||!['ltr','rtl'].includes(value.direction)||!generics.includes(value.fontFamily)||!Number.isFinite(value.baseFontSize)||value.baseFontSize<12||value.baseFontSize>32)throw Error('invalid-frame-appearance');
 return Object.freeze({theme:value.theme,direction:value.direction,fontFamily:value.fontFamily,baseFontSize:value.baseFontSize});
}
function rgb(value){
 if(typeof value!=='string'||value.length>128)return null;
 const match=/^rgba?\(([^)]+)\)$/i.exec(value.trim());if(!match)return null;
 const parts=match[1].trim().split(/[\s,/]+/);if(parts.length<3||parts.length>4)return null;
 const component=(token,scale)=>/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(token)?Number.parseFloat(token)*(token.endsWith('%')?scale/100:1):NaN;
 const channels=parts.slice(0,3).map(v=>component(v,255)),alpha=parts.length===4?component(parts[3],1):1;
 if(channels.some(v=>!Number.isFinite(v)||v<0||v>255)||!Number.isFinite(alpha)||alpha<0||alpha>1)return null;
 return {channels,alpha};
}
function backgroundTheme(body,root){
 const b=rgb(body),r=rgb(root);let channels;
 if(b?.alpha===1)channels=b.channels;
 else if(r?.alpha===1)channels=b?.alpha>0?b.channels.map((v,i)=>v*b.alpha+r.channels[i]*(1-b.alpha)):r.channels;
 else return null;
 const linear=channels.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2]<.179?'dark':'light';
}
function genericFont(value){
 if(typeof value!=='string'||value.length>2048)return 'system-ui';
 for(const raw of value.split(',')){
  const token=raw.trim().replace(/^(['"])(.*)\1$/,'$2').toLowerCase();
  if(generics.includes(token))return token;
  if(['-apple-system','blinkmacsystemfont'].includes(token))return 'system-ui';
 }
 return 'system-ui';
}
export function readFrameAppearance(document){
 const root=document?.documentElement,win=document?.defaultView;if(!root||typeof win?.getComputedStyle!=='function')throw Error('invalid-frame-appearance-document');
 const rootStyle=win.getComputedStyle(root),bodyStyle=document.body?win.getComputedStyle(document.body):rootStyle;
 const schemes=[rootStyle.colorScheme,bodyStyle.colorScheme].map(v=>typeof v==='string'?v.trim():null);
 let theme=schemes.find(v=>v==='dark'||v==='light');
 if(!theme&&(root.classList?.contains('dark')||document.body?.classList?.contains('dark')))theme='dark';
 theme??=backgroundTheme(bodyStyle.backgroundColor,rootStyle.backgroundColor);
 theme??=win.matchMedia?.('(prefers-color-scheme: dark)')?.matches?'dark':'light';
 const parsed=Number.parseFloat(bodyStyle.fontSize||rootStyle.fontSize),baseFontSize=Number.isFinite(parsed)?Math.min(32,Math.max(12,parsed)):16;
 return validateFrameAppearance({theme,direction:(bodyStyle.direction||rootStyle.direction)==='rtl'?'rtl':'ltr',fontFamily:genericFont(bodyStyle.fontFamily||rootStyle.fontFamily),baseFontSize});
}
/** Own only these exact attributes/properties, restoring external values on clear. */
export function createFrameAppearance({document}={}){
 const root=document?.documentElement;if(!root?.getAttribute||!root?.setAttribute||!root?.removeAttribute||!root.style?.getPropertyValue||!root.style?.setProperty||!root.style?.removeProperty)throw Error('invalid-frame-appearance-document');
 const owned=new Map();
 const read=(kind,key)=>kind==='attribute'?{value:root.getAttribute(key),priority:''}:{value:root.style.getPropertyValue(key),priority:root.style.getPropertyPriority(key)};
 const same=(a,b)=>a.value===b.value&&a.priority===b.priority;
 function write(kind,key,value){
  const id=kind+':'+key,current=read(kind,key),prior=owned.get(id);
  const previous=prior&&same(current,prior.written)?prior.previous:current;
  if(kind==='attribute')root.setAttribute(key,value);else root.style.setProperty(key,value);
  owned.set(id,{kind,key,previous,written:read(kind,key)});
 }
 function apply(value){
  const appearance=validateFrameAppearance(value);
  write('attribute','data-vaiwl-theme',appearance.theme);write('attribute','dir',appearance.direction);
  write('style','color-scheme',appearance.theme);write('style','--vaiwl-font-family',appearance.fontFamily);write('style','--vaiwl-font-scale',String(appearance.baseFontSize/16));
  return appearance;
 }
 function clear(){
  for(const {kind,key,previous,written}of owned.values())if(same(read(kind,key),written)){
   if(kind==='attribute'){if(previous.value===null)root.removeAttribute(key);else root.setAttribute(key,previous.value);}
   else if(previous.value==='')root.style.removeProperty(key);else root.style.setProperty(key,previous.value,previous.priority);
  }
  owned.clear();
 }
 return Object.freeze({apply,clear});
}
