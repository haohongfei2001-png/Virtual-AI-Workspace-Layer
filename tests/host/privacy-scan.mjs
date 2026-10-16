// Pure, serializable scanner. Only fixed labels/counters leave the scanned realm.
export function createPrivacyScanner(sentinels) {
 const labels=['token','cookie','body','draft'];
 if(labels.some(k=>typeof sentinels[k]!=='string'||!sentinels[k]))throw Error('invalid-privacy-sentinels');
 const result={values:0,strings:0,unsupported:0,hits:Object.fromEntries(labels.map(k=>[k,0]))};
 const string=s=>{result.strings++;for(const k of labels)if(s.includes(sentinels[k]))result.hits[k]++;};
 function scan(value){const seen=new WeakSet();function visit(v){result.values++;if(typeof v==='string'){string(v);return;}if(v===null||typeof v!=='object')return;if(seen.has(v))return;seen.add(v);
  if(v instanceof ArrayBuffer||ArrayBuffer.isView(v)){string(new TextDecoder().decode(v instanceof ArrayBuffer?new Uint8Array(v):new Uint8Array(v.buffer,v.byteOffset,v.byteLength)));return;}
  if(v instanceof Map){for(const [k,x] of v){visit(k);visit(x);}return;}if(v instanceof Set){for(const x of v)visit(x);return;}
  if(v instanceof Date)return;
  if(typeof Blob!=='undefined'&&v instanceof Blob){result.unsupported++;return;}
  for(const [k,d] of Object.entries(Object.getOwnPropertyDescriptors(v))){string(k);if('value'in d)visit(d.value);else result.unsupported++;}
 }visit(value);return snapshot();}
 function snapshot(){return {values:result.values,strings:result.strings,unsupported:result.unsupported,hits:{...result.hits}};}
 return {scan,snapshot};
}
