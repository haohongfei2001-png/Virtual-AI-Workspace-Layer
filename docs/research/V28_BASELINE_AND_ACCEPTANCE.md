# Free-first整合：实现差额、证据与原目标映射

这是一份事实和验收映射，不是另一个开发计划。读取基线为PR #15 `fd5df2be787f8eef053de65965395d7eeea1a80d`，其runtime继承父#14；当前整合只提供文档替换，未重跑产品测试。

## 1. 实际核对到的源代码

| 路径与固定blob | 实际事实 | 本次计划落点 |
|---|---|---|
| `src/data/schema.mjs` / d502030354ca0d1d0c2f03c98fd3b228aa340538 | DATABASE_VERSION=2；B1/B23同库 | B5.F同库增量，实施前核对下一版本，不新建平行数据库 |
| `src/data/state.mjs` / 52ea12a5ba3c0115567eef967fbbf719654a6558 | 8张逻辑表、none/synthetic通道；CREATE_WORKSPACE/SET_TITLE/PLACE/MOVE；引用变化触发native-reference-conflict | B2.F1独立原生更新，B3.F原始事实投影；旧虚拟命令保留Pro |
| `src/data/evidence.mjs` / f7ed82003ce5f22ececee1dc4d6f7773456ede64 | 虚拟workspaces/placements聚合；displayTitle优先派生title；缺历史覆盖segment=null | B2.F2保留证据函数但新建独立显示决定；C1.F不从该虚拟出口冒充真实Project |
| `src/navigation/projection.mjs` / 6322959753c70ff163364a4146d407b2b909107c | 固定30日、synthetic-original-send规则 | C1.F3参数化与真实来源适配，不能只多加五个按钮 |
| `simulator/service.mjs` / e5bdf3a7758f3e3e8bff1eab4670340071571d0e | syntheticURL/scopeOf/persistentSeed、WorkspaceRepository | 继续测试使用，生产HostAdapter需独立真实门槛，不能换域名直接复用认证 |
| `src/data/preferences.mjs` / 3991bbee211dd99c0f98c2711d8485504a687b67 | sidebarVisible/compactRows/workingSet/savedSnippets | 共享非AI功能保留，新增范围/原生显示偏好必须扩展合同 |
| `src/data/partitioned.mjs` / 1e6f897afc2b211c64dca69feb25efa07b596481 | F1分片/manifest/有界传输，具体运行边界由F1报告说明 | B2/B5/F1复用，不放宽旧表、消息和单记录护栏 |
| `tests/b1/broker.test.mjs` / 6a934ce7704361c6e7a4f6b340f8ac4f54addb61 | synthetic_fixture、127.0.0.1及Map repository的单元测试 | 不当作真实账户/真实IDB证据，保留并追加Free合同 |
| `experiments/d12/rules.mjs` / 396a12d11ab6a5054aba3690c938a735406fe46c | 精确中文regex、唯一已有主题、只PREVIEW/UNKNOWN | D1/D2 DEFERRED_PRO；无Project自动收录仍需后续研究 |

本表来自GitHub实际读取，不是本轮执行结果。其他旧runtime/实验路径不因引用本计划自动改变。

## 2. 已有PR和测试证据

原链：#1设计79dbfa7 → #5 B1 67653a2 → #6模拟器a02d653 → #7 B2/B3 dc73231 → #8 B4 3b1a40f → #9 C1 a055246 → #10 B5 8d19020 → #11 C3/C4 38ea47d → #12 D1/D2 3afaf33 → #13 F1 f151fb4 → #14访客调查0b07455 → #15文档fd5df2be。#2/#3/#4是实验分支，不等于缺失产品代码。main依然初始化；不能从main空或Draft数量推断没有已开发功能/已经可发布。

[F1原始最终验收](../engineering/f1-recovery-2026-10-12/FINAL_ACCEPTANCE.md)记录：Node160、mock DOM49、旧真实IDB54、新真实扩展IDB20、页面17/MV319、C1/B5/C34/C5/B4及100k9项旅程等；这些是各自套件，不相加为完成度。4x压力/worker/freeze均是隔离合成宿主证据，不认证当前Free原生Project/成员/活动实现。旧性能与正确性结果保留，新增Free出口必须回归。

[R0时间专项](../experiments/results/r0-time-source-2026-10-12/REPORT.md)记录：已检查访客DOM/初始化/自然NDJSON仍未证实原始user-send时间、历史覆盖；未穷尽其他渠道，不作全部匿名不可能判断。Back旧DOM与当前route不一致不能称正确恢复。账户/Project与当前跨设备活动不是本报告已经通过的能力。

[D1/D2原始报告](../engineering/d12-offline-2026-10-12/REPORT.md)的1200模板与16.67%覆盖保留；自然语义准确率/命名接受/自动虚拟主题未认证。

