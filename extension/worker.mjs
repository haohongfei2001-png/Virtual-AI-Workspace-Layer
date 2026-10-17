import {HOST_BROWSER_BOOTSTRAP} from './browser-bootstrap.mjs';
import {createHostWorkerRuntime} from '../src/runtime/host-worker-runtime.mjs';
import {HOST_CONFIG} from './config.mjs';
createHostWorkerRuntime({chrome,indexedDB,...HOST_CONFIG,browserBootstrap:HOST_BROWSER_BOOTSTRAP});
