// The build manifest's hashes are content checks, not a signature. Rehashing a
// manifest must not add privileges, execution entry points, or page-world code.
// Keep this policy independent of buildHost, so the verifier checks the package
// actually supplied by its caller rather than trusting a builder-produced flag.
const requiredKeys=['action','manifest_version','name','version','minimum_chrome_version','permissions','host_permissions','background','content_scripts','web_accessible_resources','content_security_policy'];
// These informational fields do not add an execution or permission surface.
// Chrome still validates their values. In particular, update_url is not here.
const metadataKeys=['description','short_name','version_name','author','homepage_url','icons','default_locale','key'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const shape=(value,required,optional=[])=>record(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));

export function hostPublicResourceTarget(path){
 if(typeof path!=='string'||path.length===0)return null;
 // WAR accepts leading slashes and percent-encoded paths. Check a conservative
 // decoded resource target, not only the declaration's literal spelling. This
 // is not a reimplementation of Chromium URLPattern's NORMAL unescape rules.
 try{return decodeURIComponent(path).replace(/^\/+/, '');}catch{return null;}
}
function publicResource(path){
 const target=hostPublicResourceTarget(path);if(target===null)return false;
 // Only unambiguous package-relative paths are supported. Do not let URL or
 // filesystem normalization turn a harmless-looking declaration into a private
 // resource; a remaining percent sign would require another decoding pass.
 // Case and trailing dots are also conservative cross-platform boundaries,
 // not claims that Chromium resolves every such spelling to the same file.
 const privateTarget=target.toLowerCase();
 return target.length>0&&!/[\\%*?#:\x00-\x20\x7f]/.test(target)&&
  !target.split('/').some(part=>part===''||part.endsWith('.'))&&
  !privateTarget.startsWith('src/runtime/')&&privateTarget!=='extension/browser-bootstrap.mjs'&&
  !['status.html','extension/status.html','extension/status.mjs','extension/status.css','extension/temporary-navigation.mjs'].includes(privateTarget)&&privateTarget!=='extension/worker.mjs'&&privateTarget!=='extension/classic-runtime.js';
}

/** Structural checks complementary to verifyHost's exact origin, permission,
 * config, CSP-value, file-hash and compiled-worker checks. No package is edited. */
export function assertHostManifestBoundary(manifest){
 if(!shape(manifest,requiredKeys,metadataKeys))throw Error('invalid-host-package-manifest-boundary');
 if(!shape(manifest.action,['default_popup'])||manifest.action.default_popup!=='status.html')throw Error('invalid-host-package-manifest-boundary');
 if(!shape(manifest.background,['service_worker']))throw Error('invalid-host-package-manifest-boundary');
 if(!Array.isArray(manifest.content_scripts)||manifest.content_scripts.length!==1)throw Error('invalid-host-package-content-script');
 const script=manifest.content_scripts[0];
 // These optional Chrome defaults and their explicit, restricted spellings
 // are equivalent. Never accept MAIN, subframes, or origin/about:blank fallback.
 if(!shape(script,['matches','js','run_at'],['all_frames','world','match_about_blank','match_origin_as_fallback'])||
    JSON.stringify(script.js)!==JSON.stringify(['content.js'])||script.run_at!=='document_idle'||
    Object.hasOwn(script,'all_frames')&&script.all_frames!==false||
    Object.hasOwn(script,'world')&&script.world!=='ISOLATED'||
    Object.hasOwn(script,'match_about_blank')&&script.match_about_blank!==false||
    Object.hasOwn(script,'match_origin_as_fallback')&&script.match_origin_as_fallback!==false)throw Error('invalid-host-package-content-script');
 if(!shape(manifest.content_security_policy,['extension_pages']))throw Error('invalid-host-package-public-boundary');
 if(!Array.isArray(manifest.web_accessible_resources)||manifest.web_accessible_resources.length!==1)throw Error('invalid-host-package-public-boundary');
 const resources=manifest.web_accessible_resources[0];
 if(!shape(resources,['resources','matches'],['use_dynamic_url'])||
    !Array.isArray(resources.resources)||!resources.resources.every(publicResource)||
    Object.hasOwn(resources,'use_dynamic_url')&&resources.use_dynamic_url!==false)throw Error('invalid-host-package-public-boundary');
}
