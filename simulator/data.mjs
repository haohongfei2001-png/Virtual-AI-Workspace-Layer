/** Deterministic, wholly invented data. Never import this file into a live-host release. */
export const FIXTURE_NOW = '2026-10-11T04:00:00Z';
export const VARIANTS = ['baseline','nested-sidebar','no-safe-boundary','packed-header','nav-rebuild','portal-collision','narrow','dark','stress'];
export function syntheticURL(raw) {
  try {
    const u = new URL(raw);
    return !u.username && !u.password && !u.hash &&
      ((u.protocol === 'http:' && u.hostname === '127.0.0.1') || (u.protocol === 'https:' && u.hostname === 'vaiwl-hf.test')) &&
      /^\/hf\/(A|B|unknown)\/(?:c\/[A-Za-z0-9_-]+|project\/[A-Za-z0-9_-]+|new)$/.test(u.pathname);
  } catch { return false; }
}
export function routeInfo(raw) {
  if (!syntheticURL(raw)) return null;
  const u = new URL(raw), [, , account, kind, id] = u.pathname.split('/');
  return {account, kind, id:id ?? null, origin:u.origin};
}
export function scopeOf(account) {
  return {verified:account === 'A' || account === 'B', provider:'hf_synthetic_only', accountId:account, organizationId:'fixture_org'};
}
export function dataset(account='A', origin='https://vaiwl-hf.test', size=8) {
  if (!['A','B'].includes(account)) return {scope:account,refs:[],themes:[],projects:[]};
  const scope=account, refs=[], themes=[], projects=[{id:'P1',name:'城市观察',pinned:true},{id:'P2',name:'材料与方法',pinned:false}];
  const dates=['2026-10-10T08:00:00Z','2026-10-04T08:00:00Z','2026-09-03T08:00:00Z',null];
  const names=account==='A'?['城市声音档案','小型研究工作台','独立出版计划','海岸行走笔记','旧街区图册','未定时间的想法','读书与摘录','实验记录']:['另一账户的工作','城市声音档案','另一个合成主题'];
  const coverage={source:'synthetic-attested-snapshot',from:'2020-01-01T00:00:00Z',through:FIXTURE_NOW,gaps:0};
  for(let t=0;t<size;t++) {
    const theme={scope,id:'W'+t,name:names[t%names.length]+(t>=names.length?' '+(t+1):''),members:[]};
    const count=t===0?(size>=120?128:12):4;
    for(let j=0;j<count;j++) {
      const id=t===0&&j>=12?'L'+j:'T'+(t===0?j:t*100+j), projectId=j===1?'P1':j===2?'P2':null;
      let sentAt=dates[Math.min(j,3)];
      if(t===3)sentAt=j===3?null:'2026-08-04T08:00:00Z';
      if(t===4)sentAt='2026-07-02T08:00:00Z';
      if(t===5)sentAt=null;
      if(t===0&&j>3)sentAt='2026-10-02T08:00:00Z';
      const events=sentAt?[{messageId:id+'-u1',branchId:'root',role:'user',kind:'new-send',state:'committed',source:'synthetic-original-send',sentAt}]:[];
      const r={scope,id,nativeTitle:(j===0?'从哪里开始':j===1?'资料整理':j===2?'方法比较':'一次新的讨论')+(t>7?' '+id:''),
        displayTitle:j>3?['现场记录与备忘','整理音频样本','访谈提纲','校对观察记录','补充变量清单','准备下一次访谈','摘要与待办','参考资料索引'][(j-4)%8]:['研究问题与边界','整理观察材料','比较两种方法','时间尚未确认'][j],
        projectId,events,coverage:{...coverage},pinned:id==='T2',archived:t===4,available:id!=='T401',
        nativeUrl:origin+'/hf/'+account+'/c/'+id};
      if(t===6)r.coverage={...coverage,through:'2026-08-01T00:00:00Z',gaps:1};
      refs.push(r);theme.members.push(id);
    }
    themes.push(theme);
  }
  return {scope,refs,themes,projects};
}
export function messagesFor(ref, long=false) {
  const n=long?160:2, out=[];
  for(let i=0;i<n;i++) out.push({id:ref.id+'-m'+i,role:i%2?'assistant':'user',branch:'root',
    text:i%2?'可以先把问题分成观察、证据和判断三部分。保留尚未解释的例外，再比较不同方法。下面的交互组件用于检查宿主自身的局部状态；它不是模型生成内容。':'请帮助我梳理这个合成研究问题，区分已经知道的事实和仍需要验证的判断。',
    revision:0});
  return out;
}
