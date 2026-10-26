/** Native reading may retain the enhanced sidebar. Genuine composer input
 * surrenders workspace; the visible native-list control releases sidebar.
 * Never force a hidden native history target. */
export async function enterPartialNativeHistory(page){
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.locator('#prompt-textarea').click();
 const nativeList=page.getByRole('button',{name:'显示原生列表',exact:true});if(await nativeList.isVisible())await nativeList.click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,null,{timeout:6000});
 await page.locator('aside nav[aria-label="Chat history"]').waitFor({state:'visible',timeout:6000});
 return {kind:'GENUINE_NATIVE_READING_AND_LIST_RELEASE',openOwnedSurfaces:0,nativeHistoryVisible:true};
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

/** A native SPA search changes route in reading mode. Observe the NEW frame's
 * current identity while hidden, then use the real return control once. */
export async function returnPartialSearchWorkspace(page,{workspaceURL,conversationId,oldFrames,deadlineAt=Date.now()+15000}){
 const remaining=()=>{const ms=deadlineAt-Date.now();if(ms<=0)throw Error('partial-search-return-deadline');return ms;};
 const isNew=frame=>frame.url()===workspaceURL&&!oldFrames.includes(frame);
 const frame=page.frames().find(isNew)??await page.waitForEvent('framenavigated',{predicate:isNew,timeout:remaining()});
 await frame.locator(`[data-ref-id="${conversationId}"][aria-current="page"]`).waitFor({state:'attached',timeout:remaining()});
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click({timeout:remaining()});
 return {newCurrentAdmitted:true,nativeReturnClicked:true};
}
