#!/usr/bin/env python3
"""Authorized transport fallback for this repository's REAL local Git objects.
No contents API, synthetic commits, checkout edits, reset, credentials logs or forced refs.
Text blobs may be included in tree requests; returned entry SHAs are verified individually.
"""
import argparse,base64,datetime,hashlib,json,re,subprocess,time
from pathlib import Path
REPO='haohongfei2001-png/Virtual-AI-Workspace-Layer'
def git(*args):return subprocess.check_output(['git',*args])
def person(value):
 m=re.fullmatch(r'(.*) <([^>]*)> (\d+) ([+-]\d{4})',value)
 if not m:raise ValueError('Unsupported Git identity serialization')
 name,email,sec,off=m.groups();minutes=(int(off[1:3])*60+int(off[3:]))*(1 if off[0]=='+' else -1)
 return {'name':name,'email':email,'date':datetime.datetime.fromtimestamp(int(sec),datetime.timezone(datetime.timedelta(minutes=minutes))).isoformat()}
def commit_payload(raw):
 headers,message=raw.split(b'\n\n',1);data={'parents':[],'message':message.decode('utf8')}
 for line in headers.decode('utf8').splitlines():
  key,value=line.split(' ',1)
  if key=='parent':data['parents'].append(value)
  elif key=='tree':data['tree']=value
  elif key in {'author','committer'}:data[key]=person(value)
  else:raise ValueError('Unsupported header; do not rewrite history: '+key)
 return data
p=argparse.ArgumentParser();p.add_argument('--base',required=True);p.add_argument('--branch',action='append',required=True);p.add_argument('--receipt',required=True);a=p.parse_args()
if any(not re.fullmatch(r'codex/vaiwl-(?:c3-c4-context|d1-d2-offline|f1-performance)-20261012',x) for x in a.branch):raise ValueError('Transport limited to authorized current module branches')
out=Path(a.receipt);out.parent.mkdir(parents=True,exist_ok=True)
receipt={'repository':REPO,'base':a.base,'branches':{},'objects':{},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'transport':'GIT_DATA_API_EXACT_SHA','refsForce':False}
verified={}
if out.exists():
 old=json.loads(out.read_text());assert old['repository']==REPO and old['base']==a.base;verified=old.get('objects',{});receipt['objects']=verified
last_write=0.
def save():out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
def api(path,method='GET',data=None):
 global last_write
 if method!='GET':
  delay=.9-(time.monotonic()-last_write)
  if delay>0:time.sleep(delay)
  last_write=time.monotonic()
 command=['gh','api','repos/'+REPO+'/'+path,'--method',method]
 if data is not None:command+=['--input','-']
 result=subprocess.run(command,input=json.dumps(data,ensure_ascii=False) if data is not None else None,text=True,capture_output=True,timeout=30)
 if result.returncode:raise RuntimeError('GitHub request failed '+method+' '+path+': '+result.stderr.strip())
 return json.loads(result.stdout)
def remote_ref(branch):
 rows=api('git/matching-refs/heads/'+branch);matches=[x for x in rows if x['ref']=='refs/heads/'+branch]
 if len(matches)>1:raise ValueError('Ambiguous remote ref')
 return matches[0]['object']['sha'] if matches else None
def record(sha,kind):
 receipt['objects'][sha]={'type':kind,'verifiedExactSha':True};save()
