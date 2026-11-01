/** Explicit reconstruction only; never claims production ChatGPT semantics. */
export function createOldSendTerminalProfile(origin){
 const u=new URL(origin);if(u.origin!==origin||u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('old-send-loopback-only');
 return Object.freeze({id:'loopback-old-send-terminal-v1',origin,operationAttribute:'data-j2-operation-id',messageAttribute:'data-j2-message-id',operationHeader:'x-j2-operation-id',messageHeader:'x-j2-message-id',submitPath:'/native/j2/send',readbackPrefix:'/native/j2/operations/'});
}
