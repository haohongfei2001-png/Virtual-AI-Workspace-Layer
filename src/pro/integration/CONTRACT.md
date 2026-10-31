# VAIWL-PRO/1.0 · 最小共享集成合同

本候选从 PR #16 交接 HEAD `f317b26ea6ed7d1cc249c4bfc0ad90a619d29417` 开始，并已继承最新文案提交 `2c9b043ce3c65a4b92c6f8f83b59fb416f63132a`；共享 src 未变化。相对最新基线，本候选未修改任何实际共享源文件。此合同与 `tests/pro/integration/shared-owner.patch` 供唯一共享负责人审查、接入；不代表生产启用许可。

## 六个边界

| port | 共享 owner 的最小供给 | Pro 已完成 / 必须拒绝的情形 |
|---|---|---|
| `sharedSnapshot` | 已授权的 bounded NativeRef、原 ActivityDecision 引用、完整 RevisionVector | 保留 C/Project ID、NONE/UNKNOWN/PROJECT；不能凭路由或缺徽标补 NONE；默认最多 1000/查询且 frame 单页 64 KiB |
| `evidence` | 当前 live grant 与明确用途许可下的标题/别名；逐项能力说明 | metadata 包最大 10 引用、本地候选 20 主题；UNKNOWN、排除/过期输入剔除；未提供正文/选区来源时保持不可用 |
| `commit` | 既有 connection、scope/document/source guard、当前一次性人工 receipt / automation ticket | 原子校验版本/预算/锁/排除/Proposal hash，overlay/checkpoint/journal 同事务；失败零部分写；网络/原生动作不进入 patch |
| `view` | 原 Free prepared snapshot、ActivityDecision、ViewSession、原 FreeFrameDTO | Pro 仅聚合 primary；related 不推进活跃。Free 原样转发。H/T/Z 沿用原机制，T 为原 Free local-day 单位 |
| `navigation` | 原 Host 生成/校验的 navigation plan 和一次性 dispatch | LaunchContext 保存明确主题/Project/Series 来路及返回锚点；不猜 first-match，不创建原生聊天或代发输入 |
| `background` | 生命周期、当前 scope/用途许可、全局安装预算、共享停止/撤权钩子 | 队列有界、去重；派发不明保留费用；恢复不重跑模型、不恢复 grant；Browser-Local 即时档不持久/不收费 |

既有实现可直接复用：`ScopeRepository.open()` 的连接生命周期；`checkActivityVersionFence()` 的同事务原生/证据根检查；`freeNavigationSnapshot/projectFreeFrame/projectFreeSearch`；`createNavigation` 的 frame 渲染与原导航计划机制；原权限/Host/UI owner。

真实来源工厂仍由共享负责人提供。`tests/pro/support/fixture-owner.mjs` 的 WeakMap grant、合成 NONE、固定 scope、RAM 导航不是生产授权实现，禁止打入扩展或复制去猜测真实权限。它必须显式传入 `fixtureOnly:true`。

## 数据与事务

实际 DB 版本保持 **4**。Pro 不调用 `indexedDB.open()` 或执行升级；仅使用 owner 已有连接。

- overlay 根和 checkpoint：`JSON.stringify(['vaiwl-pro-overlay/1', actualScopeKey])`。
- overlay operation：`JSON.stringify([overlayRootKey, operationId])`。
- installation billing 根：`JSON.stringify(['vaiwl-pro-billing/1','installation'])`。
- billing operation：`JSON.stringify([billingRootKey, operationId])`。

记录包沿用 `{key,payload,checksum}`，校验摘要。`payload.scopeKey` 使用上述独立 namespace，`targetScopeKey` 或 ledger scope 记录真实归属。这样旧 Free 的 scope journal 索引不会把新 codec 当旧 workspace 操作读取。原生、Free workspace、workset、snippet、人工引用均保留原位置，Pro 不复制或更改它们。

这只是可测试的同库适配，**不等于已经获准的生产 schema 注册**。共享 owner 接入前需登记：命名空间/容量、backup bundle 版本、恢复路由、保留与 GC、最低可读二进制版本、降级策略。旧 Free backup 不含 Pro namespace；不能宣称它已自动备份 Pro。当前 Pro 备份是独立严格 data-only bundle，需要纳入共享复合备份合同后才可进入正式包。不能通过随意提升 DB 版本或覆盖旧 root 解决。

overlay root 当前上限 16 MiB / 10,000 条 journal；billing root 上限 8 MiB / 1,000 个任务 / 10,000 操作。达到上限必须明确拒绝，保留可导出资料。生产日志压缩/清理需要保留未完成 inverse、恢复顺序、负约束和未知费用；本候选没有自动删除历史。

commit 需要在同一 IDB readwrite transaction 内完成：核对 operation replay → scope/source/grant → 原生/证据根 fence → overlay revision 和完整 read/write set → 严格纯 reducer → checkpoint、root、journal 和目标撤销状态。事务中不能 `await` 外部工作。相同 operationId/载荷重放返回原结果；不同载荷拒绝。一次性 receipt 在串行提交边界消费，不以复制的 JSON 当授权。

