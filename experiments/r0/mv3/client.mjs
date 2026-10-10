import { PROTOCOL_VERSION, LEASE_MS, REQUEST_MS, fixtureURL, validBoundReply } from './protocol.mjs';
/** Content-realm controller with injected transport/DOM. Pure tests do not emulate Chrome. */
export function createProbeClient({ clientId, send, getURL, mount, now = Date.now,
  schedule = (callback, delay) => setTimeout(callback, delay), cancel = clearTimeout }) {
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(clientId)) throw new Error('Invalid client id');
  const CANCELLED = Symbol('cancelled');
  let generation = 0, requestId = 0, pendingTimer = null, expiryTimer = null, pendingResolve = null;
  let remove = null, disposed = false, phase = 'IDLE', cleanupErrors = 0;
  function cleanup(callback) { try { callback(); } catch { cleanupErrors += 1; } }
  function clear(next) {
    const ticket = ++generation;
    phase = next; // Set before callbacks: cleanup can synchronously start a newer generation.
    const timers = [pendingTimer, expiryTimer]; pendingTimer = expiryTimer = null;
    const oldRemove = remove; remove = null;
    const oldResolve = pendingResolve; pendingResolve = null;
    if (oldResolve) oldResolve(CANCELLED);
    for (const timer of timers) if (timer !== null) cleanup(() => cancel(timer));
    if (oldRemove) cleanup(oldRemove);
    return ticket;
  }
  function stop() { clear(disposed ? 'DISPOSED' : 'STOPPED'); return cleanupErrors === 0; }
  function dispose() { disposed = true; clear('DISPOSED'); }
  async function connect() {
    if (disposed) return false;
    const ticket = clear('CONNECTING');
    if (generation !== ticket || disposed) return false;
    if (cleanupErrors) { phase = 'CLEANUP_FAILED'; return false; }
    try {
      const url = fixtureURL(getURL());
      if (!url || requestId >= Number.MAX_SAFE_INTEGER) { clear('INVALID_CONTEXT'); return false; }
      const request = Object.freeze({ v: PROTOCOL_VERSION, type: 'BIND', clientId, requestId: ++requestId });
      const cancelled = new Promise(resolve => { pendingResolve = resolve; });
      const handle = schedule(() => { if (generation === ticket) clear('TIMED_OUT'); }, REQUEST_MS);
      if (generation !== ticket || disposed) { cleanup(() => cancel(handle)); return false; }
      pendingTimer = handle;
      const response = Promise.resolve().then(() => generation === ticket ? send(request) : CANCELLED);
      const reply = await Promise.race([response, cancelled]);
      if (generation !== ticket || disposed || reply === CANCELLED) return false;
      if (cleanupErrors) { clear('CLEANUP_FAILED'); return false; }
      if (fixtureURL(getURL()) !== url || !validBoundReply(reply, request, url, now())) { clear('REJECTED'); return false; }
      cancel(pendingTimer); pendingTimer = null; pendingResolve = null;
      // Cleanup is local until the final currentness check, so reentry cannot clear a newer mount.
      const ownRemove = mount(Object.freeze({ evidence: 'SYNTHETIC_MV3_PREPARATION', workerId: reply.workerId }));
      if (typeof ownRemove !== 'function') { if (generation === ticket) clear('MOUNT_FAILED'); return false; }
      if (generation !== ticket || disposed) { cleanup(ownRemove); return false; }
      remove = ownRemove;
      if (fixtureURL(getURL()) !== url || now() >= reply.expiresAt) { clear('STALE_DURING_MOUNT'); return false; }
      function expire() {
        if (generation !== ticket || disposed) return;
        const remaining = reply.expiresAt - now();
        if (!(remaining > 0)) { clear('EXPIRED'); return; }
        try {
          const next = schedule(expire, Math.min(remaining, LEASE_MS));
          if (generation !== ticket || disposed) cleanup(() => cancel(next));
          else expiryTimer = next;
        } catch { clear('SCHEDULER_FAILED'); }
      }
      expire();
      if (generation !== ticket) return false;
      phase = 'BOUND';
      return true;
    } catch {
      if (generation === ticket && !disposed) clear('TRANSPORT_OR_MOUNT_FAILED');
      return false;
    }
  }
  return Object.freeze({ connect, stop, dispose, status: () => Object.freeze({ phase, generation, cleanupErrors }) });
}
