import assert from 'node:assert/strict';
import {ui10Cases,UI10_PROFILES} from './ui10-matrix-contract.mjs';
export function ui10PackageOptions(profile,origin){
 assert(UI10_PROFILES.includes(profile),'unsupported-ui10-profile');
 const url=new URL(origin);assert(url.origin===origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1','offline-loopback-required');
 return {offlineOrigin:origin,...(profile==='MODERN'?{offlineContext:true}:{})};
}
export function ui10Entry(profile){
 assert(UI10_PROFILES.includes(profile),'unsupported-ui10-profile');
 return '/c/'+(profile==='PARTIAL'?'77777777-7777-4777-8777-000000000001':'33333333-3333-4333-8333-333333333333');
}
/** Height must restore before width/theme changes. Restore observations are extra
 * continuity checks, not additional matrix cells or independent native PASSes. */
export function ui10Sequence(profile){
 assert(UI10_PROFILES.includes(profile),'unsupported-ui10-profile');
 const cells=ui10Cases().filter(c=>c.profile===profile),sequence=[];
 for(const title of ['ordinary','long-Chinese'])for(const width of [1440,420])for(const colorScheme of ['light','dark'])for(const [phase,height] of [['before',1000],['reduced',520],['restored',1000]]){
  const cell=cells.find(c=>c.title===title&&c.viewport.width===width&&c.colorScheme===colorScheme&&c.viewport.height===height);
  sequence.push({phase,cell});
 }
 return sequence;
}