预算的付款总额属于安装配置，scope 只是子额度。全局 ledger/jobs/journal 共同 CAS；dispatch 标记不产生网络授权。调用方看到 `replayed:true` 不能再次调用 provider。真实模型 transport 仍须消费另一个 owner 颁发、限定输入/模型/目的地/预算的一次性执行 ticket。

## 恢复、迁移与降级

旧 Workspace/Placement/Identity 保留 ID、名字、别名、顺序和人工控制。旧名称 ownership 不扩张为整个主题成员冻结。多个人工关系但没有 primary 意图时，完整保留并置为待确认；明确选择主关系或明确暂不指定，禁止 first-match。

自动和人工 patch 都写 journal；恢复按 sequence 重放数据。重复/缺失序号、重复 operation、跨 scope、摘要不符、异常 revision 或非 overlay kind 均拒绝。数据恢复后不复活来源证明、模型许可、凭据、原生命令或待派发工作。

当前独立备份恢复支持**真正空白的 overlay 目标**；残余硬排除、trashed 主题或其他任一资产存在时拒绝整体覆盖。对非空目标的选择性备份合并仍需共享 backup owner 制定并集成受审计划，不能为了演示成功覆盖已有用户资产。

Free/Pro 切换与 entitlement 失效不删除资产。Free 不读取 Pro 派生标题、不调用模型、不依赖会员联网；Pro 失效仍可查看已有资料、查找、导出、删除和按当前冲突检查撤销。Browser-Local 即时档只允许会话内本地预览；不能建立同库持久任务或真实付费预留。

## UI 与 worker 接线

`createProController(owner)` 是可信进程内 facade，独立测试页把合成资料放在同一受控文档中。它不是把完整 overlay/index 发送给真实 extension iframe 的许可。正式 frame 应通过既有 worker/UI grant 通道接收 bounded 页面/面板 DTO，并保留原 Host 的生命周期和输入所有权。

未应用的 shared-owner 补丁只增加可选 factory、精确 Pro message 分派与撤权/停止/idle 接点，默认 `null`。Free 没有 Pro/model import 或新前置。RPC 壳由已存在的 `ui.withScope` 建立当前上下文，deadline 与 signal 传入正式六 port；owner 必须注入公开结果投影函数，不能直接返回私有状态、grant、证据包或 provider handle map。

宿主继续负责 workspace/侧栏的真实挂载、返回与新标签来路传递、页面替换和输入框保护。Pro 只拥有自己的 surface，不替换聊天/编辑器。样例页面保留 textarea 节点的测试是隔离反例，不是 ChatGPT/Mac 真实宿主验收。

## 最小 codec 澄清

冻结 `VAIWL_PRO_CONTRACTS.d.ts` 未直接修改，补充位于 `R1_CODEC.d.ts`。

| 差异 | 实现及理由 |
|---|---|
| 首轮批量确认 | `ACCEPT_PROPOSAL_BATCH` 接收最多 40 个原始 `{proposalId,planHash}`；同一 read set、一次 transaction、一个 inverse；不把旧提案贴成新版本 |
| 完整 inverse 依赖 | AppliedTransaction 加 `readSet`；`inverseHash=digest({inverse,readSet})`，覆盖合并后新增成员、Series、约束和 redirect 等依赖 |
| 批量拒绝记忆 | `proposalIds` 保留所接受集合；撤销时对所有同依据提案写拒绝记忆 |
| 内部持久资产 | 加 `topic-tombstone`、`proposal-record`、`legacy-primary-resolution` patch；只含严格数据，不是外部效果 |
| 明确无主关系 | `RESOLVE_LEGACY_PRIMARY.chosenPrimary:null` 遵守主稿的“暂不指定”；保留 related 与原名剩余入口 |
| 提案登记日志 | `actor:'system', provenance:'proposal-registration'` 只写 proposal-record，不推进 overlay revision；真实人工/自动提交仍推进一版 |
| metadata 引证 | frozen payload 没有独立标题 handle；对话 handle 仅能引用自己的获准标题/别名，不能引用其他对话；正文仍需独立同引用 evidence handle |

## 尚需外部条件的关卡

1. 共享来源给出真实正向 NONE、当前 Native/Evidence 根和 live grant，不扩大现有权限。
2. 正式 owner 接入六 port、bounded DTO、命名空间/备份/GC/最低 reader，构建对应 SHA 的真实扩展包。
3. 原 Free 与真实 Host 的 Mac/页面更新/输入/导航/恢复回归；浏览器磁盘崩溃与 MV3 生命周期不能由 MockIDB 或常规进程关闭代替。
4. 明确的云目的地/用途/预算许可、当前模型与价格卡、受审凭据存储；随后才可做真实 provider 验收。
5. 自然中文标注集、独立自动 lane 质量、真实找回收益与用户验收。所有未达 lane 保持建议/人工模式。

以上各关卡分别报告。当前候选没有正式合并、安装变更、部署或发布。

## 测试接入

纯 Node 用例保持 `tests/pro/*.test.mjs`，可进入既有 CI 收集；浏览器两项沿用宿主的 `*-browser.mjs` / 显式 `.mjs` 入口约定，通过 `node tests/pro/run.mjs --browser` 运行，需要受控 Chromium 和 Playwright。共享 workflow 未改；正式 owner 接线时再将这个显式命令加入已有隔离浏览器 job。缺少浏览器时不能跳过并标成功。
