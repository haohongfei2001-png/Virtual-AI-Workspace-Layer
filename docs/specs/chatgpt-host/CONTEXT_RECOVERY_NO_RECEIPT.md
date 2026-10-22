# Worker 无有效 context 证据时的恢复

这是现有 `DEVELOPMENT_PLAN.md` 的 B1.F / C2 / SYS-02 恢复契约补充，不是第二份开发计划。

- 首次范围声明基准：`3c8a33dae36ca0de11841570ac6fb44d4331dd5a`，PR #16 的 Free 分支。
- Pro 原交付：PR #17 / `462ff1b2fb7b7fe4103b1b63f4e5f13e4babb013`，验证基准 `8f146ea99297d6f82739b5792d704577fa65416e`。原交付及其实际验证作为历史保留。
- dot 整合基准：Free `3276ab8b1b71d4851672322756355ba70f079342`；实际提交父级 `47899a5ec83233b94c7fc4c2afe8ff7093b4c9aa` 的生产源码与其相同，仅追加诊断及证据。独立审查复现服务共享授权收尾与 B 交付边界问题后修订；本文件第 7 节及当前验证记录对应修订后的实际接线，不能追认原 Pro 交付无阻断。
- 专项分支：`codex/pro-context-recovery-20261018`。
- Pro 原协作范围仅本文件、`src/runtime/context-recovery/` 和 `tests/runtime/context-recovery/`。交回后由 dot 作为 Free 唯一集成 writer 接入既有 `host-binding-service.mjs`；未扩展生产 profile、权限、TTL 或验收目标。
- 权威顺序：用户 2026-10-18 的本次明确授权优先；原 AUTHORITY、VA-HOST/1.1 FINAL §5、HOST_CONTRACTS、原验收要求继续有效。
- 当前结论：无证据 C2 不能凭空自动恢复；可实现安全等待、新合法证据后的原链授权、有限失败及晚回复隔离。`SCOPE_VERIFIED` 不等于 fresh UiGrant + VIEW，更不等于真实 ChatGPT / G 验收通过。

## 1. 必须分开的 A 与 B

**A：有效上下文证据仍在，仅 transport、HELLO、producer、mount 或握手失效。** 这是 dot 的专项。没有 ScopeGrant 不代表没有 context receipt。当前 Authority 的 pending 认证也不能被误当成证据丢失。本模块不重建 transport、不改 content 的一次恢复预算、不增加 READY 通知。

**B：当前 worker 的既有 context owner 无法提供有效证据。** 策略先调用原 `contextObserver.verify(frame,{signal})`。只有它确实返回 `null` 且没有可用 C3 语义，才记录一个 B 等待过程。新的有效 receipt 到来后，该过程允许一次原授权调用；同一 receipt 被拒绝、取消或超时后不能通过重复请求重开机会。只有原 BindingService 的最终 document 核验及最外层六秒期限通过，才通过私有 `confirmDelivery` 退出 B，正常续验重新交回原链。策略 Promise 先返回 verified 尚不退还 receipt 消耗；服务后验拒绝、取消或超时仍保持同 receipt 已尝试。

若新 worker 在首次 HOST_REFRESH 前已经捕获合法原生请求，则首次 probe 可以直接取得 receipt。这是正常的新授权，不必人为拒绝一次再进入 B。已有 `verified` / 外部 `pending` Authority 时接线直接执行原授权链，不插入竞争的 body challenge；但同一私有 owner 已经在本策略内运行的工作必须再次进入 `run()` 加入独立 subscriber，不能因自己的 pending 而旁路。策略授权已经结束但服务尚未交付时，`ownsDelivery` 继续识别这个精确 grant；相同 owner 的后续调用只取 Authority 当前同对象结果并重验调用者，不重复身份读取，也不刷新 grant 的 TTL。C3 不套 C2 的 receipt 去重。若在策略的异步边界才发现另一个外部 pending，直接返回原 pending 状态，不调用 authorize，也不取得外部后续 grant 的清理权。

## 2. 自动恢复的准确边界

| 条件 | 允许的行为 | 当前实现状态 |
|---|---|---|
| C1：新认证响应确实证明当前 document / selection epoch 的 active context | 可通过已验证 provider 重新取证 | 主规格允许，但当前 `scope-authority.mjs` 没有 C1 分支；本专项不创造开关，BLOCKED |
| C2：没有有效 receipt | 返回 `ambiguous/current-context-unproven`，原生界面继续可用，等待真正新原生信号 | 本模块实现；等待无网络、无轮询、无挂起 Promise |
| C2：新的正常 native GET 已被原 owner 接受，当前 body / document / roster 一致 | 通过原 HOST_REFRESH / Authority 进行一次新授权 | 本模块可调用；接线 diff 由 dot 整合 |
| C3：packaged profile 已证明默认个人绑定语义，新认证 roster 恰好一个 personal context | 原 Authority 正常 fresh refresh | 已有实现；本模块不另造 C3，不限制其正常续验 |
| 缓存命中、原生请求早于新 owner 安装、缺 header、prefetch、扩展自发 GET | 均不能补齐 C2 选择证据 | 等待；不自动刷新页面、不模拟用户点击、不发探测 GET |
| 并发 context 冲突、body 不符、旧 receipt、已到期、撤销或未知 profile | 保留拒绝、ambiguous 或 BLOCKED | 仅新独立合法证据可推进；不能放宽校验 |

