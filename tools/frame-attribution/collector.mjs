// Development-only observer. Not imported by the extension or run on import.
// A real-account call needs a fresh explicit grant; offline tests use a new profile.
export const MOUNT_ANCHOR = '   const inspectLayer=';
export function mountBreakpointLine(source) {
  const lines = source.split('\n'), hits = lines.flatMap((line, i) => line.startsWith(MOUNT_ANCHOR) ? [i] : []);
  if (hits.length !== 1) throw Error('mount-anchor-not-unique');
  return hits[0];
}

function sourceLocation(frame, scripts) {
  const raw = frame?.url || scripts.get(frame?.location?.scriptId);
  try {
    const url = new URL(raw);
    if (!['https:', 'http:', 'chrome-extension:'].includes(url.protocol)) return null;
    return { source: `${url.protocol}//${url.host}${url.pathname}`,
      line: frame.location.lineNumber + 1, column: frame.location.columnNumber + 1 };
  } catch { return null; }
}
function errorCode(error) {
  const text = String(error?.message ?? error);
  if (/not.*paused|Can only perform operation while paused/i.test(text)) return 'NOT_PAUSED';
  if (/DOM agent hasn.t been enabled/i.test(text)) return 'DOM_ALREADY_INACTIVE';
  if (/timeout|timed out/i.test(text)) return 'TIMEOUT';
  if (/denied|not allowed|disabled in|policy|permission/i.test(text)) return 'ACCESS_REFUSED';
  if (/not find.*breakpoint|breakpoint.*not found/i.test(text)) return 'BREAKPOINT_ABSENT';
  if (/Could not find node with given id|No node with given id found/i.test(text)) return 'NODE_ALREADY_GONE';
  return 'COMMAND_FAILED';
}
const requireValue = (value, reason) => { if (!value) throw Error(reason); };

