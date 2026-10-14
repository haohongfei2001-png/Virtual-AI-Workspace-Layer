/** Deterministic JSON and SHA-256 for local corruption checks, not authentication. */
export function stable(value) {
  if(['function','symbol','bigint','undefined'].includes(typeof value))throw Error('non-json-value');
  if(value&&typeof value==='object'&&!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('non-json-object');
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw Error('non-json-value');
  return JSON.stringify(value);
}
const K = new Int32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const encoder = new TextEncoder();
const hexBytes = Array.from({length:256},(_,n)=>n.toString(16).padStart(2,'0'));
const rotate = (x,n)=>(x>>>n)|(x<<(32-n));
const initialHash = new Int32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
const workHash = new Int32Array(8), workWords = new Int32Array(64);
// Synchronous calls cannot overlap after input coercion. Retain at most 64 KiB;
// large payloads keep the exact-size allocation path instead of growing this buffer.
const smallBuffer = new Uint8Array(65536), smallView = new DataView(smallBuffer.buffer);
export function sha256(text) {
  // Convert before borrowing scratch memory: a caller's toString may reenter.
  if(typeof text==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  const input=text===undefined?'':String(text);let data,dv,length,byteLength;
  if(input.length<=21840){
    data=smallBuffer;dv=smallView;byteLength=encoder.encodeInto(input,data).written;
    length=Math.ceil((byteLength+9)/64)*64;data.fill(0,byteLength,length);
  }else{
    const bytes=encoder.encode(input);byteLength=bytes.length;length=Math.ceil((byteLength+9)/64)*64;
    data=new Uint8Array(length);data.set(bytes);dv=new DataView(data.buffer);
  }
  data[byteLength]=128;dv.setUint32(length-8,Math.floor(byteLength/0x20000000));dv.setUint32(length-4,byteLength*8>>>0);
  const H=workHash,w=workWords,r=rotate;H.set(initialHash);
  for (let p=0;p<length;p+=64) {
    for(let i=0;i<16;i++)w[i]=dv.getInt32(p+i*4);
    for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(r(x,7)^r(x,18)^(x>>>3))+w[i-16]+(r(y,17)^r(y,19)^(y>>>10))+w[i-7];}
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){const t1=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  let result='';
  for(const word of H)result+=hexBytes[word>>>24]+hexBytes[(word>>>16)&255]+hexBytes[(word>>>8)&255]+hexBytes[word&255];
  return result;
}
export function digest(value) { return sha256(stable(value)); }
