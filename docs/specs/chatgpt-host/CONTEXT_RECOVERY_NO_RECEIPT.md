# Worker 无有效 context 证据时的恢复

这是现有 `DEVELOPMENT_PLAN.md` 的 B1.F / C2 / SYS-02 恢复契约补充，不是第二份开发计划。

- 首次范围声明基准：`3c8a33dae36ca0de11841570ac6fb44d4331dd5a`，PR #16 的 Free 分支。
- 最终验证基准：`8f146ea99297d6f82739b5792d704577fa65416e`。提交前再次读取远端，协作分支已快进吸收 dot 的 `a9e6e66` 与 `8f146ea`；没有覆盖其 WIP，原接线文件与证据 / Authority 合同没有变化。
- 专项分支：`codex/pro-context-recovery-20261018`。
- 协作边界：仅本文件、`src/runtime/context-recovery/` 和 `tests/runtime/context-recovery/`；既有生产文件的接线仅作为本文 diff 交 dot 整合。
- 权威顺序：用户 2026-10-18 的本次明确授权优先；原 AUTHORITY、VA-HOST/1.1 FINAL §5、HOST_CONTRACTS、原验收要求继续有效。
- 当前结论：无证据 C2 不能凭空自动恢复；可实现安全等待、新合法证据后的原链授权、有限失败及晚回复隔离。`SCOPE_VERIFIED` 不等于 fresh UiGrant + VIEW，更不等于真实 ChatGPT / G 验收通过。

## 1. 必须分开的 A 与 B

**A：有效上下文证据仍在，仅 transport、HELLO、producer、mount 或握手失效。** 这是 dot 的专项。没有 ScopeGrant 不代表没有 context receipt。当前 Authority 的 pending 认证也不能被误当成证据丢失。本模块不重建 transport、不改 content 的一次恢复预算、不增加 READY 通知。

**B：当前 worker 的既有 context owner 无法提供有效证据。** 策略先调用原 `contextObserver.verify(frame,{signal})`。只有它确实返回 `null` 且没有可用 C3 语义，才记录一个 B 等待过程。新的有效 receipt 到来后，该过程允许一次原授权调用；同一 receipt 被拒绝、取消或超时后不能通过重复请求重开机会。取得实际可交付的新 ScopeResolution 后退出 B，正常续验重新交回原链。

若新 worker 在首次 HOST_REFRESH 前已经捕获合法原生请求，则首次 probe 可以直接取得 receipt。这是正常的新授权，不必人为拒绝一次再进入 B。已有 `verified` / 外部 `pending` Authority 时接线直接执行原授权链，不插入竞争的 body challenge；但同一私有 owner 已经在本策略内运行的工作必须再次进入 `run()` 加入独立 subscriber，不能因自己的 pending 而旁路。C3 不套 C2 的 receipt 去重。若在策略的异步边界才发现另一个外部 pending，直接返回原 pending 状态，不调用 authorize，也不取得外部后续 grant 的清理权。

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
| SCOPE_VERIFIED | 当前 ScopeResolution 可交付，B 等待过程退役 | 后续 A / 续验回原链；仍须新 UiGrant 与实际 VIEW |
| BLOCKED | 当前输入不能恢复，同一 B receipt 不自动重试 | 新独立有效 receipt 可再尝试；没有 catch/timer 自循环 |
| CANCELLED | 当前 generation 被取消或 owner 停止 | 活实例只接受新的合法调用；stop 后实例永久终结 |

`inspect()` 只返回状态和非私人 reason，不返回 receipt、scopeKey、标题、账户 roster 或 grant；它不是授权 API。成功输出直接是原 `ScopeResolution`，没有自签的 `verified` 结果。未签出的 UI 和旧缓存永远不能因策略状态而开放。

`ownsFlight(frame,attemptOwner)` 只判断相同 frame / 私有 owner 是否拥有仍有效的工作，供接线选择 `run()` 的并发加入路径；不向页面暴露，也不代替授权判断。外部 pending 仍由原链管理。

### 4.1 有界并发与取消

状态至少按 tabId + documentId 隔离。每次操作还绑定现有私有 producer 对象 `attemptOwner`。这个对象只用于任务归属，不是新的权限凭据。相同 owner / frame 的并发调用共享一次工作；不同 producer 或新 document 替换旧 generation，晚回复只清理自己。

