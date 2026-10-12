"""Bounded event-field reducer. No full HTTP body is assembled or persisted.
Only scalar schema paths and necessary own-test message metadata survive reduction.
IDs, raw times and known synthetic marker matches remain RAM-only for equality tests.
"""
import json,re
TIME=re.compile(r'(?:^|_)(?:create(?:d)?|sent|send|update(?:d)?|server|response|received|observed|start|end)?_?(?:time|timestamp|at)$|^(?:createTime|createdAt|sentAt|sendTime|serverTime|timestamp|updateTime)$',re.I)
DENY=re.compile(r'cookie|token|secret|authorization|session|account|email|credential|password',re.I)
IDS={'id','message_id','conversation_id','parent_id','parent_message_id'}
STATUS={'status','end_turn','finish_reason','type','role'}
def reduce_event(data,marker,observation_seconds):
 rows=[];messages=[];ids=[]
 def walk(x,path=(),ancestors=()):
  if isinstance(x,dict):
   # Read only known, necessary role/content metadata, never arbitrary data values.
   author=x.get('author');role=x.get('role')
   if isinstance(author,dict):role=author.get('role',role)
   if role in ('user','assistant','system'):
    body=x.get('content');own=False
    if isinstance(body,dict) and isinstance(body.get('parts'),list):own=any(isinstance(p,str) and marker in p for p in body['parts'])
    msg={'path':'.'.join(path),'role':role,'ownSyntheticMarker':own,'privateId':x.get('id') if isinstance(x.get('id'),str) else None,'privateTimes':{}}
    for k,v in x.items():
     if TIME.search(k) and isinstance(v,(int,float,str)) and not isinstance(v,bool):msg['privateTimes'][k]=v
    messages.append(msg)
   for k,v in x.items():
    if not isinstance(k,str) or DENY.search(k):continue
    p=path+(k,)
    if isinstance(v,(dict,list)):walk(v,p,ancestors+(x,))
    elif TIME.search(k) or k in STATUS or k in IDS:
     row={'field':'.'.join(p),'type':type(v).__name__,'kind':'message-or-unknown-time' if TIME.search(k) else 'identifier' if k in IDS else 'role-or-state'}
     if TIME.search(k):
      if isinstance(v,(int,float)) and not isinstance(v,bool):
       row['unixSecondsPlausible']=1_500_000_000<float(v)<2_500_000_000
       row['unixMillisecondsPlausible']=1_500_000_000_000<float(v)<2_500_000_000_000
       row['fractionalDigits']=len(str(v).partition('.')[2]) if '.' in str(v) else 0
       seconds=float(v)/1000 if row['unixMillisecondsPlausible'] else float(v)
       if row['unixSecondsPlausible'] or row['unixMillisecondsPlausible']:row['offsetFromBrowserObservationMs']=round((seconds-observation_seconds)*1000)
      elif isinstance(v,str):row['iso8601Shape']=bool(re.fullmatch(r'\d{4}-\d\d-\d\dT[0-9:.]+(?:Z|[+-]\d\d:\d\d)',v))
     if k=='role' and v in ('user','assistant','system','tool'):row['role']=v
     if k=='status' and v in ('in_progress','finished_successfully','finished','complete','pending','failed'):row['state']=v
     rows.append(row)
     if k in IDS and isinstance(v,str) and len(v)<=128:ids.append((k,v))
  elif isinstance(x,list):
   for value in x[:500]:walk(value,path+('[]',),ancestors)
 walk(data)
 return {'fields':rows[:500],'privateMessages':messages[:100],'privateIds':ids[:500]}
class StreamReducer:
 """SSE/NDJSON frame streaming, max64KiB incomplete frame; never full body/HAR."""
 def __init__(self,marker,observed):self.marker=marker;self.observed=observed;self.pending='';self.fields=[];self.messages=[];self.ids=[];self.frames=0;self.discarded=0;self.bytes=0
 def feed(self,text):
  self.bytes+=len(text.encode());self.pending+=text
  while '\n' in self.pending:
   line,self.pending=self.pending.split('\n',1);line=line.strip()
   if line.startswith('data:'):line=line[5:].lstrip()
   if line=='[DONE]' or not line.startswith(('{','[')):continue
   if len(line)>65536:self.discarded+=1;continue
   try:data=json.loads(line)
   except (ValueError,RecursionError):self.discarded+=1;continue
   self.frames+=1;r=reduce_event(data,self.marker,self.observed)
   self.fields.extend(r['fields']);self.messages.extend(r['privateMessages']);self.ids.extend(r['privateIds'])
   self.fields=self.fields[-1500:];self.messages=self.messages[-150:];self.ids=self.ids[-1500:]
  if len(self.pending)>65536:self.pending='';self.discarded+=1
 def public(self):
  unique={json.dumps(r,sort_keys=True):r for r in self.fields}
  return {'parsedFrames':self.frames,'discardedFrames':self.discarded,'bytesStreamedNotStored':self.bytes,'fields':list(unique.values())[:500],
   'messageMetadata':[{'path':m['path'],'role':m['role'],'ownSyntheticMarker':m['ownSyntheticMarker'],'idPresent':m['privateId'] is not None,'timeFieldNames':list(m['privateTimes'])} for m in self.messages[-30:]],'noFullResponseRetained':True}
