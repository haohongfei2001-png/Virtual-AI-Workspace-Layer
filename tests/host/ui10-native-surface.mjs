/** Reading-only mode can retain the enhanced sidebar. Use the genuine native
 * composer to surrender BOTH surfaces before operating original history. */
export async function enterUi10NativeSurface(page){
 const close=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await close.isVisible())await close.click();
 await page.locator('#prompt-textarea').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:6000});
 await page.locator('aside nav[aria-label="Chat history"]').waitFor({state:'visible',timeout:6000});
 return {kind:'GENUINE_NATIVE_COMPOSER_SURRENDER',openOwnedSurfaces:0,nativeHistoryVisible:true};
}