生产 `extension/config.mjs` 在本基准仍为 `chatgpt-context-unverified` / `singlePersonalDefault:false`；C2/C3 是明确的离线 profile 组装。新模块的测试不证明生产 profile 的字段或信号真实可用。**G = BLOCKED / NOT_RUN**。

### 2.1 不可实现反例

同一 principal U 拥有 P（personal）和 T（organization），会话 C 在两者均可访问。两个可能世界如下：

| 新 worker 能看到的事实 | 世界一 | 世界二 |
|---|---|---|
| session principal / roster | U / [P,T] | U / [P,T] |
| tab、document、URL | 同一个 tab / document / `/c/C` | 完全相同 |
| 页面标题、body 关联对象、DOM | 相同 | 相同 |
| 原生内存缓存 | 命中，无新 native request | 命中，无新 native request |
| 扩展 GET C(P) / C(T) | 两者均成功 | 两者均成功 |
| 用户实际选择 | P | T |
| 有效 context receipt | 无 | 无 |

可观察输入完全相同，正确答案却不同。任何确定选择函数在两个世界输出相同，至少一个错误；随机选择也不能保证正确。扩展自发 GET 只能证明可访问，不能证明当前选择。另一个标签的 context 也不能替本标签授权。

因此，本专项不能关闭“完全没有新信号也必须在 15 秒内正确选中 context”的不可能要求。它实现的是：正确等待／拒绝，并在现有信任机制取得新证据后恢复。完全不产生任何可观察信号的同 URL 切换瞬间，也不能声称实时检测；这是原规格 §5.4 已明确的边界。

## 3. 复用的证据与新鲜度

唯一 C2 证据 owner 仍是 [`browser-request-context.mjs`](../../../src/runtime/browser-request-context.mjs)。策略没有 `importReceipt`、`restoreGrant`、自发网络或存储 API。

原 owner 的 receipt 要求私有对象同一性 `document.receipt === receipt`、当前 selection epoch 和原时钟有效。旧 worker 的对象、结构完全相同的 JSON、同 ID 字符串或页面 READY 声明都不能恢复这个身份。策略只接收 `verify()` 的实际返回值，并在授权前后检查 `isCurrent()`。

原 GET 条件全部保留：top-frame / active document / 非隐身、第一方 initiator、白名单精确路径、GET / xmlhttprequest、唯一合法 context header、非 prefetch/prerender、新 requestId、同请求的非缓存 HTTP 200、前后 browser frame/tab 复核、原始六秒内完成、无冲突、当前 body association。roster 归属和 principal 认证仍由 Authority 执行。Project request profile 仍只限既有 loopback 配置。

| 时钟／权限 | 原上限与起点 | 专项处理 |
|---|---|---|
| native request | 从原 `onSendHeaders` 起，wall 与 elapsed 均小于 6 秒 | 不改变、不续起点 |
| C2 receipt | 从原请求起，最多 60 秒；回拨使对象失效 | 原 owner `isCurrent`，不复制 TTL |
| ScopeGrant | min(session expiry, proofTTL, receipt 原起点 + 60 秒) | 只接受 Authority 当前同对象结果，交付前再次检查 |
| HOST_REFRESH | 原调用开始起 6 秒，包含先前 frame / handshake 检查 | preflight 和认证共享剩余时间，不拼接两个六秒 |
| document lease | 原 20 秒 | HELLO / renewal 原逻辑不变 |
| 完整恢复验收 | 原 fresh UiGrant + 对应 VIEW 的 15 秒窗口 | 不重置；有 ScopeResolution 不代表满足 |

撤销、同 URL context 切换、导航、document 替换、tab close、profile 改变、stop 和到期均不能让旧工作结果发布。对同 URL 的空间切换，依赖原 owner 同步 drop / onInvalidate；不依赖 URL 改变才换 generation。

## 4. 状态机与结果

