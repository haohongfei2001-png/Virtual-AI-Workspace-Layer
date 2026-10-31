import {HOST_BROWSER_BOOTSTRAP} from './browser-bootstrap.mjs';
import {createHostWorkerRuntime} from '../src/runtime/host-worker-runtime.mjs';
import {createProductionProService} from '../src/pro/integration/production-owner.mjs';
import {HOST_CONFIG} from './config.mjs';
if(HOST_CONFIG.temporaryReadOnly!==true)createHostWorkerRuntime({chrome,indexedDB,...HOST_CONFIG,browserBootstrap:HOST_BROWSER_BOOTSTRAP,proServiceFactory:createProductionProService});
