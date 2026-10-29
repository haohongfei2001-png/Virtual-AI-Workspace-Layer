/** Buffer-only allowlisted synthetic PNG transport. Never reads paths/profiles. */
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export const UI10_CAPTURE_VIEWS=Object.freeze(['home','reading-unique-return','sidebar-open','sidebar-closed','working-set','snippets','search','H-settings']);
export const UI10_NATIVE_CAPTURE_IDS=Object.freeze(['mv3-desktop-initial','mv3-narrow-dark-initial',...['desktop','narrow-dark'].flatMap(size=>['old-items-expanded','empty-history-segment','long-list-end'].map(view=>`mv3-${size}-${view}`))]);
export const UI10_CONTROL_CAPTURE_IDS=Object.freeze(['LEGACY','MODERN','PARTIAL'].flatMap(profile=>['desktop','narrow-dark'].flatMap(size=>UI10_CAPTURE_VIEWS.map(view=>`mv3-control-${profile.toLowerCase()}-${size}-${view}`))));
export const VISUAL_PNG_IDS=Object.freeze(['approved-desktop-initial','renderer-desktop-initial','approved-desktop-old-open','renderer-desktop-old-open','approved-narrow-dark','renderer-narrow-dark',...UI10_NATIVE_CAPTURE_IDS,...UI10_CONTROL_CAPTURE_IDS]);
export const PNG_LIMITS=Object.freeze({perImage:192*1024,total:1536*1024,chunk:4096,records:16,maxWidth:1440,maxHeight:1000});
export function ui10CaptureSize({width,height,colorScheme}){return height===1000&&width===1440&&colorScheme==='light'?'desktop':height===1000&&width===420&&colorScheme==='dark'?'narrow-dark':null;}
export function ui10ControlCaptureId({profile,title,phase,viewport,colorScheme,view}){const size=ui10CaptureSize({...viewport,colorScheme});if(title!=='ordinary'||phase==='restored'||!size)return null;const id=`mv3-control-${profile.toLowerCase()}-${size}-${view}`;if(!UI10_CONTROL_CAPTURE_IDS.includes(id))throw Error('unallowlisted-control-capture');return id;}
/** Applicability is established by the actual control journey, never by the
 * number of PNGs that happened to be produced. Native-retained navigation is
 * not a formal-sidebar screenshot and leaves those exact views NOT_RUN. */
