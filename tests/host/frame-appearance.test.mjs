import test from 'node:test';
import assert from 'node:assert/strict';
import {readFrameAppearance,validateFrameAppearance,createFrameAppearance} from '../../src/host/frame-appearance.mjs';
const dto={theme:'light',direction:'ltr',fontFamily:'system-ui',baseFontSize:16};
function fixture({rootStyle={},bodyStyle={},dark=false,media=false}={}){
 const attrs=new Map(),css=new Map();const style={getPropertyValue:k=>css.get(k)?.value??'',getPropertyPriority:k=>css.get(k)?.priority??'',setProperty:(k,value,priority='')=>css.set(k,{value:String(value),priority}),removeProperty:k=>css.delete(k)};
 const root={getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k),style,classList:{contains:k=>k==='dark'&&dark}};
 const body={classList:{contains:()=>false}},base={colorScheme:'normal',backgroundColor:'rgba(0, 0, 0, 0)',direction:'ltr',fontSize:'16px',fontFamily:'system-ui'};
 const document={documentElement:root,body,defaultView:{getComputedStyle:n=>({...base,...(n===root?rootStyle:bodyStyle)}),matchMedia:()=>({matches:media})}};
 return {document,root,attrs,css};
}
test('strict valid appearance yields frozen independent allowlisted copy',()=>{for(const theme of ['light','dark'])for(const direction of ['ltr','rtl'])for(const fontFamily of ['system-ui','serif','sans-serif','monospace']){const input={...dto,theme,direction,fontFamily},result=validateFrameAppearance(input);assert.deepEqual(result,input);assert(Object.isFrozen(result));assert.notEqual(result,input);input.theme='invalid';assert.equal(result.theme,theme);}});
test('reject extras prototypes symbols accessors and invalid numeric or string values without invoking getters',()=>{
 const values=[null,[],{},Object.create(dto),Object.assign(Object.create(null),dto),{...dto,extra:true},{...dto,[Symbol('x')]:1},...['theme','direction','fontFamily','baseFontSize'].map(key=>{const v={...dto};delete v[key];return v;}),...['auto','DARK','url(secret)'].map(theme=>({...dto,theme})),...['auto','RTL',null].map(direction=>({...dto,direction})),...['Arial','url(secret)','system-ui; color:red'].map(fontFamily=>({...dto,fontFamily})),...[NaN,Infinity,-Infinity,11.99,32.01,'16',null].map(baseFontSize=>({...dto,baseFontSize}))];
 let calls=0;const getter={...dto};Object.defineProperty(getter,'theme',{get(){calls++;return 'light';}});values.push(getter);
 for(const value of values)assert.throws(()=>validateFrameAppearance(value),/invalid-frame-appearance/);assert.equal(calls,0);
});
test('explicit single computed scheme precedes dark class and background fallback',()=>{
 for(const theme of ['light','dark']){const f=fixture({rootStyle:{colorScheme:theme,backgroundColor:theme==='light'?'rgb(0,0,0)':'rgb(255,255,255)'},dark:true,media:theme==='light'});assert.equal(readFrameAppearance(f.document).theme,theme);}
 assert.equal(readFrameAppearance(fixture({rootStyle:{colorScheme:'light dark'},dark:true}).document).theme,'dark');
});
test('background luminance uses body then opaque html and transparent fallback to media',()=>{
 for(const [body,root,want] of [['rgb(250, 250, 250)','rgb(0,0,0)','light'],['rgb(8 8 8 / 100%)','rgb(255,255,255)','dark'],['rgba(0,0,0,0)','rgb(0 0 0)','dark'],['rgba(0,0,0,.5)','rgb(255,255,255)','light'],['rgb(100% 100% 100%)','rgba(0,0,0,0)','light']])assert.equal(readFrameAppearance(fixture({bodyStyle:{backgroundColor:body},rootStyle:{backgroundColor:root},media:want==='light'}).document).theme,want);
 for(const media of [true,false])assert.equal(readFrameAppearance(fixture({media,bodyStyle:{backgroundColor:'invalid'}}).document).theme,media?'dark':'light');
});
test('font transfer maps only a generic token and clamps numeric size with safe defaults',()=>{
 for(const [font,want] of [['"Private Font", serif','serif'],['Arial, sans-serif','sans-serif'],['-apple-system, sans-serif','system-ui'],['"SF Mono", monospace','monospace'],['url(https://secret.invalid/font)','system-ui'],['Secret font','system-ui']])assert.equal(readFrameAppearance(fixture({bodyStyle:{fontFamily:font}}).document).fontFamily,want);
 for(const [size,want] of [['1px',12],['80px',32],['19.5px',19.5],['NaN',16],['Infinity',16]])assert.equal(readFrameAppearance(fixture({bodyStyle:{fontSize:size,direction:'rtl'}}).document).baseFontSize,want);
 assert.equal(readFrameAppearance(fixture({bodyStyle:{direction:'rtl'}}).document).direction,'rtl');
});
test('apply updates theme direction and font variables; clear restores exact prior values and priority',()=>{
 const f=fixture();f.root.setAttribute('dir','rtl');f.root.style.setProperty('color-scheme','light dark','important');f.root.style.setProperty('--vaiwl-font-scale','1.1');
 const owner=createFrameAppearance({document:f.document});owner.apply({...dto,theme:'dark',baseFontSize:20,fontFamily:'serif'});assert.equal(f.root.getAttribute('data-vaiwl-theme'),'dark');assert.equal(f.root.getAttribute('dir'),'ltr');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-scale'),'1.25');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-family'),'serif');assert.equal(f.root.style.getPropertyValue('color-scheme'),'dark');
 owner.apply({...dto,direction:'rtl'});assert.equal(f.root.getAttribute('data-vaiwl-theme'),'light');owner.clear();owner.clear();assert.equal(f.root.getAttribute('data-vaiwl-theme'),null);assert.equal(f.root.getAttribute('dir'),'rtl');assert.equal(f.root.style.getPropertyValue('color-scheme'),'light dark');assert.equal(f.root.style.getPropertyPriority('color-scheme'),'important');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-scale'),'1.1');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-family'),'');
});
test('clear never overwrites intervening changes, including equal value with external priority',()=>{
 const f=fixture(),owner=createFrameAppearance({document:f.document});owner.apply(dto);f.root.setAttribute('dir','rtl');f.root.setAttribute('data-vaiwl-theme','external');f.root.style.setProperty('color-scheme','light','important');f.root.style.setProperty('--vaiwl-font-family','serif');owner.clear();assert.equal(f.root.getAttribute('dir'),'rtl');assert.equal(f.root.getAttribute('data-vaiwl-theme'),'external');assert.equal(f.root.style.getPropertyPriority('color-scheme'),'important');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-family'),'serif');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-scale'),'');
});
test('reapply after external changes restores the new external baseline, invalid apply mutates nothing',()=>{
 const f=fixture(),owner=createFrameAppearance({document:f.document});owner.apply(dto);f.root.setAttribute('dir','rtl');owner.apply({...dto,theme:'dark'});assert.throws(()=>owner.apply({...dto,baseFontSize:NaN}));assert.equal(f.root.getAttribute('data-vaiwl-theme'),'dark');owner.clear();assert.equal(f.root.getAttribute('dir'),'rtl');
});

