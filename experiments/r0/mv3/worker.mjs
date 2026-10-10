import { createBroker } from './protocol.mjs';
/** Entry point is prepared but has NOT been loaded as an extension. No persistence/keepalive. */
const broker = createBroker({ extensionId: chrome.runtime.id, workerId: crypto.randomUUID() });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Identity is Chrome's MessageSender, never payload-supplied account/role metadata.
  sendResponse(broker.handle(message, sender));
  return false;
});

