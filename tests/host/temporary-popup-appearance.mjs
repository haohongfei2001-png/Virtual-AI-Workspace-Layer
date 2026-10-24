import assert from 'node:assert/strict';
// Browser-owned computed colors, including transparent ancestor backgrounds.
// Runs only in the isolated popup fixture; never shipped in the extension.
export function readTemporaryAppearance(){
 const root=document.querySelector('body>div')?.shadowRoot;if(!root)throw Error('missing-popup-root');
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;
 const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
 const background=node=>{for(let n=node;n;n=n.parentElement??n.getRootNode()?.host){const c=rgba(getComputedStyle(n).backgroundColor);if(c[3]===255)return c.slice(0,3);if(c[3]!==0)throw Error('unsupported-translucent-background');}throw Error('missing-opaque-background');};
 const samples=[];
 for(const selector of ['h1','.card h2','a.row','.notice','button','input'])for(const node of root.querySelectorAll(selector)){
  if(!node.checkVisibility())continue;const style=getComputedStyle(node),fg=rgba(style.color);if(fg[3]!==255||Number(style.opacity)!==1)throw Error('unsupported-transparent-text');
  samples.push({selector,foreground:fg.slice(0,3),background:background(node),hover:node.matches(':hover')});
 }
 const input=root.querySelector('input'),placeholder=getComputedStyle(input,'::placeholder');samples.push({selector:'input::placeholder',foreground:rgba(placeholder.color).slice(0,3),background:background(input),opacity:Number(placeholder.opacity)});
 const rect=n=>{const b=n.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
 const main=root.querySelector('main'),layout={main:rect(main),scrollWidth:main.scrollWidth,clientWidth:main.clientWidth,scrollHeight:main.scrollHeight,scrollbarWidth:getComputedStyle(main).scrollbarWidth,documentScrollTop:document.documentElement.scrollTop,root:{clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,overflow:getComputedStyle(document.documentElement).overflow,scrollbarWidth:getComputedStyle(document.documentElement).scrollbarWidth},body:{...rect(document.body),scrollHeight:document.body.scrollHeight,overflow:getComputedStyle(document.body).overflow}};
 const active=root.activeElement,focus=active?{tag:active.tagName,rect:rect(active),visible:active.matches(':focus-visible'),width:parseFloat(getComputedStyle(active).outlineWidth),style:getComputedStyle(active).outlineStyle,foreground:rgba(getComputedStyle(active).outlineColor).slice(0,3),background:background(active.parentElement)}:null;
 return {viewport:{width:innerWidth,height:innerHeight},layout,dark:matchMedia('(prefers-color-scheme: dark)').matches,forced:matchMedia('(forced-colors: active)').matches,samples,focus};
}
export function contrast(a,b){const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function assertTemporaryAppearance(snapshot,{focusTag=null}={}){
 const {viewport:v,layout:l}=snapshot;
 assert(v.width>=320&&v.width<=570&&v.height>=320&&v.height<=550,'native popup must allocate usable space');
 assert.equal(l.main.width,v.width);assert.equal(l.main.height,v.height);assert.equal(l.main.left,0);assert.equal(l.main.top,0);assert.equal(l.scrollWidth,l.clientWidth);assert.equal(l.documentScrollTop,0);
 assert(snapshot.samples.some(r=>r.selector==='a.row'),'native result must be rendered');
 for(const row of snapshot.samples){assert.equal(row.opacity??1,1);assert(contrast(row.foreground,row.background)>=4.5,`${row.selector} text contrast ${contrast(row.foreground,row.background).toFixed(3)}`);}
 if(focusTag){const f=snapshot.focus;assert.equal(f?.tag,focusTag);assert.equal(f.visible,true);const x=(f.rect.left+f.rect.right)/2,y=(f.rect.top+f.rect.bottom)/2;assert(x>4&&x<v.width-4&&y>4&&y<v.height-4,'keyboard target center must be inside visible scrollport');assert(f.width>=2&&f.style!=='none');assert(contrast(f.foreground,f.background)>=3,'visible focus contrast');}
}
