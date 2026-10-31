# Free + Pro R1：存储、授权与恢复独立复核

审计日期：2026-10-31。本文记录隔离集成工作区的实现和复核范围，不是正式发布验收，也不把开发中工作树的测试结果归到未来提交。最终候选必须以 GitHub CI 中精确 SHA 的报告、源码清单和扩展包为准。

## 1. 正式来源与证据分层

输入为 Free `2c9b043ce3c65a4b92c6f8f83b59fb416f63132a` 和包含该 Free 基线的 Pro `5dec17dc275a79b998db6b3ba8d940710337d3b5`。独立输入复现保存在 [baseline](../../tests/integration-unified/baseline/)：Pro 与相关回归 443/443；未应用 shared-owner 补丁在独立镜像中 202/202；二者有重叠，不能相加。原 Chromium 连续旅程及性能样本属于输入基线，不能替代本次接线后的验证。[复现说明](../../tests/integration-unified/README.md)

当前复核区分三层证据：

| 层次 | 可以证明 | 不能证明 |
|---|---|---|
| Node、MockIDB、合成授权反例 | codec、CAS、同事务协调、逆操作依赖、作用域与异步拒绝处理 | 浏览器磁盘、真实 ChatGPT 授权 |
| 独立 Chromium 存储用例 | 真实 IndexedDB 同事务回滚、浏览器进程重启后的 DB4 数据及旧 Free 读取 | 生产授权来源、MV3 自然休眠 |
| 同包 MV3 与正式 Browser-Local 离线宿主 | 生产 worker/frame/存储接线、现有本地绑定与撤权、强制 worker 停止、离线页面替换及扩展禁用/卸载 | 真实账号、个人 Mac、真实 PAIA、自然休眠、断电或操作系统崩溃 |

测试目录的 fixture owner 仅用于第一、二层。正式包入口为 `extension/pro-worker.mjs` → `createProductionProService`；生产工厂没有导入 fixture owner 或 fixture model。

## 2. DB4 注册、版本与保留

实现见 [storage-registry.mjs](../../src/pro/integration/storage-registry.mjs)、[same-db-store.mjs](../../src/pro/integration/same-db-store.mjs)、[billing-store.mjs](../../src/pro/integration/billing-store.mjs)。Pro 使用共享 owner 已有连接，不调用 `indexedDB.open()`，不提升 DB 版本、不建立另一份 Free 数据库。

| 数据 | 已有 object store 与独立键空间 | 约束 |
|---|---|---|
| Pro root / checkpoint | `b23_states` / `b23_checkpoints`；`JSON.stringify(['vaiwl-pro-overlay/1', actualScopeKey])` | 16 MiB root；10,000 条操作 |
| Pro journal | `b23_operations`；`JSON.stringify([overlayRootKey, operationId])` | `payload.scopeKey` 为命名空间键，真实归属另存 `targetScopeKey` |
| 安装级费用及工作状态 | `b23_states` / `b23_operations`；`['vaiwl-pro-billing/1','installation']` 及其操作键 | 8 MiB root；1,000 jobs；10,000 操作；未开放实际云调用 |

命名空间隔离使旧 Free 的 scope journal 索引不把 Pro codec 当成旧 Workspace 操作。root 沿用 `{key,payload,checksum}`。检查包括封包摘要、真实 scope、reader、操作序号/索引、完整 journal、revision 链及 inverse/readSet 一致性。重新计算封包摘要也不能绕过跨 scope、缺失 inverse、inverse 与 patch 不匹配或未知 read-set kind 的结构检查。

最低 reader 有两层：Pro root 的 `minimumReader` 保持数据 codec `vaiwl-pro-overlay/1`；统一备份明确声明 `vaiwl-unified-r1/1`。不支持的 reader 拒绝读取和写入，不猜测如何解释新数据。

**保留策略是无损保留，不是已完成日志压缩。** codec `/1` 保留 root、checkpoint、全部 journal/inverse 和不确定费用；达到容量时拒绝新增写入，不删用户资产、负约束或未知收费记录。`proRetentionDecision()` 声明这些记录不可被通用 GC 当作游离 Free 数据清理。现有 Free directory 保留程序只删除其自身计算出的分片键，不扫描删除未知命名空间。自动压缩、历史裁剪及超容量继续写入没有被本候选实现或宣称。

