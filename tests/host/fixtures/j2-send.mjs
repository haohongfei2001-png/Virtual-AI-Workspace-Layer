import {randomUUID} from 'node:crypto';
export const J2_C='33333333-3333-4333-8333-333333333333';
/** Independent native app state. Stored original timestamp belongs to actual POST acceptance. */
export function createJ2SendFixture({principal,now=Date.now}){
 let mode='failure',revealed=false;const rows=[{id:'j2_old',author:principal(),parent:null,at:new Date(now()-90*86400000).toISOString(),original:true}],actions=[];
 const view=()=>({messages:rows.map(r=>({messageId:r.id,branchId:r.parent===null?'j2-root':'j2-main',text:'Native J2 message '+r.id}))});
 const detail=()=>({conversation_id:J2_C,history_semantics:'fixture-original-self-send/1',mapping:Object.fromEntries(rows.map(r=>[r.id,{id:r.id,parent:r.parent,message:{id:r.id,author:{role:'user',id:r.author},status:'fixture-accepted',...(r.original||revealed&&r.kind==='success'?{original_send:{author_id:r.author,conversation_id:J2_C,kind:'new-send',state:'committed',precision:'millisecond',sent_at:r.at}}:{}),content:{parts:['Synthetic J2 native content']}}}]))});
 return {view,detail,snapshot:()=>structuredClone({mode,revealed,actions,rows}),handle(req,res,url,json){
  if(req.method!=='POST'||!url.pathname.startsWith('/native/j2/'))return false;
  const command=url.pathname.slice('/native/j2/'.length);
  if(['failure','success','other','old-branch'].includes(command)){mode=command;json(res,200,{ok:true});return true;}
  if(command==='reveal'){revealed=true;actions.push({kind:'reveal',at:now()});json(res,200,view());return true;}
  if(command!=='send')return false;
  actions.push({kind:mode,at:now()});if(mode==='failure'){json(res,503,{error:'native-send-failed'});return true;}
  const row={id:randomUUID(),author:mode==='other'?'other-principal':principal(),parent:mode==='old-branch'?null:rows.at(-1).id,at:new Date(now()).toISOString(),kind:mode,original:false};rows.push(row);json(res,200,{message:view().messages.at(-1)});return true;
 }};
}
export function j2Native(source){
 const original="$('#composer').onsubmit = async (event) => { event.preventDefault(); if(event.isComposing) return; await action('send-intent'); $('#composer output').textContent = 'Offline reconstruction: message not sent'; };";
 if(!source.includes(original))throw Error('j2-native-handler-changed');
 return source.replace(original,`
function appendJ2(item){const article=document.createElement('article');article.dataset.messageId=item.messageId;article.dataset.branchId=item.branchId;const body=document.createElement('div');body.className='message-body';body.textContent=item.text;article.append(body);$('#reading').append(article);}
const controls=document.createElement('section');controls.id='j2-controls';
for(const mode of ['failure','success','other','old-branch']){const b=document.createElement('button');b.textContent='J2 mode '+mode;b.onclick=async()=>{await fetch('/native/j2/'+mode,{method:'POST'});controls.dataset.mode=mode;};controls.append(b);}
const reveal=document.createElement('button');reveal.textContent='J2 reveal original time';reveal.onclick=async()=>{await fetch('/native/j2/reveal',{method:'POST'});await navigate(location.pathname,{pop:true});};controls.append(reveal);$('#composer').before(controls);
$('#composer').onsubmit=async event=>{event.preventDefault();if(event.isComposing)return;await action('send-intent');const response=await fetch('/native/j2/send',{method:'POST'});if(!response.ok){$('#composer output').textContent='Native J2 send failed';return;}const data=await response.json();appendJ2(data.message);$('#prompt-textarea').value='';$('#composer output').textContent='Native J2 send accepted';};`);
}