// Host canvas colors are presentation metadata, not arbitrary CSS or identity.
test('proved region resolves its neutral opaque canvas through transparent ancestors',()=>{
 const f=fixture(),parent={ownerDocument:f.document,isConnected:true,parentElement:f.document.documentElement},region={ownerDocument:f.document,isConnected:true,parentElement:parent};
 const original=f.document.defaultView.getComputedStyle;
 f.document.defaultView.getComputedStyle=n=>n===region?{backgroundColor:'rgba(0,0,0,0)',backgroundImage:'none',opacity:'1'}:n===parent?{backgroundColor:'rgb(246, 246, 246)',backgroundImage:'none',opacity:'1'}:original(n);
 assert.equal(readFrameAppearance(f.document,{region}).canvas,'#f6f6f6');
 region.ownerDocument={};assert.equal(readFrameAppearance(f.document,{region}).canvas,undefined);
});
test('canvas rejects images, translucent paint, chromatic colors and incompatible contrast',()=>{
 for(const patch of [{backgroundImage:'url(private)'},{backgroundColor:'rgba(245,245,245,.5)'},{backgroundColor:'rgb(255,0,0)'},{backgroundColor:'rgb(20,20,20)'},{opacity:'.5'}]){
  const f=fixture(),region={ownerDocument:f.document,isConnected:true,parentElement:f.root};const original=f.document.defaultView.getComputedStyle;
  f.document.defaultView.getComputedStyle=n=>n===region?{backgroundColor:'rgb(246,246,246)',backgroundImage:'none',opacity:'1',...patch}:original(n);
  assert.equal(readFrameAppearance(f.document,{region}).canvas,undefined);
 }
 for(const canvas of ['url(secret)','#ffffff;display:none','#ff0000','#111111','#e0e0e0',null])assert.throws(()=>validateFrameAppearance({...dto,canvas}));
 assert.equal(validateFrameAppearance({...dto,theme:'dark',canvas:'#212121'}).canvas,'#212121');
});
test('canvas override is role-local and removed on fallback without overwriting external style',()=>{
 const f=fixture(),owner=createFrameAppearance({document:f.document});f.root.style.setProperty('--vaiwl-canvas','#fafafa','important');
 owner.apply({...dto,canvas:'#f6f6f6'});assert.equal(f.root.style.getPropertyValue('--vaiwl-canvas'),'#f6f6f6');
 owner.apply(dto);assert.equal(f.root.style.getPropertyValue('--vaiwl-canvas'),'#fafafa');assert.equal(f.root.style.getPropertyPriority('--vaiwl-canvas'),'important');
 owner.apply({...dto,canvas:'#eeeeee'});f.root.style.setProperty('--vaiwl-canvas','#ffffff');owner.clear();assert.equal(f.root.style.getPropertyValue('--vaiwl-canvas'),'#ffffff');
});
