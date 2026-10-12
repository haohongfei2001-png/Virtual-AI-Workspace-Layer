"""RAM-only exact-string comparison proposal. Never grants account authority."""
def identifier_association(ids,dom,path_segments):
 msg=[v for k,v in ids if k in ('messageId','message_id')];conv=[v for k,v in ids if k in ('conversationId','conversation_id')]
 return {'messageIdFieldObserved':bool(msg),'conversationIdFieldObserved':bool(conv),'sameMessageIdRepeatedWithinNaturalStream':len(msg)>len(set(msg)),
 'messageIdEqualsUserDOMId':any(v in n['ids'] for v in msg for n in dom if n['role']=='user'),
 'messageIdEqualsAssistantDOMId':any(v in n['ids'] for v in msg for n in dom if n['role']=='assistant'),
 'conversationIdEqualsOwnRouteSegment':any(v in path_segments for v in conv),'accountOwnership':'NOT_ESTABLISHED','rawValuesRemainRAMOnly':True}
