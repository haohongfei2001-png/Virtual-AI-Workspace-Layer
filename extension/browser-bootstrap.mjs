import {createHostBrowserBootstrap} from '../src/runtime/host-browser-bootstrap.mjs';
import {HOST_CONFIG} from './config.mjs';

// Keep this dependency light and first in worker.mjs. Static imports below it
// still load normally; this only narrows the listener-registration window.
export const HOST_BROWSER_BOOTSTRAP=HOST_CONFIG.temporaryReadOnly===true?null:createHostBrowserBootstrap({chrome,...HOST_CONFIG});
