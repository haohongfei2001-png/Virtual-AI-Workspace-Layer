/** Synthetic MV3 message contracts only. This is NOT a host-account authenticator. */
export const PROTOCOL_VERSION = 1;
export const LEASE_MS = 4000;
export const REQUEST_MS = 1500;
const idOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const seqOk = value => Number.isSafeInteger(value) && value > 0;
const exact = (value, keys) => Boolean(value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const denied = reason => ({ ok: false, reason });

export function fixtureURL(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 256 || raw.includes('?') || raw.includes('#')) return null;
    const url = new URL(raw);
    if (raw !== url.href || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
        url.username || url.password || url.search || url.hash ||
        !/^\/r0-mv3-fixture\/(?:A|B)\.html$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function senderIdentity(sender, extensionId) {
  if (!idOk(extensionId) || !sender || sender.id !== extensionId ||
      !Number.isSafeInteger(sender.tab?.id) || sender.tab.id < 0 || sender.frameId !== 0 ||
      !idOk(sender.documentId) || sender.documentLifecycle !== 'active' || !fixtureURL(sender.url)) return null;
  return { tabId: sender.tab.id, frameId: 0, documentId: sender.documentId, url: sender.url };
}

export function validRequest(message) {
  try {
    const keys = ['v', 'type', 'clientId', 'requestId'];
    if (message?.type === 'CHECK') keys.push('workerId', 'leaseId');
    return exact(message, keys) && message.v === PROTOCOL_VERSION &&
      ['BIND', 'CHECK'].includes(message.type) && idOk(message.clientId) && seqOk(message.requestId) &&
      (message.type === 'BIND' || (idOk(message.workerId) && idOk(message.leaseId)));
  } catch { return false; }
}

export function validBoundReply(reply, request, url, now) {
  try {
    return exact(reply, ['ok', 'v', 'type', 'clientId', 'requestId', 'workerId', 'leaseId',
      'tabId', 'frameId', 'documentId', 'url', 'expiresAt']) && reply.ok === true &&
      reply.v === PROTOCOL_VERSION && reply.type === 'BOUND' && reply.clientId === request.clientId &&
      reply.requestId === request.requestId && idOk(reply.workerId) && idOk(reply.leaseId) &&
      Number.isSafeInteger(reply.tabId) && reply.tabId >= 0 && reply.frameId === 0 &&
      idOk(reply.documentId) && reply.url === url && fixtureURL(reply.url) === url &&
      Number.isFinite(now) && Number.isFinite(reply.expiresAt) &&
      reply.expiresAt > now && reply.expiresAt <= now + LEASE_MS;
  } catch { return false; }
}

export function createBroker({ extensionId, workerId, now = Date.now, makeId = () => crypto.randomUUID(), maxSlots = 32 }) {
  if (!idOk(extensionId) || !idOk(workerId) || !Number.isSafeInteger(maxSlots) || maxSlots < 1 || maxSlots > 32)
    throw new Error('Invalid synthetic broker configuration');
  const slots = new Map();
  function handle(message, sender) {
    try {
      const identity = senderIdentity(sender, extensionId);
      if (!identity || !validRequest(message)) return denied('invalid-envelope-or-sender');
      const time = now();
      if (!Number.isFinite(time)) return denied('invalid-clock');
      for (const [tab, value] of slots) if (value.expiresAt <= time) slots.delete(tab);
      const current = slots.get(identity.tabId);
      const sameIdentity = current && ['tabId', 'frameId', 'documentId', 'url'].every(key => current[key] === identity[key]) &&
        current.clientId === message.clientId;
      if (message.type === 'CHECK') {
        if (!sameIdentity || message.workerId !== workerId || message.leaseId !== current.leaseId ||
            message.requestId <= current.requestId) return denied('stale-lease');
        current.requestId = message.requestId;
        return { ok: true, v: PROTOCOL_VERSION, type: 'CURRENT', workerId, leaseId: current.leaseId,
          clientId: current.clientId, requestId: current.requestId, expiresAt: current.expiresAt };
      }
      // Never replace an unexpired different document/client based on arrival order.
      if (current && (!sameIdentity || message.requestId <= current.requestId)) return denied('occupied-or-replayed');
      if (!current && slots.size >= maxSlots) return denied('capacity');
      const leaseId = makeId();
      if (!idOk(leaseId) || !Number.isFinite(time + LEASE_MS)) return denied('invalid-lease');
      const record = { ...identity, clientId: message.clientId, requestId: message.requestId,
        leaseId, expiresAt: time + LEASE_MS };
      slots.set(identity.tabId, record);
      return { ok: true, v: PROTOCOL_VERSION, type: 'BOUND', workerId, ...record };
    } catch { return denied('broker-error'); }
  }
  return Object.freeze({ handle });
}

