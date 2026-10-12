# VAIWL 本分支工作约束

> **新的产品实施顺序（2026-10-13）：** 同一A–G路线，Free为第一完整产品，Pro为后续AI增强。Free只能使用真实Project/聊天名称和原生Project成员；必须显示全部已知无项目聊天，活跃排序尽力可靠且不因证据缺失卡死。Pro保留AI虚拟组织/派生名和既有研究，不抢Free关键路径。本分支继续仅文档；真实账号、原生操作、Mac、付费、合并与发布不因更新范围而获得新权限。依据[docs/FREE_PRO_PRODUCT_SCOPE.md](docs/FREE_PRO_PRODUCT_SCOPE.md)及[docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)§0。


## 本轮范围

这是2026-10-12用户明确授权的**三项机制设计与开发计划修订**分支。只允许VAIWL设计、计划、治理文档和独立Draft PR。不得修改产品源码/测试/模拟器/原型原件，不操作Mac或Remote Desktop Commander，不访问真实私人聊天，不创建真实Project、不发送消息，不改其他仓库/main，不合并/部署或调用收费服务。

过去的Mac连续实现许可是历史上下文，不覆盖本轮“只文档”限制。不要求不相关已批准开发停工，不覆盖其他writer提交。提交前核对父head，独立分支提交；不得force push。

## 阅读顺序与唯一依据

先读docs/STATUS.md、docs/AUTHORITY.md、docs/DECISIONS.md、docs/CORE_MECHANISMS_V2_8.md，再读INTERACTION_SPEC/DATA_MODEL/TECHNICAL_ARCHITECTURE/PRIVACY_SAFETY_RECOVERY/AI_NAMING_EVALUATION和唯一DEVELOPMENT_PLAN。当前候选待批准，运行时仍为v2.7；旧原件保持历史，不能成为相冲突的第二规范。

已有A–G任务不删除，新工作只挂`.28`子任务。文档检查和算例不是产品测试。PR #2–#14的旧结果按原源码/环境/范围保留，真实访客UNKNOWN不等于所有匿名渠道NO_GO。

## 不变量

- 普通派生不改原生消息/Project/权限；独立批准的Project创建流程才可生成真实对象。原生Project不等于主题、账户scope或API平台项目。
- Workspace为稳定意图容器；空/单窗口可以存在，H不决定身份。跨Project聚合不合并上下文。
- 人工include/exclude/title/icon/lock优先，模型只受控建议；数量不自动拆合，time变化不运行原生动作。
- 既有无常驻日期/来源/计数、主题静态卡/左侧旧窗口/侧栏开合/上下区间/唯一阅读返回保留。不要重新加“自动·14天”顶栏。
- 可信新发送和覆盖不变；候选H为7/14/30/60/90当地日历日。未知不造假，手工/固定/当前/空主题可达不记为发送。
- Project首次确认、结果核验、跨run预算、UNKNOWN不重试是候选安全合同；主题＋不自动提交用户正文，不克隆composer。
- B1–B5/F1的同库IDB、CAS/inverse/分区/旧护栏继续，迁移不能全库重建丢人工数据，不从备份恢复grant。
- 原生搜索/新聊天/dot/固定/账户/工具/授权/新入口完整保留；测试合成标记不能当生产身份。

## 交付

只创建独立Draft PR，列真实head/基线、文档路径、待批准决策和未执行能力。公开仅来源/合成材料，无私有正文/原生ID/凭证/HAR。所有写入文件需与实际生成内容核对；不得以复制旧测试PASS给新方案背书。
