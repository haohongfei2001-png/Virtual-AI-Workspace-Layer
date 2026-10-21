/** Native reading may retain the enhanced sidebar. Genuine composer input
 * surrenders both masks; never force a hidden native history target. */
export async function enterPartialNativeHistory(page){
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.locator('#prompt-textarea').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:6000});
 await page.locator('aside nav[aria-label="Chat history"]').waitFor({state:'visible',timeout:6000});
 return {kind:'GENUINE_NATIVE_COMPOSER_SURRENDER',openOwnedSurfaces:0,nativeHistoryVisible:true};
}
