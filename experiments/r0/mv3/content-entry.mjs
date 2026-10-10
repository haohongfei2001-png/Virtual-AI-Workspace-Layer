import { fixtureURL } from './protocol.mjs';
import { createProbeClient } from './client.mjs';
/** Bundled into a classic isolated-world content script; no page-message bridge. */
if (window.top === window && fixtureURL(location.href) &&
    document.querySelector('meta[name="vawl-r0-synthetic"]')?.content === 'mv3-preparation-v1') {
  const client = createProbeClient({
    clientId: crypto.randomUUID(),
    getURL: () => location.href,
    send: message => chrome.runtime.sendMessage(message),
    mount() {
      const slots = document.querySelectorAll('[data-vawl-r0-mv3-slot="exclusive"]');
      if (slots.length !== 1 || slots[0].childNodes.length) throw new Error('Fixture slot unavailable');
      const mark = document.createElement('section');
      mark.dataset.vawlR0Mv3 = 'synthetic-probe';
      const shadow = mark.attachShadow({ mode: 'open' });
      const label = document.createElement('span');
      label.textContent = 'R0 synthetic MV3 lease; no host/account attestation';
      shadow.append(label);
      slots[0].append(mark);
      return () => mark.remove();
    }
  });
  // These handlers only drive this fixture's local lease. No automatic refresh or heartbeat.
  const stop = event => { if (event.isTrusted) client.stop(); };
  const reconnect = event => {
    if (event.isTrusted && document.visibilityState === 'visible') void client.connect();
  };
  const visibility = event => {
    if (!event.isTrusted) return;
    if (document.visibilityState === 'visible') void client.connect();
    else client.stop();
  };
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', reconnect);
  window.addEventListener('popstate', stop);
  window.addEventListener('hashchange', stop);
  document.addEventListener('freeze', stop);
  document.addEventListener('resume', reconnect);
  document.addEventListener('visibilitychange', visibility);
  if (document.visibilityState === 'visible') void client.connect();
}

