// Replaced only by the package builder. A missing marker is never a match.
export const HOST_BUILD=/* build-runtime-fingerprint */ 'source';
export function registeredHostBuild(runtime){
 try{const value=runtime.getManifest().version_name;return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;}catch{return null;}
}
export function runtimeBuildMatches(runtime){return /^[a-f0-9]{64}$/.test(HOST_BUILD)&&registeredHostBuild(runtime)===HOST_BUILD;}
