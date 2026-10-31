# VAIWL Pro R1 验收证据映射

合同：`VAIWL-PRO/1.0`。本文件与 `acceptance-map.json` 映射冻结的 35 个 A 场景和 9 条黄金序列；它们是离线工程证据，不是发布签字。

当前分类：**30 OFFLINE_VERIFIED / 3 PARTIAL_EXTERNAL_GATE / 2 NOT_RUN**。每条精确测试名称、断言范围、缺口和执行归属见 JSON。

## 执行边界

- 最终 root aggregate **443/443 通过，0 失败、0 跳过**：20 个 Pro 文件 209 项，14 个相关共享回归文件 234 项。记录在 `test-results.json`；此前独立复核的 202 项及 focused UI 回执在 JSON 中保留，不与最终总数重复相加。
- 最终 Chromium 回执为 PASS：真实隔离 IndexedDB、原 Free renderer、原 native state 不变、composer identity/value 保留、关闭并重开浏览器进程、数据备份恢复；全部请求限 loopback。两个浏览器测试及其源码均由最终 `source-manifest.json` 绑定。
- 最终测试源摘要：`9687d53e39d0b7151dbb5c6500299e6a408528c9258d5c6c1b0b9901bb80823e`。该摘要覆盖运行代码、类型、Schema、测试、HTML 和补丁，排除文档及 evidence 输出，避免自指。
- 开发期间 PR16 从交接 HEAD `f317b26ea6ed7d1cc249c4bfc0ad90a619d29417` 前进到 `2c9b043ce3c65a4b92c6f8f83b59fb416f63132a`。候选已继承新基线；变化仅 STATUS、恢复提示文案及其测试。全部共享 src 依赖与聚合测试逐字不变；新增基线的文案测试另验 **63/63**。依据见 `final-checks.json`，不将旧测试冒称为新文案验证。
- 合成数据、fixture-rules、stub transport 和评测算术不等于自然中文模型质量。**真实 host、实体机型/IME、自然样本双标与保留集、收费 provider、真实用户找回效率、发布：均 NOT_RUN。**
- sourceBinding 保存最终 `src/pro` 文件哈希与总 manifest。最终 Git commit SHA 记录于 Draft PR 和交付回执，文件内不写自指 SHA；当前工程状态是源文件已封版并通过测试，不是发布签字。

## 连续端到端旅程

`tests/pro/support/continuous-journey.mjs::runContinuousJourney` 用同一个 `c_beta` 经历合法 NONE → 人工主题 → 本地建议预览/确认 → 人工标题与主归属纠错/排除 → 原子撤销 → 冲突零写 → 独立补偿 → Series/来源返回 → 拆分与合并冲突解除 → Free/Pro 切换 → 顺序重放与重启恢复。

这条旅程由 `journey.test.mjs`（MockIDB）和 `browser-journey.test.mjs`（父 runner 的真实隔离 Chromium）覆盖。负向黄金序列另列，不能由成功旅程代替。

## 35 场景索引

