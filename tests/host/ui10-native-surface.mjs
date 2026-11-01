/** Native input yields the workspace, while the independently proven flow
 * sidebar may remain. Native history must itself remain reachable. */
export async function enterUi10NativeSurface(page){
 const close=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await close.isVisible())await close.click();
 await page.locator('#prompt-textarea').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned][id$="_workspace"]')].every(n=>getComputedStyle(n).display==='none'||getComputedStyle(n).visibility!=='visible'||n.getBoundingClientRect().height===0),null,{timeout:6000});
 await page.locator('aside nav[aria-label="Chat history"]').waitFor({state:'visible',timeout:6000});
 return {kind:'GENUINE_NATIVE_COMPOSER_SURRENDER',visibleWorkspaceSurfaces:0,nativeHistoryVisible:true};
}