| 状态 | 含义 | 后继与限制 |
|---|---|---|
| IDLE | 该 document 尚无策略记录 | 合法 HOST_REFRESH → CHECKING |
| CHECKING | 有界原 owner probe；不构造证据 | 无证据 → WAITING_NATIVE；原证据可用 → AUTHORIZING；外部 pending 抢先时返回该状态、结束工作 |
| WAITING_NATIVE | 已返回缺证据的 ambiguous；不保活 worker | 现有 READY → 新 HELLO / HOST_REFRESH；再次读取 live owner |
| AUTHORIZING | 一次原授权闭包正在运行 | 合法当前结果 → SCOPE_VERIFIED；拒绝／超时 → BLOCKED；失效 → CANCELLED |
| SCOPE_VERIFIED | Authority 当前 ScopeResolution 已取得；若存在私有 pending delivery，B 尚未退役 | 仅服务最终成功的 `confirmDelivery` 退役 B；未交付失败不能重开同 receipt；仍须新 UiGrant 与实际 VIEW |
| BLOCKED | 当前输入不能恢复，同一 B receipt 不自动重试 | 新独立有效 receipt 可再尝试；没有 catch/timer 自循环 |
| CANCELLED | 当前 generation 被取消或 owner 停止 | 活实例只接受新的合法调用；stop 后实例永久终结 |

`inspect()` 只返回状态和非私人 reason，不返回 receipt、scopeKey、标题、账户 roster 或 grant；它不是授权 API。成功输出直接是原 `ScopeResolution`，没有自签的 `verified` 结果。未签出的 UI 和旧缓存永远不能因策略状态而开放。

`ownsFlight(frame,attemptOwner)` 判断相同 frame / 私有 owner 的有效在途工作；`ownsDelivery` 判断同 owner 已授权但尚未完成服务交付的精确 grant。二者仅供内部选择 `run()` 的并发加入路径，不向页面暴露、不代替 Authority。`confirmDelivery(frame,attemptOwner,grant)` 还要求当前 slot/generation、相同 document/URL、原 grant 对象、仍有效 receipt；复制 grant、其他 owner、撤权或 stop 均不能确认。外部 pending 仍由原链管理。

### 4.1 有界并发与取消

状态至少按 tabId + documentId 隔离。每次操作还绑定现有私有 producer 对象 `attemptOwner`。这个对象只用于任务归属，不是新的权限凭据。相同 owner / frame 的并发调用共享一次工作；不同 producer 或新 document 替换旧 generation，晚回复只清理自己。

每个 subscriber 保留自己的 signal、isCurrent 和父 RPC 剩余期限。单个 subscriber 取消不取消其他仍有效 subscriber；最后一个离开才 abort 底层。后加入者不能延长首个操作的原期限；后加入者较短的期限只限制自己的等待。每文档至多 128 个 subscriber、默认至多 128 个活动 document；达到容量返回拒绝，不驱逐仍有权的其他 tab。

真实 frame 核验后的新 document 会退休同 tab 的旧 document 槽，避免长期标签反复 reload 耗尽容量。同 document 导航／重复 HELLO 不通过清表补回 B 尝试次数。tab close 调 `forgetTab`；stop 取消、清表并禁止复活。空 WAITING 没有 timer、subscriber 或在途工作，不阻止休眠。

授权结果在 Authority 返回和最终 subscriber 回交两个 Promise 边界各复核一次。BindingService 还在最外层 deadline 返回后，同步复核当前 grant、producer、document binding，再一次性标记 producer.verified 和交付确认，防止 Promise 间隙提前进入 A 路径。若晚到结果需要撤回，只在 `authority.peek(frame).grant === 本次返回对象` 且对象不是调用前旧 grant 时调用原 `authority.invalidate`；不按 document 无条件撤销可能属于更新操作的 grant。

服务端对同一个实际 grant 的并发交付使用私有 WeakMap claim：失败只释放自己；另一个同组调用仍在有效交付或已经成功时不能误撤其 grant。最后一个调用退出即删除该组；全体失败仍撤权，历史成功不会永久豁免下一次失败。显式 invalidate/stop 与 HOST_FOCUS 的原强制撤权保持。没有新增持久记录或授权来源。

## 5. 调用合同

实现：[`no-receipt-recovery.mjs`](../../../src/runtime/context-recovery/no-receipt-recovery.mjs)。JSDoc 直接引用既有 `BrowserFrameContext` / `ScopeResolution`，Authority 和 receipt API 是现有实现，没有另起类型授权体系。

```js
const recovery = createNoReceiptContextRecovery({
  profile, contextObserver, authority, now, elapsedNow, schedule, cancel
});

const resolution = await recovery.run(frame, {
  attemptOwner: producer, // 现有 sequences 中的私有对象
  signal: attempt.abort.signal,
  remainingMs: () => 6000 - (elapsedNow() - attempt.started),
  isCurrent: () => serviceActive && attempt.active && !producer.denied &&
    sequences.get(message.producerToken) === producer && handshake.isBound(message, sender),
  authorize: ({signal}) => authority.refresh(frame, 'auth-change', signal)
});
```