降级到旧 Free 保持 DB4 和共享资产可读；旧 Free 看不到 Pro 命名空间，也不会把它纳入旧格式备份。因此回退前应保留统一备份；旧 `vaiwl-assets` 文件不是 Pro 资产备份。

## 3. 原子事务、真实来源与撤销

`WorkspaceRepository.mutate()` 新增可选、仅供可信进程内使用的同步 enlist 回调。未提供回调时保持原 Free 路径。复合恢复将 Free mutation 与 Pro root/checkpoint/journal 放在同一个已有 IDB readwrite transaction 内；`done` 只表示请求已入队，只有 transaction complete 才表示提交。事务内没有外部 `await`；异步 reducer/fence 被拒绝，实际 Promise 的拒绝被接收。

生产授权来自既有 UI owner 的当前文档/scope grant。Pro request 内的 opaque grant 仅对该闭包有效，复制 scope、epoch、review hash 或备份内容不能取得权限。提交同时检查当前 grant、session generation、原生与证据根版本、共享 Workspace revision、Pro overlay revision。已过期的来源截止时间不能被过滤掉后继续作为正向归属使用。Free 没有证明 NONE 时，Pro 使用 UNKNOWN 并拒绝需要确定归属的收录。

审计期间实际修复并补充反例的项目包括：异步公开投影 rejection、scalar 字段下的任意对象泄漏、DTO/source scope 不一致、同 scope 旧面板覆盖、新的 Free/Pro 模式变化与在途写竞争、缺失 root 被误当空白、不完整或篡改 journal、相同操作重放无法到达已有 receipt，以及 blocked 原生导航残留虚构阅读上下文。对应实现和反例分别在 worker、public DTO、remote controller、production owner、registry 测试中。

普通操作与受审结构操作均使用 durable fingerprint 验证同 operationId 重试；不同载荷拒绝，旧 review 只能识别已有结果，不能授权另一笔新写。恢复和迁移的 inverse 也包含主题成员、Series、约束、redirect、引用关系的聚合 readSet：后来新增成员，即使未修改原有行，也会在撤销预览中产生冲突。逆操作不能恢复处理权限或撤销用户的处理排除。

## 4. 统一备份、非破坏迁移与回退

[composite-backup.mjs](../../src/pro/integration/composite-backup.mjs) 是现有 chunked Host backup service 的 repository 适配器，不是另起一个导入通道：

```js
createCompositeBackupRepository({
  workspaceRepository,
  resolvePro: async (scope, options) => ({store, grant, versions}),
  onRestored
})
```

生产 `resolvePro` 使用 Host service 内部传入的当前 `ownerContext`、guard 和 signal；持久化 scope 字符串不能代替该上下文。生命周期终止、signal 已终止及恢复后的暂停/通知均独立处理。

统一格式为 `vaiwl-unified-assets/1`，包含原 `vaiwl-assets` 与 `vaiwl-pro-backup/1`，外层 checksum 和 `legacyAssetsDigest` 绑定两部分。沿用 Host 17 MiB 传输上限，过大时明确拒绝。导出对 Free 进行前后双读，确保 Pro 读取处在同一稳定 Free revision 区间。文件只携带数据，不导入 grant、provider credentials、授权、待派发 jobs 或安装费用。

恢复预览绑定完整版本与两侧计划。目标已有完全相同行时保留；不相交资产可合并；同 ID 不同内容、锁/排除/结构约束冲突一律拒绝，提供私有冲突摘要。未实现任意冲突的交互式“覆盖解决”，也不会静默覆盖。任一配额错误、Free CAS 冲突、Pro 写失败或权限失效均整体回滚。旧 Free-only 备份继续走原 Free 恢复路径。

旧数据升级必须经过 `previewLegacyMigration()` / `migrateLegacy()` 的明确审阅动作，仅允许真正空白的 Pro overlay。保留 Workspace/Placement/Identity 的 ID、名称、别名、排序、锁及排除；多关系无明确主关联时保留待确认状态。共享 reducer 不改原资产，只前进 revision 并写入空 patch 作为共同 CAS。可选 worker-local `requestFingerprint` 为消费后的预览提供 durable receipt 身份；它不是公开授权凭证。成功且非重放时调用 `onRestored`，处理保持关闭。

