/** Progress is scoped and disposable; deleting it restarts bounded reconciliation. */
export const knownAnchorCursorKey=scopeKey=>JSON.stringify([scopeKey,'b1-anchor-backfill',1]);