export function ui10ControlCapturePlan(profileResults){
 const names=[...new Set(profileResults.map(p=>p.profile))],expectedIds=[],notRun=[];
 if(!names.length||names.some(p=>!['LEGACY','MODERN','PARTIAL'].includes(p)))throw Error('invalid-visual-profile-set');
 for(const profile of names)for(const [width,colorScheme]of [[1440,'light'],[420,'dark']]){
  const id=`${profile}/${width}/${colorScheme}/ordinary/1000`,matches=profileResults.filter(p=>p.profile===profile).flatMap(p=>p.steps).filter(step=>step.id===id&&step.phase==='before');
  if(matches.length!==1||!['FORMAL','NATIVE_RETAINED'].includes(matches[0].interactions?.sidebarMode))throw Error('unestablished-visual-sidebar-mode:'+id);
  const sidebarMode=matches[0].interactions.sidebarMode;
  for(const view of UI10_CAPTURE_VIEWS){
   const captureId=ui10ControlCaptureId({profile,title:'ordinary',phase:'before',viewport:{width,height:1000},colorScheme,view});
   if(sidebarMode==='NATIVE_RETAINED'&&view.startsWith('sidebar-'))notRun.push({id:captureId,status:'NOT_RUN_NATIVE_SIDEBAR_RETAINED',sidebarMode});else expectedIds.push(captureId);
  }
 }
 return {status:'ACTUAL_SIDEBAR_MODE_APPLICABILITY',expectedIds,notRun,fullV27Acceptance:'NOT_ESTABLISHED'};
}
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function inspectSyntheticPng(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>PNG_LIMITS.perImage)throw Error('CAPTURE_TOO_LARGE_OR_NOT_BUFFER');
 if(bytes.length<45||!bytes.subarray(0,8).equals(signature))throw Error('invalid-png-signature');
 let offset=8,ihdr=false,idat=false,iend=false,width,height,channels;const compressed=[];
 while(offset<bytes.length){if(offset+12>bytes.length)throw Error('truncated-png');const n=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(n>bytes.length-offset-12)throw Error('truncated-png-chunk');if(crc32(bytes.subarray(offset+4,offset+8+n))!==bytes.readUInt32BE(offset+8+n))throw Error('invalid-png-crc');if(!ihdr&&type!=='IHDR')throw Error('missing-ihdr');if(type==='IHDR'){if(ihdr||n!==13)throw Error('invalid-ihdr');width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);if(!width||!height||width>PNG_LIMITS.maxWidth||height>PNG_LIMITS.maxHeight)throw Error('invalid-png-dimensions');const depth=bytes[offset+16],color=bytes[offset+17];if(depth!==8||![2,6].includes(color)||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]!==0)throw Error('unsupported-screenshot-png');channels=color===6?4:3;ihdr=true;}if(type==='IDAT'){idat=true;compressed.push(bytes.subarray(offset+8,offset+8+n));}offset+=n+12;if(type==='IEND'){if(n!==0||offset!==bytes.length)throw Error('invalid-iend');iend=true;break;}}
 if(!ihdr||!idat||!iend)throw Error('incomplete-png');const rowBytes=width*channels+1,decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:rowBytes*height});if(decoded.length!==rowBytes*height)throw Error('invalid-png-pixels');for(let y=0;y<height;y++)if(decoded[y*rowBytes]>4)throw Error('invalid-png-filter');return {width,height,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function syntheticPngLogRecords(captures){
 if(!Array.isArray(captures)||!captures.length||captures.length>PNG_LIMITS.records)throw Error('invalid-capture-count');const cohorts=new Set(captures.map(c=>c.id?.startsWith('mv3-control-')?c.id.split('-').slice(0,3).join('-'):c.id?.startsWith('mv3-')?'native':'components'));if(cohorts.size!==1)throw Error('mixed-job-capture-cohorts');if(cohorts.has('native')&&captures.length>8)throw Error('native-capture-count');const seen=new Set(),validated=[];let total=0;
 for(const c of captures){if(!VISUAL_PNG_IDS.includes(c.id)||seen.has(c.id))throw Error('unallowlisted-or-duplicate-image');seen.add(c.id);const png=inspectSyntheticPng(c.bytes);total+=png.bytes;if(total>PNG_LIMITS.total)throw Error('CAPTURE_TOO_LARGE');const lane=c.id.startsWith('mv3-')?'ACTUAL_MV3_OFFLINE':'WEB_MECHANISM_ONLY';if(c.metadata?.lane!==lane||c.metadata?.synthetic!==true)throw Error('invalid-synthetic-lane');if(c.metadata.viewport?.width!==png.width||c.metadata.viewport?.height!==png.height)throw Error('viewport-png-mismatch');const metadata=JSON.stringify(c.metadata);if(metadata.length>16384||/[\r\n]/.test(metadata))throw Error('metadata-too-large');const b64=c.bytes.toString('base64');validated.push({id:c.id,png,metadata:c.metadata,b64,chunks:Math.ceil(b64.length/PNG_LIMITS.chunk)});}
 const lines=['VAIWL_PNG_MANIFEST '+JSON.stringify({protocol:'synthetic-png-log/1',visualVerdict:'NOT_REVIEWED',totalBytes:total,images:validated.map(({id,png,metadata,chunks})=>({id,...png,metadata,chunks}))})];
 for(const v of validated){lines.push(`VAIWL_PNG_BEGIN ${v.id} ${v.chunks}`);for(let i=0;i<v.chunks;i++)lines.push(`VAIWL_PNG_CHUNK ${v.id} ${i+1}/${v.chunks} ${v.b64.slice(i*PNG_LIMITS.chunk,(i+1)*PNG_LIMITS.chunk)}`);lines.push(`VAIWL_PNG_END ${v.id} ${v.png.sha256}`);}if(lines.length>640)throw Error('too-many-log-lines');return lines;
}
let emissionStarted=false;
export function emitSyntheticPngs(captures,write=line=>process.stdout.write(line+'\n')){if(emissionStarted)throw Error('png-job-already-emitted');const lines=syntheticPngLogRecords(captures);emissionStarted=true;for(const line of lines)write(line);}
/** Partial completed views remain reviewable, but cannot turn a failed run green. */
export function finalizeUi10ControlVisualEvidence({report,ownedCaptures,expected,expectedIds=null,emit=emitSyntheticPngs,singleProfile=true}){
 if(!singleProfile){report.visualLog={status:'NOT_EMITTED_MULTI_PROFILE',visualVerdict:'NOT_REVIEWED',expected,available:0,complete:false,reason:'PNG retention is bounded to one explicit profile per job; default multi-profile control testing remains supported.'};if(ownedCaptures.length){report.status='FAIL';report.visualLog.status='FAILED_UNEXPECTED_MULTI_PROFILE_CAPTURES';}return report.status!=='FAIL';}
 const trusted=report.testSourcesStable?ownedCaptures.filter(x=>x.owner.sourceChangedDuringRun===false&&x.owner.buildManifestUnchanged===true).map(x=>x.capture):[];
 report.visualLog={status:'NOT_EMITTED',visualVerdict:'NOT_REVIEWED',expected,available:trusted.length};
 try{if(trusted.length){emit(trusted);report.visualLog.status='EMITTED_NOT_REVIEWED';}if(expectedIds!==null&&(!Array.isArray(expectedIds)||expectedIds.length!==expected||new Set(expectedIds).size!==expectedIds.length||expectedIds.some(id=>!UI10_CONTROL_CAPTURE_IDS.includes(id))))throw Error('invalid-expected-control-capture-set');if(report.status!=='FAIL'&&(trusted.length!==expected||expectedIds!==null&&JSON.stringify(trusted.map(c=>c.id).sort())!==JSON.stringify([...expectedIds].sort())))throw Error('incomplete-ui10-visual-capture-set');}
 catch(error){report.visualLog.status='FAILED';report.visualLog.error=String(error);report.status='FAIL';report.nativeMatrix='FAIL_LAYOUT_SUBCONTRACT_NOT_UI10_ACCEPTANCE';}
 return report.status!=='FAIL';
}