**损坏恢复边界：** 当前 root/journal 不完整时会拒绝继续操作并保留证据，不自动初始化或清空；现有纯 `replayOverlayJournal` codec 不等于生产已提供损坏 root 的修复入口。统一备份可恢复到有效或空白目标，但该适配器先读取当前 Pro root，因此不能被宣称可直接修复任意损坏的原 namespace。进程重启恢复、原子事务回滚、备份恢复和损坏数据库修复是不同结论。

## 5. 有界公开数据与能力限制

worker/frame 单条 DTO 上限 64 KiB、8,192 JSON 节点和 16 层深度；schema 检查所有公开嵌套类型、枚举、分页、scope 与 native Free 字段。reviewId 只是比较 token，完整版本映射、journal inverse、证据包及权限留在 worker。真实 Free `evidenceRevision` 的双整数格式已纳入精确 codec，未通过放宽任意对象来适配。

Series 的摘要、成员和全部边分别分页；密集图用 40 个成员、780 条边验证无遗漏/重复。完整小图可以编辑；大图不可把一个分页冒充完整图。操作记录最多公开 200 个变化，超出字节预算时缩小窗口，确实截断时显示 `changesTruncated` 并阻止把不完整列表当完整撤销审阅。引用超过 100 条受保护主题关系时明确拒绝该面板，不隐藏受保护关系后保存。

没有 live grant、正向 NONE 或持久本地绑定时准确降级。真实模型不可用；默认费用为 0；没有用测试规则模型冒充生产能力。原生 href fallback 只公开严格匹配当前引用的 ChatGPT/隔离 loopback 链接，并要求新一次用户点击，在新标签打开以保留当前草稿；原生 plan 与 handle 不进入 DTO。

## 6. 可复现验证与尚未关闭的关卡

本次存储复核工作树实际通过：registry 5/5（含多组破坏反例）、复合备份/迁移 14/14、public DTO 16/16、原结构提交回归 3/3；生产 owner 在独立复核时为 15/15，后续新增用例以最终 CI 为准。真实 Chromium 存储测试 1/1，验证两侧请求入队后强制 abort、完整回滚、成功重试、一次 receipt、浏览器进程重开和旧 Free 读取。该浏览器测试明示使用隔离 fixture 授权，不冒充生产账号证据。

```sh
node --test-reporter=tap tests/pro/storage-registry.test.mjs
node --test-reporter=tap tests/pro/composite-backup.test.mjs
node --test-reporter=tap tests/pro/public-frame-dto.test.mjs
node --test-reporter=tap tests/pro/production-owner.test.mjs
PRO_CHROMIUM_EXECUTABLE=/absolute/path/to/full/chrome PRO_EVIDENCE_DIR=/absolute/evidence/path node --test-reporter=tap tests/pro/storage-browser.mjs
node tests/integration-unified/run.mjs node
node tests/integration-unified/run.mjs package
node tests/integration-unified/run.mjs performance
node tests/integration-unified/run.mjs browser
```

完整 runner 拒绝缺失 Chromium、零测试、跳过用例、运行中源码变化、CI 未提交源码及不匹配的 `VAIWL_SOURCE_COMMIT`。冻结后应检查 `artifacts/unified-r1/{node,browser,performance,package}-report.json` 的 source SHA、前后源码摘要、原始日志以及实际包清单；只有同 SHA 的成功报告能关闭本候选的工程验收。

审计时仍需与最终源码/报告核对的**内部**项目：损坏 Pro namespace 的受审修复入口；Free/Pro 顶部切换恢复先前范围/历史位置；拆分面板选择 24 条以后的成员。后两项已交对应负责人处理，不能当成需要用户真机许可的问题。日志压缩、17 MiB 以上的复合文件以及 100 条以上受保护关系面板是明确容量/功能边界，不能用外部验收一词掩盖。

**外部或环境相关**关卡独立列为未验收：真实 ChatGPT DOM 与真实正向 NONE/账号切换；本人 Mac、输入法与真实阅读现场；实际 PAIA 安装包的输入/导航/布局共存；未附调试器的自然 MV3 空闲休眠；真实模型目的地、用途、凭据、费用许可及真实数据质量。离线同包测试的被动共存扩展、强制停止 worker、正常进程关闭，分别不能替代实际 PAIA、自然休眠或磁盘崩溃。候选保持 Draft，不由本文授权合并、发布或替换用户已安装扩展。