示例为 fresh refresh；第 7 节 diff 保留原 `firstFresh`、focus、renewal 的具体调用选择。`authorize` 必须同步开始原 Authority 调用，不能在前面插入异步工作；必须使用传入的共享操作 signal，不能捕获第一个 subscriber 的 signal。其身份 fallback 仍运行在原 BindingService 的 `refreshAttempts` 内，所以沿用原剩余预算和 producer 关联。页面不能调用此模块、传入 owner 对象、伪造 authorize callback 或提交 receipt。服务必须在自身最终检查及原外层 deadline 成功后同步调用 `confirmDelivery(frame,producer,resolution.grant)`；不等待 VIEW 才确认，也不以确认代替独立的 fresh UiGrant + VIEW 验收。直接使用策略的最终消费者也须在真正交付时确认；测试 fixture 明确模拟这一步。

仅在原 HOST_REFRESH 已通过 schema、sender、HELLO、seq、实际 Chrome frame 校验后使用。原 `firstFresh` 及其旧 UI/observation 撤销保持。已有 verified grant 的新 producer 仍执行原 fresh auth；HOST_FOCUS 和已经 verified producer 的续验保持原路径。

## 6. 与原恢复预算的关系

模块不发 GET、不重发 send/create、不读 Native/Shared 数据、不补 WAL、不预取历史。等待缺证据时，重复 HOST_REFRESH 或连续新 worker 都不产生身份网络调用。一次 B 失败不由 catch、timer、重复 READY 或相同 receipt 重试。

既有 `SharedHostReadBudget` 的 30 秒 / 12 请求 / 首次 + 最多两次重试及跨 lease / worker / tab 持久 reservation 保持原样。但是基准 `session-provider.mjs` 只有 `current && readBudget` 才 reserve；普通 session/roster 身份读取并不自动受这个持久计数覆盖。**本专项不声称替身份认证建立了新的跨重启总预算，也不猜一个 scope 去 reserve。** 新合法证据只进入一次已有固定身份链；有授权后的元数据读取仍走原共享预算。

content 原 `recoveryRemaining=1` 的 transport/mount 一次恢复、原六秒请求、staged preparation、15 秒 fresh-grant + VIEW 均不改变。无证据等待不消耗不存在的网络尝试，也不重置后续验收计时。C3 正常认证次数由现有调用者控制，不使用 B 的一次性表。

## 7. Free 实际整合的精确接线 diff

下面只改 `src/runtime/host-binding-service.mjs`，包含 dot 独审后修订的并发交付收尾。Pro 原协作提交没有直接改该文件；Free 整合应用此精确 diff。不修改 content-session、bootstrap、authority、provider、存储或 profile。原 browser owner → service.invalidate → PENDING 与 READY → content.begin(true) 保持；首次 probe 也能读取 READY 通知发出早于 service 挂载时已经建立的真实 receipt，不重放通知。

适用基准为 Free `3276ab8`（其 service 与 Pro 原验证基准字节相同）。diff 的 UTF-8 字节（含末尾换行）SHA-256 为 `02ea832012db671c9f8dc27fc5aeaf5c73ecb4380b06563a3c89cd77f767ab4e`。dot 在最新 Free 自己的工作区核对 WIP 后 `git apply --check`，若该文件已推进，应逐 hunk 合并而非覆盖。本次 Free 整合包含该实际接线；专项测试仍只在新临时源码副本执行前向或完整 reverse-check，运行实际 service / authority / UiGrant / VIEW，不以副本测试替代已提交源码与浏览器结果。

测试同时支持 dot 完成接线后的代码：前向检查失败时必须通过完整 `git apply --reverse --check` 才直接验证已接线副本；不会实际撤回补丁。部分接线、过时 hunk、其他冲突和异常进程均失败，没有通过忽略 patch 错误来获得 PASS。

