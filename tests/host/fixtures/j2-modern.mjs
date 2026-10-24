import {j2Native} from './j2-send.mjs';
/** Native test application sends in its selected account, independently of extension scope. */
export function j2ModernNative(source){
 const transformed=j2Native(source),anchor="headers:{'x-j2-operation-id':operationId,'x-j2-message-id':messageId}";
 if(transformed.split(anchor).length!==2)throw Error('j2-modern-send-anchor-mismatch');
 return transformed.replace(anchor,"headers:{'x-j2-operation-id':operationId,'x-j2-message-id':messageId,'Chatgpt-Account-Id':(await (await fetch('/native/preferences')).json()).account_id}");
}
export function j2ModernDetail(source){
 const anchor="if(location.pathname!==`/c/${match[1]}` || !data.mapping)return;";
 if(source.split(anchor).length!==2)throw Error('j2-modern-detail-anchor-mismatch');
 return source.replace(anchor,anchor+"\n if(data.history_semantics==='fixture-original-self-send/1')return;");
}