| 场景 | 状态 | 主要测试文件（位于 tests/pro） | 范围或缺口 |
|---|---|---|---|
| A01 UNKNOWN/路由缺Project信息 | OFFLINE_VERIFIED | `domain.test.mjs`、`organize.test.mjs`、`ports.test.mjs`、`navigation.test.mjs` | UNKNOWN 和未经选择的 PROJECT 不可变成 NONE；UNKNOWN 不入 AI payload，仍能由直接入口打开。 |
| A02 同名两个原生Project | OFFLINE_VERIFIED | `browser-journey.test.mjs` | 原 Free renderer 在真实隔离 Chromium 中保留两个同名 Project 的 p_alpha/p_beta ID；Pro 操作前后 NativeRepository 状态完全相同。 |
| A03 无正文的Browser-Local | OFFLINE_VERIFIED | `organize.test.mjs`、`ports.test.mjs` | metadata-only pack 不含正文；获准字段 payload 不含原生 URL、scope、native ID 或授权；Browser-Local 禁内容授权与云任务。 |
| A04 仅即时会话 | OFFLINE_VERIFIED | `jobs.test.mjs`、`ports.test.mjs`、`budget.test.mjs` | 会话模式不创建 DB，不允许持久工作/修改/付费预留；恢复丢弃 RAM job，重启不恢复处理同意。 |
| A05 scope切换/撤权后迟到结果 | OFFLINE_VERIFIED | `organize.test.mjs`、`ports.test.mjs`、`navigation.test.mjs`、`ui-browser.test.mjs`、`worker-service.test.mjs` | 版本/授权 epoch/scope/native变化拒绝迟到结果；撤权即时清除缓存与 UI，即使 pointerdown 正在进行也不延迟隐私清除。 Worker RPC在document/mount/tab撤权或六秒到期后拒绝迟到私人回复，执行未结束前仍占用容量。 |
| A06 用户改名后模型结果到达 | OFFLINE_VERIFIED | `domain.test.mjs`、`organize.test.mjs`、`ui-browser.test.mjs` | 人工改名后旧 proposal 不能提交；人工字段控制状态保留。UI 还验证旧 expected 的脏编辑不会覆盖后来状态。 |
| A07 locked=false但owner=human | OFFLINE_VERIFIED | `domain.test.mjs`、`organize.test.mjs` | 解除锁定不解除 human ownership；只有显式 RELEASE_TO_AUTO 后的新有效建议可以评估。 |
| A08 排除此主题后重跑/换模型/新增证据 | OFFLINE_VERIFIED | `domain.test.mjs`、`organize.test.mjs` | 移动/排除生成精确 pair constraint；新 model/version/证据不能绕过；明确解除之后才可人工收录。 |
| A09 C不参与AI整理 | OFFLINE_VERIFIED | `jobs.test.mjs`、`domain.test.mjs`、`organize.test.mjs` | 排除对象不入 payload；取消 job 拒绝迟到结果；接受过的人工资产保持，普通 inverse 不恢复同意。 |
| A10 一个C多主题 | OFFLINE_VERIFIED | `domain.test.mjs`、`projection.test.mjs` | 同一 C 只有一份 derived title；每卡一次；主关系最多一条，related不推进主题活跃，也不隐藏未收录入口。 |
| A11 A/B不同入口阅读与返回 | OFFLINE_VERIFIED | `navigation.test.mjs`、`journey.test.mjs`、`browser-journey.test.mjs` | 同一 C 从 A/B 打开保留独立 card/scroll/old-item/sidebar anchor；直接/搜索入口不猜主题。连续旅程验证 Series 来源和返回。 |
| A12 首次新主题 | OFFLINE_VERIFIED | `domain.test.mjs`、`organize.test.mjs`、`evaluation.test.mjs`、`ui-browser.test.mjs` | 首次只预览；NEW_TOPIC 门与已有主题独立；人工创建单窗口主题可用，首轮批量确认是一笔可原子撤销操作。 |
| A13 删除主题 | OFFLINE_VERIFIED | `domain.test.mjs` | 删除主题仅移除派生关系并留下抑制依据；原生 C 不删；同依据改名重建仍被阻止。 |
| A14 稳定主归属与新证据冲突 | OFFLINE_VERIFIED | `organize.test.mjs`、`domain.test.mjs` | 稳定 primary 关闭自动迁移；冲突主关系／整批操作零写。自然增量质量未验收。 |
| A15 合并include/exclude冲突 | OFFLINE_VERIFIED | `structure.test.mjs`、`journey.test.mjs` | merge preview 精确列出 refId、原排除 topicId 和映射目标；冲突未解除 proposal 为 null，状态不变；显式解除后才提交。 |
| A16 拆分/合并中途失败 | OFFLINE_VERIFIED | `structural-commit.test.mjs`、`structure.test.mjs` | 同笔split/merge实测checkpoint成功、root成功后journal put失败：5张表及state/journal逐项不变，无半个redirect/成员。旧receipt不能改ID重用；新intent重试才整笔成功，native表不变。 |
| A17 Series环/两分支/断链 | OFFLINE_VERIFIED | `structure.test.mjs`、`navigation.test.mjs` | 拒绝环和一节点双 continuation；branch 不混主编号，2.10 使用整数元组；删除中间项不补接、不重编号。 |
| A18 AI撤销与后续人改冲突 | OFFLINE_VERIFIED | `structural-commit.test.mjs`、`domain.test.mjs`、`journey.test.mjs` | 同一merge后修改其原member并增加新member，原inverse冲突零写；危险全补偿拒绝；旧选择性补偿CAS失效拒绝；新封装补偿单独提交并保留后续成员，原operation/proposal仍applied。 |
| A19 一次operationId重复 | OFFLINE_VERIFIED | `ports.test.mjs`、`billing-store.test.mjs`、`budget.test.mjs` | 同 operationId+原 payload/expected 幂等；不同 payload 拒绝；一份人工 receipt 不能并发成为两笔提交。 |
| A20 新聊天取消/第二tab/导航旧C | NOT_RUN | `navigation.test.mjs` | 没有实际执行新聊天取消、第二 tab 打开既有 C、pending意图不被消费的完整序列。 |
| A21 NONE在模型期间变PROJECT | OFFLINE_VERIFIED | `stability.test.mjs`、`organize.test.mjs`、`ports.test.mjs` | 真实登记的pending suggestion在NONE→PROJECT后接受被stale拒绝，raw state与journal不变、Free仍达。独立测试证明同C既有人控placement/title保留但默认Pro暂停展示。 |
| A22 Provider返回未知handle/URL/注入指令 | OFFLINE_VERIFIED | `model-schema.test.mjs`、`organize.test.mjs`、`worker-service.test.mjs` | 未知 handle、URL、authority/native-action 字段严格拒绝，不能生成执行计划；自然 prompt-injection 语料未验收。 |
| A23 token截断/refusal/过长JSON | OFFLINE_VERIFIED | `model-provider.test.mjs`、`model-schema.test.mjs`、`organize.test.mjs` | refusal/truncation/过长/损坏 JSON 不能产生 plan；stub transport 至多一次，ticket不能重复调用，无自动无限重试。 |
| A24 两tab/两scope同时预算预留 | OFFLINE_VERIFIED | `budget.test.mjs`、`billing-store.test.mjs` | 纯账本总额40000时只接受一次30000；同 DB 两连接/两scope CAS共用安装日/月限额，失败后不以换账号重置。 |
| A25 dispatch后超时+worker重启 | OFFLINE_VERIFIED | `jobs.test.mjs`、`budget.test.mjs`、`billing-store.test.mjs`、`model-provider.test.mjs` | 派发标记与预留同事务持久化；重开后改 outcome-unknown 并保守持有30000；不能重新派发或自动释放，只有明确核账才能解除。 |
| A26 Pro关闭/会员断网/预算0 | PARTIAL_EXTERNAL_GATE | `ports.test.mjs`、`jobs.test.mjs`、`budget.test.mjs`、`projection.test.mjs`、`ui-browser.test.mjs`、`browser-journey.test.mjs`、`worker-service.test.mjs` | 没有模拟真实会员服务断网、过期缓存和网络重连。 |
| A27 迁移quota/崩溃/旧reader | PARTIAL_EXTERNAL_GATE | `migration-recovery.test.mjs`、`ports.test.mjs`、`billing-store.test.mjs` | 未在真实已有数据库上执行升级迁移及中途杀进程/quota组合；未验证旧扩展 reader 与新根并存。 |
| A28 备份恢复 | OFFLINE_VERIFIED | `migration-recovery.test.mjs`、`browser-journey.test.mjs` | 备份只带数据及校验和；拒绝 grant/key/consent/机器提案注入；非空有约束目标不隐式覆盖；真实隔离浏览器新DB导入后处理off，不恢复jobs/authority。 |
| A29 恢复原名后原生改名 | OFFLINE_VERIFIED | `domain.test.mjs`、`projection.test.mjs`、`ui-browser.test.mjs` | 恢复原名保存显示偏好而非冻结副本；NativeRepository后来改名立即跟随；保留派生名但不会自动切回。 |
| A30 H/时区/新模型/重复打开 | OFFLINE_VERIFIED | `stability.test.mjs`、`projection.test.mjs`、`structure.test.mjs` | 同一已保存状态（包含实际c_alpha→c_beta Series、标签[2,9]/[2,10]）经历5种H×3种时区、两个模型绑定版本、三轮打开/返回/Free-Pro切换；primary/title/exclusion和全部Series值的digest始终不变。 |
| A31 窄屏/200%/键盘/IME/原生弹层 | PARTIAL_EXTERNAL_GATE | `ui-browser.test.mjs`、`browser-journey.test.mjs`、`navigation.test.mjs`、`worker-service.test.mjs` | 430px是窄视口，不能当作真实 browser zoom 200%证据。 |
| A32 扩展停用/卸载/宿主恢复 | NOT_RUN | — | 未测停用/卸载后的原生可操作性及隐私残留两个独立结果。 |
| A33 旧C具有多个无role人工Placement | OFFLINE_VERIFIED | `migration-recovery.test.mjs`、`domain.test.mjs` | 旧多 placement 的人工资产与锁完整保留，必须明确选择 primary 或 null；迁移专用 UI 尚未单独点击验收。 |
| A34 只有related或primary暂停的NONE聊天 | OFFLINE_VERIFIED | `projection.test.mjs` | 只有related/primary暂停/精确pair排除时，NONE的原名未收录入口保持；不可用已知引用仍以disabled行保留。 |
| A35 自动patch后人工patch再恢复 | OFFLINE_VERIFIED | `migration-recovery.test.mjs`、`domain.test.mjs`、`journey.test.mjs`、`browser-journey.test.mjs` | 实际 human→system提案注册→automation→human journal按sequence重建同一state；逆序输入按提交顺序恢复；不重跑模型/命令、不忽略机器前置；浏览器进程重开与数据备份导入一致。 |

