/** Test-package-only passive view of actual frame work, including not-yet-sent
 * presentation saves. It never flushes a timer, grants authority or freezes UI.
 * A hidden surface may retain a dirty hint without scheduling a read; it is
 * deferred until foreground, not work to drain before dormancy.
 * Final worker CHECK/RELEASE still decide whether the one close may proceed. */
export function instrumentFramePendingWork(source){
 const anchor=" return Object.freeze({start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});";
 if(source.split(anchor).length!==2)throw Error('frame-pending-work-anchor');
 return source.replace(anchor,` globalThis.__vaiwlFixtureFramePendingWork=()=>({role,closed,bootstrapping:!!bootstrapping,read:!!activeRead,dirty,refreshAllowed:backgroundRefreshAllowed(),resumeTimer:resumeTimer!==null,resumeQueued:!!resumeQueued,resumeWriting:!!resumeWriting,dispatch:!!dispatchPending,calibration:!!calibrationPending,horizon:!!horizonPending,snippetLocate:!!snippetLocatePending,panel:!!(backup||recovery||snippets),readTerminal:!!readTerminal});\n`+anchor);
}
export function framePendingWorkIsIdle(value,role){
 const keys=['role','closed','bootstrapping','read','dirty','refreshAllowed','resumeTimer','resumeQueued','resumeWriting','dispatch','calibration','horizon','snippetLocate','panel','readTerminal'];
 return !!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k))&&['workspace','sidebar'].includes(role)&&value.role===role&&typeof value.dirty==='boolean'&&typeof value.refreshAllowed==='boolean'&&(!value.dirty||!value.refreshAllowed)&&keys.slice(1).filter(k=>!['dirty','refreshAllowed'].includes(k)).every(k=>value[k]===false);
}
