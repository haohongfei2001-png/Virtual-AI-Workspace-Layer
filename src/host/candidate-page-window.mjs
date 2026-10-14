const PAGE_SIZE=32;

/** Retain one requested page and the current last page of a filtered stream.
 * Rows are opaque references; this helper grants no identity or authority. */
export function createCandidatePageWindow(offset){
 if(!Number.isSafeInteger(offset)||offset<0||offset%PAGE_SIZE!==0)throw Error('invalid-candidate-offset');
 let total=0,tailOffset=0,tail=[];
 const requested=[];
 function add(row){
  if(total===Number.MAX_SAFE_INTEGER)throw Error('candidate-count-overflow');
  if(total%PAGE_SIZE===0){tail=[];tailOffset=total;}
  tail.push(row);
  if(total>=offset&&total-offset<PAGE_SIZE)requested.push(row);
  total++;
 }
 function finish(){
  const selectedOffset=Math.min(offset,tailOffset);
  const items=(selectedOffset===offset?requested:tail).slice();
  return {items,total,offset:selectedOffset,nextOffset:selectedOffset+items.length<total?selectedOffset+PAGE_SIZE:null};
 }
 function stats(){return {retainedRows:requested.length+tail.length,total};}
 return Object.freeze({add,finish,stats});
}