每个 subscriber 保留自己的 signal、isCurrent 和父 RPC 剩余期限。单个 subscriber 取消不取消其他仍有效 subscriber；最后一个离开才 abort 底层。后加入者不能延长首个操作的原期限；后加入者较短的期限只限制自己的等待。每文档至多 128 个 subscriber、默认至多 128 个活动 document；达到容量返回拒绝，不驱逐仍有权的其他 tab。

真实 frame 核验后的新 document 会退休同 tab 的旧 document 槽，避免长期标签反复 reload 耗尽容量。同 document 导航／重复 HELLO 不通过清表补回 B 尝试次数。tab close 调 `forgetTab`；stop 取消、清表并禁止复活。空 WAITING 没有 timer、subscriber 或在途工作，不阻止休眠。

授权结果在 Authority 返回和最终 subscriber 回交两个 Promise 边界各复核一次。若晚到结果需要撤回，只在 `authority.peek(frame).grant === 本次返回对象` 且对象不是调用前旧 grant 时调用原 `authority.invalidate`；不按 document 无条件撤销可能属于更新操作的 grant。

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

示例为 fresh refresh；第 7 节 diff 保留原 `firstFresh`、focus、renewal 的具体调用选择。`authorize` 必须同步开始原 Authority 调用，不能在前面插入异步工作；必须使用传入的共享操作 signal，不能捕获第一个 subscriber 的 signal。其身份 fallback 仍运行在原 BindingService 的 `refreshAttempts` 内，所以沿用原剩余预算和 producer 关联。页面不能调用此模块、传入 owner 对象、伪造 authorize callback 或提交 receipt。

仅在原 HOST_REFRESH 已通过 schema、sender、HELLO、seq、实际 Chrome frame 校验后使用。原 `firstFresh` 及其旧 UI/observation 撤销保持。已有 verified grant 的新 producer 仍执行原 fresh auth；HOST_FOCUS 和已经 verified producer 的续验保持原路径。

## 6. 与原恢复预算的关系

模块不发 GET、不重发 send/create、不读 Native/Shared 数据、不补 WAL、不预取历史。等待缺证据时，重复 HOST_REFRESH 或连续新 worker 都不产生身份网络调用。一次 B 失败不由 catch、timer、重复 READY 或相同 receipt 重试。

既有 `SharedHostReadBudget` 的 30 秒 / 12 请求 / 首次 + 最多两次重试及跨 lease / worker / tab 持久 reservation 保持原样。但是基准 `session-provider.mjs` 只有 `current && readBudget` 才 reserve；普通 session/roster 身份读取并不自动受这个持久计数覆盖。**本专项不声称替身份认证建立了新的跨重启总预算，也不猜一个 scope 去 reserve。** 新合法证据只进入一次已有固定身份链；有授权后的元数据读取仍走原共享预算。

content 原 `recoveryRemaining=1` 的 transport/mount 一次恢复、原六秒请求、staged preparation、15 秒 fresh-grant + VIEW 均不改变。无证据等待不消耗不存在的网络尝试，也不重置后续验收计时。C3 正常认证次数由现有调用者控制，不使用 B 的一次性表。

## 7. 供 dot 整合的精确接线 diff

下面只改 `src/runtime/host-binding-service.mjs`，**未直接应用到本协作分支的该文件**。不修改 content-session、bootstrap、authority、provider、存储、build 或 CI。原 browser owner → service.invalidate → PENDING 与 READY → content.begin(true) 保持；首次 probe 也能读取 READY 通知发出早于 service 挂载时已经建立的真实 receipt，不重放通知。

适用 SHA 为本文最终验证基准（该 service 与首次基准字节相同）。diff 的 UTF-8 字节（含末尾换行）SHA-256 为 `a41fca670920bc4f48d4394395b7e7a895b79b2c07da1cc30fe8b6cc6a1f4ddb`。dot 在最新 Free 自己的工作区核对 WIP 后 `git apply --check`，若该文件已推进，应逐 hunk 合并而非覆盖。专项测试将此精确 diff 仅应用到全新临时源码副本，运行实际 service / authority / UiGrant / VIEW，不能把这等同正式分支已经接线。

测试同时支持 dot 完成接线后的代码：前向检查失败时必须通过完整 `git apply --reverse --check` 才直接验证已接线副本；不会实际撤回补丁。部分接线、过时 hunk、其他冲突和异常进程均失败，没有通过忽略 patch 错误来获得 PASS。

