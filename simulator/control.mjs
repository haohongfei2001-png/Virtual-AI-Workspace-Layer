let host=opener;
for(const a of document.querySelectorAll('a[target="hf-host"]'))a.onclick=e=>{e.preventDefault();host=window.open(a.href,'hf-host');};
function send(action,value){if(!host||host.closed){document.querySelector('#status').textContent='请先打开一个宿主窗口。';return;}host.postMessage({type:'HF_CONTROL',action,value},location.origin);document.querySelector('#status').textContent='已发送合成场景动作：'+action;}
document.querySelector('#variant').onchange=e=>send('variant',e.target.value);
document.querySelector('#zone').onchange=e=>send('timeZone',e.target.value);
document.querySelector('#delay').onchange=e=>send('delay',Number(e.target.value));
document.querySelector('#time').onclick=()=>send('now',document.querySelector('#now').value);
for(const b of document.querySelectorAll('button[data-action]'))b.onclick=()=>send(b.dataset.action,b.dataset.value==='true'?true:b.dataset.value==='false'?false:b.dataset.value);
