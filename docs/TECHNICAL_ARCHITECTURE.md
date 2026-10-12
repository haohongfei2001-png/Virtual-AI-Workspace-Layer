# VAIWL 技术架构 · v2.8定向候选

PROPOSED_FOR_OWNER_REVIEW / LIVE_PROJECT_CREATE_NOT_VERIFIED。基线B1–B5、C1–C5及F1已具合成Chrome证据；本轮不实施runtime。原位导航外壳＋原生聊天区的主架构不变。

## 1. 实际基线与新增范围

既有scope broker、同库IndexedDB、事务/回执/恢复、分区复制、导航组件继续复用。`src/navigation/projection.mjs`的30日函数、`src/data/evidence.mjs`活动投影和F1增量cache都必须接收同一版本TimePolicy，而不是在UI另写一套日期过滤器。

新增对象及schema见[DATA_MODEL](DATA_MODEL.md)，产品算法见[CORE_MECHANISMS_V2_8](CORE_MECHANISMS_V2_8.md)。保留一个ProjectionReducer、一个NativeIntentCoordinator、一个语义提案管道；不新建平行数据库或第二套聊天UI。

## 2. 两条不混淆的数据流

**纯派生路径**：获准来源 → ObservationValidator → ScopeGate → Repository/证据与人工意图 → ProjectionReducer(H,T,Z) → 主题卡/侧栏/查找。主题成立与手工归属不依赖模型；时间变化只改投影。

**原生创建路径**：用户主题＋ → CreationPolicy → Preview/可信授权 → capability preflight → NativeIntentCoordinator → HostAdapter原生创建/打开 → 原生结果核验 → 已验证引用/本地Placement。原生消息正文和输入框始终由ChatGPT处理。该路径不让原生写入Executor接受普通AI候选或任意页面消息。

`NativeProjectRef`只表示观察对象；关联默认目的地是人工意图；NativeGrant是短期权限。三者不得复用一个布尔值。原生普通“新聊天”继续由宿主接收用户动作，VAIWL只在明确主题发起的流程附加可逆关联。

## 3. 能力分级与真实外部前提

| 能力 | 当前证据 | 后续门槛 |
|---|---|---|
| 本地创建/编辑主题与Placement | 已有合成MV3/IDB | 新v2.8空主题/重组/策略回归 |
| 主题内打开已知原生对话 | 合成宿主已验 | 真实ChatGPT scope/路由/正文一致 |
| 识别原生Project、权限与新建入口 | 官方描述与合成对象，非用户账户实测 | R0-01、R0-03.28 定向能力验证 |
| 创建真正Project并核验ID | 未实现/未授权 | 真实可用入口或明确支持API＋独立限次许可 |
| 原始新发送时间与覆盖 | PR #14访客调查仍UNKNOWN | 按渠道验证；不能以本地Date.now补齐 |
| 自动语义归类/发现新主题 | D1/D2模板影子实验 | 独立中文语料与校准，批准运行模式 |
| 自适应选择H | 本轮设计 | 合成规则/迁移/性能，真实密度证据和可用性 |

