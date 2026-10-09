# VAIWL — Virtual AI Workspace Layer

在 ChatGPT 原位工作的、可逆的语义工作空间层。

**当前交付：正式产品设计提案与完整旗舰开发计划，等待评审；不是正式扩展、已批准全部交互或真实 ChatGPT 验收。** 本仓库暂不提供安装包。

## 产品边界

原生聊天、消息、链接和 Project 归属不改变。VAIWL 单独保存稳定工作区、对话系列、当前工作集及显示标题，重构导航外壳，保留 ChatGPT 自己的聊天、输入框、模型及工具能力。跨 Project 显示不合并上下文或权限。原生改名属于另一条默认关闭、须另行授权的真实写入通道。

PAIA 管理用户输入、思想和 AI Context；VAIWL 管理 ChatGPT 工作环境。双方不共享可写数据库，不互相继承权限。

## 阅读顺序

1. [当前状态与唯一下一任务](docs/STATUS.md)、[文档效力](docs/AUTHORITY.md)、[执行约束](AGENTS.md)。
2. [产品提案](docs/PRODUCT_PROPOSAL.md)、[关键待确认决策](docs/DECISIONS.md)、[完整交互规格](docs/INTERACTION_SPEC.md)。
3. [数据模型](docs/DATA_MODEL.md)、[技术架构](docs/TECHNICAL_ARCHITECTURE.md)、[隐私、安全与恢复](docs/PRIVACY_SAFETY_RECOVERY.md)、[AI 与命名评估](docs/AI_NAMING_EVALUATION.md)。
4. [旧项目继承与 PAIA 共存](docs/INTEGRATION_BOUNDARIES.md)、[完整开发计划](docs/DEVELOPMENT_PLAN.md)、[R0 能力验证任务书](docs/experiments/R0_CAPABILITY_SPIKE.md)。
5. [原始材料、41 项来源及章节映射](docs/research/SOURCE_REGISTER.md)、[原型证据逐项核对](docs/research/PROTOTYPE_EVIDENCE.md)。

## 研究来源及原型

本提案整理自上一轮完整交付：`research.html`、`prototype.html`、`research.md`、`sources.json`、验证脚本、结果、日志和四张截图。原始 ZIP 为 `ChatGPT_Workspace_Research_2026-10-10.zip`。全部 13 个包内文件已读取；ZIP CRC 通过；两个独立 HTML 与包内文件逐字节相同。完整 SHA-256 见来源登记。

本次提交设计、计划、治理与纯文本研究证据，不生成新原型，不提交产品运行代码。专题文档为便于开发的整理版；另在 [原始研究档案](docs/research/2026-10-10/README.md) 原样保存完整 research.md、来源表和验证文本，六份原件均逐字节校验。HTML、Python 测试源码、PNG 和 ZIP 本体仍是原对话附件，没有上传或部署到 GitHub Pages。后续需要原型原件时按清单核对 SHA，不能凭文字重建后声称一致。

原记录为 **20/20 模拟交互 PASS**：Chromium 中的内存示例页面，未连接真实 ChatGPT。它不证明真实账户隔离、历史获取、原生恢复、原生改名、Chrome 标签页恢复、跨刷新持久化或 PAIA 共存。本次没有重跑该测试并制造新的通过记录。

## 下一步

完成文档评审后，单独授权 **R0：影响架构的能力验证**。先查清宿主账户/原生空间绑定、路由与渲染归属、历史发现边界、跨 Project 引用、原生 DOM 与生命周期恢复、PAIA 共存，再决定哪些正式能力可以实施。R0 不是完整产品开发；当前文档入库也不自动授权执行 R0。
