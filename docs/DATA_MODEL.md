# 逻辑数据模型与操作契约

状态：PROPOSED，不是已实现 schema。来源：原研究 §8、§10、§13–15。字段展开服务工程任务；实际版本与迁移由 B 阶段提出并验证，不把文档当 DDL 执行。

## 1. 身份与持久对象

| 对象 | 必需信息 | 所有权/关键约束 |
|---|---|---|
| Scope | provider、verified account/native-space evidence、vaultId、verification、epoch | 不能只用 Chrome profile、安装 ID、邮箱标签、头像或 tab ID；原生 Project 与组织 scope 不同 |
| HostBinding | tabId、documentId、frame、route、conversation witness、scope/epoch、adapter version、expiry | 临时绑定，不随备份恢复成为权限；每次异步提交重新验证 |
| ConversationRef | scopeId、nativeConversationId、canonical URL、title/project observations、availability | 逻辑唯一键是范围＋原生 ID；多 Project/工作区显示不复制原生消息 |
| SharedReference | 独立 shared ID/URL、来源范围、观察证据、availability | 不冒充自有 conversation；不由相似标题自动合并 |
| EvidenceSlice | conversation/branch/message、user-role evidence、channel/time、coverage、body或最小特征、revision、consent reference | 不接收未经归属验证的正文；索引角色和覆盖独立说明 |
| Workspace | stable ID、scopeId、name、owner、revision、archive state | AI 重跑不重新发 ID、静默拆合或删人工作品 |
| Placement / Constraint | conversation、workspace、facet、owner、include/exclude、evidence、revision | 人工 exclude/include 优先，负向约束不靠“缺少一行”表达 |
| DisplayIdentity | conversation、displayTitle、history aliases、owner、lock、revision、policy/evidence version | 与 nativeTitle 观察分离，人工锁不可由模型覆盖 |
| Series / SeriesEdge | stable series ID、predecessor、continuation/branch、sequence tuple、evidence、revision | 不以字符串标题作主键；相似只作建议；避免循环与重复序号 |
| TabInstance | scope、tab/document/window、conversation reference、currentness | 实例会失效；持久恢复不沿用旧 tabId 当身份 |
| Workset / Snapshot | scope、ordered references、active ref、window hints、validated anchors、revision | 不包含原生草稿/运行态；缺失项保留 availability |
| SuggestionBatch | source scope/epoch、evidence hashes、target base revisions、model/schema、candidates、budget/status | 候选无直接写权；缺证据/超范围/过期结果拒绝 |
| IntentLog / OperationReceipt | operationId、base revisions、delta、inverse/conflicts、author/time、result revision | 与对象写入原子提交，支持重放检测和冲突感知撤销 |
| NativeWritePlan / Receipt | commandId、scope/target、old/new、preconditions、authorization、status、timestamps | 特权通道，权限短期且精确；restore 不复活授权 |

HostBinding、SuggestionBatch 与 TabInstance 是对原报告数据流的必要拆解，不代表现有官方 API 或已完成的宿主身份来源。

## 2. 事实、意图与 AI 分开

原生观察保留渠道、时间、证据与有效状态，原名/Project 不能被 AI 直接改。displayTitle、Placement、Series 是派生事实；人工 intent 高于 AI。原生 title observation 作者未知就记 unknown，不推断“这是 ChatGPT 起的名”。

排序依据、人工固定次序、工作集顺序不同；候选热度不能覆盖固定顺序。AI 自动大规模拆合/改名需预览，不能沿用旧授权解释成任意更新。

## 3. 覆盖与可达性

内容覆盖使用原研究状态：`reference_only / title_only / partial_user_text / snapshot_verified / stale_or_unavailable`，并保留 channel、observedAt、branch、缺失区间与 parse status。实现时应将 coverage 与 availability 分开表达，避免旧完整快照被误当成当前可访问。

`snapshot_verified` 只对输入快照及其解析范围成立，不代表账户全量。Project 未核验不等于普通聊天；未知权限不等于允许。删除、归档、权限拒绝、网络暂时失败不能合并成永久删除。

账户总量未知则只报告已知引用/已索引数量。进度分母只能是明确批次；不由侧栏可见项推算完整历史。

## 4. 命令提交

命令有 operationId、当前 scope/epoch、目标和 baseRevision、有限字段及明确 origin。先验证授权和 schema，再开扩展 origin IDB 事务核对当前 revision/人工约束；在同一事务提交对象、IntentLog、receipt/撤销指针。先写后回包中断时，同一 operationId 只回读既有结果，不重复副作用。

不要跨网络等待持有 IDB 事务；异步模型返回后重新检查数据与授权。一个 worker 不自动保证所有扩展页面的并发安全，B 阶段需真实存储与重启测试。

撤销使用本操作 inverse 和目标 revision 检查；若后续人工作品冲突，展示冲突或只撤不冲突部分，不恢复全库旧快照。用户改名期间旧 AI 结果拒绝，而不是完成时间较晚者获胜。

## 5. 导入与去重

解析器先限制格式/解压/编码/ID/字节/数量/路径/分支；拒绝路径穿越、压缩炸弹、可执行 HTML、脚本及不支持结构。导入数据是数据，不是授权或工具指令。

范围不匹配进入隔离区，不混入当前账户。去重根据已核验原生身份/来源版本，不靠标题；跨来源冲突保留证据，不删原始输入文件。批次可以分块提交并续传，但公开宣称“整批可撤销”需 journal/rollback 验证。备份恢复与官方导入是两个入口，不能相互冒充。

## 6. 清除、恢复、同步

删除工作区只改派生容器；移除 Placement 不删聊天；清索引不删原生内容。撤回采集后停止新增/未完成读取；历史敏感证据、向量、snippet、AI 依赖结果按明确保留/删除策略处理，不任意擦除独立人工作品。

备份默认是人工组织和最小引用，证据正文另选并可加密。恢复验证 schema、哈希、scope 和当前授权；目标范围未知不自动绑定当前网页。授权、旧 native plan、待发云请求、实时 HostBinding 不可携带。迁移先保留可恢复原库，损坏/配额失败不半写覆盖。

可选同步只同步获准对象/人工作品日志，不同步过期授权及任务。tombstone 防旧设备复活；撤权设备不能继续写；离线分支保留双方人工修改，不用 last timestamp 获胜。密钥、恢复、元数据可见性和保留期是 PD-12/F2 单独交付，不是假定已有服务。
