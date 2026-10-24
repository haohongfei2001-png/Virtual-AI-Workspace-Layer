// Emit only completed test records. Infrastructure errors never qualify as kills.
export default async function* reporter(events) {
 for await (const {type,data} of events) if(type==='test:pass'||type==='test:fail') {
  const error=data.details?.error,cause=error?.cause;
  yield JSON.stringify({type,name:data.name,skip:data.skip??false,code:cause?.code??error?.code,message:cause?.message??error?.message,stack:cause?.stack??error?.stack})+'\n';
 } else if(type==='test:stdout'||type==='test:stderr') yield JSON.stringify({type,message:data.message})+'\n';
}