<!-- BEGIN CONTEXT_RECOVERY_WIRING_DIFF -->
```diff
diff --git a/src/runtime/host-binding-service.mjs b/src/runtime/host-binding-service.mjs
--- a/src/runtime/host-binding-service.mjs
+++ b/src/runtime/host-binding-service.mjs
@@ -1,3 +1,4 @@
+import {createNoReceiptContextRecovery} from './context-recovery/no-receipt-recovery.mjs';
 import {createIsolatedSessionOwner} from './isolated-session-owner.mjs';
 import {createHostEntryCalibration} from './host-entry-calibration.mjs';
 import {createHostIngestionPassOwner} from './host-ingestion-pass-owner.mjs';
@@ -51,4 +52,5 @@
   }
  }:null;
  const authority=createScopeAuthority({provider,profile,readIdentity,contextObserver,allowedURL,now,makeId,elapsedNow,schedule,cancel});
+ const contextRecovery=profile.browserRequestContext===true&&contextObserver?createNoReceiptContextRecovery({profile,contextObserver,authority,now,elapsedNow,schedule,cancel}):null;
  const asFrame=(doc,sender)=>({tabId:doc.tabId,frameId:0,documentId:doc.documentId,parentDocumentId:null,actualURL:doc.url,documentLifecycle:'active',incognito:sender.tab?.incognito===true});
@@ -140,7 +142,12 @@
   // Ordinary renewals keep the existing bounded revalidation/single-flight path.
   const firstFresh=!producer.verified&&!producer.freshStarted;
   if(firstFresh){producer.freshStarted=true;ingestionPasses?.invalidateDocument(frame.documentId);observations?.invalidateDocument(frame.documentId);ui?.revokeDocument(frame.documentId);views?.revokeDocument(frame.documentId);}
-  const resolution=await (focus?authority.revalidate(frame,attempt.abort.signal,{force:true}):!producer.verified?authority.refresh(frame,firstFresh?'auth-change':'focus',attempt.abort.signal):authority.peek(frame).state==='verified'?authority.revalidate(frame,attempt.abort.signal):authority.refresh(frame,'bind',attempt.abort.signal));attempt.resolution=resolution;
+  const authorize=({signal})=>focus?authority.revalidate(frame,signal,{force:true}):!producer.verified?authority.refresh(frame,firstFresh?'auth-change':'focus',signal):authority.peek(frame).state==='verified'?authority.revalidate(frame,signal):authority.refresh(frame,'bind',signal);
+  const resolution=await (contextRecovery&&!focus&&!producer.verified&&(contextRecovery.ownsFlight(frame,producer)||!['verified','pending'].includes(authority.peek(frame).state))?contextRecovery.run(frame,{
+   attemptOwner:producer,signal:attempt.abort.signal,remainingMs:()=>6000-(elapsedNow()-attempt.started),
+   isCurrent:()=>serviceActive&&attempt.active&&!producer.denied&&sequences.get(message.producerToken)===producer&&handshake.isBound(message,sender),
+   authorize
+  }):authorize({signal:attempt.abort.signal}));attempt.resolution=resolution;
   if(resolution.state!=='verified')firstSend?.invalidateTab(frame.tabId);
   if(focus&&resolution.state!=='verified'){denyFocus();revokeFocus();}check();
   const verified=await handshake.verify(message,sender);check();
@@ -174,9 +181,9 @@
   if(!attempt.completed&&attempt.frame)firstSend?.invalidateTab(attempt.frame.tabId);
   if(!attempt.completed&&attempt.frame&&attempt.resolution?.state==='verified'&&authority.peek(attempt.frame).grant===attempt.resolution.grant)authority.invalidate(attempt.frame.documentId);}
  }
- function invalidate({tabId,frameId=0,documentId,firstSendNavigation=null,preserveViewDocumentId=null}={}){oldSendTerminal?.invalidateTab(tabId);if(firstSendNavigation)firstSend?.navigate({tabId,...firstSendNavigation});else firstSend?.invalidateTab(tabId);broker.invalidate({tabId,frameId});if(documentId){ingestionPasses?.invalidateDocument(documentId);observations?.invalidateDocument(documentId);authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{ingestionPasses?.invalidateTab(tabId);observations?.invalidateTab(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId,{preserveDocumentId:preserveViewDocumentId});}}
- function tabClosed(tabId){ingestionPasses?.invalidateTab(tabId);oldSendTerminal?.invalidateTab(tabId);firstSend?.invalidateTab(tabId);observations?.invalidateTab(tabId);broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
- function stop(){if(!serviceActive)return;serviceActive=false;identityOwner?.stop();entryCalibration?.stop();ingestionPasses?.stop();currentNavigation?.stop();candidates?.stop();views?.stop();snippets?.stop();oldSendTerminal?.stop();firstSend?.stop();sendCandidates?.stop();ackOwner?.stop();historyOwner?.stop();currentMetadata?.stop();observations?.stop();recovery?.stop();backup?.stop();for(const attempt of refreshAttempts){attempt.active=false;attempt.abort.abort();}refreshAttempts.clear();authority.invalidateAll();}
+ function invalidate({tabId,frameId=0,documentId,firstSendNavigation=null,preserveViewDocumentId=null}={}){contextRecovery?.invalidate({tabId,documentId});oldSendTerminal?.invalidateTab(tabId);if(firstSendNavigation)firstSend?.navigate({tabId,...firstSendNavigation});else firstSend?.invalidateTab(tabId);broker.invalidate({tabId,frameId});if(documentId){ingestionPasses?.invalidateDocument(documentId);observations?.invalidateDocument(documentId);authority.invalidate(documentId);ui?.revokeDocument(documentId);views?.revokeDocument(documentId);}else{ingestionPasses?.invalidateTab(tabId);observations?.invalidateTab(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId,{preserveDocumentId:preserveViewDocumentId});}}
+ function tabClosed(tabId){contextRecovery?.forgetTab(tabId);ingestionPasses?.invalidateTab(tabId);oldSendTerminal?.invalidateTab(tabId);firstSend?.invalidateTab(tabId);observations?.invalidateTab(tabId);broker.tabClosed(tabId);authority.invalidateTab(tabId);ui?.revokeTab(tabId);views?.revokeTab(tabId);}
+ function stop(){if(!serviceActive)return;serviceActive=false;contextRecovery?.stop();identityOwner?.stop();entryCalibration?.stop();ingestionPasses?.stop();currentNavigation?.stop();candidates?.stop();views?.stop();snippets?.stop();oldSendTerminal?.stop();firstSend?.stop();sendCandidates?.stop();ackOwner?.stop();historyOwner?.stop();currentMetadata?.stop();observations?.stop();recovery?.stop();backup?.stop();for(const attempt of refreshAttempts){attempt.active=false;attempt.abort.abort();}refreshAttempts.clear();authority.invalidateAll();}
  // Internal worker composition only; no page RPC exposes metadata or accepts proof IDs.
  const readCurrentMetadata=proofId=>track('requests',()=>currentMetadata?currentMetadata.read(proofId):Promise.reject(Error('current-metadata-unavailable')));
  const handle=(message,sender)=>track('requests',()=>handleWork(message,sender));
@@ -191,7 +198,7 @@
   return quiet()&&ownersIdle(true)&&quiet();
  }
  function ownersIdle(excludeUi=false){
-  return [authority,continuations,...(excludeUi?[]:[ui]),observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views].every(owner=>owner===null||owner.isIdle?.()===true);
+  return [authority,contextRecovery,continuations,...(excludeUi?[]:[ui]),observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views].every(owner=>owner===null||owner.isIdle?.()===true);
  }
  return Object.freeze({isIdle,oldSendTerminal,firstSend,ackAdmission:(scope,request)=>ackOwner?.gate(scope,request)??historyOwner?.gate(scope,request)??null,sendCandidates,readCurrentMetadata,stop,connectPort:port=>serviceActive&&(ui?.connectPort(port)??false),handle,invalidate,tabClosed,broker,handshake,authority,nativeRepository,observations,continuations,readService,ui,views});
 }
```
<!-- END CONTEXT_RECOVERY_WIRING_DIFF -->

