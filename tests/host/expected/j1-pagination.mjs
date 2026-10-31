// Independent test-process oracle. Never served or imported by application fixture.
export const j1PaginationExpected=Object.freeze({
 pendingControls:80,totalBeforePromotion:81,totalAfterPromotion:80,
 targetInitialOrdinal:40,targetPageOffset:32,pageSize:32,
 canonicalProjects:40,initialCanonicalProjects:39,canonicalConversations:4,canonicalPageOffset:32,canonicalPageSize:8,
 additionalProjects:Object.freeze(Array.from({length:38},(_,i)=>Object.freeze({id:'g-p-'+(i+1).toString(16).padStart(32,'0'),name:'Research'}))),
});

// Same-name, undated cards have a deliberately deterministic native insertion
// order, also matching lexical ID order. Promotion appends P2 at ordinal 39.
export const j1CanonicalOrder=Object.freeze([...j1PaginationExpected.additionalProjects.map(p=>p.id),'g-p-11111111111111111111111111111111','g-p-22222222222222222222222222222222']);
