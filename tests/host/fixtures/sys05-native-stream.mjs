// Native application-owned finite assistant output. No extension API, authority,
// expected world, database access, manufactured ACK or message timestamp.
const reading=document.querySelector('#reading');
const state={running:false,ticks:0,mutations:0,startedAt:null,finishedAt:null,jointAt:null,jointBatch:false,jointToken:null,records:0,maxGapMs:0};
let leaf=null,lastAt=null,timer=null;
// Test controls belong to the existing protected composer; an unknown sibling
// between reading and composer correctly fails the formal flow baseline.
const button=document.createElement('button');button.type='button';button.id='sys05-start';button.textContent='Start finite assistant stream';document.querySelector('#composer').append(button);
function tick(){
 if(!state.running||!leaf?.isConnected)return;
 const at=performance.now();if(lastAt!==null)state.maxGapMs=Math.max(state.maxGapMs,at-lastAt);lastAt=at;
 // Multiple characterData records in one task on a genuine nested Text node.
 for(let i=0;i<8;i++){leaf.data='Offline assistant token '+(++state.mutations);}
 state.ticks++;
}
function jointTick(){if(!state.running)throw Error('sys05-send-outside-stream');tick();state.jointAt=Date.now();state.jointToken=state.mutations;}
button.onclick=()=>{
 if(state.running||state.startedAt!==null)return;
 const article=reading.querySelector('article[data-message-id="sys05-assistant"]'),body=article?.querySelector('div[data-message-id="sys05-assistant"]');
 if(!article||article.dataset.messageAuthorRole!=='assistant'||!body)throw Error('sys05-native-assistant-model-not-rendered');
 const span=document.createElement('span');leaf=document.createTextNode('Offline assistant token 0');span.append(leaf);body.replaceChildren(span);
 state.running=true;state.startedAt=Date.now();lastAt=performance.now();
 timer=setInterval(()=>{tick();if(state.ticks>=800){clearInterval(timer);state.running=false;state.finishedAt=Date.now();}},25);
};
new MutationObserver(records=>{
 state.records+=records.length;
 const token=records.some(r=>r.type==='characterData'&&r.target===leaf);
 const title=records.some(r=>r.target===document.querySelector('h1'));
 const user=records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&n.matches('article[data-message-author-role="user"]')));
 if(token&&title&&user)state.jointBatch=true;
}).observe(document.querySelector('main'),{subtree:true,characterData:true,childList:true});
globalThis.sys05NativeStream=Object.freeze({jointTick,snapshot:()=>({...state,realDescendant:leaf instanceof Text&&reading.contains(leaf)&&leaf.parentNode!==reading,sameReading:reading===document.querySelector('#reading'),text:leaf?.data??null})});