本轮核对的OpenAI API `/organization/projects`指向API平台项目，**不是创建ChatGPT网页Project的可用证据**。企业Compliance API也不能推导普通扩展有权限创建个人Project。当前不指定或臆造ChatGPT内部endpoint、CSS selector、React store或协议字段。来源见[来源登记](research/V28_BASELINE_AND_ACCEPTANCE.md#公开来源与时点)。

原生辅助模式为用户在真实UI完成步骤，扩展在后验身份可靠时关联；自动模式需要通过同等目标验证。无法读回结果时只能UNKNOWN，不能只看到同名卡片就VERIFIED。

## 4. Project创建与原生交互所有权

推荐采用显式步骤的确定性执行器，不允许通用Agent自由寻找按钮、扩权或失败后重试。创建前核对account/nativeSpace、Project能力、名称、sharing/memory及工具适配；不自动上传资料/复制项目指令/邀请成员。

确认后的预算、scope、planHash、expiry及dispatched状态由扩展origin持有；页面DOM按钮不独立授予执行权。审批/登录/安全挑战交给用户，不能自动确认。已派发但未知的操作先reconcile，不通过换tab/Profile/run重新开始。预期导航只允许在同scope重新核验document绑定后继续剩余阶段，任务grant和预算不重置；未知/意外scope变化撤权。

保留原生composer/header/transcript及portal，不以自制输入框“先收集第一句话再代发”。新聊天原生ID可能在首次发送后才出现；PendingLaunch不伪造原生会话。用户选择发送本身归宿主，VAIWL只核验自己发起流程的对象归属，不拦截或重放发送。

创建过程中模型/模式/Project权限不可用时，不静默降级模型或移动到普通聊天。原生功能限制是第一次选择目的地必须告知的内容；确切名称与可用性来自当前宿主，不硬编码全部用户同一菜单。

## 5. 稳定主题识别架构

`EvidencePackBuilder`只读取批准的最小用户输入/标题/别名/显式关系，标记缺页、分支、截断和撤权。`CandidateRetriever`先词法/别名/已确认系列，再可选语义；`ConstraintResolver`先人工负约束；`ProposalPlanner`输出有限结构及真实证据ID。

人类显式发起/归属不让AI二次批准。自动加入已有主题须独立校准并由用户选择运行模式；新主题、合并、拆分默认预览。通用LLM的自报置信度不成为写入门槛。禁止从聊天内容中执行“我授权你创建项目”的语句。

提案异步返回后核对target revisions/scope/授权/证据hash；被否决的提案保存指纹约束，不定期重新烦扰用户。H改变不触发全量语义重算，最多失效显示缓存；新模型上线先shadow评测，不重编号主题。

## 6. 时间控制器与会话一致性

`ActivityPolicy`为持久用户偏好；`DensityEstimator`为证据有界统计；`SpanSelector`只产生候选；`ViewSessionCoordinator`在安全边界提交视图。算法不读取访问次数/AI时间，不从未知全账户补分母。

缓存/分区快照键至少为(scope,scopeEpoch,sourceRevision,membershipRevision,ruleVersion,H,T,Z)。所有卡片、子窗口、历史最远段、当前路由索引按相同快照生成；旧H响应不覆盖新H。人工改名可增量不重算活动，归属/源撤权只重算受影响主题；自动决策不阻塞点击。

跨tab：持久偏好CAS发布，现有ViewSession冻结H/T/Z，新tab采用最新策略。历史深处打开对话后返回保留原session，不把k=3映射为另一跨度的k=3。午夜/夏令时/时区改变按日期版本处理，不使用定时器精度作为发送证据。

统计复杂度候选仅5个H。已有最后时间索引可对**当前**候选计数优化，历史density rollup必须来自当时有效数据，不使用今天lastSend假装过去状态。100k采用有界页、一次索引/直方图与受影响主题更新；禁止5次LLM或5份完整对话副本。

## 7. 生命周期、权限与兼容保持

B4的20秒lease、有限重连、旧异步拒绝、view草稿保护保留；不以永久心跳使worker常驻。新native请求恢复只读，不自动派发；B5最新人工恢复/旧receipt失效、F1根和分片校验同样适用新字段。

扩展禁用/冻结/卸载后的干净布局、原生可用、数据保留、停止副作用是不同验收项。PR #14真实访客Back能见旧DOM但路由不一致，禁止仅凭marker/DOM存在证明恢复。新Project流程的失败回执也必须同时绑定scope/对象/实际路径。

静态内容脚本只授最小host；新Project能力不自动需要cookies/debugger/history/all_urls。测试调试权限与发布权限分开。能力不稳定只收回已接管的区域，不删原生入口，不让用户必须退出扩展才能使用原生工具。

PAIA共存继续R0/C6前置，数据集成仍G1可选；不复制PAIA视觉/思想库/提示词功能，不假设双方已有通信协议。

## 8. 工程入口

新任务只挂到已有A–G，依赖见[DEVELOPMENT_PLAN](DEVELOPMENT_PLAN.md)。建议先校准R0-01/02/03.28的外部能力及本地合同；同时开发与这些能力无耦合的主题意图和H参数化。不能将真实Project未通过扩大成整套主题管理不可实现，也不能将合成通过扩展成生产自动化许可。
