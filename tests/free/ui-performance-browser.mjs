/** UI_SYNTHETIC: real navigation DOM under CDP CPU throttling; NOT an IDB/broker/account end-to-end benchmark. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {platform,arch,cpus} from 'node:os';import assert from 'node:assert/strict';
const output=process.argv[2]??'/private/tmp/free-ui-performance.json';
const files=[...(await readdir('src/navigation')).filter(f=>f.endsWith('.mjs')).map(f=>'src/navigation/'+f),'src/data/free-replica.mjs','src/data/free-activity.mjs','src/data/free-time-policy.mjs','src/data/cooperate.mjs','simulator/adapter.mjs','tests/free/ui-performance-browser.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const sourceHashes=await hashes(),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const results=[],errors=[];
try{
 browser=await chromium.launch({headless:true});
 for(const size of (process.env.VAIWL_UI_PERF_SIZES??"1000,10000,100000").split(",").map(Number))for(const distribution of ['project-mixed','none-heavy']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push({size,distribution,message:e.message}));
  await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const result=await page.evaluate(async({size,distribution})=>{
   const {planFreeReplica,freeReplicaRequests,assembleFreeReplicaAsync}=await import('/src/data/free-replica.mjs'),{freeNavigationSnapshot}=await import('/src/navigation/free-view.mjs'),{currentIndexAsync}=await import('/src/navigation/current-index.mjs'),{createNavigation}=await import('/src/navigation/navigation.mjs'),{createAdapter}=await import('/simulator/adapter.mjs'),{createFreeViewSession}=await import('/src/data/free-time-policy.mjs');
   const now='2026-10-13T12:00:00Z',scope='ui-performance-synthetic-A',session=createFreeViewSession({now,timeZone:'Asia/Shanghai'}),refs=new Map(),projects=new Map(),refVersions={},projectVersions={},activityVersions={};
   const generationStart=performance.now();
   for(let i=0;i<size;i++){
    const id='perf_'+String(i).padStart(6,'0'),grouped=distribution==='project-mixed'?i%5!==4:i%10===0,projectId=grouped?'project_'+Math.floor(i/100):null,age=Math.floor(i/100)%6*30+i%25,candidateTime=new Date(Date.parse(now)-age*86400000).toISOString();
    if(grouped&&!projects.has(projectId)){projects.set(projectId,{id:projectId,key:JSON.stringify([scope,projectId]),scope,nativeName:'原生项目 '+projectId,nativeAliases:[],nativeUrl:location.origin+'/hf/A/project/'+projectId,memberCount:0,membershipWitnessCurrent:true,membershipWitness:{sourceId:"perf",generation:1,sourceRevision:1}});projectVersions[projectId]=1;}
    if(grouped)projects.get(projectId).memberCount++;
    refs.set(id,{id,scope,nativeTitle:'原生中文聊天 '+id+' · 用于真实导航组件的大规模合成历史与原名查找，保留完整标题和 English 混合文字',nativeAliases:[],nativeUrl:location.origin+'/hf/A/c/'+id,membership:grouped?'PROJECT':'NONE',projectId,membershipWitnessCurrent:grouped,membershipWitness:grouped?{sourceId:"perf",generation:1,sourceRevision:1}:null,activityDecision:{objectKey:id,evidenceRevision:1,basis:'exact',candidateDay:session.T-age,candidateTime,segment:Math.floor(age/30),reason:age<30?'positive-send':'covered-history'}});refVersions[id]=1;activityVersions[id]='event1';
   }
   const header={scope,revision:1,evidenceRevision:'1:1',workspaceRevision:1,viewRevision:0,preferences:{},inventoryComplete:true,activitySourceRevision:'synthetic-source1',visibilityRevision:'active',membershipWitnessRevision:'source1',evaluatedAt:now,viewSession:session,manifest:{refVersions,projectVersions,activityVersions}},plan=planFreeReplica(null,header),pages=freeReplicaRequests(plan,1000).map(ids=>({scope,revision:1,evidenceRevision:'1:1',projects:ids.projects.map(id=>projects.get(id)),refs:ids.refs.map(id=>refs.get(id))}));
   const generationMs=performance.now()-generationStart;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const longTasks=[];const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push({startTime:entry.startTime,duration:entry.duration});});observer.observe({type:'longtask',buffered:false});
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),rounded=n=>Math.round(n*1000)/1000;
   const ownedNodes=()=>[...document.querySelectorAll('[data-vaiwl-owned]')].reduce((n,root)=>n+1+(root.shadowRoot?.querySelectorAll('*').length??root.querySelectorAll('*').length),0);
   const start=performance.now(),assembled=await assembleFreeReplicaAsync(null,header,pages,plan,()=>true),assemblyMs=performance.now()-start;
   const preparedStart=performance.now(),snapshot=freeNavigationSnapshot(assembled.snapshot),index=await currentIndexAsync(snapshot,snapshot.groups,()=>true),prepareMs=performance.now()-preparedStart;
   const navigation=createNavigation({document,adapter:createAdapter()}),mountStart=performance.now();navigation.update(snapshot,now,'Asia/Shanghai',index);navigation.showWorkspace();await frame();const mountedAt=performance.now(),initialNodes=ownedNodes();
   if(navigation.status().state!=='ACTIVE')throw Error('navigation-not-mounted');
   const measurements=[],measure=async(name,action)=>{const began=performance.now();action();const syncEnded=performance.now();await frame();const ended=performance.now();const value={name,startedAt:began,syncMs:syncEnded-began,paintMs:ended-began,nodes:ownedNodes()};measurements.push(value);return value;};
   const findButton=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label);
   for(let i=0;i<20;i++){
    const label=i%2===0?'较早的30日':'较近的30日',button=findButton(navigation.roots().workspace.shadow,label);if(!button||button.disabled)throw Error('history-button-unavailable');
    await measure('history',()=>button.click());if(navigation.view().segment!==(i%2===0?1:0))throw Error('history-navigation-failed');
   }
   await measure('search-open',()=>findButton(navigation.roots().sidebar.shadow,'查找已知项目与聊天').click());
   const input=navigation.roots().workspace.shadow.querySelector('input[type="search"]'),tail='perf_'+String(size-1).padStart(6,'0');
   for(let i=0;i<12;i++){
    const query=i%3===0?tail:i%3===1?'不存在的合成目标':'原生中文聊天';
    await measure('search',()=>{input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}));});
    const count=navigation.roots().workspace.shadow.querySelectorAll('.search-results a[data-ref-id]').length;
    if(i%3===0&&count!==1||i%3===1&&count!==0||i%3===2&&count!==24)throw Error('search-first-screen-incomplete');
   }
   await frame();observer.disconnect();
   const summarize=name=>{const rows=measurements.filter(m=>m.name===name),values=rows.map(m=>m.paintMs).sort((a,b)=>a-b),sync=rows.map(m=>m.syncMs).sort((a,b)=>a-b);return {samples:rows.length,paintP50Ms:rounded(values[Math.floor((values.length-1)*.5)]),paintP95Ms:rounded(values[Math.ceil(values.length*.95)-1]),paintMaxMs:rounded(values.at(-1)),handlerP95Ms:rounded(sync[Math.ceil(sync.length*.95)-1]),maxOwnedDomNodes:Math.max(...rows.map(m=>m.nodes))};};
   const longTaskPhase=(from,to)=>{const rows=longTasks.filter(t=>t.startTime<to&&t.startTime+t.duration>from);return {count:rows.length,totalMs:rounded(rows.reduce((n,t)=>n+t.duration,0)),maxMs:rounded(Math.max(0,...rows.map(t=>t.duration)))};};
   const history=summarize('history'),search=summarize('search'),searchOpen=summarize('search-open'),end=performance.now(),result={size,distribution,projects:projects.size,noProject:assembled.snapshot.noProject.length,cpuThrottle:4,fixtureGenerationMs:rounded(generationMs),initial:{assemblyMs:rounded(assemblyMs),viewAndIndexMs:rounded(prepareMs),mountToPaintMs:rounded(mountedAt-mountStart),totalToPaintMs:rounded(mountedAt-start),ownedDomNodes:initialNodes},history,search,searchOpen,longTasks:{initial:longTaskPhase(start,mountedAt),interactive:longTaskPhase(mountedAt,end)},targets:{requiredAcceptance:size===10000,role:size===10000?'10k-plan-acceptance':'stress-or-sanity-observation',historyP95Under150ms:history.paintP95Ms<150,searchP95Under300ms:search.paintP95Ms<300}};
   navigation.stop();if(document.querySelector('[data-vaiwl-mask]'))throw Error('native-mask-not-restored');return result;
  },{size,distribution});
  results.push(result);console.log(JSON.stringify(result));await page.close();
 }
 const finalHashes=await hashes(),report={evidence:'UI_SYNTHETIC_HEADLESS_CDP4X',scope:'Existing Free projection/replica/navigation components on synthetic native host; no IndexedDB/broker/source/network acquisition timing and no real-account or physical weak-device certification.',browser:browser.version(),headless:true,platform:platform(),arch:arch(),cpu:cpus()[0]?.model??null,viewport:{width:1440,height:1000},sourceHashes,sourceChangedDuringRun:JSON.stringify(sourceHashes)!==JSON.stringify(finalHashes),results,errors,pass:results.length,fail:errors.length,targetMisses:results.filter(r=>r.targets.requiredAcceptance&&(!r.targets.historyP95Under150ms||!r.targets.searchP95Under300ms)).map(r=>({size:r.size,distribution:r.distribution,targets:r.targets}))};
 await writeFile(output,JSON.stringify(report,null,2)+'\n');assert.deepEqual(errors,[]);assert.equal(report.sourceChangedDuringRun,false,'source changed during benchmark');console.log(JSON.stringify({report:output,pass:report.pass,fail:report.fail,targetMisses:report.targetMisses}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
