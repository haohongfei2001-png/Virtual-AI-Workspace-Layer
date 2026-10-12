# VAIWL — Virtual AI Workspace Layer

ChatGPT原位的可逆主题工作空间：稳定主题、跨原生Project的对话引用、手工意图和工作现场；保留真正原生聊天/输入/模型/工具。不是另一套聊天客户端或PAIA思想库。

## 本分支：v2.8机制升级候选

用户要求定向设计三项机制：主题内创建真实Project/新窗口、主题成立与内容拆合、自适应活跃区间。**本分支仅文档Draft，未改源码或原型，不操作Mac，不执行真实Project/模型/合并。**

- [三项机制唯一入口](docs/CORE_MECHANISMS_V2_8.md)与[待批准决策](docs/DECISIONS.md)
- [当前实际状态](docs/STATUS.md)、[文档效力/权限](docs/AUTHORITY.md)、[唯一A–G开发计划](docs/DEVELOPMENT_PLAN.md)
- [交互](docs/INTERACTION_SPEC.md)、[数据与迁移](docs/DATA_MODEL.md)、[技术](docs/TECHNICAL_ARCHITECTURE.md)、[隐私/恢复](docs/PRIVACY_SAFETY_RECOVERY.md)、[语义算法与评估](docs/AI_NAMING_EVALUATION.md)
- [最新GitHub/代码/来源与验收用例](docs/research/V28_BASELINE_AND_ACCEPTANCE.md)、[同一R0定向任务](docs/experiments/R0_CAPABILITY_SPIKE.md)、[文档检查范围](docs/research/V28_DOCUMENT_VALIDATION.md)

已有运行时仍执行v2.7；v2.8推荐须用户审定及后续实施。批准的v2.7原型与效果图原件保持在[design/approved/v2.7](design/approved/v2.7/)，不把其中模拟聊天组件迁成生产UI。

## 核对到的工程状态

main仍初始化提交；PR #1–#14均Draft。B1–B5、C1–C5的独立部分、D1/D2影子规则与F1分区性能已有连续工程证据；#11/#12/#13已经远端交付，100k合成MV3已在PR #13验证，不能再从旧README推断缺失。

PR #14是真实访客部分验证，不是登录态产品验收：原始用户发送时间和历史覆盖仍UNKNOWN，Project/账户接入和实际PAIA共存未完成。D1/D2模板质量不代表通用AI整理已可用。

详细状态和范围以STATUS为准；历史证据按各自head/环境保留，不相加为完成度。本轮推荐“首次确认后同名Project、人工主题零AI依赖、有效H自适应”仍是待审设计，不是已经可以安装使用的新增功能。
