import { checkFixtureReference, onFixtureReferenceInvalidated } from './core.mjs';
/** Additive-only R0 shell. Does not inspect composer, transcript, native styles or history. */
export function mountFixtureNavigation(slot, gate, token, references) {
  if (!gate.check(token).ok) return { ok: false, reason: 'inactive-binding' };
  if (!Array.isArray(references) || references.some(ref => !checkFixtureReference(gate, token, ref).ok)) return { ok: false, reason: 'invalid-reference' };
  if (!slot || slot.dataset.r0Mount !== 'exclusive' || slot.childNodes.length !== 0) return { ok: false, reason: 'occupied-slot' };
  const doc = slot.ownerDocument;
  const mount = doc.createElement('section');
  mount.dataset.vaiwlR0 = 'navigation';
  const shadow = mount.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = ':host{display:block;contain:content}nav{padding:8px;border:1px solid #667;border-radius:6px}ul{margin:8px 0;padding-inline-start:20px}a{overflow-wrap:anywhere}';
  const nav = doc.createElement('nav');
  nav.setAttribute('aria-label', 'R0 synthetic derived navigation');
  const label = doc.createElement('strong');
  label.textContent = 'Synthetic R0, additive navigation only';
  nav.append(label);
  const list = doc.createElement('ul');
  for (const ref of references) {
    // Links here are verified synthetic route references, never live target selectors.
    const li = doc.createElement('li');
    const a = doc.createElement('a');
    a.href = ref.url;
    a.textContent = ref.display?.title ?? ref.nativeTitle;
    const source = doc.createElement('span');
    source.textContent = ` (native ${ref.nativeProject ?? 'ordinary chat'}, metadata only)`;
    li.append(a, source); list.append(li);
  }
  nav.append(list);
  shadow.append(style, nav);
  slot.append(mount);
  let active = true;
  const subscriptions = [];
  const dispose = () => { if (active) { mount.remove(); active = false; for (const unsubscribe of subscriptions) unsubscribe(); } };
  subscriptions.push(gate.onInvalidate(dispose));
  for (const ref of references) subscriptions.push(onFixtureReferenceInvalidated(ref, dispose));
  return { ok: true, mount, dispose, style, evidence: 'BROWSER_FIXTURE' };
}
