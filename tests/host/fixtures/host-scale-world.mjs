/** Application-owned scale reconstruction. No extension state, grant or ACK seeds.
 * Distribution describes native service truth; unobserved membership remains UNKNOWN. */
export const HOST_SCALE_SIZES=Object.freeze([1000,10000,100000]);
export const HOST_SCALE_DISTRIBUTIONS=Object.freeze(['project-mixed','none-heavy','single-project']);
export function hostScaleScenario({size=1000,distribution='project-mixed',cpuRate=1,longTitles=true}={}){
 if(!HOST_SCALE_SIZES.includes(size)||!HOST_SCALE_DISTRIBUTIONS.includes(distribution)||![1,4].includes(cpuRate)||typeof longTitles!=='boolean')throw Error('invalid-host-scale-scenario');
 return Object.freeze({size,distribution,cpuRate,longTitles,profile:'LEGACY_LOOPBACK_RECONSTRUCTION',throttleScope:'NATIVE_PAGE_RENDERER_ONLY_NOT_WORKER_OR_PHYSICAL_DEVICE',rpcBudgetMs:6000,acceptance:'NOT_ESTABLISHED'});
}
export function scaleConversationId(index){if(!Number.isSafeInteger(index)||index<0||index>=100000)throw Error('invalid-scale-index');return '60000000-0000-4000-8000-'+index.toString(16).padStart(12,'0');}
export function* hostScaleRows(input){const s=hostScaleScenario(input);for(let i=0;i<s.size;i++){
 const grouped=s.distribution==='single-project'||(s.distribution==='project-mixed'?i%5!==4:i%10===0),projectIndex=s.distribution==='single-project'?0:Math.floor(i/100),projectId=grouped?'g-p-'+(projectIndex+1).toString(16).padStart(32,'0'):null;
 yield {id:scaleConversationId(i),title:'原生压力聊天 '+String(i).padStart(6,'0')+(s.longTitles?' · 长中文标题与 English mixed 内容用于尾部原名检索及实际可达验证，不代表真实聊天。':''),project:projectId};
}}
export function hostScaleExpected(input){const s=hostScaleScenario(input),grouped=s.distribution==='single-project'?s.size:s.distribution==='project-mixed'?s.size/5*4:s.size/10;return Object.freeze({conversations:s.size,grouped,nativeNone:s.size-grouped,projects:s.distribution==='single-project'?1:s.size/100,first:scaleConversationId(0),last:scaleConversationId(s.size-1),membershipProof:'Only actually observed native membership is assertable; no bulk NONE/coverage grant.'});}
