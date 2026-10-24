/** Serialized into the isolated fixture page. Reads only, including during parsing. */
export function readIdleBootstrapFacts() {
 const root=document.documentElement;
 const control=document.querySelector('[aria-label="返回工作空间"]');
 const rect=control?.getBoundingClientRect();
 return {
  url:location.href,readyState:document.readyState,rootPresent:root!==null,
  visibility:document.visibilityState,focused:document.hasFocus(),
  state:root?.dataset.vaiwlState??null,reason:root?.dataset.vaiwlReason??null,
  open:document.querySelectorAll('[data-va-owned]:popover-open').length,
  owned:document.querySelectorAll('[data-va-owned]').length,
  frames:[...document.querySelectorAll('[data-va-owned] iframe')].map(f=>({src:f.src,connected:f.isConnected})),
  editorCount:document.querySelectorAll('#prompt-textarea').length,
  readingCount:document.querySelectorAll('#reading').length,
  activeElement:{tag:document.activeElement?.tagName??null,id:document.activeElement?.id??null,owned:!!document.activeElement?.closest?.('[data-va-owned]')},
  returnCount:document.querySelectorAll('[aria-label="返回工作空间"]').length,
  returnVisible:!!rect&&rect.width>0&&rect.height>0&&getComputedStyle(control).visibility==='visible',
 };
}

export function idleEvaluationFailure(details) {
 // Keep the original bounded synthetic-page exception, not merely a generic
 // wrapper that makes the failing bootstrap phase impossible to diagnose.
 return new Error('page-evaluation-failed:'+JSON.stringify({
  text:String(details.text??'').slice(0,160),
  exception:String(details.exception?.description??'').slice(0,800),
  line:Number.isSafeInteger(details.lineNumber)?details.lineNumber:null,
  column:Number.isSafeInteger(details.columnNumber)?details.columnNumber:null,
 }));
}
