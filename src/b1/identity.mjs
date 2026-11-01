/** B1-only authority types. A scope is supplied by a privileged host identity resolver,
 * NEVER by a content-script request, selected vault, URL, tab ID or display name.
 * No real ChatGPT identity resolver is shipped in this phase.
 */
export const isRecord = x => x !== null && typeof x === 'object' &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
export const tokenOK = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
export const urlOK = x => {
  if (typeof x !== 'string' || x.length > 2048) return false;
  try { const u=new URL(x); return (u.protocol==='https:' || u.protocol==='http:') &&
    !!u.hostname && !u.username && !u.password && !u.hash; } catch { return false; }
};
export function normalizedScope(input) {
  // A local namespace is not a server principal. Issuance still belongs to the
  // privileged owner; accepting this data shape is never an authorization.
  if (isRecord(input) && input.kind === 'browser-local') {
    if (!['session','personal'].includes(input.storage) || !tokenOK(input.spaceId) ||
        Object.keys(input).some(k=>!['kind','storage','spaceId','key'].includes(k))) return null;
    return Object.freeze({kind:'browser-local',storage:input.storage,spaceId:input.spaceId,
      key:JSON.stringify(['vaiwl-local-v1','browser-local',input.storage,input.spaceId])});
  }
  if (!isRecord(input) || input.verified !== true ||
      typeof input.provider !== 'string' || !tokenOK(input.provider) ||
      !tokenOK(input.accountId) || !tokenOK(input.organizationId)) return null;
  // Exact caller must be trusted by the broker. This marker is a data label,
  // NOT authentication. Browser messages never supply these fields.
  return Object.freeze({verified:true,provider:input.provider, accountId:input.accountId,
    organizationId:input.organizationId,
    key: JSON.stringify([input.provider,input.accountId,input.organizationId])});
}
export function canonicalRef(input) {
  if (!isRecord(input) || !tokenOK(input.conversationId) || !urlOK(input.nativeUrl) ||
      (input.projectId !== null && !tokenOK(input.projectId))) return null;
  return Object.freeze({conversationId:input.conversationId, nativeUrl:input.nativeUrl,
    projectId:input.projectId});
}
