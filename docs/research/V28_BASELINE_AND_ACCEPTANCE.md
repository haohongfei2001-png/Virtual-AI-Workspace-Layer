# v2.8 基线、来源与统一验收矩阵

2026-10-12，证据截止本轮GitHub核对。支持[唯一机制规范](../CORE_MECHANISMS_V2_8.md)与[原A–G计划](../DEVELOPMENT_PLAN.md)，不是新计划或产品实现。以下新验收用例均 **TARGET / NOT_RUN**；末尾数值只做独立设计算术核验，没有运行产品、Chrome、模型或Mac。

## 1. 真实GitHub基线与证据边界

main=`76e3dbdb283769e5c94fcef2de35f6b21cf7e49c`，初始化；#1–#14均Draft、未合并。文档基线选最新#14 `0b07455a09b4f2ae2d756ffca5a868305815e424`，不是仅凭main空壳重建。新文档PR叠在#14分支，不修改它。

| PR | 固定head（缩写） | 依赖与实际内容 | 本轮继承的结论，不升级证据 |
|---|---|---|---|
| [#1](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/1) | 79dbfa7 | main；v2.7设计/原A–G | 旧固定30是已批准基线；新默认值仍待审 |
| [#2](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/2) | e2e45a8 | #1旧快照；R0合成网页 | 页面fixture，不是账户认证 |
| [#3](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/3) | d5c6622 | #2；MV3源码准备 | 当时未加载；不因后续结果改原件 |
| [#4](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/4) | 7d47d97 | #1；Mac R0 | 真Chrome合成，有route/lease/残留失败；不是整项GO |
| [#5](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/5) | 67653a2 | #1；B1 | 同库IDB、scope/doc broker，未生产认证 |
| [#6](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/6) | a02d653 | #5；合成宿主/导航/MV3 | 真MV3合成、原生节点保留；不是真ChatGPT |
| [#7](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/7) | dc73231 | #6；B2/B3 | 证据、手工主题/归属/标题、真实IDB与持久化 |
| [#8](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/8) | 3b1a40f | #7；B4 | lease/冷启动/草稿/CAS、合成生命周期 |
| [#9](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/9) | a055246 | #8；C1 | 原v2.7视觉一致性；原件design/approved保留 |
| [#10](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/10) | 8d19020 | #9；B5 | 最新人工恢复、文件备份、坏数据/配额反例 |
| [#11](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/11) | 38ea47d | #10；C3/C4/C5 | 工作集/手选片段/安全定位/合成200%键盘；不是全部真人体验 |
| [#12](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/12) | 3afaf33 | #11；离线D1/D2 | 1200模板、16.67%覆盖；未启用运行时分类 |
| [#13](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/13) | f151fb4 | #12；F1 | 同库分区/100k合成MV3与有界性能已测；新H/拆合性能需重验 |
| [#14](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/14) | 0b07455 | #13；真实访客专项 | 原始sentAt/coverage UNKNOWN；匿名途径未被全盘否定；无登录态Project证据 |

PR链是依赖关系，不是14条新路线。#2/#3/#4实验分支原始证据独立；不能因没有把它们全部合入产品链就删掉失败结论。当前#14包含#13之前的产品累积实现。

本轮纠正入口文档中的陈旧状态：旧README仍称#11–13未远端交付及100k受阻，与实时PR相冲突；旧R0任务书NOT_STARTED不再代表已有专项；旧AI文档完全NOT_EVALUATED需细化为“模板已评估、通用质量未认证”。只改入口和状态表述，不改历史结果或宣称重新验收。

## 2. 代码核对与复用清单

以下均以#14固定head为参照，属于仓库读取，不是本轮复跑。

| 路径/对象 | 实际机制 | v2.8最小影响 |
|---|---|---|
| `src/data/schema.mjs` | DATABASE_VERSION=2；B1/B23共库 | 同库下一版本增量，不能另开平行DB |
| `src/data/state.mjs` | CREATE/UPDATE_WORKSPACE、PLACE/MOVE、SET_TITLE、owner/lock/negative | 现有0/1/多主题可用；新增元数据/重组计划，不造第二reducer |
| `src/data/preferences.mjs` | sidebarVisible/compactRows/workingSet/savedSnippets | 扩展唯一ActivityPolicy/CreationPolicy合同，当前尚不存在 |
| `src/data/evidence.mjs` | 原始发送、正向当前证据、完整覆盖、撤权、合作式计算 | 参数化所有H；增加有范围的密度汇总，不能只改按钮 |
| `src/navigation/projection.mjs` | 固定30日函数 | H=30兼容，5候选同一实现/缓存键 |
| `src/navigation/current-index.mjs` | 路由索引`entries[0]`选主题 | 明确LaunchContext/多Placement优先，不覆盖实际来路 |
| `src/data/partitioned.mjs`等F1模块 | 有界分区根/增量投影与原CAS | 不制作5份100k全集；schema迁移/拆合根提交需新测试 |
| `simulator/editor.mjs` | 人工主题/标题/归属/工作集/片段/备份 | 新主题＋/目的地/拆合/范围为增量；不复制原生输入 |
| `experiments/d12/rules.mjs` | 只有明确“继续整理某对象某任务”的regex与唯一已有主题预览 | 不属于通用新主题发现；需要D1/D2.28质量研究 |
| `docs/experiments/results/r0-time-source-2026-10-12/REPORT.md` | 访客DOM/初始化/自然NDJSON仍无可靠原始时间 | 自动密度生产门槛未满足；不能把本机Date升级为sentAt |

继续继承：scope/epoch、原生所有权、CAS/幂等/inverse、人工锁与负约束、B5文件/检查点恢复、B4有限重连、F1限额与原始设计。新增：Project创建流程/结果关联、主题出生/重组、可验证密度、H策略与会话、迁移。待门槛：真实数据渠道/Project执行、自然语义质量、实际PAIA、发布。

## 公开来源与时点

**仅对本次机制定向查证，不重新竞品调研。官方说明与当前用户账户实测分开。** 下述资料在2026-10-12读取；页面可能继续变动，实施前按目标账户复核，不把文档解释当作API或法律许可。

- **S28-01** [OpenAI — Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)：项目具有文件、指令、共享及记忆语义，不是视觉目录；移入聊天会继承上下文。创建入口/权限、记忆选项和工具由真实宿主管理。当前帮助文档允许部分项目稍后改记忆；共享项目和project-only有特殊限制，不能套旧的“一律不能改”结论，也不能为安全静默强制一个会改变工具可用性的模式。首次用GPT开聊可能落到Project外，须核验实际结果，不据按钮猜归属。VAIWL不自动移动它纠错。
- **S28-02** [OpenAI API — Organization Projects](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects)：该端点面向API组织项目，不是ChatGPT网页Project创建证据。本轮未建立普通扩展可用的原生创建API；这是“未证实”而非断言所有账户绝无官方渠道。
- **S28-03** [OpenAI — Exporting history and data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)：导出是主动请求的账户数据渠道，资格与账户类型相关；不能假设每类账户同一自助入口、固定JSON或持续实时历史覆盖。
- **R28-14** [PR14时间与恢复专项](../experiments/results/r0-time-source-2026-10-12/REPORT.md)：权威是实际实验范围而非早期摘要。曾声称6条却跨run累计9条；后来第10条未获批。设计吸取任务总预算不可由Profile/输出目录/重新运行重置的教训。本轮没有追加实验或继承发送许可。

“不改变原生”仍约束派生操作；独立原生创建需要用户确认、真实能力及渠道合规三者。文档中未填写私有endpoint/selector/认证token，也没有调用相关写接口。

## 3. 自动化验收分层与共同要求

证据分为L=逻辑/故障合同，D=真正原生IDB事务，S=真实Chrome合成宿主/MV3，G=真实ChatGPT清洁账户，U=真人可用性/独立语义标注。本轮仅定义用例，**L/D/S/G/U的新测试全未执行**。旧结果只证明旧版本，不能加总成v2.8通过数。

每项未来结果绑定source/build、scope与权限、原始断言、失败和修复后相同条件。安全退让与完整增强分别记；缺权限标BLOCKED，不放宽条件。下面表格的编号是DEVELOPMENT_PLAN子任务的验收用例，不是额外工程队列。

### N28：主题内原生Project/窗口

| ID | 场景 | 必须结果 | 层级/映射 |
|---|---|---|---|
| N28-01 | 人工建空主题 | 无原生Project、无发送、稳定主题ID | L/D/S；B3/C1 |
| N28-02 | 首次主题＋选同名Project | 先确认scope/name/context，后创建；结果由稳定原生ID验证 | S/G；C2/E1–2 |
| N28-03 | 已有默认/多个关联/两个同名Project | 默认只用人工ID；同名不猜；无默选首成员 | L/S/G；B3/C2 |
| N28-04 | 双tab同时首次创建 | 同主题同意图仅一个派发；另一tab等待/查看回执 | L/D/S；B4/E2 |
| N28-05 | 创建派发后超时/worker死/换run目录 | UNKNOWN只读核对，预算不重置，不再创建 | L/S/G；B4/E3 |
| N28-06 | Project成功、composer失败 | 保留已建对象；PROJECT_ONLY可继续，不自动删除 | S/G；C2/E3 |
| N28-07 | 对话成功、localPlacement写入失败 | 幂等重试本地关联，不重建原生对话 | D/S/G；B3/B5/E3 |
| N28-08 | 尚无第一条消息或ID | PendingLaunch，不伪造ref/sentAt；取消不删原生Project | L/S/G；B2/C2 |
| N28-09 | 第一句GPT/原生路由实际落到项目外 | 不声称项目内创建成功，不擅自Move；说明真实目的地 | S/G；C2/R0-03 |
| N28-10 | 主题/Project改名、Project删除/共享/权限变化 | 关联按ID；不级联改名；不静默替代，必要时重新确认 | L/S/G；B3/C2 |
| N28-11 | 预期文档切换 vs 换账户/意外跳转 | 前者同scope重绑但不重置预算；后者撤权暂停 | L/S/G；B1/B4/E |
| N28-12 | 无自动能力但用户可用原生UI | 辅助创建后核验关联；仅报辅助模式，不冒称自动GO | S/G；C2/R0 |

### T28：主题生命周期与重组

| ID | 场景 | 必须结果 | 层级/映射 |
|---|---|---|---|
| T28-01 | 0/1/50窗口，人工创建 | 都合法；不因数量/活动失去主题资格 | L/D/S；B3/C1 |
| T28-02 | 单窗口独立成果 vs 一次性短问 | 前者可提议新主题，后者不自动造目录；人工作为最终意图 | L/U；D1/D2 |
| T28-03 | 同一成果50窗口 vs 两个独立成果2窗口 | 不以数量拆；按明确工作目标提议 | L/U；D2 |
| T28-04 | 同名异事/异名同事/引用否定/目标漂移 | 语义证据/UNKNOWN，不按同词或最后一句迁走 | L/U；D1/D2 |
| T28-05 | 人工锁/include/exclude vs 新模型建议 | 人工约束保留，候选不可伪装human | L/D/S；B3/D2 |
| T28-06 | 同窗口多Placement/从某主题发起 | launchWorkspaceId决定本次语境，不取entries[0] | L/S；C2/C3 |
| T28-07 | 合并负约束冲突/多个默认Project | 显式解决；默认不猜；原生Project不拆合 | L/D/S；B3/B4 |
| T28-08 | 拆合后新人工改名、再撤销 | 安全inverse/CAS，不覆盖后续修改，原ID/别名/片段可达 | D/S；B4/B5/C4 |
| T28-09 | 长对话短暂插曲 | 保留主主题/标题，相关片段或建议附加，不静默迁移 | L/U；D2/C4 |
| T28-10 | 空主题/未归类/时间未知/已退休 | 全部有明确查找/当前/固定路径，不凭创建时刻激活 | L/S/U；C1/C4 |

### A28：自适应时间

| ID | 场景 | 必须结果 | 层级/映射 |
|---|---|---|---|
| A28-01 | 5个H及相邻3段 | 当地日历日期连续互斥；最新无↑ | L/S；B2/C1 |
| A28-02 | DST、闰日、月末、跨时区 | 日历天数正确，不用H×24小时 | L/S；B2 |
| A28-03 | 当前主题旧窗口/历史主题重新发送 | 单父主题/单段，旧子项仍在父内 | L/S；B2/C1 |
| A28-04 | 卡片/子行/cache/time policy不同revision | 原子投影，旧H回包不能覆盖新H | L/D/S；B4/C1 |
| A28-05 | 一主题100窗口、多tab/快捷入口 | 计为一个不同主题ID，不按窗口数调H | L；B2/C1 |
| A28-06 | 所有主题近7日都活跃 | 不硬裁卡数、不分裂主题；无改善保留H | L/S；C1/F1 |
| A28-07 | 只有同两个主题90日内反复使用 | 不线性外推/填满页面；同损失保留H | L；B2/C1 |
| A28-08 | 旧导出/未知作者/部分覆盖/发现总体不明 | 保留H/标数据不足；手选仍可用 | L/G；B2/R0-02 |
| A28-09 | 共享Project他人role=user消息 | 非本人不激活个人主题；作者未知不冒充本人 | L/G；B2/R0-01/02 |
| A28-10 | 7日评估、两轮、14日驻留 | 未满周期不改；不追求每天新跨度 | L/S；C1 |
| A28-11 | 主题拆合/大导入/撤权后数量突变 | 进入冷却，不能组织变更→调H反馈环 | L/S；B3/C1 |
| A28-12 | 历史浏览/正在编辑/拖动/生成 | 推荐pending，不中途改变H/T；当前引用可达 | L/S；C1/C3 |
| A28-13 | A tab采纳新策略、B tab浏览旧段 | 持久policy唯一，B保留view session，不跳段 | D/S；B4/C3 |
| A28-14 | 手工H/锁定/撤销auto/重启 | 人工优先；撤销回固定；不周期性重劝 | D/S；B3/C1 |
| A28-15 | H从30变14后返回原历史窗口 | 按ref/anchor定位，不复用相同k造成错位 | L/S；C3 |
| A28-16 | 今天lastSend用来重算过去月活 | 拒绝伪历史；用当时汇总或完整事件 | L；B2 |
| A28-17 | 冷启动、空主页微小改善、所有候选都空 | 按P28-A特殊收益规则；0→0不造主题 | L；B2/C1 |
| A28-18 | 主界面与设置 | 常态无新增时间/来源/计数；设置有可访问名称和手动锁 | S/U；C1/C5 |

### M28/S28/Q28/P28：迁移、安全、质量与规模

| ID | 场景/断言 | 层级/映射 |
|---|---|---|
| M28-01 | v2同库升级保留全部ID/owner/lock/negative/顺序/workingSet/snippet | D；B5 |
| M28-02 | 旧安装固定30(origin=legacy)，新安装auto30且资料不足；不覆盖人工偏好 | D/S；B5/C1 |
| M28-03 | 已有人工作品时回退旧reader：拒绝丢字段写入；保留已验根或只读恢复 | D/S；B5 |
| M28-04 | 两版本tab、migration中断、配额不足：原子根/CAS、旧数据不清空，新半成品不可见 | D/S；B4/B5 |
| M28-05 | 100k分区迁移/拆合：有界页、校验后根切换，不写巨型旧state | D/S；B5/F1 |
| M28-06 | 备份原生引用/CreationPolicy与H：恢复后重验原生；不恢复grant/密度可信/pending动作 | D/S；B5 |
| M28-07 | 旧k视图恢复到新H/时区：显式旧session或锚点迁移，不静默解释为新k | L/D/S；C3/B5 |
| M28-08 | 无法验证的journal/root/Project引用：拒绝覆盖/执行，不假装可修复 | D/S；B5 |
| S28-01 | 页面伪造“创建许可”或AI候选标actor=human：可信授权边界拒绝 | L/S；E/B4 |
| S28-02 | 请求超时再运行、换目录/Profile重试：同任务限额累计，派发前已记账；不绕已拒绝授权 | L/S；E2 |
| S28-03 | 改名/分类/创建/导入/AI回复时间：不产生UserSendEvent，不影响活跃事实 | L；B2 |
| S28-04 | 不同scope同名主题/Project与旧异步结果：不显示、不写、不匹配错账户 | L/D/S/G；B1/B4 |
| S28-05 | 错误恢复/撤销试图删Project或移旧聊天：禁止隐式原生补偿；已创建事实与本地inverse分开 | L/S/G；E3 |
| S28-06 | disable/freeze时原生仍可用但派生有残留：两种结果分别报告，不用一项PASS盖另一项 | S/G；R0/C6 |
| S28-07 | 数据撤权/无真实时间：不以新H/新模型绕过，只保留独立人工资产 | L/D/G；B2/B5 |
| Q28-01 | 模板同源/训练测试泄漏/相邻续聊：按用户/事项/系列/时间隔离，模板不冒充真人gold | L/U；D1 |
| Q28-02 | 规则/语义模型阈值：报precision与coverage/interval、误合并/误拆分，不自报confidence当准入 | U；D1/D2 |
| Q28-03 | 同证据重跑/升级/已拒提案：名称/ID/人工组织稳定；记录真实依据 | L/U；D2 |
| Q28-04 | 自动H与固定30、手工模式对照：找回/误开/每周维护/调H次数/撤销率，无收益则保留固定 | U；D5 |
| Q28-05 | 无AI、无Project写入、资料稀疏：仍能手工建主题、整理/查找/恢复，不被AI错误门槛锁死 | S/U；C6 |
| P28-01 | 1k/10k/100k×5个H：有界统计与缓存，保留原p95目标，不五份全量镜像 | S；F1 |
| P28-02 | 大量主题 vs 单主题大量窗口：不降数据，完整末尾可达，渲染预算明确 | S；F1 |
| P28-03 | 人工修改/撤权与增量投影交错：只重算受影响数据，正确性与输入延迟同时报告 | D/S；B4/F1 |
| P28-04 | 4x CPU/多tab/长输入/原生生成：不以牺牲原生节点、焦点、操作事件通过性能 | S/G；C5/F1 |
| P28-05 | 密度诊断、备份、冷启动成本：单列诊断开销与有界备份；不混作导航p95 | S；B5/F1 |

## 4. 设计算术示例（非产品实测）

P28-A当前H=30；N向量依次为7/14/30/60/90日。下表只核对loss/平局/最小收益的候选选择，实际应用仍须完整证据与抗抖条件。参数未获真人验证。

| 场景 | N向量 | 候选H |
|---|---|---|
| 稀疏且更长区间有额外主题 | 1,1,2,3,4 | 90 |
| 60日已经足够 | 1,2,2,7,9 | 60 |
| 当前合理 | 4,6,8,10,12 | 30 |
| 30日拥挤 | 5,9,24,35,42 | 14 |
| 14日仍拥挤 | 9,21,37,60,80 | 7 |
| 全部24主题7日内活跃 | 24,24,24,24,24 | 保持30，不硬裁 |
| 全部跨度都是两个主题 | 2,2,2,2,2 | 保持30，不假设90日会更多 |
| 当前空，60日有一个可找回主题 | 0,0,0,1,1 | 60，适用空主页收益1特例 |
| 全部都为空 | 0,0,0,0,0 | 保持30 |
| 小改善不足以变动 | 3,4,4,5,5 | 保持30 |

当地锚点2026-10-12的闭区间展示如下；内部仍用半开边界，用户主界面不显示这张表。

| H | 当前段 | 上一段 |
|---|---|---|
| 7 | 10-06—10-12 | 09-29—10-05 |
| 14 | 09-29—10-12 | 09-15—09-28 |
| 30 | 09-13—10-12 | 08-14—09-12 |
| 60 | 08-14—10-12 | 06-15—08-13 |
| 90 | 07-15—10-12 | 04-16—07-14 |

America/New_York的7日窗口跨2026春季DST可为167小时，秋季为169小时，仍是7个当地日历日。独立算术核对不等于产品实现已正确处理DST；新代码必须按A28-02另外验收。

## 5. 当前完成标准

此次仅完成规范、工程依赖、迁移、安全和验收的文档固化。历史原始设计与#1–14证据不改；本轮未执行上述未来测试，不增加运行时代码、测试源码或新模拟器。用户审批D28后，按同一A–G的.28子任务开工，真实Project、时间数据和自然语义的关键能力验证不推迟到发布前。
