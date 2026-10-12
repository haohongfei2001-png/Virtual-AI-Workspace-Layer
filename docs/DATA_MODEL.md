# VAIWL 数据模型与迁移合同 · v2.8候选

> **Free/Pro数据边界修订：** Free以(scope,nativeProjectId)的真实原生Project为卡片身份，ConversationRef的项目归属必须显式区分“已确认ID / 已确认null无项目 / 未验证UNKNOWN”。Free项目/聊天行只使用原生观察名称，不能由旧DisplayIdentity覆盖。原有Workspace/Placement/DisplayIdentity/Series/人工保护与拆合等持久对象**保留，归Pro虚拟组织层或旧用户兼容资产**，不删除或迁移覆盖。Pro只能以独立VirtualTopic命名空间映射确认无项目聊天；虚拟关系不是原生Project membership。[分级规范](FREE_PRO_PRODUCT_SCOPE.md)；现有schema/代码尚未按此更改。


状态：PROPOSED_FOR_OWNER_REVIEW；不是DDL、不是已实施schema。基线为PR #14 `0b07455…`，实际代码仍使用B1–B5/F1的同一扩展IndexedDB及受限合成身份。机制入口：[CORE_MECHANISMS_V2_8](CORE_MECHANISMS_V2_8.md)。

## 1. 既有实现必须保留

实际`src/data/state.mjs`的TABLES为refs/sources/events/coverage/workspaces/placements/identities/preferences；CREATE_WORKSPACE、UPDATE_WORKSPACE、SET_TITLE、PLACE、MOVE及人工锁/排除已有实现。`schema.mjs`的DATABASE_VERSION=2，B23_STORES与B1 refs/operations共库。F1又在同一数据库建立分片根、只读复制及增量投影；20k旧表、16Mi单记录和有界请求护栏不能为新机制放宽。

`preferences.mjs`只接收sidebarVisible、compactRows、workingSet、savedSnippets。当前没有原生Project创建策略、自适应跨度偏好、密度统计、主题拆合事务。`current-index.mjs`仍有entries[0]默认语境；需要在有明确启动上下文时保留它，而不是以first-match覆写。

以下名称是拟定的逻辑对象，不声称真实宿主API存在。原型与合成resolver只能填synthetic证据等级。

## 2. 原生事实、用户意图、执行许可分开

| 对象 | 字段/键 | 所有权与约束 |
|---|---|---|
| Scope | provider/accountId/nativeSpaceId、验证来源、epoch | 三者与当前宿主绑定匹配；Project不等于安全scope |
| HostBinding | tabId/documentId/frameId、browserRoute、conversationWitness、expiresAt | 临时；不能从备份恢复为权限；浏览器frame URL与sender初始URL区别保留 |
| ConversationRef | (scope,nativeConversationId)、nativeUrl、nativeTitle/project观察、availability | 原生ID稳定，多tab只是实例；归属/权限未知分别表达 |
| UserSendEvent | scope/ref/messageId/branchId、actorWitness、role、kind、committed、sentAt、precision、source、revocation | 仅可信原始新发送；共享Project须证明是本人输入，role=user不等于当前作者；创建/打开/本地时间不能填sentAt |
| TimeCoverage | ref/branch、from/through/gaps、发现渠道/新鲜度 | 单条时间、旧导出、当前URL可见都不等于完整历史 |
| Workspace | stable id/name/aliases/icon/order/owner/lock/revision | 0/1/多成员均合法；时间分段为派生结果，不写死到身份 |
| Placement | scope/workspaceId/refId、order/include/exclude/owner/lock | 多重归属合法；原生Project不被修改，显式exclude不能消失 |
| DisplayIdentity | ref、displayTitle/aliases/owner/lock/revision | 与原名分离；人工作品不因新证据或H改变漂移 |
| Workset/手工片段 | 既有refs/order/current、message/branch/bodyHash/选中文本 | 继续原生定位与安全降级；不保存未发草稿/Agent内部状态 |
| Series | stable id/edge/sequenceTuple/evidence | 逻辑规范保留；不把D1模板输出当作已实现全部系列能力 |