清理点包括 service.invalidate、tabClosed、stop 和 ownersIdle。A 的有效 grant / pending 路径、firstFresh、continuation 和原 finally 撤销均保留。由于被测试的是临时接线副本，dot 整合提交后仍需在其完整候选上运行受影响回归和原恢复关口。

原构建器递归追踪相对静态 import，接线后会自动纳入该私有 runtime 模块，无需新增依赖、manifest 权限或 WAR。原 Free workflow 递归发现 `*.test.mjs`，会运行两份专项测试；该 workflow 只订阅 Free 分支 push，协作分支 / Draft PR 本身不会触发它，其无 CI 状态不能视作通过。

## 8. 实际验证记录

在最终 Free 基准 `8f146ea99297d6f82739b5792d704577fa65416e` 上实际运行，Node `v24.19.0`，构建工具沿用锁定的 esbuild `0.25.12`。完整命令参数、每次终态、源码 / 精确 diff 哈希、原始 TAP 摘要哈希及此前失败记录见 [`validation-results.json`](../../../tests/runtime/context-recovery/validation-results.json)。该记录绑定实际代码字节；最终完整提交 SHA 在专项 PR 与 PR16 交付评论给出。

| 本次运行 | 结果 | 具体范围 |
|---|---|---|
| 未接线协作源码，测试仅在临时副本应用本文 diff | **64 / 64 PASS** | 53 个策略用例 + 11 个实际服务集成用例 |
| 已完整接线的临时源码，完整 reverse-check 后直接执行 | **64 / 64 PASS** | 与上一行相同的用例，验证 dot 整合后仍可执行，不能相加成 128 项 |
| 最新基准受影响既有回归，在精确接线副本执行 | **400 / 400 PASS** | observer、Authority、BindingService、UiGrant、VIEW、A 类前台恢复及原 J4 oracle |
| 既有 build / package 测试，在精确接线副本执行 | **31 / 31 PASS** | 真实 classic worker 编译、闭包、权限、WAR、包校验及已有反例 |

