/** Defer only the existing synthetic host's rendered body, never its route GET.
 * Exact, unique anchors fail closed when the application fixture changes. The
 * original render block remains intact; no extension API or ACK is fabricated.
 */
export function delayNativeBodyUntilWorkspace(source){
 if(typeof source!=='string'||source.includes('__lateNativeBody'))throw Error('invalid-late-body-fixture-source');
 const start="  const reading = $('#reading'); reading.replaceChildren();\n",end="  $('#move-button').disabled = !view.conversationId;\n";
 const unique=anchor=>{const at=source.indexOf(anchor);if(at<0||source.indexOf(anchor,at+anchor.length)!==-1)throw Error('late-body-fixture-anchor-not-unique');return at;};
 const a=unique(start),b=unique(end);if(b<=a)throw Error('late-body-fixture-anchor-order');
 const render="  reading.replaceChildren();\n"+source.slice(a+start.length,b+end.length);
 return source.slice(0,a)+"  const reading = $('#reading');\n  const renderNativeBodyOnce=()=>{\n"+render+`  };
  if(view.conversationId){
    reading.replaceChildren();delete reading.dataset.conversationId;$('#move-button').disabled=true;
    let released=false;
    globalThis.__lateNativeBody={preparedAt:performance.timeOrigin+performance.now(),releases:0,release(){
      if(released)throw Error('late-body-release-already-consumed');released=true;this.releases++;
      const board=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])');
      if(!board||getComputedStyle(board).visibility!=='visible'||board.getBoundingClientRect().height<96)throw Error('workspace-not-ready-for-late-body');
      this.releaseAt=performance.timeOrigin+performance.now();renderNativeBodyOnce();
      return {releaseAt:this.releaseAt,releases:this.releases,conversationId:reading.dataset.conversationId,messageCount:reading.querySelectorAll('[data-message-id]').length};
    }};
  }else renderNativeBodyOnce();
`+source.slice(b+end.length);
}
