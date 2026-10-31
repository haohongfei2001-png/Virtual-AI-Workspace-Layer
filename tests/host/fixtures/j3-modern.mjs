/** Application-owned J3 surfaces and original historical messages; no extension API. */
const text='Offline prefix uniquely selected fixture words suffix.';
const messageId=id=>'j3_'+id.replaceAll('-','')+'_message';
export function j3ModernPage(html,{layout='direct'}={}){
 if(!['direct','app-root'].includes(layout))throw Error('invalid-modern-j3-layout');
 const replacements=[['<textarea id="prompt-textarea"','<textarea data-j3-editor="plain" id="prompt-textarea"'],['<!-- J3_EDITOR -->','<button type="button" id="editor-mode">Use contenteditable</button><div id="j3-contenteditable" data-j3-editor="rich" contenteditable="true" role="textbox" aria-label="Rich message ChatGPT" hidden></div>'],['<!-- J3_PERMISSION -->','<dialog id="permission-dialog" aria-label="Fixture tool permission"><p>Offline reconstruction permission, not a system permission.</p><button id="permission-allow">Allow fixture tool</button><button id="permission-deny">Deny fixture tool</button><output id="permission-result" aria-live="polite"></output></dialog>']];
 for(const [from,to]of replacements){if(html.split(from).length!==2)throw Error('modern-j3-page-anchor-mismatch');html=html.replace(from,to);}
 if(layout==='app-root')html=html.replace('<body>','<body><div id="native-app-root" style="display:flex;width:100%;height:100vh">').replace('<script type="module"','</div><script type="module"');
 return html;
}
export function j3ModernMessages(conversationId){return [{messageId:messageId(conversationId),branchId:'j3_branch',text}];}
export function j3ModernMetadata({conversationId,principalId,sentAt}){return {conversation_id:conversationId,history_semantics:'fixture-original-self-send/1',mapping:{j3_node:{id:'j3_node',parent:null,message:{id:messageId(conversationId),author:{role:'user',id:principalId},original_send:{author_id:principalId,conversation_id:conversationId,kind:'new-send',state:'committed',precision:'second',sent_at:sentAt},content:{parts:[text]}}}}};}
/** Still make the normal account-bound detail GET; native route already renders
 * the exact J3 message. Avoid a duplicate message-ID DOM from the generic loader. */
export function j3ModernNative(source){
 const anchor="if(location.pathname!==`/c/${match[1]}` || !data.mapping)return;";
 if(source.split(anchor).length!==2)throw Error('modern-j3-native-anchor-mismatch');
 // J3 matches LEGACY's stable native history during the keyboard/AX journey.
 // Ordinary MODERN retains its windowed scroll loader in variants-native.mjs.
 const start="let offset = historyRegion.querySelectorAll('a[href]').length,loading=false;";
 const end="let lastConversation=null,lastProject=null;";
 if(source.split(start).length!==2||source.split(end).length!==2||source.indexOf(start)>source.indexOf(end))throw Error('modern-j3-history-anchor-mismatch');
 source=source.slice(0,source.indexOf(start))+source.slice(source.indexOf(end));
 return source.replace(anchor,anchor+"\n if(data.history_semantics==='fixture-original-self-send/1')return;");
}