## 9 条黄金序列

| 序列 | 状态 | 证据形态与未覆盖部分 |
|---|---|---|
| G01-human-wins | OFFLINE_VERIFIED | 旧提案生成→人工更名→接受旧提案抛错；title与human控制状态不变。 |
| G02-related-does-not-hide | OFFLINE_VERIFIED | 同一C只有A/B两条related；两主题segment/candidateTime均null，卡片共享派生名，而原名uncollected仍含C。 |
| G03-native-membership-change | OFFLINE_VERIFIED | 已登记建议→同C更新PROJECT→旧proposal被stale拒绝，原raw state/journal无变化且Free可达；另一同C已有人控边用例证明资产保留。 |
| G04-undo-structural-conflict | OFFLINE_VERIFIED | 同一已提交merge→修改原member/新增member→inverse零写→危险全补偿拒绝→旧选择性补偿stale拒绝→最新CAS重计划后独立提交；新成员/新hard exclusion保持，原operation和proposal仍applied。 |
| G05-dispatch-crash | OFFLINE_VERIFIED | 30000预留→持久dispatch→重建账本/DB连接→outcome-unknown；automaticDispatch=false且资金保持。 **缺口：**未发送真实请求或终止真实service worker；网络阶段仅stub适配器独立验证。 |
| G06-two-scopes-budget | OFFLINE_VERIFIED | 安装上限40000，A预留30000后B再要30000失败，B要10000成功；另有日上限35000的双连接CAS变体。 |
| G07-legacy-ambiguity | OFFLINE_VERIFIED | 两条人控锁定关系均保留，chosenPrimary=null并要求人工解决；保留原名入口的投影规则独立验证。 |
| G08-hard-exclude-not-dismiss | OFFLINE_VERIFIED | 跨新model/fingerprint的pair exclusion不变；只有显式REMOVE_TOPIC_EXCLUSION解除；不是把旧proposal dismiss当硬排除。 |
| G09-new-chat-not-next-chat | NOT_RUN | 仅有阅读上下文新tab继承测试，不冒充新聊天intent归属验证。 **缺口：**未触发原生新聊天再由第二tab打开旧C；现有显式收录能力不等于完成这条事件序列。 |

## 必须保留的收口事项

1. **A20/G09、A32 未运行。** 新建聊天身份绑定与真实停用/卸载/宿主恢复需要共享宿主能力；普通新 tab 上下文测试不是替代。
2. **A16/G04 离线组合缺口已补齐。** 新 `structural-commit.test.mjs` 实测 split/merge 在root成功后journal失败的5表零写回滚，以及同次merge修改成员后冲突撤销/独立新补偿；这是MockIDB事务证据，不是物理磁盘或MV3崩溃签字。
3. **A27 仍只覆盖部分。** 迁移 codec/旧reader拒绝已测，但真实数据库升级中断未测。A30的5种H×3时区、两个模型版本和反复打开/切换序列，以及G02/G03精确状态变换，已由新 `stability.test.mjs` 独立执行。
4. **A26/A31 的外部门仍在。** 真实会员服务断网、实际200%浏览器缩放、实体中文IME、原生popover与辅助技术待集成；430px不写成200%验收。
5. UI 最近一次 focused run 包含 settings 本地同意暂停/恢复/重启、两种列表各自5/+12/200/下一页、深色过渡结束后的computed color断言。此证据不代表真实宿主设备验收。
