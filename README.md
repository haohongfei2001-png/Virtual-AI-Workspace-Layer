# VAIWL — Virtual AI Workspace Layer

在 ChatGPT 原位工作的、可逆的语义工作空间层。

**当前交付：旗舰产品设计提案、完整开发计划与 v2 高保真交互原型；不是正式扩展，也不是已完成真实 ChatGPT 验收。** 本仓库不提供扩展安装包。

## 最新核心体验

用户于 2026-10-10 明确增加三项核心要求：[CORE_EXPERIENCE_V2](docs/CORE_EXPERIENCE_V2.md)。

- 原生一致性：字体、字号、圆角、间距、配色、交互、菜单和动画跟随真实 ChatGPT；保留第三方身份，不迁入 PAIA 品牌视觉。
- 主题级卡片：一个稳定 Workspace/主题一张聚合卡片，内部紧凑对话列表；跨原生 Project 引用，不做对话大卡片或复杂文件夹。
- 用户发送时间：默认最近一个月，支持 3 个月、1 年、全部与逐段回看；可靠用户发送事件驱动卡片及内部列表，历史折叠、时间未知单列，固定与当前访问不伪造活跃性。

这些是核心设计约束，不再等待“是否采用”投票；精确像素、默认展开数量和固定区具体样式仍待评审。原生数据/Project、派生标题隔离、保留原生聊天/输入/模型/工具的边界不变。

## 阅读与体验

1. [状态](docs/STATUS.md)、[效力](docs/AUTHORITY.md)、[执行约束](AGENTS.md)、[v2 核心体验](docs/CORE_EXPERIENCE_V2.md)。
2. [产品提案](docs/PRODUCT_PROPOSAL.md)、[交互规格](docs/INTERACTION_SPEC.md)、[决策登记](docs/DECISIONS.md)。v2 增量优先于旧文档的冲突描述，旧研究不被抹去。
3. [数据模型](docs/DATA_MODEL.md)及 v2 §8 时间数据增量、[技术架构](docs/TECHNICAL_ARCHITECTURE.md)、[隐私安全恢复](docs/PRIVACY_SAFETY_RECOVERY.md)、[AI 命名](docs/AI_NAMING_EVALUATION.md)。
4. [完整路线](docs/DEVELOPMENT_PLAN.md)、[R0 任务书](docs/experiments/R0_CAPABILITY_SPIKE.md)、[旧项目与 PAIA](docs/INTEGRATION_BOUNDARIES.md)。
5. [可交互原型 v2](docs/prototypes/v2/prototype-v2.html)、[本轮验证](docs/prototypes/v2/VALIDATION.md)。将 HTML 保存后在桌面浏览器打开；本轮实际测试为 Chromium 内存页面，未验证所有本地文件策略。

v2 使用 88 个主题、339 条对话，PAIA 有 60 条；演示日期/时区可切换。只含合成材料，不联网、不发送、不读取私人数据；状态在页面内存。浅/深色是近似宿主样本，不是已经完成登录态像素匹配。37 项模拟测试不等于真实账户、时间来源、原生恢复、PAIA 共存或性能认证。

## 原始研究保留

原件来源：[SOURCE_REGISTER](docs/research/SOURCE_REGISTER.md)、[原研究档案](docs/research/2026-10-10/README.md)、[v1 模拟证据](docs/research/PROTOTYPE_EVIDENCE.md)。原始 ZIP 的 13 项、两个 HTML 与校验记录保持不变；六份原始文本在研究目录中逐字节保存。v1 的 20/20 是历史模拟结果，不与 v2 相加冒称正式验收。

原始 HTML/PNG/Python 与 ZIP 本体仍是原对话附件；v2 是本次获准的设计衍生原型，不覆盖原件。历史 SOURCE_REGISTER 关于“仅提交 Markdown”的描述属于前轮范围，由本次明确原型修订授权扩展，不改变其原件事实。

## 下一步

R0 尚需单独授权。第一轮同时验证宿主 scope、消息级用户发送时间及覆盖、路由/Project 引用、原生视觉角色和完整恢复、实际 PAIA 构建共存。缺证据不能用 updated_at 或访问时间替代，也不能把这些核心要求挪到后期美化。
