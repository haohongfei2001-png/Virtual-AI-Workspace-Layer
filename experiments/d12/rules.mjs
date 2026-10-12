import { digest } from '../../src/data/hash.mjs';
/** OFFLINE shadow experiment only. No import by MV3, model call, source ingestion or automatic application. */
export function previewRule(input,state){
 const unknown=reason=>({status:'UNKNOWN',reason});
 if(input.source!=='controlled-synthetic-annotation-v1'||input.scopeKey!==state.scopeKey||input.verified!==true)return unknown('unverified-or-different-synthetic-scope');
 if(input.role!=='user'||input.kind!=='new-send')return unknown('not-original-user-send');
 if(input.baseRevision!==state.revision)return unknown('stale-input');
 const ref=state.refs[input.refId],identity=state.identities[input.refId];if(!ref)return unknown('unknown-reference');
 if(identity?.owner==='human'||identity?.locked)return unknown('human-title-protected');
 const match=/^请继续(?:梳理|整理)「([^」]{1,100})」的(评估方案|问题清单|结构校对|根因排查|资料对照|边界梳理)。$/.exec(input.text);
 if(!match)return unknown('ambiguous-or-outside-validated-grammar');
 const choices=Object.values(state.workspaces).filter(w=>w.name===match[1]);if(choices.length!==1)return unknown('non-unique-workspace');
 const workspace=choices[0],negative=Object.values(state.placements).some(p=>p.refId===ref.id&&p.workspaceId===workspace.id&&p.excluded&&(p.owner==='human'||p.locked));
 if(negative)return unknown('explicit-exclusion');
 const proposal={refId:ref.id,workspaceId:workspace.id,title:match[1]+' · '+match[2],baseRevision:state.revision,reason:'明确对象、任务及唯一已知主题；仅供预览，分类不制造发送。'};
 return {status:'PREVIEW',proposal,fingerprint:digest({input,proposal})};
}
