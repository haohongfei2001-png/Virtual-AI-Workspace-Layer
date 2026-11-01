import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Source/fixture/tool closure, excluding only preinstalled dependency trees. */
export function snapshotInputs(root){
 const rows=[];
 function walk(relative){for(const entry of readdirSync(join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  if(entry.name==='node_modules')continue;
  const name=join(relative,entry.name);
  if(entry.isDirectory())walk(name);else if(entry.isFile())rows.push([name,sha(readFileSync(join(root,name)))]);else throw Error('unsupported-input-entry:'+name);
 }}
 for(const name of ['src','extension','simulator','tests'])walk(name);
 return {hash:sha(JSON.stringify(rows)),files:rows.length};
}
/** Must run from outer finally, including setup/copy/read failures. */
export function finalizeIntegrity(report,root,before,expectedCount){
 report.inputUnchanged=false;
 try{const after=snapshotInputs(root);report.inputAfter=after;report.inputUnchanged=!!before&&before.hash===after.hash&&before.files===after.files;}
 catch(error){report.integrityError=error.message;}
 report.pass=!report.error&&report.inputUnchanged&&report.results.length===expectedCount&&expectedCount>0&&report.results.every(row=>row.status==='KILLED');
 return report.pass;
}
