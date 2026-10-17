// Predetermined failure expectations, never delivered to the page as answers.
export const faultExpectedWorld = Object.freeze({
  fixtureId:'chatgpt-host-fault-reconstruction-v1',reconstruction:true,
  cases:{
    'auth-failure':{sessionStatus:401,privateProjectionAllowed:false},
    'unsafe-reading':{composerInsideReading:true,workspaceMountAllowed:false},
    'forged-scope':{pageMessageIsAuthority:false},
    csp:{frameSourceNone:true,frameFallbackIntoPageAllowed:false},
    'iframe-destroy':{insertedFrameRemoved:true,staleUiGrantAllowed:false},
    'stale-response':{firstRouteHeld:true,oldEpochMustNotPublish:true},
    'rate-limit':{metadataStatus:429,automaticInfiniteRetryAllowed:false},
    corrupt:{metadataInvalidJSON:true},
    'unknown-protocol':{metadataSchemaKnown:false,completeClaimsAllowed:false},
  },
});
