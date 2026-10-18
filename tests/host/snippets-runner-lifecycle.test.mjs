import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {snippetsRunnerPaths,runSnippetsLifecycle} from './snippets-runner-lifecycle.mjs';

for(const [platform,expected]of [['darwin','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],['linux','/usr/bin/chromium']])test(`${platform} uses system temp and its explicit browser default`,()=>{
 const paths=snippetsRunnerPaths({platform,env:{},temp:'/owned temp'});
 assert.deepEqual(paths,{executablePath:expected,tempPrefix:join('/owned temp','vaiwl-snippets-package-'),output:join('/owned temp','host-snippets-package-mv3.json')});
});
test('explicit browser and output are preserved, including spaces and Windows paths',()=>{
 const paths=snippetsRunnerPaths({platform:'win32',env:{FREE_CHROME_EXECUTABLE:'C:\\Program Files\\Chrome\\chrome.exe'},temp:'temporary',output:'chosen.json'});
 assert.equal(paths.executablePath,'C:\\Program Files\\Chrome\\chrome.exe');assert.equal(paths.output,'chosen.json');
});
for(const options of [{platform:'win32',env:{}},{env:{FREE_CHROME_EXECUTABLE:''}},{env:{FREE_CHROME_EXECUTABLE:'   '}}])test('missing or empty explicit browser fails clearly',()=>assert.throws(()=>snippetsRunnerPaths(options),/FREE_CHROME_EXECUTABLE/));

function fixture(overrides={}){
 const report={status:'NOT_RUN',results:[]},calls=[],saved=[],diagnostics=[];
 const options={report,output:'report.json',execute:async({own})=>{
  own('server',async()=>calls.push('server'));own('context',async()=>calls.push('context'));calls.push('execute');
 },integrityChecks:[['source-integrity',async()=>calls.push('source')],['package-integrity',async()=>calls.push('package')]],writeReport:async(path,text)=>{calls.push('write');saved.push({path,report:JSON.parse(text)});},diagnostic:message=>diagnostics.push(message),...overrides};
 return {report,calls,saved,diagnostics,options};
}
test('successful execution closes both resources and checks integrity before writing PASS',async()=>{
 const f=fixture(),result=await runSnippetsLifecycle(f.options);
 assert.equal(result.exitCode,0);assert.equal(result.reportWritten,true);assert.deepEqual(f.calls,['execute','context','server','source','package','write']);assert.equal(f.saved[0].report.status,'PASS');
});
for(const stage of ['before-resources','after-server','after-context'])test(`${stage} failure closes exactly the acquired resources and writes the original failure`,async()=>{
 const f=fixture();f.options.execute=async({own})=>{if(stage==='before-resources')throw Error(stage);own('server',()=>f.calls.push('server'));if(stage==='after-server')throw Error(stage);own('context',()=>f.calls.push('context'));throw Error(stage);};
 const result=await runSnippetsLifecycle(f.options);assert.equal(result.exitCode,1);assert.equal(result.reportWritten,true);assert.match(f.saved[0].report.error,new RegExp(stage));
 assert.deepEqual(f.calls,[...(stage==='after-context'?['context']:[]),...(stage!=='before-resources'?['server']:[]),'source','package','write']);
});
test('failure diagnostics do not replace the primary error or prevent cleanup',async()=>{
 const f=fixture();f.options.execute=async({own})=>{own('server',()=>f.calls.push('server'));throw Error('original');};f.options.inspectFailure=async()=>{throw Error('screenshot-failed');};
 const result=await runSnippetsLifecycle(f.options);assert.equal(result.exitCode,1);assert.match(f.report.error,/original/);assert.deepEqual(f.report.lifecycleErrors.map(x=>x.stage),['execute','failure-diagnostics']);assert(f.calls.includes('server'));assert(f.calls.includes('write'));
});
for(const originalFailure of [false,true])test(`cleanup errors never skip later resources or integrity (original failure ${originalFailure})`,async()=>{
 const f=fixture();f.options.execute=async({own})=>{own('server',()=>{f.calls.push('server');throw Error('server-close');});own('context',()=>{f.calls.push('context');throw Error('context-close');});if(originalFailure)throw Error('original');};
 const result=await runSnippetsLifecycle(f.options);assert.equal(result.exitCode,1);assert.equal(f.report.status,'FAIL_CLEANUP');assert.deepEqual(f.report.cleanupErrors.map(x=>x.name),['context','server']);assert.deepEqual(f.calls,['context','server','source','package','write']);if(originalFailure)assert.match(f.report.error,/original/);
});
for(const failed of ['source-integrity','package-integrity'])test(`${failed} exception is recorded without suppressing the other check or report`,async()=>{
 const f=fixture();f.options.integrityChecks=f.options.integrityChecks.map(([name,check])=>[name,async()=>{await check();if(name===failed)throw Error('hash-read-failed');}]);
 const result=await runSnippetsLifecycle(f.options);assert.equal(result.exitCode,1);assert.equal(f.saved[0].report.status,'FAIL');assert.equal(f.report.lifecycleErrors[0].stage,failed);assert.deepEqual(f.calls,['execute','context','server','source','package','write']);
});
test('cleanup, integrity, and report-write errors remain visible with the original failure',async()=>{
 const f=fixture();f.options.execute=async({own})=>{own('server',()=>{throw Error('close');});throw Error('original');};f.options.integrityChecks=[['source-integrity',()=>{throw Error('read');}]];f.options.writeReport=()=>{throw Error('disk-full');};
 const result=await runSnippetsLifecycle(f.options);assert.equal(result.exitCode,1);assert.equal(result.reportWritten,false);assert.equal(f.report.status,'FAIL_CLEANUP');assert.match(f.report.error,/original/);assert.match(f.report.reportWriteError,/disk-full/);assert.equal(f.report.cleanupErrors.length,1);assert.deepEqual(f.report.lifecycleErrors.map(x=>x.stage),['execute','source-integrity','report-write']);assert.equal(f.diagnostics.length,1);assert.match(f.diagnostics[0],/^SNIPPETS_REPORT_WRITE_FAILED /);assert.match(f.diagnostics[0],/original/);
});
test('a report-write failure after a successful journey is nonzero with a fallback diagnostic',async()=>{
 const f=fixture({writeReport:async()=>{throw Error('output-denied');}}),result=await runSnippetsLifecycle(f.options);assert.equal(result.exitCode,1);assert.equal(result.reportWritten,false);assert.equal(f.report.status,'FAIL');assert.equal(f.diagnostics.length,1);assert.match(f.report.error,/output-denied/);
});

const runner=await readFile(new URL('./snippets-package-mv3-browser.mjs',import.meta.url),'utf8');
test('the complete six-case browser journey and all its original assertions remain byte-identical',()=>{
 const core=runner.slice(runner.indexOf(' page=await context.newPage()'),runner.indexOf('},inspectFailure:'));
 assert.equal(createHash('sha256').update(core).digest('hex'),'35ae69a5d220476893f79f0ef215295eae2ffc36f228bf69fe58eecf612aaa0b');
 assert.equal((core.match(/report\.results\.push\(/g)??[]).length,6);
});

// Execute the actual runner shell with injected I/O, stopping before any DOM
// journey. This is lifecycle wiring evidence, never a real MV3/browser PASS.
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function runShell(fault){
 const calls=[],writes=[],reportErrors=[],fakeProcess={argv:['node','runner','result.json'],exitCode:0};
 let sourceReads=0,manifestReads=0;
 const manifest=JSON.stringify({sourceHashes:{'source.mjs':createHash('sha256').update('source').digest('hex')}});
 const fail=name=>{throw Error(name);};
 const fakeRead=async path=>{
  if(path.endsWith('build-manifest.json')){manifestReads++;if(fault==='manifest-final'&&manifestReads===2)fail(fault);return manifest;}
  if(path==='source.mjs'){sourceReads++;if(fault==='source-final')fail(fault);return 'source';}
  return 'runner';
 };
 const shell=runner.replace(/^import .*;\n/m,'').replace("await import('../b1/tooling/node_modules/playwright/index.mjs')",'await loadChromium()');
 const fn=new AsyncFunction('createHistoricalNetworkGuard','historicalNetworkGuardArgs','assert','mkdtemp','readFile','join','tmpdir','createHash','createHostFixtureServer','packageHost','verifyHost','snippetsRunnerPaths','runSnippetsLifecycle','loadChromium','process','console',shell);
 const context={close:async()=>{calls.push('context-close');if(fault==='context-close')fail(fault);},route:async()=>fail('route-stop')};
 await fn(async()=>{calls.push('guard-open');if(fault==='guard-open')fail(fault);return {config:{fixtureOrigin:'http://127.0.0.1:1234',proxyPort:1235},snapshot:()=>({mode:'DISPOSABLE_CHROME_REJECT_PROXY'}),close:async()=>{calls.push('guard-close');if(fault==='guard-close')fail(fault);}};},()=>['--proxy-server=guard'],assert,async()=>{calls.push('mkdtemp');if(fault==='mkdtemp')fail(fault);return '/owned-new';},fakeRead,join,()=>'/system-temp',createHash,
  async()=>{calls.push('server-open');if(fault==='server-open')fail(fault);return {origin:'http://127.0.0.1:1234',close:async()=>{calls.push('server-close');if(fault==='server-close')fail(fault);}};},
  ()=>{calls.push('package');if(fault==='package')fail(fault);return {unpacked:'/owned-new/package'};},()=>{},
  options=>snippetsRunnerPaths({...options,env:{FREE_CHROME_EXECUTABLE:'/explicit-test-browser'},temp:'/system-temp'}),
  options=>runSnippetsLifecycle({...options,writeReport:async(path,text)=>{calls.push('write');if(fault==='write')fail(fault);writes.push(JSON.parse(text));},diagnostic:text=>reportErrors.push(text)}),
  async()=>{if(fault==='import')fail(fault);return {chromium:{launchPersistentContext:async(path,options)=>{calls.push('launch');assert.equal(path,join('/owned-new','profile'));assert.equal(options.executablePath,'/explicit-test-browser');assert.deepEqual(options.ignoreDefaultArgs,['--disable-extensions']);assert.deepEqual(options.args,['--enable-unsafe-extension-debugging','--proxy-server=guard']);if(fault==='launch')fail(fault);return context;}}};},fakeProcess,{log:()=>{}});
 return {calls,writes,reportErrors,sourceReads,manifestReads,exitCode:fakeProcess.exitCode};
}
for(const fault of ['server-open','guard-open','guard-close','mkdtemp','package','import','launch','context-close','server-close','source-final','manifest-final','write'])test(`actual runner shell reports ${fault} and continues all acquired cleanup`,async()=>{
 const f=await runShell(fault);assert.equal(f.exitCode,1);assert(f.calls.includes('write'));
 if(fault!=='server-open')assert(f.calls.includes('server-close'));
 if(!['server-open','guard-open'].includes(fault))assert(f.calls.includes('guard-close'));
 if(['context-close','server-close','source-final','manifest-final','write'].includes(fault))assert(f.calls.includes('context-close'));
 if(fault==='write'){assert.equal(f.writes.length,0);assert.equal(f.reportErrors.length,1);}else{assert.equal(f.writes.length,1);assert.notEqual(f.writes[0].status,'PASS');}
 if(['source-final','manifest-final'].includes(fault)){assert.equal(f.sourceReads,1);assert.equal(f.manifestReads,2);assert.match(f.writes[0].error,/route-stop/);assert(f.writes[0].lifecycleErrors.some(x=>x.stage===`${fault.split('-')[0]==='manifest'?'package':'source'}-integrity`));}
});
