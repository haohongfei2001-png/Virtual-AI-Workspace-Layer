import assert from 'node:assert/strict';
/** Serializable synchronous read: resolve current owned DOM and sample in one
 * browser task, never retain a locator ElementHandle across list replacement. */
export function readJ1LiveCandidatePosition(projectId){
 const hosts=document.querySelectorAll('[data-vaiwl-candidates]'),host=hosts.length===1?hosts[0]:null,list=host?.shadowRoot?.querySelector('ul');
 const cards=[...document.querySelectorAll('[data-vaiwl-owned]')].flatMap(n=>[...(n.shadowRoot?.querySelectorAll('[data-theme-id]')??[])]).filter(n=>n.getAttribute('data-theme-id')===projectId),card=cards.length===1?cards[0]:null;
 const rect=list?.getBoundingClientRect(),laidOut=!!list&&list.getClientRects().length>0&&rect.width>0&&rect.height>0;
 let visible=laidOut&&document.visibilityState==='visible';
 for(let node=list;visible&&node;node=node.parentElement??node.getRootNode()?.host??null){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0||style.contentVisibility==='hidden'||node.hidden)visible=false;}
 return {at:Date.now(),hostCount:hosts.length,connected:!!host?.isConnected&&!!list?.isConnected,laidOut,visible,scrollTop:list?.scrollTop??null,scrollHeight:list?.scrollHeight??null,clientHeight:list?.clientHeight??null,canonicalFocused:!!card&&document.hasFocus()&&card.getRootNode().activeElement===card};
}
export function assertJ1LiveCandidatePosition(sample,expectedScroll){
 assert.equal(sample.hostCount,1,'one current candidate panel required');assert.equal(sample.connected,true,'candidate list must be connected');assert.equal(sample.laidOut,true,'candidate list must have layout');assert.equal(sample.visible,true,'candidate list must be visible');assert.equal(sample.canonicalFocused,true,'canonical project must retain actual focus');assert(Number.isFinite(sample.at));assert(Number.isFinite(sample.scrollTop));assert(Number.isFinite(expectedScroll)&&expectedScroll>0);assert(Math.abs(sample.scrollTop-expectedScroll)<=1,'candidate scroll must survive native route and trusted return');return sample.scrollTop;
}
