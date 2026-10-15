import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
/** Preserve original stage failures and diagnostics even if teardown/checks fail. */
export async function finalizeJ4Report(report,steps,write){
 const cleaned=await cleanupOwnedResources(report,steps);
 try{await write();}catch(error){report.statusBeforeReportWrite=report.status;report.status='FAIL_REPORT_WRITE';report.reportWriteError=error?.stack??String(error);return false;}
 return cleaned;
}
