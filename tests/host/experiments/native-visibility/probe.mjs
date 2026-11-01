/** EXPERIMENT ONLY. Not approved for product integration.
 * Only caller-owned native-mask CSS rules may be supplied. The caller must
 * verify live ownership before each use. Never supply closed-frame CSS rules.
 * This synchronous probe is not proof of zero transient accessibility or paint
 * effects. Browser and product acceptance remain required.
 */
export function probeNativeVisibility(node,{rules,getComputedStyle}) {
  const saved=rules.map(rule=>({rule,text:rule.style.cssText}));
  if(!saved.length||saved.some(({rule})=>rule.style.getPropertyValue('visibility')!=='hidden'||rule.style.getPropertyValue('interactivity')!=='inert'))return false;
  try {
    for(const {rule}of saved)rule.style.removeProperty('visibility');
    return getComputedStyle(node).visibility==='visible';
  } finally {
    for(const {rule,text}of saved)rule.style.cssText=text;
  }
}
