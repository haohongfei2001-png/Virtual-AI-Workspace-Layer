/** Repair UI owns only local-cache controls; no native actions or automatic repair. */
export const isFreeRecoveryReason=reason=>['native-partition-capacity','invalid-native-manifest','invalid-native-piece','invalid-native-piece-version','invalid-native-changes','orphan-native-membership','invalid-free-evidence-manifest','invalid-free-evidence-index-manifest','invalid-free-evidence-index','invalid-free-evidence-piece','invalid-free-evidence-piece-index','invalid-free-evidence-piece-version','invalid-free-evidence-sizes','missing-free-evidence-index','orphan-free-evidence-index','corrupt-native-record','missing-native-root','missing-native-marker','native-root-revision-conflict','corrupt-free-evidence-record','missing-free-evidence-root','missing-free-evidence-marker','free-evidence-root-revision-conflict'].includes(reason);
export function freeRecoveryPanel({document:doc,plans,onRepair}){
 const panel=doc.createElement('section');panel.dataset.vaiwlOwned='free-recovery';panel.setAttribute('role','region');panel.setAttribute('aria-label','原生数据与活动恢复');panel.style.cssText='font:13px/1.6 system-ui;padding:12px 18px';
 const text=(tag,value)=>{const n=doc.createElement(tag);n.textContent=value;return n;};panel.append(text('h3','本地数据恢复'));let damaged=false;
 for(const [kind,label] of [['native','原生缓存'],['evidence','活动证据']]){
   const plan=plans?.[kind];if(!plan?.corrupt)continue;damaged=true;
   const section=doc.createElement('div'),status=text('p',plan.recoverable?label+'损坏。可以恢复已核验的本地检查点；不会重放发送或修改原生聊天。':label+'损坏，未能核验安全恢复条件。原始记录已保留，原生聊天仍可使用。');status.setAttribute('role','status');section.append(status);
   if(plan.recoverable){const button=text('button','修复'+label);button.type='button';button.onclick=async()=>{button.disabled=true;status.textContent='正在修复本地记录…';try{await onRepair(kind,plan);status.textContent='本地记录已修复，来源与活动仍需重新核验。';}catch(e){status.textContent='修复未确认：'+e.message+'。未自动重试。';button.disabled=false;}};section.append(button);}panel.append(section);
 }
 if(!damaged)panel.append(text('p','本地原生缓存与活动记录未检测到损坏。'));return panel;
}
