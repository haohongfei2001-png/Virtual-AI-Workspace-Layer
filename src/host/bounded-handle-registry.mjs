/** Bounded RAM cache only. Retention never grants dispatch or identity authority. */
export function createBoundedHandleRegistry({now=()=>performance.now(),onEvict=()=>{},capacity=2048,maxPinned=1024,maxOwners=512}={}){
 if(typeof now!=='function'||typeof onEvict!=='function'||![capacity,maxPinned,maxOwners].every(Number.isSafeInteger)||capacity<1||maxPinned<0||maxPinned>=capacity||maxOwners<1)throw Error('invalid-handle-registry');
 const records=new Map(),owners=new Map();let head=null,tail=null,pinned=0,nextExpiry=Infinity,lastTime=null,notifying=false;
 const key=value=>typeof value==='string'&&value.length>0&&value.length<=256;
 function unlink(entry){if(!entry.queued)return;if(entry.prev)entry.prev.next=entry.next;else head=entry.next;if(entry.next)entry.next.prev=entry.prev;else tail=entry.prev;entry.prev=entry.next=null;entry.queued=false;}
 function enqueue(entry){if(entry.queued)return;entry.prev=tail;entry.next=null;if(tail)tail.next=entry;else head=entry;tail=entry;entry.queued=true;}
 function releaseOwner(owner){const retained=owners.get(owner);if(!retained)return false;owners.delete(owner);for(const id of retained.ids){const entry=records.get(id);if(entry&&--entry.pins===0){pinned--;enqueue(entry);}}return true;}
 function expiry(){nextExpiry=Infinity;for(const retained of owners.values())nextExpiry=Math.min(nextExpiry,retained.deadline);}
 function prune(){let time;try{time=now();}catch{time=NaN;}if(!Number.isFinite(time)||lastTime!==null&&time<lastTime){for(const owner of owners.keys())releaseOwner(owner);nextExpiry=Infinity;lastTime=Number.isFinite(time)?time:null;return null;}lastTime=time;if(time>=nextExpiry){for(const [owner,retained]of owners)if(retained.deadline<=time)releaseOwner(owner);expiry();}return time;}
 function remove(id){const entry=records.get(id);if(!entry)return false;unlink(entry);records.delete(id);if(entry.pins){pinned--;for(const [owner,retained]of owners)if(retained.ids.delete(id)&&!retained.ids.size)owners.delete(owner);expiry();}return true;}
 function retain(owner,ids,deadline){
  const time=prune();if(time===null||!key(owner)||!Array.isArray(ids)||ids.length>256||!Number.isFinite(deadline)||deadline<=time||deadline>time+30000)return false;
  const selected=new Set();for(const id of ids){if(!key(id)||!records.has(id)||selected.has(id))return false;selected.add(id);}
  const prior=owners.get(owner);if(!prior&&selected.size&&owners.size>=maxOwners)return false;
  let total=pinned;for(const id of prior?.ids??[])if(!selected.has(id)&&records.get(id).pins===1)total--;for(const id of selected)if(!prior?.ids.has(id)&&records.get(id).pins===0)total++;
  if(total>maxPinned)return false;
  // Change only differences, preserving FIFO position of unaffected records.
  for(const id of prior?.ids??[])if(!selected.has(id)){const entry=records.get(id);if(--entry.pins===0){pinned--;enqueue(entry);}}
  for(const id of selected)if(!prior?.ids.has(id)){const entry=records.get(id);if(entry.pins++===0){pinned++;unlink(entry);}}
  if(selected.size)owners.set(owner,{ids:selected,deadline});else owners.delete(owner);expiry();return true;
 }
 return Object.freeze({
  set(id,value){if(notifying)throw Error('reentrant-handle-insertion');prune();if(!key(id))throw Error('invalid-handle-id');const prior=records.get(id);if(prior){prior.value=value;return true;}
   if(records.size>=capacity){const victim=head;if(!victim)throw Error('handle-registry-capacity');remove(victim.id);notifying=true;try{onEvict(victim.id,victim.value);}finally{notifying=false;}}
   const entry={id,value,pins:0,prev:null,next:null,queued:false};records.set(id,entry);enqueue(entry);return true;
  },
  get(id){prune();return records.get(id)?.value;},delete:remove,
  *values(){for(const entry of records.values())yield entry.value;},
  *entries(){for(const entry of records.values())yield [entry.id,entry.value];},
  keys(){return records.keys();},
  clear(){records.clear();owners.clear();head=tail=null;pinned=0;nextExpiry=Infinity;lastTime=null;},
  retain,release(owner){const result=releaseOwner(owner);if(result)expiry();return result;},
  stats(){prune();return {records:records.size,pinned,owners:owners.size};}
 });
}
