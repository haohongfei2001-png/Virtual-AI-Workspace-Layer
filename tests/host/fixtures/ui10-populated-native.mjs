/** Native service facts only; never extension authority or IDB seeds. */
import {scaleConversationId} from './host-scale-world.mjs';
import {j3ModernMetadata,j3ModernMessages} from './j3-modern.mjs';
export const UI10_NATIVE_PROJECT='g-p-00000000000000000000000000000001';
export function ui10NativeRows(){return Array.from({length:64},(_,i)=>({id:scaleConversationId(i),title:`UI10 原生窗口 ${String(i).padStart(2,'0')} 中文长标题与独立历史事实`,project:i<34?UI10_NATIVE_PROJECT:null,daysAgo:i>=17&&i<34||i===63?75:1}));}
export function ui10NativeHistory(row,principalId,now){if(!row||![1,75].includes(row.daysAgo)||!Number.isFinite(now))throw Error('invalid-ui10-native-history');return j3ModernMetadata({conversationId:row.id,principalId,sentAt:new Date(now-row.daysAgo*86400000).toISOString().replace(/\.\d{3}Z$/,'Z')});}
export const ui10NativeMessages=row=>j3ModernMessages(row.id);