以上四次最终运行均为 **0 failed / 0 cancelled / 0 skipped**。没有把历史 Free 全量结果算作本提交通过，没有触发或宣称协作分支完整云 CI。执行耗时只作运行记录，不构成浏览器恢复速度或性能验收。

专项复现命令（未接线 / 已完整接线两种状态均适用）：

```sh
node --test --experimental-test-isolation=none --test-reporter=spec tests/runtime/context-recovery/*.test.mjs
```

原构建回归命令（在已接线候选上，沿用仓库锁定依赖）：

```sh
node --test --experimental-test-isolation=none --test-reporter=spec tests/host/classic-worker-build.test.mjs tests/host/package.test.mjs
```

初次临时副本遗漏既有 workflow / simulator 依赖，出现导入与文件缺失失败；补齐相同已跟踪依赖后继续。随后 3 个既有合成 loopback 测试因沙箱 `listen EPERM` 失败，在允许本地监听的执行环境以同一完整命令通过。没有删除用例或修改断言；失败原因、计数及摘要哈希均保留在验证记录中。

所有专项数据均为明确构造的 fixture，无私人聊天数据。实际运行原 BrowserRequestContext、ScopeAuthority、BindingService、握手、UiGrant、ViewService 与 repository 代码；Chrome、provider、时钟和 IDB 边界使用确定性 doubles，属于 L 级机制／集成测试。没有真实账户或 Profile，也没有用推理结果代替浏览器验收。

要求的覆盖矩阵：无证据、新合法信号、旧回执、同 URL 切换空间、双标签不同 context、缓存命中、晚回复、撤权、到期、连续重启、并发恢复、失败无循环；另覆盖 A 透传、C3 正常路径、独立 subscriber 取消、整体六秒预算和原十五秒 oracle。

集成测试先通过实际 repository 写入 personal 数据，再重建 worker 和原生证据 owner；缺证据时旧 UiGrant、缓存、单独 roster 和结构化旧 receipt 都不能恢复访问。新 team 信号后实际 HELLO → REFRESH → MOUNT → JOIN / CONFIRM → VIEW 成功，并验证 personal 数据不可见。直接复用 `installJ4GrantObserver`、`currentJ4Grant` 和 `waitJ4PeerScope`：有新 grant 但没有对应 VIEW 仍失败；无新信号在原 15000 ms 到期，之后的恢复不能追记为原窗口通过。

独立审查实际复现并关闭两项实现问题：外部 pending 所有权误撤销，以及策略自有 pending 被接线旁路而破坏独立取消。另关闭测试整合后二次应用 diff 的兼容性问题。最终源码无未修复的已复现阻断问题；这一结论仍受第 5 节内部调用合同和第 9 节验收边界约束。

## 9. 剩余边界与交付判断

1. 本分支交付模块、专项测试与接线 diff；实际 Free 接线／完整候选整合由 dot 完成。
2. 本基准无已证实的生产 C1；生产 C2/C3 不能由离线 profile 自动启用。
3. 无新可辨别信号的 C2 自动选中不可实现。用户自然操作只有产生被原 owner 接受的新信号才推进；模块不制造原生操作。
4. 新 ScopeResolution 不自动证明双 surface 就绪、原生编辑连续性、fresh UiGrant + VIEW、完整 J4 或 Free 完成。原 15 秒门槛保留，未运行项保持未通过。
5. G / 真实 ChatGPT / 真实 Profile = BLOCKED / NOT_RUN。本任务没有相应授权，不创建凭据、购买服务或使用私人聊天数据。
