// All 1000 objects remain in the test process. The browser sees only loaded pages.
export const partialExpectedWorld = Object.freeze({
  fixtureId:'chatgpt-host-partial-reconstruction-v1',reconstruction:true,
  principalId:'user-host-fixture',contextId:'account-host-personal',
  conversations:Array.from({length:1000},(_,index)=>({
    id:`77777777-7777-4777-8777-${String(index+1).padStart(12,'0')}`,
    title:`Archive conversation ${index+1}`,
    membership:index%3===0?'NONE':'UNKNOWN',
    metadataComplete:index%4===0,
  })),
  initiallyExposed:25,pageSize:25,worldSize:1000,
  coverage:'non-atomic-observed-scan',
  variants:{positive:{secondPageStart:25,newVisible:25},missing:{secondPageStart:25,newVisible:25,missingTitles:true},conflict:{secondPageStart:24,newVisible:24},neighbor:{secondPageStart:25,newVisible:25,neighborMessage:true}},
});