export async function collectFrameAttribution({ cdp, reload, extensionOrigin, mountLine,
  observationMs = 30000, maxPauses = 20, now = Date.now }) {
  requireValue(/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin), 'invalid-owned-origin');
  requireValue(Number.isInteger(mountLine) && mountLine >= 0, 'invalid-mount-line');
  requireValue(observationMs > 0 && observationMs <= 30000 && maxPauses > 0 && maxPauses <= 20, 'invalid-budget');
  const mountURL = extensionOrigin + '/src/navigation/mount-surface.mjs';
  const report = { schema: 'vaiwl-frame-attribution-v1', state: 'NOT_RUN', refreshes: 0,
    pauses: 0, truncated: false, armed: 0, nodeRebindings: 0, pauseClasses: [], writes: [], cleanup: {} };
  const scripts = new Map(), frames = new Map(), group = 'vaiwl-owned-frame-attribution';
  let debuggerEnabled = false, domEnabled = false, breakpoint, cursor, stage = 'setup',
    started, deadline, pendingWrite, objectsUsed = false, reloadOutcome = 'NOT_STARTED';
  const command = async (method, params = {}, cleanup = false) => {
    stage = method;
    if (!cleanup && deadline && now() >= deadline) throw Error('observation-deadline');
    return cdp.send(method, params, { timeoutMs: cleanup ? 1500 : Math.max(1, Math.min(1500, deadline ? deadline - now() : 1500)) });
  };
  const evaluate = async (callFrameId, expression, returnByValue = true) => {
    objectsUsed = true;
    const r = await command('Debugger.evaluateOnCallFrame', { callFrameId, expression,
      returnByValue, silent: true, throwOnSideEffect: true, generatePreview: false, objectGroup: group });
    requireValue(r && !r.exceptionDetails && r.result, 'owned-evaluation-failed');
    return r.result;
  };
  const hasInline = async objectId => {
    const r = await command('Runtime.callFunctionOn', { objectId,
      functionDeclaration: "function(){return this.hasAttribute('srcdoc')}",
      returnByValue: true, silent: true, throwOnSideEffect: true });
    requireValue(!r?.exceptionDetails && typeof r?.result?.value === 'boolean', 'owned-attribute-read-failed');
    return r.result.value;
  };
  const finishWrite = write => {
    report.writes.push({ role: write.role, attribute: 'srcdoc', stack: write.stack });
    report.state = write.stack[0]?.source ? 'WRITER_OBSERVED' : 'WRITE_OBSERVED_SOURCE_UNRESOLVED';
  };
  try {
    // Establish the cursor BEFORE enabling Debugger: enable itself emits script metadata.
    const initial = await cdp.readEvents({ methods: ['Debugger.scriptParsed', 'Debugger.paused'], limit: 1000 });
    requireValue(Number.isInteger(initial?.cursor), 'event-cursor-unrecognized'); cursor = initial.cursor;
    await command('Debugger.enable'); debuggerEnabled = true;
    await command('DOM.enable'); domEnabled = true;
    const bp = await command('Debugger.setBreakpointByUrl', { url: mountURL, lineNumber: mountLine });
    requireValue(typeof bp?.breakpointId === 'string' && bp.breakpointId.length, 'breakpoint-response-unrecognized');
    breakpoint = bp.breakpointId;
    started = now(); deadline = started + observationMs;
    report.refreshes = 1; report.state = 'OBSERVING'; reloadOutcome = 'PENDING';
    // Never await an unbounded reload while the page can be paused at our breakpoint.
    Promise.resolve().then(reload).then(() => { reloadOutcome = 'COMPLETE'; }, () => { reloadOutcome = 'FAILED'; });
    while (report.state === 'OBSERVING' && now() < deadline && report.pauses < maxPauses) {
      stage = 'read-events';
      const batch = await cdp.readEvents({ methods: ['Debugger.scriptParsed', 'Debugger.paused'],
        afterSequence: cursor, limit: 1000, timeoutMs: Math.min(250, Math.max(1, deadline - now())) });
      requireValue(Number.isInteger(batch?.cursor) && Array.isArray(batch.events), 'event-response-unrecognized');
      cursor = batch.cursor; report.truncated ||= batch.truncated === true;
      // Consume positive returned events even if older unrelated events were evicted.
      for (const event of batch.events) {
        if (now() >= deadline || report.pauses >= maxPauses) break;
        const p = event.params ?? {};
        if (event.source?.sessionId || event.source?.targetId) continue;
        if (event.method === 'Debugger.scriptParsed') {
          if (scripts.size < 4096 && typeof p.scriptId === 'string' && typeof p.url === 'string') scripts.set(p.scriptId, p.url);
          continue;
        }
        if (event.method !== 'Debugger.paused') continue;
        report.pauses++;
        const top = p.callFrames?.[0], ownHit = p.hitBreakpoints?.includes(breakpoint) === true;
        report.pauseClasses.push({ ownHit, hasTop: !!top, urlPresent: !!top?.url,
          kind: p.reason === 'DOM' ? 'dom' : p.reason === 'step' ? 'step' : 'other' });
        if (pendingWrite) {
          // A nested/independent breakpoint cannot certify the previous write.
          if (p.reason !== 'step') { report.state = 'STEP_INTERRUPTED'; break; }
          if (await hasInline(pendingWrite.objectId)) finishWrite(pendingWrite);
          pendingWrite = null;
          await command('Debugger.resume');
          if (report.state !== 'OBSERVING') break;
          continue;
        }
        if (ownHit) {
          requireValue(top?.callFrameId, 'owned-pause-missing-frame');
          // The exact breakpoint ID is authoritative even when CallFrame.url is empty.
          if (top.location?.scriptId) scripts.set(top.location.scriptId, mountURL);
          const check = await evaluate(top.callFrameId,
            `surfaces.map(s=>({role:s.role,owned:s.frame.tagName==='IFRAME'&&s.node.hasAttribute('data-va-owned')&&s.frame.parentNode===s.node&&s.frame.getAttribute('src')===${JSON.stringify(extensionOrigin)}+'/'+(s.role==='workspace'?'workspace.html':'sidebar.html'),connected:s.frame.isConnected,inline:s.frame.hasAttribute('srcdoc')}))`);
          requireValue(Array.isArray(check.value) && check.value.length === 2 &&
            new Set(check.value.map(x => x.role)).size === 2 &&
            check.value.every(x => ['workspace', 'sidebar'].includes(x.role) && x.owned && x.connected), 'owned-frames-not-confirmed');
          if (check.value.some(x => x.inline)) { report.state = 'INLINE_PRESENT_BEFORE_ARM'; break; }
          const objects = [];
          for (let i = 0; i < 2; i++) {
            const object = await evaluate(top.callFrameId, `surfaces[${i}].frame`, false);
            requireValue(typeof object.objectId === 'string', 'owned-object-missing');
            objects.push({ objectId: object.objectId, role: check.value[i].role });
          }
          // A frontend node ID may expire while iframe documents initialize.
          // At most ONE remapping, only while still at our own pause and only
          // for the same live RemoteObjects. This never refreshes/replaces DOM.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await command('DOM.getDocument', { depth: 0 });
              for (const object of objects) {
                const node = await command('DOM.requestNode', { objectId: object.objectId });
                requireValue(Number.isInteger(node?.nodeId) && node.nodeId > 0, 'owned-node-missing');
                await command('DOMDebugger.setDOMBreakpoint', { nodeId: node.nodeId, type: 'attribute-modified' });
                frames.set(node.nodeId, object);
                report.armed = frames.size;
              }
              break;
            } catch (error) {
              if (attempt !== 0 || errorCode(error) !== 'NODE_ALREADY_GONE') throw error;
              for (const object of objects) {
                const live = await command('Runtime.callFunctionOn', { objectId: object.objectId,
                  functionDeclaration: `function(){return this.isConnected&&this.tagName==='IFRAME'&&this.parentNode?.hasAttribute('data-va-owned')&&this.getAttribute('src')===${JSON.stringify(extensionOrigin+'/'+object.role+'.html')}&&!this.hasAttribute('srcdoc')}`,
                  returnByValue: true, silent: true, throwOnSideEffect: true });
                requireValue(!live?.exceptionDetails && live?.result?.value === true, 'owned-node-no-longer-live');
              }
              for (const nodeId of frames.keys()) {
                try { await command('DOMDebugger.removeDOMBreakpoint', { nodeId, type: 'attribute-modified' }); }
                catch (cleanupError) { if (errorCode(cleanupError) !== 'NODE_ALREADY_GONE') throw cleanupError; }
              }
              frames.clear(); report.armed = 0; report.nodeRebindings++;
            }
          }
          report.armed = frames.size;
          await command('Debugger.removeBreakpoint', { breakpointId: breakpoint }); breakpoint = null;
        } else if (p.reason === 'DOM' && p.data?.type === 'attribute-modified' && frames.has(p.data.nodeId)) {
          const owned = frames.get(p.data.nodeId);
          const write = { ...owned, stack: (p.callFrames ?? []).slice(0, 10).map(f => sourceLocation(f, scripts)) };
          if (await hasInline(owned.objectId)) finishWrite(write);
          else { pendingWrite = write; await command('Debugger.stepOver'); continue; }
        } else {
          // A pause outside our known breakpoints is not silently consumed.
          report.state = 'UNCLASSIFIED_PAUSE'; break;
        }
        await command('Debugger.resume');
        if (report.state !== 'OBSERVING') break;
      }
      if (reloadOutcome === 'FAILED' && report.state === 'OBSERVING') report.state = 'RELOAD_FAILED';
    }
    if (report.state === 'OBSERVING') report.state = report.pauses >= maxPauses ? 'PAUSE_LIMIT' : 'DEADLINE';
  } catch (error) {
    report.state = String(error.message) === 'observation-deadline' ? 'DEADLINE' : 'STOPPED';
    report.failure = { stage, code: errorCode(error) };
    // Our fixed local validation messages carry no source or account data.
    if (/^[a-z]+(?:-[a-z]+)+$/.test(error.message)) report.failure.validation = error.message;
  } finally {
    report.observationElapsedMs = started === undefined ? 0 : now() - started;
    const cleanupStart = now();
    const clean = async (label, method, params = {}) => {
      try { await command(method, params, true); report.cleanup[label] = 'DONE'; }
      catch (error) { report.cleanup[label] = errorCode(error); }
    };
    for (const [nodeId, f] of frames) await clean(`attribute-${f.role}`, 'DOMDebugger.removeDOMBreakpoint', { nodeId, type: 'attribute-modified' });
    if (breakpoint) await clean('sourceBreakpoint', 'Debugger.removeBreakpoint', { breakpointId: breakpoint });
    if (debuggerEnabled) {
      await clean('resume', 'Debugger.resume');
      await clean('debugger', 'Debugger.disable');
    }
    if (objectsUsed) await clean('objects', 'Runtime.releaseObjectGroup', { objectGroup: group });
    if (domEnabled) await clean('dom', 'DOM.disable');
    report.cleanupElapsedMs = now() - cleanupStart;
    report.reload = reloadOutcome;
    scripts.clear(); frames.clear(); pendingWrite = null;
  }
  return report;
}
