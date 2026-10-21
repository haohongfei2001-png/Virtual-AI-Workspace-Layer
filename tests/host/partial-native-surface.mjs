/** Native reading may retain the enhanced sidebar. Genuine composer input
 * surrenders both masks; never force a hidden native history target. */
export async function enterPartialNativeHistory(page){
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.locator('#prompt-textarea').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:6000});
 await page.locator('aside nav[aria-label="Chat history"]').waitFor({state:'visible',timeout:6000});
 return {kind:'GENUINE_NATIVE_COMPOSER_SURRENDER',openOwnedSurfaces:0,nativeHistoryVisible:true};
}

/** Removing a scrolled-to-bottom window clamps scrollTop and emits a native
 * scroll event. Return to top and drain that input BEFORE shrinking the list,
 * otherwise an empty-list bottom check legitimately requests a third page. */
export async function preparePartialHistoryUnmount(page){
 await enterPartialNativeHistory(page);
 const nav=page.locator('aside nav[aria-label="Chat history"]');await nav.hover();
 await page.mouse.wheel(0,-2000);
 await page.waitForFunction(()=>document.querySelector('aside nav[aria-label="Chat history"]').scrollTop===0,null,{timeout:6000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const scrollTop=await nav.evaluate(node=>node.scrollTop);
 if(scrollTop!==0)throw Error('partial-unmount-requires-native-top');
 return {kind:'GENUINE_NATIVE_WHEEL_TO_TOP',scrollTop,scrollInputDrained:true};
}
