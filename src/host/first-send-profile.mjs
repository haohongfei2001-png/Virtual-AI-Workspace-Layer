/** Reconstruction profile only. These are application-declared fixture semantics,
 * not evidence that ChatGPT exposes such fields or has passed G acceptance. */
export function createLoopbackFirstSendProfile(origin){
 const u=new URL(origin);if(u.origin!==origin||u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('first-send-loopback-only');
 return Object.freeze({id:'loopback-first-send-v1',revision:1,origin,liveVerified:false,formSelector:'main > form#composer',operationAttribute:'data-native-operation-id',messageAttribute:'data-native-message-id',submitPath:'/native/first-send',readbackPrefix:'/native/first-send/',operationHeader:'x-native-operation-id',messageHeader:'x-native-message-id'});
}
