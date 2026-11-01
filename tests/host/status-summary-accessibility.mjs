import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const statusSummaryOracleHash=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

/** Inspect the actual packaged private page without expanding any details.
 * Chromium accessibility evidence is not a claim about native macOS AX. */
export async function assertStatusSummaryAccessible(page,{build=null,state=null,bootStage=null}={}){
 const result=await page.evaluate(()=>{
  const ids=['runtime-build','boot-stage','status-code','mount-stage'];
  return {detailsClosed:[...document.querySelectorAll('details')].every(n=>!n.open),fields:ids.map(id=>{
   const matches=document.querySelectorAll('#'+id),node=matches[0],box=node?.getBoundingClientRect();
   return {id,count:matches.length,text:node?.textContent??'',outsideDetails:!!node&&!node.closest('details'),visible:!!node&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&box.width>0&&box.height>0,insideSummary:node?.parentElement?.id==='diagnostic-summary'};
  })};
 });
 assert(result.detailsClosed,'diagnostic acquisition must not expand details');
 for(const f of result.fields){assert.equal(f.count,1,'unique fixed ID '+f.id);assert(f.outsideDetails&&f.visible&&f.insideSummary,'default visible fixed field '+f.id);assert(f.text.length>0,'missing placeholder/value '+f.id);}
 const cdp=await page.context().newCDPSession(page);
 try{
  const {nodes}=await cdp.send('Accessibility.getFullAXTree');
  const texts=nodes.filter(n=>!n.ignored&&n.role?.value==='StaticText').map(n=>n.name?.value);
  for(const f of result.fields)assert.equal(texts.filter(text=>text===f.text).length,1,'unique exposed accessibility text '+f.id);
  result.accessibility='CHROMIUM_STATIC_TEXT_DEFAULT_VISIBLE';
 }finally{await cdp.detach();}
 const value=id=>result.fields.find(f=>f.id===id).text;
 if(build!==null)assert.equal(value('runtime-build'),'运行指纹：'+build);
 if(state!==null){const prefix='本次状态码：'+state;assert(value('status-code')===prefix||value('status-code').startsWith(prefix+'；本地检查：'));}
 if(bootStage!==null)assert.equal(value('boot-stage'),'启动阶段：'+bootStage);
 return result;
}
