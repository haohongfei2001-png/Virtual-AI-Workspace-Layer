/** Pure classification, deliberately independent of a child's nonzero exit alone. */
export function baselinePass(run,name){
 const targets=run.records.filter(r=>r.name===name&&!r.skip);
 return run.exitCode===0&&!run.signal&&!run.error&&targets.length===1&&targets[0].type==='test:pass';
}
export function classifyMutant(run,name){
 const failures=run.records.filter(r=>r.type==='test:fail');
 const targets=run.records.filter(r=>r.name===name&&!r.skip);
 const killed=targets.length===1&&failures.length===1&&failures[0]===targets[0]&&failures[0].code==='ERR_ASSERTION'&&run.exitCode===1&&!run.signal&&!run.error;
 return killed?'KILLED':baselinePass(run,name)?'SURVIVED':'INVALID_FAILURE';
}
