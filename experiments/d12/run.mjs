import { createHash } from 'node:crypto';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { previewRule } from './rules.mjs';
import { scopeOf } from '../../simulator/data.mjs';
import { emptyState,placementId,reduceCommand } from '../../src/data/state.mjs';
import { digest,stable } from '../../src/data/hash.mjs';
const out=process.argv[2];if(!out)throw Error('new output directory required');mkdirSync(out,{recursive:false});
const topics=['水质估计','训练噪声','异步竞态','机器人导航','读书提纲','访谈方法','城市声音','输入法词库','排版边界','数据去重','项目归属','实验误差','语义引用','修订草稿','交互回退','资源权限','版本迁移','任务依赖','中文分词','缓存边界'];
const tasks=['评估方案','问题清单','结构校对','根因排查','资料对照','边界梳理'],rows=[],results=[];
for(let object=0;object<100;object++)for(let variation=0;variation<12;variation++){
 const split=object<60?'train':object<80?'dev':'test',name=topics[object%topics.length]+' '+(object+1),scope=scopeOf('A'),state=emptyState(scope);state.revision=1;
 state.refs.ref={id:'ref',nativeUrl:'https://vaiwl-hf.test/hf/A/c/ref',projectId:null,nativeTitle:'未整理的合成记录',available:true};state.identities.ref={id:'ref',title:'未整理的合成记录',aliases:[],locked:false,owner:'bootstrap',revision:1};state.workspaces.topic={id:'topic',name,icon:'research',order:0,locked:false,owner:'bootstrap',revision:1};
 const task=tasks[object%tasks.length],positive='请继续'+(variation%2?'整理':'梳理')+'「'+name+'」的'+task+'。';
 const input={source:'controlled-synthetic-annotation-v1',scopeKey:state.scopeKey,verified:true,refId:'ref',role:'user',kind:'new-send',baseRevision:1,text:positive};
 const labels={topic:name,task,series:variation<2?'explicit-continuation':null,title:name+' · '+task,expected:variation<2?'PREVIEW':'UNKNOWN'};
 const group={user:'synthetic-author-'+split,time:split==='train'?'2026-09-01':split==='dev'?'2026-09-15':'2026-10-11',series:'synthetic-series-'+object,object};
 if(variation===2)input.text='不是要整理「'+name+'」，只是引用这句话：'+positive;
 if(variation===3)input.text='他说“'+positive+'”，我并不继续这个主题。';
 if(variation===4)input.text='比较「'+name+'」与另一个同名项目，不要自动归属。';
 if(variation===5)input.text='一次性查看「'+name+'」的软件版本 v2.7，不建立系列。';
 if(variation===6)input.role='assistant';
 if(variation===7)input.kind='edit-not-send';
 if(variation===8)input.verified=false;
 if(variation===9){state.identities.ref.owner='human';state.identities.ref.locked=true;state.identities.ref.title='人工优先 '+name;}
 if(variation===10){const id=placementId('topic','ref');state.placements[id]={id,workspaceId:'topic',refId:'ref',excluded:true,order:0,locked:true,owner:'human',revision:1};}
 if(variation===11)input.baseRevision=0;
 state.sources.synthetic={id:'synthetic',channel:'controlled-synthetic-annotation-v1',description:'Invented offline annotation evidence, not live host.',observedAt:group.time+'T04:00:00Z',trustLevel:'synthetic',revoked:false};state.events.synthetic={id:'synthetic',sourceId:'synthetic',conversationId:'ref',messageId:'m0',branchId:'root',role:'user',kind:'new-send',sendState:'committed',sentAt:group.time+'T03:00:00Z',precision:'second',observedAt:group.time+'T04:00:00Z',revoked:false};
 const before=stable(state),preview=previewRule(input,state),again=previewRule(input,state);if(stable(preview)!==stable(again)||stable(state)!==before)throw Error('unstable-or-mutating-preview');
 if(preview.status==='PREVIEW'){const applied=reduceCommand(state,{type:'SET_TITLE',refId:'ref',title:preview.proposal.title,locked:false},'candidate');if(stable(applied.events)!==stable(state.events)||stable(applied.sources)!==stable(state.sources))throw Error('candidate-created-activity');}
 const ok=preview.status===labels.expected&&(preview.status!=='PREVIEW'||preview.proposal.title===labels.title),id='synthetic_'+object+'_'+variation;
 rows.push({id,split,group,input,labels,annotationAuthority:'TEMPLATE_SYNTHETIC_NOT_HUMAN_GOLD',difficulty:['clear-object-task','clear-object-task','negation','quoted-voice','ambiguous-membership','software-version-not-series','assistant-not-send','edit-not-send','unknown-identity','human-title','human-exclusion','stale-revision'][variation]});results.push({id,status:ok?'PASS':'FAIL',preview});
}
// No author, time band or series crosses splits. Rules are fixed, never fitted to test labels.
for(const field of ['user','time','series']){const splits=new Map();for(const r of rows){const key=r.group[field];if(splits.has(key)&&splits.get(key)!==r.split)throw Error('split-leak');splits.set(key,r.split);}}
const metrics=Object.fromEntries(['train','dev','test'].map(split=>{const selected=rows.filter(r=>r.split===split),ids=new Set(selected.map(r=>r.id)),runs=results.filter(r=>ids.has(r.id)),previews=runs.filter(r=>r.preview.status==='PREVIEW'),correct=previews.filter(r=>r.status==='PASS').length;return [split,{examples:selected.length,previews:previews.length,precision:previews.length?correct/previews.length:null,diagnosticIidWilsonLower95:previews.length?previews.length/(previews.length+3.8416):null,intervalCaveat:'Template-correlated observations, iid diagnostic is not calibrated real-language confidence',coverage:previews.length/runs.length,UNKNOWN:runs.length-previews.length,fail:runs.filter(r=>r.status==='FAIL').length}];}));
const report={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:process.argv,node:process.version,sourceSHA256:createHash('sha256').update(readFileSync(new URL('./rules.mjs',import.meta.url))).digest('hex'),samples:rows.length,counts:{PASS:results.filter(r=>r.status==='PASS').length,FAIL:results.filter(r=>r.status==='FAIL').length},metrics,limits:['Generated synthetic templates, NOT independent human language labels or real-product precision certification','No model or production classifier enabled; sparse grammar deliberately returns UNKNOWN','No title acceptance or real user-benefit claim; 98% precision/90% acceptance targets remain unverified'],results};
writeFileSync(out+'/corpus.jsonl',rows.map(r=>JSON.stringify(r)).join('\n')+'\n');writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({samples:report.samples,counts:report.counts,metrics},null,2));if(report.counts.FAIL)process.exitCode=1;
