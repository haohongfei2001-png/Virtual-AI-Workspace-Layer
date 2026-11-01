// Independent Node-only oracle. Not imported by the fixture application/server.
export const modernExpectedWorld = Object.freeze({
  fixtureId:'chatgpt-host-modern-reconstruction-v1',reconstruction:true,
  principalId:'user-host-fixture',accountRoster:['account-host-personal','account-host-team'],
  selectedContext:'account-host-team',contextEvidence:'native-request-header-plus-roster-required',
  projects:[{id:'g-p-11111111111111111111111111111111',name:'Research'},{id:'g-p-22222222222222222222222222222222',name:'Research'}],
  conversations:[
    {id:'11111111-1111-4111-8111-111111111111',title:'First project conversation',projectId:'g-p-11111111111111111111111111111111'},
    {id:'22222222-2222-4222-8222-222222222222',title:'Second project conversation',projectId:'g-p-22222222222222222222222222222222'},
    {id:'33333333-3333-4333-8333-333333333333',title:'Ordinary conversation',membership:'NONE'},
    {id:'44444444-4444-4444-8444-444444444444',title:'Membership not loaded',membership:'UNKNOWN'},
  ],
  initialVisibleIds:['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'],
  afterScrollIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],
  messageCases:{positive:{selfId:'msg-self',selfTime:1700000000,actorId:'user-host-fixture'},missing:{id:'msg-incomplete',hasAuthor:false,hasTime:false},conflict:{id:'msg-self',differentTime:1700000001},neighbor:{id:'msg-neighbor',actorId:'user-other',time:1700000500}},
  hiddenOldBodyConversation:'99999999-9999-4999-8999-999999999999',
  expectedCapability:'offline-candidate-only',
});
