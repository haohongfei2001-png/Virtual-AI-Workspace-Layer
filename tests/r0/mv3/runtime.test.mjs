import test from 'node:test';
import assert from 'node:assert/strict';
/** Executes the real worker entry against a mocked chrome.runtime registration, never Chrome. */
test('mocked runtime uses actual sender, synchronously responds, and fresh module boot changes generation', async () => {
  const previous = globalThis.chrome;
  try {
    const handlers = [];
    globalThis.chrome = { runtime: { id: 'extension-id', onMessage: { addListener: fn => handlers.push(fn) } } };
    const firstURL = new URL('../../../experiments/r0/mv3/worker.mjs?source-test=1', import.meta.url);
    await import(firstURL.href);
    await import(new URL('../../../experiments/r0/mv3/worker.mjs?source-test=2', import.meta.url).href);
    assert.equal(handlers.length, 2);
    const request = { v: 1, type: 'BIND', clientId: 'client-A', requestId: 1 };
    const sender = { id: 'extension-id', tab: { id: 1 }, frameId: 0, documentId: 'doc-A',
      documentLifecycle: 'active', url: 'http://127.0.0.1:38407/r0-mv3-fixture/A.html' };
    const replies = [];
    for (const handler of handlers) assert.equal(handler(request, sender, r => replies.push(r)), false);
    assert.equal(replies.every(reply => reply.ok), true);
    assert.notEqual(replies[0].workerId, replies[1].workerId);
    let wrong;handlers[0](request, {...sender,id:'other'},r=>{wrong=r;});
    assert.equal(wrong.ok,false);
  } finally { globalThis.chrome = previous; }
});