<!-- BEGIN CONTEXT_RECOVERY_WIRING_DIFF -->
```diff
diff --git a/src/runtime/host-binding-service.mjs b/src/runtime/host-binding-service.mjs
--- a/src/runtime/host-binding-service.mjs
+++ b/src/runtime/host-binding-service.mjs
@@ -1,5 +1,6 @@
 import {createHostNativeActivityOwner} from './host-native-activity-owner.mjs';
 import {validateNativeActivityProfile} from './native-activity-profile.mjs';
+import {createNoReceiptContextRecovery} from './context-recovery/no-receipt-recovery.mjs';
 import {createIsolatedSessionOwner} from './isolated-session-owner.mjs';
 import {createHostEntryCalibration} from './host-entry-calibration.mjs';
 import {createHostIngestionPassOwner} from './host-ingestion-pass-owner.mjs';
@@ -53,6 +54,7 @@
   }
  }:null;
  const authority=createScopeAuthority({provider,profile,readIdentity,contextObserver,allowedURL,now,makeId,elapsedNow,schedule,cancel});
+ const contextRecovery=profile.browserRequestContext===true&&contextObserver?createNoReceiptContextRecovery({profile,contextObserver,authority,now,elapsedNow,schedule,cancel}):null;
  const asFrame=(doc,sender)=>({tabId:doc.tabId,frameId:0,documentId:doc.documentId,parentDocumentId:null,actualURL:doc.url,documentLifecycle:'active',incognito:sender.tab?.incognito===true});
 
  const ingestionPasses=surfaceProfiles?createHostIngestionPassOwner({handshake,authority,getFrame,profiles:surfaceProfiles,now,elapsedNow,schedule,cancel}):null;
@@ -90,6 +92,22 @@
  backup=ui&&['exportBackup','previewRestore','restoreBackup'].every(name=>typeof workspaceRepository?.[name]==='function')?createHostBackupService({ui,workspaceRepository,onRestored:scopeKey=>{views?.refreshScope(scopeKey);ui.notifyScope?.(scopeKey);},elapsedNow,schedule,cancel,makeId}):null;
  const commands={};if(readService)for(const name of ['snapshot','command','undo','history','saveView','exportBackup','previewRestore','restoreBackup','recoveryStatus','recover'])if(typeof workspaceRepository[name]==='function')commands[name]=workspaceRepository[name].bind(workspaceRepository);
  const broker=createDocumentBindingBroker({extensionId,getFrame,allowedURL,repository,workspaceRepository:readService?{...readService,...commands}:workspaceRepository,freeRuntime,now,makeId,hostHandshake:handshake,resolveScope:({currentFrame,sender})=>authority.scopeFor(asFrame(currentFrame,sender))});
+ // Claims last only through concurrent service delivery, not the grant lifetime.
+ // A failed subscriber cannot revoke a sibling's completed or pending delivery.
+ const resolutionClaims=new WeakMap();
+ function claimResolution(attempt,resolution){
+  if(resolution?.state!=='verified')return;
+  let claim=resolutionClaims.get(resolution.grant);
+  if(!claim){claim={grant:resolution.grant,users:new Set(),delivered:false};resolutionClaims.set(claim.grant,claim);}
+  claim.users.add(attempt);attempt.resolutionClaim=claim;
+ }
+ function releaseResolution(attempt){
+  const claim=attempt.resolutionClaim;if(!claim)return;
+  claim.users.delete(attempt);
+  if(claim.users.size)return;
+  resolutionClaims.delete(claim.grant);
+  if(!claim.delivered&&attempt.frame&&authority.peek(attempt.frame).grant===claim.grant)authority.invalidate(attempt.frame.documentId);
+ }
  const sequences=new Map(),refreshAttempts=new Set();let serviceActive=true;
  async function handleWork(message,sender){
   if(message?.type==='HOST_OLD_SEND_OPERATION')return {ok:oldSendTerminal?await oldSendTerminal.intent(message,sender):false};
@@ -148,11 +166,16 @@
   // Ordinary renewals keep the existing bounded revalidation/single-flight path.
   const firstFresh=!producer.verified&&!producer.freshStarted;
   if(firstFresh){producer.freshStarted=true;ingestionPasses?.invalidateDocument(frame.documentId);observations?.invalidateDocument(frame.documentId);ui?.revokeDocument(frame.documentId);views?.revokeDocument(frame.documentId);}
-  const resolution=await (focus?authority.revalidate(frame,attempt.abort.signal,{force:true}):!producer.verified?authority.refresh(frame,firstFresh?'auth-change':'focus',attempt.abort.signal):authority.peek(frame).state==='verified'?authority.revalidate(frame,attempt.abort.signal):authority.refresh(frame,'bind',attempt.abort.signal));attempt.resolution=resolution;
+  const authorize=({signal})=>focus?authority.revalidate(frame,signal,{force:true}):!producer.verified?authority.refresh(frame,firstFresh?'auth-change':'focus',signal):authority.peek(frame).state==='verified'?authority.revalidate(frame,signal):authority.refresh(frame,'bind',signal);
+  const resolution=await (contextRecovery&&!focus&&!producer.verified&&(contextRecovery.ownsFlight(frame,producer)||contextRecovery.ownsDelivery(frame,producer)||!['verified','pending'].includes(authority.peek(frame).state))?contextRecovery.run(frame,{
+   attemptOwner:producer,signal:attempt.abort.signal,remainingMs:()=>6000-(elapsedNow()-attempt.started),
+   isCurrent:()=>serviceActive&&attempt.active&&!producer.denied&&sequences.get(message.producerToken)===producer&&handshake.isBound(message,sender),
+   authorize
+  }):authorize({signal:attempt.abort.signal}));attempt.resolution=resolution;if(!focus)claimResolution(attempt,resolution);
   if(resolution.state!=='verified')firstSend?.invalidateTab(frame.tabId);
   if(focus&&resolution.state!=='verified'){denyFocus();revokeFocus();}check();
   const verified=await handshake.verify(message,sender);check();
-  if(!verified){firstSend?.invalidateTab(frame.tabId);if(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant)authority.invalidate(frame.documentId);revokeFocus();return {ok:false,reason:'stale-host-document'};}
+  if(!verified){firstSend?.invalidateTab(frame.tabId);if(focus&&resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant)authority.invalidate(frame.documentId);revokeFocus();return {ok:false,reason:'stale-host-document'};}
   if(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant){const scope=authority.scopeFor(frame);if(scope)views?.confirmScope(frame,scope.key);}
   const recoveryProfiles=[...(surfaceProfiles?.size===1?[surfaceProfiles.values().next().value]:[]),...(ackProfile&&resolution.grant?.principal?.providerProfile===ackProfile.providerProfile?[ackProfile]:[])];
   if(!focus&&resolution.state==='verified'&&continuations&&recoveryProfiles.length&&elapsedNow()-attempt.started<4500){
@@ -175,16 +198,23 @@
    const stillVerified=await handshake.verify(message,sender);check();
    if(!stillVerified||authority.peek(frame).grant!==resolution.grant)return {ok:false,reason:'stale-host-document'};
   }
-  if(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant&&sequences.get(message.producerToken)===producer)producer.verified=true;
+  if(resolution.state==='verified'&&(authority.peek(frame).grant!==resolution.grant||sequences.get(message.producerToken)!==producer))return {ok:false,reason:'stale-host-document'};
   return {ok:true,v:1,type:'HOST_SCOPE_STATUS',state:resolution.state,...(resolution.state==='verified'&&authority.peek(frame).grant===resolution.grant?{scopeKey:authority.scopeFor(frame)?.key}:{}),...(resolution.reason?{reason:resolution.reason}:{})};
-  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});attempt.completed=true;return result;}catch{return {ok:false,reason:'host-refresh-unavailable'};}
+  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
+  if(result.ok===true&&result.state==='verified'){
+   check();
+   if(!attempt.frame||authority.peek(attempt.frame).grant!==attempt.resolution?.grant||sequences.get(message.producerToken)!==attempt.producer||!handshake.isBound(message,sender))return {ok:false,reason:'stale-host-document'};
+   attempt.producer.verified=true;
+   if(attempt.resolutionClaim){attempt.resolutionClaim.delivered=true;contextRecovery?.confirmDelivery(attempt.frame,attempt.producer,attempt.resolutionClaim.grant);}
+  }
+  attempt.completed=true;return result;}catch{return {ok:false,reason:'host-refresh-unavailable'};}
   finally{refreshAttempts.delete(attempt);attempt.active=false;attempt.abort.abort();if(!attempt.completed){denyFocus();revokeFocus();}
   if(!attempt.completed&&attempt.frame)firstSend?.invalidateTab(attempt.frame.tabId);
-  if(!attempt.completed&&attempt.frame&&attempt.resolution?.state==='verified'&&authority.peek(attempt.frame).grant===attempt.resolution.grant)authority.invalidate(attempt.frame.documentId);}
- }
- function invalidate({tabId,frameId=0,documentId,firstSendNavigation=null,preserveViewDocumentId=null}={}){oldSendTerminal?.invalidateTab(tabId);if(firstSendNavigation)firstSend?.navigate({tabId,...firstSendNavigation});else firstSend?.invalidateTab(tabId);broker.invalidate({tabId,frameId});if(documentId){ingestionPasses?.invalidateDocument(documentId);observations?.invalidateDocument(documentId);authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{ingestionPasses?.invalidateTab(tabId);observations?.invalidateTab(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId,{preserveDocumentId:preserveViewDocumentId});}}
- function tabClosed(tabId){ingestionPasses?.invalidateTab(tabId);oldSendTerminal?.invalidateTab(tabId);firstSend?.invalidateTab(tabId);observations?.invalidateTab(tabId);broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
- function stop(){if(!serviceActive)return;serviceActive=false;identityOwner?.stop();entryCalibration?.stop();ingestionPasses?.stop();currentNavigation?.stop();candidates?.stop();views?.stop();snippets?.stop();oldSendTerminal?.stop();firstSend?.stop();sendCandidates?.stop();ackOwner?.stop();historyOwner?.stop();nativeActivity?.stop();for(const attempt of nativeActivityAttempts)attempt.abort.abort();currentMetadata?.stop();observations?.stop();recovery?.stop();backup?.stop();for(const attempt of refreshAttempts){attempt.active=false;attempt.abort.abort();}refreshAttempts.clear();authority.invalidateAll();}
+  if(focus&&!attempt.completed&&attempt.frame&&attempt.resolution?.state==='verified'&&authority.peek(attempt.frame).grant===attempt.resolution.grant)authority.invalidate(attempt.frame.documentId);releaseResolution(attempt);}
+ }
+ function invalidate({tabId,frameId=0,documentId,firstSendNavigation=null,preserveViewDocumentId=null}={}){contextRecovery?.invalidate({tabId,documentId});oldSendTerminal?.invalidateTab(tabId);if(firstSendNavigation)firstSend?.navigate({tabId,...firstSendNavigation});else firstSend?.invalidateTab(tabId);broker.invalidate({tabId,frameId});if(documentId){ingestionPasses?.invalidateDocument(documentId);observations?.invalidateDocument(documentId);authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{ingestionPasses?.invalidateTab(tabId);observations?.invalidateTab(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId,{preserveDocumentId:preserveViewDocumentId});}}
+ function tabClosed(tabId){contextRecovery?.forgetTab(tabId);ingestionPasses?.invalidateTab(tabId);oldSendTerminal?.invalidateTab(tabId);firstSend?.invalidateTab(tabId);observations?.invalidateTab(tabId);broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
+ function stop(){if(!serviceActive)return;serviceActive=false;contextRecovery?.stop();identityOwner?.stop();entryCalibration?.stop();ingestionPasses?.stop();currentNavigation?.stop();candidates?.stop();views?.stop();snippets?.stop();oldSendTerminal?.stop();firstSend?.stop();sendCandidates?.stop();ackOwner?.stop();historyOwner?.stop();nativeActivity?.stop();for(const attempt of nativeActivityAttempts)attempt.abort.abort();currentMetadata?.stop();observations?.stop();recovery?.stop();backup?.stop();for(const attempt of refreshAttempts){attempt.active=false;attempt.abort.abort();}refreshAttempts.clear();authority.invalidateAll();}
  // Internal worker composition only; no page RPC exposes metadata or accepts proof IDs.
  const consumeNativeActivity=(proof,frame)=>track('background',async()=>{
   const started=elapsedNow(),abort=new AbortController();let active=true,used=false;
@@ -219,7 +249,7 @@
   return quiet()&&ownersIdle(true)&&quiet();
  }
  function ownersIdle(excludeUi=false){
-  return [authority,continuations,nativeActivity,...(excludeUi?[]:[ui]),observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views].every(owner=>owner===null||owner.isIdle?.()===true);
+  return [authority,contextRecovery,continuations,nativeActivity,...(excludeUi?[]:[ui]),observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views].every(owner=>owner===null||owner.isIdle?.()===true);
  }
  return Object.freeze({isIdle,consumeNativeActivity,activityAdmission:(scope,request)=>nativeActivity?.gate(scope,request)??null,oldSendTerminal,firstSend,ackAdmission:(scope,request)=>ackOwner?.gate(scope,request)??historyOwner?.gate(scope,request)??null,sendCandidates,readCurrentMetadata,stop,connectPort:port=>serviceActive&&(ui?.connectPort(port)??false),handle,invalidate,tabClosed,broker,handshake,authority,nativeRepository,observations,continuations,readService,ui,views});
 }
```
<!-- END CONTEXT_RECOVERY_WIRING_DIFF -->