## 3. 需要消除的旧现行冲突

| 原先正文中的通用要求 | 最终处理 |
|---|---|
| 所有主题都是独立Workspace，按人工/候选Placement显示 | Free正文改为真实Project及实际成员；独立Workspace仅Pro |
| 所有行优先派生标题/alias | Free只原名与合法原生旧名检索；派生title/semantic仅Pro |
| 主题第一次开聊先建立同名原生Project | Free项目本已原生，原生创建入口由用户操作；自动流程转E/Pro |
| 没完整历史覆盖就只进入UNKNOWN | 原事实UNKNOWN保留，显示决策可按旧锚点暂定较早并持续核验；完全无时间不造日期 |
| F1/F3/F4需已启用D/模型验收 | Free只依赖其启用的B/C/来源和性能；Pro D5后测 |
| 旧65项全是Free首发前置 | 按下表分级，FR-01–15为Free新主验收，原Pro目标全部保留 |
| 方向仍要等待六项D28批准 | Free/Pro方向为用户决定；D28按DECISIONS映射，不重复等待无关Pro决策 |

## 4. 原65项逐组映射（目标保留，未执行）

每一原用例都在固定[原矩阵](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/9e3b2164b495380e5ec40752eae28d6fdc9860fe/docs/research/V28_BASELINE_AND_ACCEPTANCE.md)保留原文。下表列全65个编号及当前任务归属；它们不是新的PASS，更不是第二条任务队列。

| 原用例 | 当前归属 | 执行任务 |
|---|---|---|
| N28-01 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-02 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-03 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-04 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-05 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-06 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-07 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-08 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-09 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-10 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-11 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| N28-12 | Pro/可选E | B3.P/C2.P/E1–E3；Free原生入口另验FR-13 |
| T28-01 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-02 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-03 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-04 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-05 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-06 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-07 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-08 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-09 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| T28-10 | Pro（共享数据保护继续） | B3.P/B4.P/B5.P/D2；Free可达性另验FR-03/15 |
| A28-01 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-02 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-03 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-04 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-05 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-06 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-07 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-08 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-09 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-10 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-11 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-12 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-13 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-14 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-15 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-16 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-17 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| A28-18 | Free/共享 | B2.F2/F3、C1.F3、C3.F；原主题计数改为真实Project |
| M28-01 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-02 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-03 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-04 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-05 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-06 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-07 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| M28-08 | 共享，Free先行 | B5.F/B4.F；Pro数据原样保留、授权不恢复 |
| S28-01 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| S28-02 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| S28-03 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| S28-04 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| S28-05 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| S28-06 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| S28-07 | 共享或E安全 | B1/B2/B4/B5与E边界；不要求Free启用代理写入 |
| Q28-01 | Pro | D1/D2/D5独立语义质量 |
| Q28-02 | Pro | D1/D2/D5独立语义质量 |
| Q28-03 | Pro | D1/D2/D5独立语义质量 |
| Q28-04 | Free/共享 | C6.F/F4.F/自适应质量 |
| Q28-05 | Free/共享 | C6.F/F4.F/自适应质量 |
| P28-01 | 共享，Free先行 | F1.F/B4.F/B5.F；启用Pro后再测虚拟重组负载 |
| P28-02 | 共享，Free先行 | F1.F/B4.F/B5.F；启用Pro后再测虚拟重组负载 |
| P28-03 | 共享，Free先行 | F1.F/B4.F/B5.F；启用Pro后再测虚拟重组负载 |
| P28-04 | 共享，Free先行 | F1.F/B4.F/B5.F；启用Pro后再测虚拟重组负载 |
| P28-05 | 共享，Free先行 | F1.F/B4.F/B5.F；启用Pro后再测虚拟重组负载 |

新Free对象的FR用例不能拿原“虚拟Workspace创建”案例替代；共享安全/日历/迁移反例可复用断言但要跑新数据模型。Pro通过条件在FREE_PRO_ACCEPTANCE的PR-01–07及D1–D5继续，不删除语义/拆合/Series目标。

## 5. 历史原件和现行文件

现有design/approved/v2.7、旧CORE_FLOW_V2_7与工程原始结果不修改；它们是视觉或旧版本证据。原v2.8机制、旧分级追加版在Git历史的9e3b216/fd5df2be完整保留。当前机制文件和专题正文直接表达Free/共享/Pro规则，不依赖页首“忽略下文”的覆盖说明。

本轮不额外研究公共产品功能，不新写未经验证的宿主API/字段/权限结论；真实来源在R0-00/01/02/03.F按目标账户定向核验。所有新的准确率、响应时间、兼容、原生写入和发布都是待验收，不因文档算法写好而成立。
