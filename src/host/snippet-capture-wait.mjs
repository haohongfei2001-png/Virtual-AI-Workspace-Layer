/** Wait only for the original explicit selection's body ACK. No native action,
 * selection rewrite, retry of capture, or persistent text is performed here. */
export function waitForSnippetCapture({document:doc,ready,capture,isCurrent,reply,timeoutMs=6000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 let done=false,timer=null,attempts=0,snapshot=null;const started=now();let lastNow=started;
 const events=['pointerdown','keydown','focusin','wheel','beforetoggle'];
 function finish(value){if(done)return;done=true;if(timer!==null)cancel(timer);for(const type of events)doc.removeEventListener?.(type,interrupt,true);snapshot=null;reply(value);}
 const interrupt=event=>{if(event.isTrusted===true&&(event.type!=='beforetoggle'||event.newState==='open'))finish({ok:false});};
 function lineage(node){const result=[];for(let n=node;n;n=n.parentNode){if(result.length>=64)return null;result.push(n);}return result;}
 function selection(){const s=doc.getSelection?.();if(!s||s.rangeCount!==1||s.isCollapsed)return null;const r=s.getRangeAt(0),text=r.toString();if(!text.trim()||text.length>2000)return null;return {s,r,start:r.startContainer,end:r.endContainer,from:r.startOffset,to:r.endOffset,text,startLine:lineage(r.startContainer),endLine:lineage(r.endContainer)};}
 function unchanged(){const n=selection(),s=snapshot;return !!n&&n.s===s.s&&n.r===s.r&&n.start===s.start&&n.end===s.end&&n.from===s.from&&n.to===s.to&&n.text===s.text&&['startLine','endLine'].every(k=>n[k]&&s[k]&&n[k].length===s[k].length&&n[k].every((v,i)=>v===s[k][i]))&&n.start.isConnected&&n.end.isConnected&&n.start.ownerDocument===doc&&n.end.ownerDocument===doc;}
 function step(){if(done)return;try{if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000)return finish({ok:false});const at=now(),elapsed=at-started;if(at<lastNow)return finish({ok:false});lastNow=at;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs||++attempts>120||isCurrent()!==true||snapshot&&!unchanged())return finish({ok:false});if(ready()===true){const end=now();if(!Number.isFinite(end)||end<lastNow||end-started>=timeoutMs||isCurrent()!==true||snapshot&&!unchanged())return finish({ok:false});return finish(capture());}if(!snapshot){snapshot=selection();if(!snapshot||!unchanged())return finish({ok:false});for(const type of events)doc.addEventListener?.(type,interrupt,true);}timer=schedule(step,Math.min(50,timeoutMs-elapsed));}catch{finish({ok:false});}}
 step();return ()=>finish({ok:false});
}
