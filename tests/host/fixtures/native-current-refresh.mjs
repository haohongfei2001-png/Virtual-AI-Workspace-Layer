/** Explicit native application refresh control for a narrow offline scenario.
 * No timer, extension API, authority injection or test-oracle dependency.
 */
export function withNativeCurrentRefresh(source){
 const marker="async function loadCurrentMessages(){";
 const dedupe="if(match[1]===lastConversation)return;";
 for(const text of [marker,dedupe,"reading.append(fragment);"])if(source.split(text).length!==2)throw Error('native-refresh-source-mismatch');
 return source.replace(marker,"async function loadCurrentMessages(refresh=false){").replace(dedupe,"if(!refresh&&match[1]===lastConversation)return;").replace("reading.append(fragment);","if(refresh)reading.querySelectorAll('article[data-message-id]').forEach(node=>node.remove());reading.append(fragment);")+`
const refreshButton=document.createElement('button');
refreshButton.type='button';refreshButton.id='native-current-refresh';refreshButton.textContent='Refresh current conversation';
refreshButton.addEventListener('click',async()=>{if(refreshButton.disabled)return;refreshButton.disabled=true;try{await loadCurrentMessages(true);refreshButton.dataset.completed=String(Number(refreshButton.dataset.completed??0)+1);}finally{refreshButton.disabled=false;}});
document.querySelector('#composer').before(refreshButton);
`;
}