清理点包括 service.invalidate、tabClosed、stop 和 ownersIdle。A 的有效 grant / pending 路径、firstFresh、continuation 和原 finally 撤销均保留。实际整合候选已完成下列完整冻结 Node 与 guard mutations；原实际浏览器恢复关口仍须在该新 HEAD 运行。

原构建器递归追踪相对静态 import，接线后会自动纳入该私有 runtime 模块，无需新增依赖、manifest 权限或 WAR。原 Free workflow 递归发现 `*.test.mjs`，会运行全部专项测试文件；该 workflow 只订阅 Free 分支 push，协作分支 / Draft PR 本身不会触发它，其无 CI 状态不能视作通过。

## 8. 实际验证记录

Pro 原交付 `462ff1b` 在 `8f146ea` 基准实际记录两种接线状态各同一批 64 项、受影响既有 400 项及 build/package 31 项通过。原命令、哈希、早期 setup/沙箱失败保存在 `validation-results.json` 的 `originalProDelivery`，这些是历史事实，不能当作修订后的全量回归。

dot 在最新 Free `3276ab8` 的隔离源码副本重新执行：

| 当前修订运行 | 结果 | 边界 |
|---|---|---|
| 原始未接线 64 项与精确接线后 64 + 31 package | 64 / 64、95 / 95 PASS | 复现 Pro 原证据，不足以发现下列新增反例 |
| 原 64 项 + 40 项独立交付/并发边界，合并公共 fixture 后 | **104 / 104 PASS** | 同一批 104 项，0 fail / cancelled / skip；没有重复计算双状态 |
| 当前修订受影响既有回归、foreground race、build/package | **436 / 436 PASS** | 当前修订源码；不是完整 Free CI |
| 实际整合冻结完整 Node | **7708 / 7708 PASS** | 原 concurrency 2，0 fail / cancelled / skip，168.881 秒，输入哈希未漂移 |
| 原 guard mutations | **12 / 12 KILLED** | 同冻结输入，原 guard 与所有基线先通过 |
| 实际浏览器 | **NOT_ESTABLISHED** | 等待本次生产整合的新 HEAD 原 CI 门槛，不借用父级结果 |