try:
 base=git('rev-parse',a.base).decode().strip();remote_base=api('git/commits/'+base);assert remote_base['sha']==base
 targets={b:git('rev-parse',b).decode().strip() for b in a.branch}
 before={b:remote_ref(b) for b in a.branch}
 for b,head in targets.items():
  assert subprocess.run(['git','merge-base','--is-ancestor',base,head]).returncode==0
  old=before[b]
  if old and old!=head and subprocess.run(['git','merge-base','--is-ancestor',old,head],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0:raise ValueError('Remote has unseen/nonancestor history; refuse ref write: '+b)
  receipt['branches'][b]={'localHead':head,'remoteBefore':old}
 save()
 rows=git('rev-list','--objects',*targets.values(),'--not',base).decode().splitlines();ids={row.split(' ',1)[0] for row in rows};objects={}
 for sha in ids:
  kind=git('cat-file','-t',sha).decode().strip();raw=git('cat-file',kind,sha)
  assert hashlib.sha1(kind.encode()+b' '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==sha
  objects[sha]=(kind,raw)
 # Binary blobs need a blob request; exact UTF-8 text blobs are created with their tree.
 binary=[]
 for sha,(kind,raw) in objects.items():
  if kind=='blob':
   try:raw.decode('utf8')
   except UnicodeDecodeError:binary.append(sha)
 for i,sha in enumerate(sorted(binary)):
  if sha in verified:continue
  result=api('git/blobs','POST',{'content':base64.b64encode(objects[sha][1]).decode(),'encoding':'base64'});assert result['sha']==sha,'Blob SHA differs';record(sha,'blob')
  if i%10==0:print('binary blobs',i+1,'/',len(binary),flush=True)
 built=set(verified)
 def tree(sha):
  if sha not in objects or sha in built:return
  kind,_=objects[sha];assert kind=='tree';entries=[];expected={}
  for row in git('ls-tree','-z',sha).split(b'\0'):
   if not row:continue
   meta,name=row.split(b'\t',1);mode,typ,child=meta.decode().split();name=name.decode('utf8');entry={'path':name,'mode':mode,'type':typ,'sha':child};expected[name]=(mode,typ,child)
   if typ=='tree':tree(child)
   elif typ=='blob' and child in objects and child not in built:
    try:content=objects[child][1].decode('utf8')
    except UnicodeDecodeError:pass
    else:entry.pop('sha');entry['content']=content
   elif typ!='blob':raise ValueError('Unsupported tree type')
   entries.append(entry)
  result=api('git/trees','POST',{'tree':entries});assert result['sha']==sha,'Tree SHA differs'
  actual={x['path']:(x['mode'],x['type'],x['sha']) for x in result['tree']};assert actual==expected,'Tree entries differ'
  for name,(_,typ,child) in expected.items():
   if typ=='blob' and child in objects:built.add(child);receipt['objects'][child]={'type':'blob','verifiedExactSha':True,'viaTree':sha}
  built.add(sha);record(sha,'tree');print('objects verified',len(receipt['objects']),'/',len(objects),flush=True)
 commits=git('rev-list','--reverse','--topo-order',*targets.values(),'--not',base).decode().splitlines()
 for sha in commits:
  data=commit_payload(objects[sha][1]);tree(data['tree'])
  if sha not in verified:
   result=api('git/commits','POST',data);assert result['sha']==sha,'Commit SHA differs; refs untouched';assert [x['sha'] for x in result['parents']]==data['parents'] and result['tree']['sha']==data['tree'];record(sha,'commit')
  print('exact commit',sha,flush=True)
 # Only now create/fast-forward refs. Check remote again immediately before each write.
 for branch,head in targets.items():
  current=remote_ref(branch)
  if current!=before[branch] and current!=head:raise ValueError('Concurrent remote update; refuse: '+branch)
  if current!=head:
   if current:api('git/refs/heads/'+branch,'PATCH',{'sha':head,'force':False})
   else:api('git/refs','POST',{'ref':'refs/heads/'+branch,'sha':head})
  assert remote_ref(branch)==head
  c=api('git/commits/'+head);assert c['sha']==head and c['tree']['sha']==git('rev-parse',head+'^{tree}').decode().strip()
  receipt['branches'][branch]['remoteAfter']=head;save();print('SYNCED',branch,head,flush=True)
 receipt['status']='PASS';receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
except Exception as e:
 receipt['status']='BLOCKED';receipt['error']=str(e);save();raise
