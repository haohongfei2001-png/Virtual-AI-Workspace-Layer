// Earliest packaged frame diagnostics. No data, grants or runtime calls.
(()=>{
 const role=document.body?.dataset.frameRole;
 const parentOrigin=/* build-parent-origin */ 'https://chatgpt.com';
 if(!['workspace','sidebar'].includes(role)||window.parent===window)return;
 let terminal=false;
 const report=stage=>{if(terminal)return;terminal=['entry-resource-failed','script-error','promise-rejected'].includes(stage);document.documentElement.dataset.vaiwlFrameBoot=stage;window.parent.postMessage({type:'VAIWL_UI_BOOT',role,stage},parentOrigin);};
 window.addEventListener('error',event=>report(event.target?.tagName==='SCRIPT'?'entry-resource-failed':'script-error'),true);
 window.addEventListener('unhandledrejection',()=>report('promise-rejected'));
 document.addEventListener('DOMContentLoaded',()=>report('dom-ready'),{once:true});
 report('entry-ready');
})();
