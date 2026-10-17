import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {emptyNativeFacts,validateNativeFacts,validateAndMeasureNativeFacts} from '/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer/src/data/native-facts.mjs';
import {A} from '/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer/tests/b23/contracts.mjs';
const f=emptyNativeFacts(A);f.format='vaiwl-native-facts-v2';f.revision=1;const w={sourceId:'fixture',generation:'one',sourceRevision:1,observedAt:'2026-10-13T00:00:00Z',validUntil:'2026-10-14T00:00:00Z'};
f.sources.fixture={id:'fixture',generation:'one',sourceRevision:1,observedAt:w.observedAt,validUntil:w.validUntil,revoked:false,channel:'synthetic',inventory:{projects:'partial',conversations:'partial',cursor:null}};
for(let i=0;i<5000;i++){const id='r'+i;f.refs[id]={id,nativeTitle:'原生标题 '+i+'😀',nativeAliases:['历史标题 '+i,'标题\\"\n'+i],nativeUrl:'https://fixture.test/c/'+id,availability:'available',...w};f.membership[id]={id,state:'NONE',projectId:null,...w};}
const header=JSON.stringify({...f,refs:{},membership:{}}).length;
const old=()=>{validateNativeFacts(f,A);let total=header;for(const t of ['refs','membership']){let n=0;for(const [key,row] of Object.entries(f[t]))total+=JSON.stringify(key).length+1+JSON.stringify(row).length+(n++?1:0);}return total;};
const next=()=>validateAndMeasureNativeFacts(f,A).jsonLength;
const expected=JSON.stringify(f).length;for(const fn of [old,next,old,next])if(fn()!==expected)throw Error('size mismatch');
const samples={prior:[],measured:[]};for(let i=0;i<12;i++)for(const key of i%2?['measured','prior']:['prior','measured']){const start=performance.now();if((key==='prior'?old:next)()!==expected)throw Error('size mismatch');samples[key].push(performance.now()-start);}
const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
await writeFile('/private/tmp/free-round103-measure-benchmark.json',JSON.stringify({evidence:'NODE_DIAGNOSTIC_5000_ROW_VALIDATION_AND_AUDIT_ENCODING_ONLY',limitations:'No IDB/checksum/Chrome/throttle latency certification; prior and optimized algorithms use same data in this process',node:process.version,jsonLength:expected,refCount:5000,samples,medianMs:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,median(v)]))},null,2)+'\n');