独审保留的失败及修复归因：

1. 服务最终 handshake deadline / false 的旧 finally 会撤销另一已成功共享 subscriber 的 grant。这两条在未接线 `3276ab8` 也为 RED，是已有 Free 服务问题；修订只增加并发交付所有权，不能删掉全体失败时的撤权。
2. 原 B 策略在 Promise resolve 就清 waiting/attempted，实际服务随后拒绝时，同一 receipt 能再次读取身份。现在消费保留到精确的服务交付确认。
3. 已授权而服务后验未结束时，第三个同 producer REFRESH 原来走 A 旁路并重复身份读取；现在在私有 pending delivery 阶段复用同当前 Authority 结果，不能重开认证或返回 verified 空 scope。
4. 服务内部 work 结束即设置 producer.verified，外层 deadline 的 Promise 间隙仍可能超时。独立扫 16 个微任务位置，原 3/4/5 为 RED；现在标记与确认移至最外层原 deadline 和同步当前性核验之后。

额外反例覆盖短 subscriber 期限独立、晚加入不延长在途授权期限、容量、invalidate 不退款、profile 变更、外部 pending、错误 owner / clone grant / document、pending delivery 中断，以及最后使用者失败必须撤权、历史成功不能永久豁免、显式撤权盖过 claims。原始 RED 与独审冻结源码哈希在当前验证记录中保存。首次完整组合有两处旧合同形状不再匹配，保留实际 isolated fallback 后仍不得授权的反例，并新增无 C2 零身份读取；诊断合同改为执行实际 catch。第二次完整运行有两个文件级 test failed，报告未记录原因，不猜测 OOM；两文件独立 47/47 后，同冻结字节、原 concurrency 2 的完整 TAP 7708/7708 通过。所有早期失败哈希保留，不累加为最终次数。

