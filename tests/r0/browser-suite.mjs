/* Runs only on the synthetic host. Test code may inspect its own synthetic draft. */
import { FixtureScopeGate, FixtureProjection, validateFixtureObservation } from '../../experiments/r0/core.mjs';
import { mountFixtureNavigation } from '../../experiments/r0/shell.mjs';
import { witness, observation, SCOPE_B } from './samples.mjs';
const byId = id => document.getElementById(id);
const assert = (value, message) => { if (!value) throw new Error(message); };
const results = [];
function record(id, run) {
  try { const detail = run() ?? {}; results.push({ id, status: 'PASS', evidence: 'BROWSER_FIXTURE', ...detail }); }
  catch (error) { results.push({ id, status: 'FAIL', evidence: 'BROWSER_FIXTURE', error: error.message }); }
}
function binding(overrides = {}) {
  const gate = new FixtureScopeGate(() => 1000);
  assert(gate.bindFixture(witness(overrides)).ok, 'Fixture binding must succeed');
  const token = gate.token();
  const ref = validateFixtureObservation(gate, token, observation(token)).reference;
  return { gate, token, ref };
}
function run() {
  results.length = 0;
  const composer = byId('native-composer');
  const transcript = byId('native-transcript');
  const model = byId('native-model');
  const tools = byId('native-tools');
  const nativeNav = byId('native-nav');
  const slot = byId('r0-slot');
  let clicks = 0;
  const clicked = () => { clicks += 1; };
  tools.addEventListener('click', clicked);
  const baseline = { composer, transcript, model, tools, nativeNav };
  let state = binding();
  let shell;
  const refList = () => [state.ref];

  record('BF-01-baseline-native-interaction', () => {
    assert(Object.values(baseline).every(n => n.isConnected), 'Native fixture nodes must exist');
    composer.value = '合成草稿 SYNTHETIC ONLY'; composer.focus(); composer.setSelectionRange(2, 5);
    tools.click();
    assert(clicks === 1, 'Baseline native handler must execute');
    assert(document.activeElement === composer, 'Baseline composer focus');
    return { nativeHandlerCount: clicks };
  });
  record('BF-02-mount-preserves-dom-focus-selection', () => {
    shell = mountFixtureNavigation(slot, state.gate, state.token, refList());
    assert(shell.ok, 'Mount must succeed');
    assert(byId('native-composer') === composer && byId('native-transcript') === transcript, 'Native DOM identity must be preserved');
    assert(document.activeElement === composer && composer.selectionStart === 2 && composer.selectionEnd === 5, 'Focus/selection must stay');
    assert(composer.value === '合成草稿 SYNTHETIC ONLY', 'Fixture draft must stay unchanged');
    assert(nativeNav.isConnected && !nativeNav.hidden && !nativeNav.inert, 'Native navigation stays available');
  });
  record('BF-03-duplicate-mount-refused', () => {
    assert(mountFixtureNavigation(slot, state.gate, state.token, refList()).reason === 'occupied-slot', 'Second owner must be refused');
    assert(slot.children.length === 1, 'Single mount only');
  });
  record('BF-04-host-style-update-and-controlled-exit', () => {
    composer.style.color = 'rgb(12, 34, 56)'; // Host updates its own style while probe is mounted.
    shell.dispose(); shell.dispose();
    assert(slot.children.length === 0, 'Owned DOM removed idempotently');
    assert(composer.style.color === 'rgb(12, 34, 56)', 'Do not restore stale host styles');
    assert(document.activeElement === composer && composer.selectionStart === 2, 'Exit preserves native focus/selection');
    assert(composer.value === '合成草稿 SYNTHETIC ONLY', 'Exit preserves synthetic draft');
  });
  record('BF-05-remount-native-handlers-survive', () => {
    shell = mountFixtureNavigation(slot, state.gate, state.token, refList());
    tools.click();
    assert(clicks === 2 && model === byId('native-model'), 'Native handlers and model node remain');
    assert(shell.ok && slot.children.length === 1, 'Exactly one remount');
  });
  record('BF-06-unknown-scope-clears-shell-synchronously', () => {
    state.gate.invalidate('unknown-scope');
    assert(slot.children.length === 0, 'No prior sensitive navigation remains');
    assert(!state.gate.check(state.token).ok, 'Old token revoked');
    assert(composer === byId('native-composer') && composer.value === '合成草稿 SYNTHETIC ONLY', 'Native node and draft stay');
  });
  record('BF-07-A-B-A-old-response-refused', () => {
    state = binding(); const old = state.token;
    state.gate.bindFixture(witness({ scope: SCOPE_B })); const b = state.gate.token();
    assert(validateFixtureObservation(state.gate, old, observation(old)).reason === 'stale-epoch', 'A response in B must fail');
    state.gate.bindFixture(witness());
    assert(!state.gate.check(old).ok && !state.gate.check(b).ok, 'Both old epochs invalid after returning A');
    state.token = state.gate.token();
    state.ref = validateFixtureObservation(state.gate, state.token, observation(state.token)).reference;
  });
  record('BF-08-route-new-body-old-refused', () => {
    const old = state.token;
    state.gate.bindFixture(witness({ route: 'https://r0.invalid/p/P1/c/T1', routeRevision: 2 }));
    state.token = state.gate.token();
    const oldBody = observation(state.token, { conversation: old.conversation, messages: observation(old).messages });
    assert(validateFixtureObservation(state.gate, state.token, oldBody).reason === 'observation-conversation', 'Residual body rejected');
    assert(validateFixtureObservation(state.gate, state.token, observation(state.token)).ok, 'Matching positive case accepted');
  });
  record('BF-09-cross-project-source-invariant', () => {
    state = binding(); const store = new FixtureProjection(state.gate);
    const refs = [state.ref, binding({ route: 'https://r0.invalid/p/P1/c/T1' }).ref, binding({ route: 'https://r0.invalid/p/P2/c/T2' }).ref];
    const before = JSON.stringify(refs);
    for (const ref of refs) assert(store.add(state.token, ref).ok, 'Same scope reference accepted');
    assert(store.setDisplayTitle(state.token, 'T1', 'Synthetic derived title', 0).ok, 'Derived title edit succeeds');
    assert(JSON.stringify(refs) === before, 'All native source values unchanged');
    const other = binding({ scope: SCOPE_B });
    assert(store.add(state.token, other.ref).reason === 'cross-scope', 'Cross-account reference rejected');
    shell = mountFixtureNavigation(slot, state.gate, state.token, store.view(state.token));
    assert(shell.ok && shell.mount.shadowRoot.querySelectorAll('a').length === 3, 'Three references rendered');
    assert(shell.mount.shadowRoot.textContent.includes('native P1') && shell.mount.shadowRoot.textContent.includes('native P2'), 'Native sources shown');
    store.dispose();
  });
  record('BF-10-text-only-rendering', () => {
    shell.dispose();
    const store = new FixtureProjection(state.gate); store.add(state.token, state.ref);
    const payload = '<img src=x onerror=alert(1)>';
    store.setDisplayTitle(state.token, 'T0', payload, 0);
    shell = mountFixtureNavigation(slot, state.gate, state.token, store.view(state.token));
    assert(shell.mount.shadowRoot.querySelector('img') === null, 'No HTML element from title');
    assert(shell.mount.shadowRoot.querySelector('a').textContent === payload, 'Literal title is preserved');
    store.dispose();
  });
  record('BF-11-probe-css-loss-does-not-hide-native', () => {
    shell.style.remove();
    assert(getComputedStyle(composer).display !== 'none' && getComputedStyle(nativeNav).display !== 'none', 'Native controls visible without probe CSS');
    const a = composer.getBoundingClientRect(), b = slot.getBoundingClientRect();
    assert(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left, 'Additive slot does not cover composer');
  });
  record('BF-12-no-cleanup-simulated-residue-recorded', () => {
    // Deliberately omit dispose to model absence of cleanup, NOT extension disable.
    assert(slot.children.length === 1, 'Residual additive panel remains, clean layout is NOT proven');
    tools.click(); assert(clicks === 3 && composer.isConnected, 'Native handler still works');
    return { cleanLayout: false, nativeOperable: true, limitation: 'Simulated loss of cleanup, not MV3 disable. Residue persists until explicit disposal.' };
  });
  record('BF-13-explicit-disposal-cleans-owned-layout', () => {
    shell.dispose(); assert(slot.children.length === 0, 'Explicit dispose removes residue');
    assert(Object.entries(baseline).every(([key, node]) => byId(`native-${key === 'nativeNav' ? 'nav' : key}`) === node), 'All original native nodes retained');
  });
  record('BF-14-synthetic-host-SPA-slot-replacement', () => {
    shell = mountFixtureNavigation(slot, state.gate, state.token, refList());
    const replacement = slot.cloneNode(false); slot.replaceWith(replacement); // Host replaces only its fixture mount slot.
    shell.dispose();
    assert(!shell.mount.isConnected, 'Old mount detached');
    shell = mountFixtureNavigation(replacement, state.gate, state.token, refList());
    assert(shell.ok && replacement.children.length === 1 && composer === byId('native-composer'), 'Explicit fresh mount keeps native island');
    shell.dispose();
  });
  record('BF-15-forged-reference-refused-without-dom-mutation', () => {
    const currentSlot = byId('r0-slot');
    const forged = { ...state.ref, url: 'https://r0.invalid/share/forged' };
    assert(mountFixtureNavigation(currentSlot, state.gate, state.token, [forged]).reason === 'invalid-reference', 'Copied evidence label is not provenance');
    assert(currentSlot.children.length === 0, 'No mutation on rejected reference');
  });
  record('BF-16-source-document-switch-clears-mounted-reference', () => {
    const source = binding({ route: 'https://r0.invalid/p/P1/c/T1', document: 'synthetic-source-document' });
    const currentSlot = byId('r0-slot');
    shell = mountFixtureNavigation(currentSlot, state.gate, state.token, [source.ref]);
    assert(shell.ok, 'Verified same-scope other document accepted');
    source.gate.invalidate('other-document-account-switch');
    assert(currentSlot.children.length === 0, 'Source invalidation removes mounted projection');
  });
  record('BF-17-cleanup-error-does-not-skip-shell-removal', () => {
    const broken = binding();
    broken.gate.onInvalidate(() => { throw new Error('synthetic cleanup fault'); });
    const currentSlot = byId('r0-slot');
    shell = mountFixtureNavigation(currentSlot, broken.gate, broken.token, [broken.ref]);
    assert(shell.ok, 'Mount succeeded');
    assert(!broken.gate.invalidate('test-cleanup-error').ok, 'Cleanup failure reported');
    assert(currentSlot.children.length === 0, 'Later shell cleanup still executed');
  });
  tools.removeEventListener('click', clicked);
  state.gate.invalidate('suite-end');
  const report = { schema: 'vawl-r0-browser-fixture-v1', evidence: 'BROWSER_FIXTURE', fixtureOnly: true,
    runAt: new Date().toISOString(), userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight },
    pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length,
    results, notRun: ['LIVE_HOST identity/route/project/history', 'Real MV3 worker/reload/disable/re-enable', 'PAIA four-arm coexistence',
      'Physical IME and screen reader', 'Actual browser freeze/background throttling', 'Extension-origin persistence/export import', 'Native send/attachment/Canvas/voice'] };
  byId('report').textContent = JSON.stringify(report, null, 2);
  byId('summary').textContent = `${report.pass}/${results.length} fixture assertions passed; ${report.fail} failed. LIVE_HOST/MV3/PAIA remain BLOCKED.`;
}
byId('run-suite').addEventListener('click', run);
