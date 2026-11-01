import {checkHostScaleSearchPage} from './host-scale-ui-oracle.mjs';
/** Read the real native title after the existing native-focus surrender. */
export async function readHostScaleNativeTail(page,{id,size,longTitles}){
 if(typeof id!=='string'||!/^60000000-0000-4000-8000-[0-9a-f]{12}$/.test(id))throw Error('invalid-native-tail-id');
 await page.locator('textarea').focus();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);
 const link=page.locator(`nav[aria-label="Chat history"] a[href="/c/${id}"]`);
 if(await link.count()!==1)throw Error('native-tail-link-not-unique');
 await link.waitFor({state:'visible',timeout:15000});
 const title=await link.innerText();
 checkHostScaleSearchPage({rows:[{id,title}],size,query:title,longTitles,expectedCount:1});
 return {id,title};
}