专项命令：

```sh
node --test --experimental-test-isolation=none --test-reporter=spec tests/runtime/context-recovery/*.test.mjs
```

第 7 节 diff 在未接线源码前向应用和已接线源码完整 reverse-check 两种状态均严格检查；部分接线和过期 diff 必须失败。没有通过忽略 patch 错误取得 PASS。

所有数据均为明确构造的 fixture，无私人聊天数据。测试运行原 BrowserRequestContext、ScopeAuthority、BindingService、握手、UiGrant、ViewService 与 repository；Chrome、provider、时钟和 IDB 边界使用确定性 doubles，属于 L 级。真实 fresh grant + VIEW 的原 15 秒 oracle 保留；无新信号超时后不能追记该窗口通过。没有真实账户或 Profile，也不以 L 结果代替浏览器验收。

## 9. 剩余边界与交付判断

1. Pro 原交付保留为历史；dot 的修订包含模块、实际服务接线、独立反例和当前证据。完整候选与浏览器结论只以最新 STATUS 为准。
2. 本基准无已证实的生产 C1；生产 C2/C3 不能由离线 profile 自动启用。
3. 无新可辨别信号的 C2 自动选中不可实现。用户自然操作只有产生被原 owner 接受的新信号才推进；模块不制造原生操作。
4. 新 ScopeResolution 不自动证明双 surface 就绪、原生编辑连续性、fresh UiGrant + VIEW、完整 J4 或 Free 完成。原 15 秒门槛保留，未运行项保持未通过。
5. G / 真实 ChatGPT / 真实 Profile = NOT_RUN。离线专项不替代另行指定的真实宿主只读核验；当前云端没有可用的已授权 Profile 页面通道，不创建凭据、购买服务或使用私人聊天数据。
