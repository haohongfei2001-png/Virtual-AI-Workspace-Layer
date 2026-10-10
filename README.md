# VAIWL — Virtual AI Workspace Layer

在ChatGPT原位工作的可逆语义工作空间层。当前为设计提案与模拟原型，Draft PR #1，尚无正式扩展/安装包。

## 当前体验

一个主题一张卡片，卡片内部紧凑显示活跃对话；旧对话留在该主题的“以前的对话”中。主题按最近可靠用户发送只属于一个滚动日历时间段，当前活跃主题不会在上个月重复。时间计算在后台，主界面不逐项显示日期、原生来源或数量。

原生数据和Project归属不变，显示标题独立保存。导航改变但原生聊天、输入框、模型和工具保留。真实来源仍在底层，跨Project显示不合并上下文/权限。PAIA负责输入、思想和AI Context，VAIWL负责工作环境；不共享可写数据库或授权。

## 入口

- [当前状态](docs/STATUS.md)、[效力与授权](docs/AUTHORITY.md)、[执行约束](AGENTS.md)。
- [当前核心规格v2.1](docs/CORE_EXPERIENCE_V2_1.md)、[交互规格](docs/INTERACTION_SPEC.md)、[决策登记](docs/DECISIONS.md)。
- [交互原型v2.1](docs/prototypes/v2/prototype-v2.1.html)、[当前验证范围](docs/prototypes/v2/VALIDATION_V21.md)。
- [产品提案](docs/PRODUCT_PROPOSAL.md)、[数据模型](docs/DATA_MODEL.md)、[技术架构](docs/TECHNICAL_ARCHITECTURE.md)、[安全恢复](docs/PRIVACY_SAFETY_RECOVERY.md)、[AI/命名](docs/AI_NAMING_EVALUATION.md)。
- [完整A–G开发计划](docs/DEVELOPMENT_PLAN.md)、[R0任务书](docs/experiments/R0_CAPABILITY_SPIKE.md)、[PAIA与旧项目边界](docs/INTEGRATION_BOUNDARIES.md)。
- [原研究来源登记](docs/research/SOURCE_REGISTER.md)、[原始文本档案](docs/research/2026-10-10/README.md)、[原型证据映射](docs/research/PROTOTYPE_EVIDENCE.md)。

## 证据与下一步

当前v2.1是在v2已有源码上做定向修改，91个合成主题/345个对话，40/40模拟用例通过。它不连接ChatGPT、模型、真实账户，不证明真实发送时间/覆盖、扩展生命周期、PAIA共存或完整可访问性。字体/菜单仍是中性近似宿主样本，非精确登录态校准。

v2原HTML、37/37记录与原研究均保留；[v2规格](docs/CORE_EXPERIENCE_V2.md)的任意区间事件重复命中、常驻来源/日期/计数、固定项带出父卡片等冲突选择由v2.1明确替代，不是第二套执行标准。原v1的20/20同样只属于历史模拟。

R0仍未执行。下一步在独立获准的清洁环境验证宿主scope、最近可靠用户发送与覆盖、主题隔断、原生节点/恢复以及实际PAIA构建共存。文档入库不授权正式代码、安装、付费、私人聊天或原生写入；main不改、不自动合并。