### v2.8新增对象

| 对象 | 必要字段 | 关键规则 |
|---|---|---|
| ThemeMetadata | workspaceId、birthKind、lifecycle、intentDescriptor、redirect、revision | lifecycle=empty/established/retired；是否有内容与当前活跃段独立。intent可不填，不强制额外表单 |
| NativeProjectRef | scope/nativeProjectId、observedName、nativeUrl、permission/sharing/memory/tool snapshot、observedAt、verification | API平台projectId不得混入；name非主键；观察不授予创建权 |
| WorkspaceProjectLink | scope/workspaceId/nativeProjectId、kind、owner、verifiedObservation | referenced/explicit-link为关系；默认新建目的地单独存，允许多对多 |
| CreationPolicy | workspaceId、mode=ask/project/plain、defaultProjectId、sameNamePreference、contextHash、owner/revision | 最多一个默认Project；普通聊天与询问不带projectId；不是native grant |
| CreationIntent | flowId、workspaceId/revision、scope/epoch、nameSnapshot、destination、phase、budget、dispatch journal、verified IDs、reconcile state | 一次用户动作一份计划；任务grant与每阶段文档binding分离；无正文/密码/token；预算跨受控run累计，不自动重放；独立Profile全局去重未证实 |
| ThemeProposal/RestructurePlan | proposalId、kind=create/place/split/merge、evidenceHashes、source/destination IDs、negative constraints、base revisions、previewHash | 模型只读提案；提交由明确人工动作转换为受限本地命令，不能直接设actor=human绕确认 |
| ActivityPolicy | mode=auto/fixed、effectiveH、selectionOrigin=user/legacy/default、userLocked、policyVersion、pending、decision reason | 唯一所有者为现有preferences体系；不另建第二个控制开关 |
| DensitySample | scope、population contract、T/Z、N或上下界、missing/unknown、source revisions、policyVersion | 派生诊断，可重算；不是用户发送证据；新发现/撤权必须使旧样本失效 |
| ViewSession | scope/epoch、H/T/Z、policyRevision、anchorRef/anchorDay、k、oldOpen/scroll、launchWorkspaceId | H/T改变不得只复用旧k；多tab现有视图允许暂时使用不同会话参数，不改变持久偏好唯一值 |

empty主题没有latestUserSentAt；创建上下文和固定使它可访问，不产生伪活动。待存聊天只有CreationIntent，不造refId占位后混入正式列表。Topic语义不得迁入PAIA Thought Library的同名对象。

## 3. 数据/命令与原生创建状态机

复用B4 operationId、CAS、inverse、源撤权、原子回执。新增本地命令候选：SET_CREATION_POLICY、LINK_NATIVE_PROJECT、ACK_CREATED_CONVERSATION、PROMOTE_CONVERSATION、APPLY_RESTRUCTURE、SET_ACTIVITY_POLICY、PUBLISH_DENSITY_DECISION。命令白名单、actor、schema与字段长度逐项验证，未知字段拒绝。

原生Project创建不在本地reduceCommand中伪执行。NativeIntentExecutor单独持有可信UI批准；发送前原子保留次数，进程挂起后属于dispatched/unknown，不能因未拿到回包当作未发送。终态只能来自实际同scope原生对象核验。日志保存结果，不保存可重放授权。

ACK_CREATED_CONVERSATION只在完整scope/project/conversation绑定后创建引用和人工Placement；人工取消、改变目的地或切scope后旧回包不能接管当前界面。对话已存在而Placement冲突时仅在同意的原主题修复本地关系；新Project ID永久依回执记录，名称变化不能重置。

两个tab同时首次新建同一主题：创建策略CAS＋唯一pending flow使一个成为owner；另一个可打开已存在的请求/等待核验，不能并发创建第二个同名Project。浏览器流程不是服务端原子事务，不能宣称exactly-once；未知结果需要只读reconciliation或用户明确处理。

## 4. 拆合的原子范围与冲突

RestructurePlan显式列出保留ID、新ID、每条Placement前后值、排除规则、别名、默认目的地和重定向。预览后任何被修改目标的revision变化均拒绝自动应用，保留用户草稿；无关变更可按原B4的目标级冲突规则处理。

合并：用户选定survivor，旧主题保留redirect，不删除引用或消息；对话在survivor去重。include/exclude冲突必须解决；未明确解锁则排除优先。两个默认原生Project不同则清除唯一默认、设为ask，并保留两条关联。

拆分：原ID保留给用户选定主集合，其他新ID一次分配；原主题已确认排除不能在新主题中被自动洗掉。分配方案中明确每条人工约束的继承/冲突，提交前展示必要差异。手工标题/图标/锁与工作集/片段的ref不改。

undo使用本次inverse和目标revision；不全库回滚，不撤销用户后续原生创建。一个重组计划可以本地撤销，但原生Project绝不跟着删除。

## 5. 同库增量迁移设计

**建议使用下一个可用IndexedDB版本（基线为2，暂拟3）；实施前若其他已批准迁移占用该版本，重新核对，不能抢版本或覆盖。** 不本轮写代码。

1. 新增同库metadata/intent存储；保留B1/B23旧stores和F1不可变分片。建议`v28_meta`存ThemeMetadata/ProjectRefs/Links/CreationPolicy/DensitySample，`v28_native_intents`存非授权执行账本。ActivityPolicy继续现有preferences并扩展白名单；不双重存储同一控制值。
2. 旧Workspace/Placement/DisplayIdentity/Workset/手工片段的ID、owner、lock、order、revision原样保留。已有主题生命周期由真实已知成员标记；不因无最新证据删除空/未知主题。
3. 原生Project关系只能从已有可信原生观察建立referenced；**不得按同名自动绑定默认目的地**，默认ask。既有主题不批量新建Project。
4. 无新偏好的v2.7安装保留H=30/fixed/origin=legacy，userLocked=false但仍不自动调整；用户选择auto后才启用。已有明确人工偏好不覆盖。新安装auto从30起步。
5. view记录保留原H=30/anchor/revision；恢复到其他H时按对象或锚点重定位，不沿用旧k。派生缓存、密度诊断、语义候选可失效重算，原始UserSendEvent不改变。
6. 元数据迁移使用短事务、分片进度与可校验根。大规模跨表命令以写时复制+一次根/CAS切换提交，不能把100k全部搬进16Mi旧记录。旧reader不理解新root时拒绝读取写入，不能忽略新字段写回旧schema。
7. 活跃写入者须版本协商/停写栅栏；versionchange关闭旧连接。存储配额/崩溃/损坏保留旧已验根与新进度，不“清空后重建”。新文档误用旧worker、两个tab分别运行v2/v3必须拒绝跨代写。
8. 降级前无新人工数据可显式切旧root；已有新人工数据时禁止静默降级丢字段，提供兼容版只读或显式迁移工具。备份格式升版并保持严格schema与校验。

## 6. 备份、恢复与原生权限

延续B5有界资产文件，不把100k原证据全量无损镜像当已实现。新增人工主题意图、拆合重定向/约束、CreationPolicy与手动H可备份；NativeProject ID只是恢复后待核验引用。缺权限时呈现受限关联，不能复活可操作状态。

**不备份为执行态：**HostBinding、原生grant、待派发操作、重试计数重置、密度可信标志、pending自动推荐、模型待写候选。CreationIntent可保留只读审计结果但恢复后一律不派发；已派发不明结果标reconcile，不能因恢复成新Profile绕过任务预算。

来源撤权只重新计算活跃/候选；独立人工主题/名称保留为资产。新TimeCoverage/InventoryCoverage不是恢复文件自签名即可获得的权威。切账户时先撤投影再核验，UNKNOWN范围不能查找旧scope资产。

## 7. 验收入口

见[统一验收矩阵](research/V28_BASELINE_AND_ACCEPTANCE.md)的M28、N28、T28、A28、S28及对应DEVELOPMENT_PLAN子任务。本文件只有可执行设计；迁移、真实创建、语义精度及自动调H均NOT_RUN。
