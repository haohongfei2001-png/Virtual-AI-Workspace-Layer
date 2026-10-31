# VAIWL Pro R1 独立收口完成矩阵

合同：`VAIWL-PRO/1.0`。正式统一工程基础：PR #24，`976487fab544baaefcd490460c98cd9dc26385df`。本次分支：`codex/vaiwl-pro-closeout-20261101`。

本矩阵依据冻结的 `VAIWL-Pro-Design-Handoff-R1.md` 第 11 节、当前实际代码以及实际运行的工程反例。它补充历史 PR #23 的 `acceptance-map.md/json`，不把历史 443 项或某次局部测试数充作本次最终 CI 数量。P0–P3、六个共享接口、DB4 与统一 MV3 基础均继承，未重新设计 Free。

## 候选绑定与结论范围

| 项目 | 本次记录 |
|---|---|
| 最终候选源码 SHA | 由同提交 CI 产物 `pro-closeout/report.json` 的 `sourceSHA`、`sourceSHAAfter` 自动绑定，要求 `sourceMatchesCommit: true` 且源码工作树干净；Draft PR 记录该精确 SHA。不得使用继承基线冒充新源码。 |
| 实际最终 CI | Draft PR 中记录 `.github/workflows/vaiwl-pro-closeout.yml` 的实际 run URL 与该 SHA 的结果；同次报告、统一包 manifest 和逐文件日志构成回执。本文件不预写尚未运行的最终结果。 |
| 完整独立回归 | 以最终 source manifest、逐文件真实测试数、隔离浏览器及统一包回执为准；下文逐项给出实现和断言入口。 |
| 本文件的独立审查 | 已审查 Pro UI、public DTO、remote controller、production owner 的新读写链路；发现的问题进入实际修复及反例测试。 |
| 产品状态的上限 | 最终 CI 和可运行包核对通过后可判定 `PRO_CODE_READY`。真实 ChatGPT、真实模型自然质量、真实账户来源与正式发布不由此推导。 |
| 合并与发布 | 本轮不合并、不部署、不发布。Draft PR 是候选审阅入口。 |

`PASS` 只表示对应回执中实际运行的范围。表格中的“实现与验证”不是另行宣称真实宿主或供应商验收。未完成的最终源码冻结、CI、产物或中文截图检查属于本轮工程收尾，不归入外部依赖。

## 当前实际执行证据

| 证据 | 已观察结果及边界 |
|---|---|
| `tests/pro/closeout-public-data.test.mjs` | 5/5 PASS：150 个长中文主题关系的完整分页；64 成员历史提案不会阻断其他审阅；合并冲突显示原排除和目的地；搜索/别名回复身份栅栏；A20 明确收录后备路径。使用合法合成数据、实际 Pro production owner 或实际 public projector；IDB 为 MockIDB。 |
| `tests/pro/closeout-public-model.test.mjs` | 4/4 PASS：关闭 provider、价格卡到期、用途撤回均保留真实账本中的历史预留/未知金额，允许安全取消和恢复；取消历史任务不误停另一个在途任务。请求使用进程内合成 transport，没有外网调用。 |
| `tests/pro/closeout-public-budget.test.mjs` | 5/5 PASS：实际 production owner、remote controller 与严格 DTO 的三额度持久化、重复确认合并、丢失回执幂等、跨来源失效、会员到期拒绝调额、自动选择默认关闭；单聊天精细复核只生成待审提案且不改变全局模式。IDB/授权为合成替身；预算测试零凭据/transport，单聊天测试只有一次进程内合成回复、零外网。 |
| `tests/pro/closeout-ui-browser.mjs` | 隔离 Chromium 实际 UI PASS：空输入、重复 Enter 单次提交、拆分草稿、Series 保真、到期只读、任务后页取消和已保存结果核对；首次云整理实际最小示例/接收方/保留政策/费用确认；自动及原生后台偏好默认关闭、取消不保存；单聊天精细复核保留草稿、不改变全局模式；三项额度精确微货币输入、旧新预览、取消/过期/重复/零/近限和暂停，队列更严格限额可见，剩余额度不足禁止云确认；别名删除、无盲目应用、临时预览、授权更新、Free/Pro 返回、迟到结果、短窗键盘和错误状态。回执为 `PRO_UI_SCREENSHOT_DIR/closeout-ui-browser.json`，模型/预算 API 使用合成接口，未外传。 |
| `tests/pro/remote-ui-browser.mjs` | 隔离 Chromium 实际有界 renderer PASS：242 个搜索结果翻页；长 Series 编辑；完整大操作审阅和撤销；超过 100 个候选主题/原生 Project/已保存关系；第六页的关系移除实际提交；丢失回复幂等核对；恢复 UI。所有外部请求被拦截，实际观测外部请求和 page error 均为 0。 |
| `tests/pro/ui-browser.mjs` | 继承的实际 UI 回归在本次变更后 PASS：人工闭环、过期草稿、Series、窄窗口、合成 IME/键盘事件及撤权清屏。 |
| `tests/pro/closeout-history-browser.mjs` | `artifacts/pro-closeout/history-browser/closeout-history-browser.json` 为 PASS：Chromium 143.0.7499.4，515 次实际顺序 domain 提交，0 条预置 journal，真实 IDB 的 512 条历史切换、事务中止回滚、旧 receipt/inverse、旧操作重放与撤销、历史分页、两次独立损坏修复及整进程重开；第 515 次后改高水位后丢失新 root 和末尾 journal 时明确拒绝较短恢复，零回退写入。不是 10,000 次浏览器操作或物理磁盘断电。 |
| 存储/领域独立复核 | 稳定性负责人最新专项回执为 188/188 PASS，新增生产 dispatch fence 及迟到动作反例另验 17/17；两次修复、高水位和禁止较短恢复已通过独立复审。它们是各自受测源码的局部回执，不能相加成最终唯一测试数；新增预算及最终完整 CI 以同提交报告为准。旧 10,000 条边界用的是合法历史 codec 的合成持久链，不冒称 10,000 次用户点击。 |
| `tests/pro/closeout-zoom-browser.mjs` | `artifacts/pro-closeout/zoom/real-zoom.json` PASS：真实 `chrome.tabs.setZoom` 的 100%、125%、200%，对应 devicePixelRatio 和视口变化均核对，CSS zoom 保持 1；键盘创建、弹层操作和溢出检查通过。不是用 CSS 缩放代替浏览器缩放。 |
| 中文字形/视觉复核 | 本地镜像缺 CJK 字体，早期截图的几何和操作验证不等于中文视觉验收。最终 CI 安装官方 `fonts-noto-cjk` 后须查看实际截图；这是可独立完成的最终工程检查，不能列为 `REAL_DEVICE_VALIDATION`。 |

## A01–A35 完整工程矩阵

下表代码路径均相对 `src/pro/`，测试路径均相对 `tests/pro/`，另列的统一 MV3 路径除外。每项的最终 PASS/FAIL 由上述候选绑定的实际回执判定；“无 Pro 余项”表示当前实现和反例覆盖已完成，仍须随最终候选一起运行。

| 场景 | 当前实现与可观察结果 | 实际测试/证据入口 | 剩余边界 |
|---|---|---|---|
| **A01 UNKNOWN 不变 NONE** | `domain/index.mjs`、`evidence/metadata.mjs`、`integration/production-owner.mjs` 只接受正向归属证据。UNKNOWN 不能人工冒充 NONE，也不进入模型 payload；直接原生入口仍可用。 | `domain.test.mjs` 的 A01；`organize.test.mjs` 的 A01/A03；`ports.test.mjs` UNKNOWN；`production-owner.test.mjs` positive NONE/UNKNOWN；`navigation.test.mjs` direct entry。 | 无 Pro 余项。真实普通聊天的正向 NONE 证据是 **FD1**。 |
| **A02 同名原生 Project** | `projection/project.mjs` 在 native 模式保留原 Free DTO，以真实 ID 区分项目；Pro 只保存虚拟关系。 | `browser-journey.mjs` 对同名 `p_alpha/p_beta` 与操作前后 NativeRepository 的断言；统一包 MV3 原生界面回归。 | 无 Pro 余项；真实来源和宿主验收见 FD1/FD2。 |
| **A03 Browser-Local 无正文** | `evidence/metadata.mjs`、`model/payload.mjs`、`model/openai-responses.mjs` 严格限定获准 metadata；不借 URL、勾选或模型输出补造正文、消息 ID、归属。临时本地预览可用。 | `organize.test.mjs`、`ports.test.mjs`、`model-provider.test.mjs`；`closeout-ui-browser.mjs` 临时预览无保存/拒绝操作；production owner 的 Browser-Local 专项测试。 | 无 Pro 余项。若未来使用选区/已发送内容，只能等 FD3 的真实来源与用途许可。 |
| **A04 即时会话** | `jobs/lifecycle.mjs`、`jobs/organize-service.mjs`、`integration/production-owner.mjs` 拒绝临时 scope 的持久变更和收费任务；可做明确标注的本地 RAM 预览，撤权/重启不复活许可。 | `jobs.test.mjs` A04；`ports.test.mjs` Browser-Local；`budget.test.mjs` session reserve；production owner 临时会话专项；closeout UI 临时预览。 | 无 Pro 余项。 |
| **A05 撤权/换 scope 后迟到** | worker live authority、完整 review 向量、dispatch source fence 与 UI 生命周期共同校验；清空旧私有投影，不借迟到结果重新打开弹层。同 scope 的授权 epoch 更新也关闭旧弹层。 | `worker-service.test.mjs` deadline/revoke；`remote-controller.test.mjs` late/cross-scope；`closeout-public-data.test.mjs` search/alias；`closeout-ui-browser.mjs` renewal/late result；统一 MV3 principal switch。 | 无 Pro 余项；真实账户来源/授权生命周期见 FD2。 |
| **A06 人改名后模型结果到达** | `domain/index.mjs` 人工控制与版本门拒绝旧标题提案；`jobs/organize-service.mjs` 结果落地前重验原始批次和当前来源。UI 脏草稿不会覆盖后改资料。 | `domain.test.mjs` A06；`organize.test.mjs` A06/A07；`closeout-ai-service.test.mjs` changed-source/late-registration；`ui-browser.mjs` stale draft。 | 无 Pro 余项。 |
| **A07 解锁不交还自动** | `SET_LOCK(false)` 保留 human ownership；`RELEASE_TO_AUTO` 是独立显式命令。主题名、成员、标题、单关系均有对应 UI。 | `domain.test.mjs` A07/locking untouched name；`organize.test.mjs`；`ui-browser.mjs`；统一 MV3 title/relationship controls。 | 无 Pro 余项。 |
| **A08 明确 pair 排除** | 移动主关系/移除关联写精确负约束；换证据、nonce、模型或重新建议不能解除。解除排除是明确人类操作。 | `domain.test.mjs` A08/removing related；`organize.test.mjs` exclusion/rejection fingerprint；`remote-ui-browser.mjs` 后页移除关联保留 primary。 | 无 Pro 余项。 |
| **A09 不参与 AI** | 被排除的引用不进入候选/模型 payload；任务与来源栅栏阻止迟到应用；已有人工/原生资产保留，普通撤销不恢复处理许可。恢复参与需要当前用途许可。 | `domain.test.mjs` A09/consent-not-undoable；`organize.test.mjs` excluded payload；`jobs.test.mjs` A05/A09；production owner 与 dispatch-fence 专项；统一 MV3。 | 无 Pro 余项。 |
| **A10 一 C 多主题** | 一份 C 级 DerivedTitle；单 primary、多 related；每卡只出现一次，related 不贡献活跃。不因超过 100 个关系永久失去编辑能力。 | `domain.test.mjs` A10；`projection.test.mjs`；`closeout-public-data.test.mjs` 150 个关系；`remote-ui-browser.mjs` 真实后页移除。 | 无 Pro 余项。 |
| **A11 来路与返回** | `navigation/launch-context.mjs` 显式记录 topic/Series/search/direct 来路；不同入口的 scroll/segment/old-items 分开；native link 新标签后备保留原页草稿。 | `navigation.test.mjs` A/B/context inheritance；`journey.test.mjs`；`browser-journey.mjs`；`remote-ui-browser.mjs` native-link/Series next；统一 MV3。 | 无 Pro 余项。真实宿主最终导航确认由 FD2 提供。 |
| **A12 首轮与 NEW_TOPIC** | 首轮保留可理解的提案审阅；人工单窗口/空主题可建立。自动 existing/new/related/title 各自准入，不能借另一 lane 的质量放行。实际默认无批准模型或报告。 | `domain.test.mjs` A12/batch；`evaluation.test.mjs` lane/sample/leakage；`organize.test.mjs` A12/A14；自动 owner 专项合成批准测试；closeout UI。 | 无独立模型工程余项；真实自然质量及自动开关准入为 **EA1/EA2**。自动接线最终测试须绑定最终 SHA。 |
| **A13 删除虚拟主题** | 删除只影响虚拟容器、派生关系和必要 Series/redirect；原生 C 保留。tombstone 和语义依据抑制同依据自动重生；完整记录可撤销。 | `domain.test.mjs` A13；`journey.test.mjs`；`ui-browser.mjs` 删除/撤销；`structural-commit.test.mjs`。 | 无 Pro 余项。 |
| **A14 稳定 primary** | 新证据不授予静默搬家权。`organize/planner.mjs` 与 domain 硬门保留稳定主关系，只允许当前确认后的变更。 | `organize.test.mjs` A12/A14；`domain.test.mjs` conflicting batch/primary；`stability.test.mjs` A30。 | 无 Pro 余项。推荐正确率仍属 EA2，不借规则断言证明自然质量。 |
| **A15 合并 include/exclude 冲突** | `domain/index.mjs` 给出原排除主题与映射目标；`public-frame-dto.mjs` 生成有界、实际名称描述；UI 直接显示聊天、原排除、目标，禁止应用并要求明确解除。 | `structure.test.mjs` A15；`journey.test.mjs`；`closeout-public-data.test.mjs` 精确中文名称描述；实际 UI 合并/冲突路径。 | 无 Pro 余项。长冲突清单明确显示总量与当前展示量，处理后重验。 |
| **A16 拆合中途失败** | 同一 DB4 事务中的 root/checkpoint/journal/inverse 共同提交；中止无部分成员或半个 redirect。丢失回执使用同 operationId 核对。 | `structural-commit.test.mjs` A16 split/merge；`structure.test.mjs`；`storage-browser.mjs`；`remote-ui-browser.mjs` lost reply；统一 MV3 quota/repair。 | 无 Pro 余项。物理断电/真实设备存储故障为 RD2 的发布前实机范围，不代替已完成的浏览器事务验证。 |
| **A17 Series 环/分支/断链** | 完整图校验环、双 continuation；分支不伪造连续编号；顺序移动不改 edges/labels，删除保留断点；长 Series 支持分页单项编辑。 | `structure.test.mjs` A17；`series-edit.test.mjs` 2,000 项、单边、编号；`navigation.test.mjs` continuation；closeout UI 预览返回/顺序保真；remote UI 长图。 | 无 Pro 余项。 |
| **A18 撤销与后改冲突** | 完整 inverse+readSet 核对，冲突零写；用户可选择新补偿计划；不将新补偿冒称原操作已撤销。超过 200 变化可逐页完整审阅后整笔撤销。 | `domain.test.mjs` A18/compensation；`structural-commit.test.mjs` G04；`production-owner.test.mjs` complete operation review；`remote-ui-browser.mjs`；`storage-history.test.mjs` archived undo。 | 无 Pro 余项。 |
| **A19 operationId 幂等** | 原始 payload/review/receipt 绑定，重复相同意图返回原结果，不同 payload 拒绝；重启和旧历史段仍可查原始 receipt。 | `ports.test.mjs`；`production-owner.test.mjs` same operation/reconciliation；`remote-controller.test.mjs` lost reply；`closeout-ui-browser.mjs` double Enter；history browser 旧 receipt。 | 无 Pro 余项。 |
| **A20 新聊天取消/其他 tab/旧 C** | 当前没有可消费的未经证实新聊天意图；不以“下一条出现的聊天”推断归属。模拟另一父文档、原生旧聊天导航、后续独立正向 NONE 来源均不造 Placement；用户明确收录后才写入。 | `closeout-public-data.test.mjs` A20 后备路径实际生产 owner；`navigation.test.mjs` context inheritance；普通收录 UI。 | 已完成可独立验证的安全后备。真实 action→新 C 精确关联只能由 **FD4** 提供，不声称模拟文档等于真实宿主新聊天旅程。 |
| **A21 NONE 在运行中变 PROJECT** | 完整来源向量/CAS 改变后拒绝旧提案；默认 Pro 范围暂停该引用，但保全原生与人工资产；显式跨 Project 另选范围。 | `organize.test.mjs` A05/A21；`ports.test.mjs` NONE→Project；`stability.test.mjs` G03；生产 dispatch-fence 专项。 | 无 Pro 余项。 |
| **A22 未知 handle/URL/注入** | `model/output-schema.mjs`、`model/validate.mjs`、`model/payload.mjs`、`model/openai-responses.mjs` 拒绝未知字段、handle、跨引用证据、URL/tool/权限注入；不能触发原生写操作。 | `model-schema.test.mjs`；`model-provider.test.mjs`；`organize.test.mjs` A22；`closeout-ai-service.test.mjs` wrong handle 与使用量结算。 | 无 Pro 余项。真实供应商实际输出仍须 EA1/EA2 实验。 |
| **A23 截断/refusal/超长 JSON** | 拒绝不完整结果，bounded response/input/token/timeout；无无限重试；已派发时保守记录未知费用，未取得有效提案不应用。 | `model-provider.test.mjs`；`model-schema.test.mjs`；`closeout-ai-service.test.mjs` refusal/missing usage/network/timeout/late-result。 | 无 Pro 余项。 |
| **A24 双 tab/scope 预算** | `jobs/budget.mjs`、`integration/model-budget.mjs` 与 billing store 将三项用户上限、安装付款总额及 scope 子额同事务 CAS；默认 0，修改需旧新预览和确认，丢失回复幂等。UTC 日/月已占用包括预留和未知费用；队列余量遵守所有更严格限额。改预算清除各 scope 云许可，不自动启动。 | `budget.test.mjs` A24；`billing-store.test.mjs` 双连接/政策/归档；`closeout-ai-budget.test.mjs`；`closeout-public-budget.test.mjs`；`closeout-ui-browser.mjs` 三额度/零/近限/只读；AI service 派发重验。 | 无 Pro 余项。真实配置、付款与账单核对需 EA1。 |
| **A25 派发后超时/重启** | 先持久派发标记再允许 transport；未知回执保留预留费用；worker/service 重建不得自动重发。到期价格卡、关闭执行、撤回用途也不隐藏历史费用或取消/恢复入口。 | `jobs.test.mjs` A25；`billing-store.test.mjs` reopen；`closeout-ai-service.test.mjs` timeout/lost durable dispatch；`closeout-public-model.test.mjs`；统一 MV3 实际 worker/browser 生命周期。 | 无 Pro 余项。真实网络中断/供应商计费行为需 EA1；人工设备休眠场景见 RD2。 |
| **A26 Pro 关闭/会员/预算 0** | mode、entitlement、processing、capability 分离；native 立即可用，Pro资产保留；新写暂停而保存内容、记录、删除、别名清理、撤销、导出恢复保留。Free→Pro 还原所选 Project 和分页位置。切原生默认暂停，当前范围的继续整理须独立明确选择且仍受当前文档许可约束，不承诺浏览器关闭后运行。 | `jobs.test.mjs` A26；`ports.test.mjs` entitlement；`production-owner.test.mjs` policy invalidation；`remote-controller.test.mjs` resume；closeout UI 只读 Series/model/跨 Project；统一 MV3。 | 无 Pro 余项。真实账户会员可信状态和撤权来源由 FD2 提供。 |
| **A27 迁移/容量/旧 reader** | 同库版本兼容、明确最低 reader；旧 root/1 的 10,000 条历史不再锁死第 10,001 次写入，512 窗口转有封印的无损历史段。多次修复采用不可变关联回执与有界 head，后续正常编辑同事务更新高水位；缺失后继拒绝较短恢复。别名 100 条上限通过显式可撤销管理解决。 | `migration-recovery.test.mjs`；`composite-backup.test.mjs`；`storage-history.test.mjs` 边界/损坏；`closeout-history-browser.mjs` 515 次真实 IDB、两次修复和再冷重启；`domain.test.mjs` alias；closeout UI 明确删除。 | 无 Pro 余项。修复后的资产根要求 storage/3 reader；用户预算另用 billing-storage/3。旧 Pro reader 不可写不支持的根，Free 继续读取自己的命名空间。资产与未决费用仍有显式有限容量，见下文。 |
| **A28 备份恢复** | `integration/composite-backup.mjs` 与 `migration/recovery.mjs` 只恢复资产数据；portable compound backup 仍为 /1，不导出 lifetime journal/inverse、恢复 quarantine 或安装级账本。无 token/grant/key/云许可/pending 请求复活；Free+Pro 同笔事务恢复，冲突不得覆盖人工行。 | `composite-backup.test.mjs`；`migration-recovery.test.mjs`；`storage-browser.mjs`；`recovery-browser.mjs`；统一 MV3 备份/空白配置恢复。 | 无 Pro 余项。个人备份的最终恢复验收由用户自己的环境决定（RD2），不能拿它延迟合成浏览器验证。 |
| **A29 持续原名** | native 是显示偏好，不保存冻结原名副本；后续原生改名继续跟随；已存派生标题和别名仍可找回。 | `domain.test.mjs` A29；`projection.test.mjs` native preference；`remote-ui-browser.mjs` 保存/原名/跨页草稿保留。 | 无 Pro 余项。 |
| **A30 时间/新模型/重复打开** | 原生证据决定活动；Pro改名、related、重复打开、H/时区和模型变化不伪造活跃，不重编 Series；硬排除继续生效。 | `stability.test.mjs` A30 合并序列；`projection.test.mjs`；`navigation.test.mjs`；`series-edit.test.mjs`；实际 UI reorder 保真。 | 无 Pro 余项。 |
| **A31 窄窗/缩放/键盘/IME/弹层** | 继承 v2.7，长列表分窗；320×260 操作可达，focus trap/IME 合成/外部 pointer release/迟到结果正确；真实 Chrome 100/125/200% zoom 已单独验证。记录、诊断和模型任务留在按需设置中。 | `ui-browser.mjs`；`closeout-ui-browser.mjs`；`remote-ui-browser.mjs`；`closeout-zoom-browser.mjs`；统一 MV3 原生 composer/dialog 共存。 | 中文最终截图需 CI 字体环境独立完成。真实 OS IME、触控/屏幕阅读器以及本人窗口环境为 **RD1**；真实 ChatGPT 弹层由 FD2+RD1 验收。 |
| **A32 停用/卸载/宿主恢复** | `createProWorkspace.destroy()`、frame companion 与共享卸载清理移除 Pro 私有表面，不接管 native 输入；统一测试包具备实际 disable/reenable/uninstall 旅程。 | `tests/integration-unified/mv3-browser.mjs`：`chrome.management.setEnabled`、`Extensions.uninstall`、同一 textarea/tools、私有 DOM 消失；`ui-browser.mjs` revocation。 | 独立 Chrome 可完成部分必须在最终包 CI 中运行。真实本人配置/真实宿主停用与隐私残留为 **RD2**，不是整个场景都待外部。 |
| **A33 旧多人工关系** | 旧无 role 关系完整保留，明确选择 primary 或明确不指定；不取第一条、不丢锁。超过一页的待解决记录可继续逐条处理，已解决页自动回收 cursor。 | `migration-recovery.test.mjs`；`domain.test.mjs` A33；`production-owner.test.mjs` 24 条以后；`public-frame-dto.test.mjs`；`remote-ui-browser.mjs` 连续解决 25 条。 | 无 Pro 余项。 |
| **A34 related-only/primary 暂停** | `projection/project.mjs` 保持原名未收录入口，不把“存在关联”当作已有 primary；UNKNOWN/Project 不被强行纳入。 | `projection.test.mjs` uncollected/suspended primary；`stability.test.mjs` G02；`ports.test.mjs` NONE→Project。 | 无 Pro 余项。 |
| **A35 自动后人工顺序恢复** | 恢复只重放已提交 patch，保留原始顺序和 actor/inverse，不重跑模型、命令或过期权限；分段历史 checkpoint/suffix 延续该不变量。 | `domain.test.mjs` A35；`migration-recovery.test.mjs` actual machine+human；`storage-history.test.mjs`；`recovery-browser.mjs`；自动 owner 新回归。 | 无 Pro 余项。最终自动 owner 接线与恢复组合须随最终 SHA 一起验证。 |

### 容量与备份的精确边界

历史归档解除的是累计 operation ID 导致的永久编辑阻断，不表示无限存储。当前 overlay 仍受 16 MiB 与每表 20,000 行的明确限制；账本最多保留 1,000 个尚未解决或当前有效账期内必须保留的任务，未知费用不能为了腾空间而丢弃。100 条历史名称有明确的逐项可撤销管理；当前待审提案上限 2,000，拒绝新增而不静默删除可审内容。错误信息应引导相应管理操作，不能把审批容量错误误称为存储损坏。

本地完整操作历史、原始 inverse、历史金额和恢复 quarantine 留在同库的受保护记录中。可移植 /1 备份保存现有人工/派生资产及必要引用，不保证将整个 lifetime undo/计费/诊断历史搬到另一安装；授权与 pending 工作尤其不能随备份恢复。上述产品边界与“本地历史无损归档”是不同承诺。

## 自动模型与质量门：实现和真实准入分开

| 门 | 已实现的可独立工程 | 必须保留的真实边界 |
|---|---|---|
| 模型配置 | 固定 provider/profile、frozen model/prompt/output schema、metadata 输入、当前匹配价格卡、每任务额度；配置不含 secret，不能自带 endpoint/permission。生产 owner 注入获准 transport/授权函数；没有默认 fetch/凭据。首次启用面板展示实际标题/别名/主题示例、目的地、政策版本与链接、最高预留和每任务上限；当前总余额不足时不能确认，明确确认方可启用。公开一次性 previewId 绑定来源、预算和可信配置；frame 不接触 key。仅 Pro 包声明固定 `https://api.openai.com/*` optional host 和精确 CSP origin，无自动 request/grant；Free manifest 逐字保持。公开 owner、浏览器和重算 manifest 哈希攻击的打包反例均已运行。 | EA1：供应商、凭据、用途、目的地、保留政策与费用许可尚未批准。不能因为注入 fake transport 就称真实 API 已接通。 |
| 严格输出与回退 | 四种明确输出，opaque handles、引用归属、实体/版本、JSON/token/byte/timeout/refusal 校验；本地规则可给 review-only 初步建议，模型失败不破坏人工/Free。 | 本地规则和原创合成中文反例只证明工程行为，不是自然中文分类质量。 |
| 完整已知范围 | metadata-batch cursor 覆盖所有获准引用，并绑定完整来源、scope、约束、mode；本批只发送冻结的 refIds，不默默替换下一批或跳过第 1,001 项。 | 真正可见的普通聊天范围仍来自 FD1；未知或历史不可见数据不会被推断出来。 |
| 自动归属准入 | 各 lane 独立；point precision≥98%、95% Wilson 下界≥98% 才扩大默认范围；每个自动 lane 至少 200 项；首轮/稳定 primary/人控锁排除仍独立执行。可信 owner 自动策略不能由 frame 的 boolean 替代。用户当前范围自动选择默认关闭，仅在已具备真实资格时显示选项，最终许可为用户选择与可信资格的交集；改范围、关闭、撤权或预算变更会清除选择。 | EA2：≥1,000 自然工作样本、中文优先、用户/对象/Series/时间隔离、双标及保留集的实际报告尚未产生。没有实际报告的默认自动状态必须为 false。 |
| 命名/覆盖 | 标题直接接受≥90%并记录区间；预登记 eligible cohort 的真实分母、覆盖目标≥50%；漏报错误/排除困难样本/模板泄漏不能过门。 | EA2：真实报告和各 lane 批准；只在少量简单标题准确不能称完整自动 Pro。 |
| Series/拆合 | 边和编号的工程不变量已执行；结构一律保留显式预览、冲突校验和原子操作。 | EA2：真实误合/误拆/用户接受/撤销统计。报告达标也不开放静默结构变更。 |
| 任务与费用 | queued→reserved→dispatched→result-ready→review/commit；同 ID 不重发；未知收费保守保留；关闭/到期仍可读历史和取消；任务分页可达第 21 项以后；主动核对保存收据可处理任务状态；结束任务不删已存建议或退已结算费；长期 settled/terminal 归档不丢累计金额。 | EA1：真实供应商响应、实际计费/对账、价格有效期由批准方核验；本次没有真实费用。 |
| 额度设置（§6.5） | 单项/每日/每月三项上限默认 0，以整数微货币保存；UTC 周期、已占用与队列余额可见，队列不增加独立输入。提高额度须预览确认；取消/过期/重复和回复丢失不重复写，保存后必须重新确认云范围；近限提供暂停/调整，到期会员只读费用及可暂停。 | `closeout-public-budget.test.mjs`、`closeout-ai-budget.test.mjs`、`closeout-ui-browser.mjs` 验证工程；真实付款限额与计费仍需 EA1。 |
| 单聊天精细复核（§6.3） | 当前范围内一个获准聊天单独披露和确认，使用同一冻结模型；只产生建议，不改变全局整理模式、不推进普通批次、不打开自动或后台偏好。取消返回人工编辑保留未保存草稿。 | 公开接口实际 owner 合成 transport 与浏览器交互均 PASS；真实分类质量仍需 EA2。 |
| 当前范围后台偏好（§7.1） | “切换到原生视图后继续”独立默认关闭，取消不保存。明确选择后仅在同一当前文档许可仍有效时继续原范围；默认切原生暂停。当前自动范围的新来源有限触发，不以 UI 开关绕过来源/质量/费用门。 | 生产 owner 默认暂停/显式继续及新增来源反例、浏览器偏好传递已运行；关闭浏览器后的常驻执行从未承诺。 |
| 效用 | `organize/evaluation.mjs` 对参与者/任务量、20% 中位找回耗时降低且错误不升的门做计算验证。 | EA3：至少 12 人、60 个真实任务的平衡对照研究及数据用途许可。本次不把调用数/测试数当找回收益。 |

## 最终剩余依赖清单

这些条目只包含必须由外部事实、授权或本人环境补齐的事项。人工功能、DTO/分页、任务接线、合法合成数据验证、独立浏览器、实际 tab zoom、打包、CI、中文字体截图不在此列表。

| ID / 分类 | 确切缺失能力 | 已完成的 Pro 准备与当前行为 | 验收需要的实际事实 |
|---|---|---|---|
| **FD1 / FREE_DEPENDENCY** | Free 正式宿主提供真实已知引用、稳定 ID、正向 NONE/PROJECT/UNKNOWN 与新鲜度证据。 | 六 port/production owner 读 admitted snapshot；UNKNOWN 可打开但不默认收录；合法独立正向 NONE 用例已完成。 | 在真实账户下证明来源，不以 URL 或缺 Project 徽标推断。 |
| **FD2 / FREE_DEPENDENCY** | 真实 ChatGPT 宿主导航确认、账户身份/授权 epoch/撤权、可信会员状态及原生 composer/popover 生命周期。 | scoped authority、CAS、原生 new-tab 后备、Free/Pro 无损切换、临时/过期只读、隔离 MV3 生命周期。 | Free owner 的真实来源与宿主通道验收；不覆盖其 PR #16 开发成果。 |
| **FD3 / FREE_DEPENDENCY** | 仅当后续选择使用正文增强时，Free 提供当前获准选区/已发送内容的明确能力与出处。 | metadata-only 路径完整；输入类型、用途与 payload 边界已预备，缺能力不会读取正文。 | 明确来源、最小字段和独立用途许可。R1 metadata/manual 模式不等待此项。 |
| **FD4 / FREE_DEPENDENCY** | 原生“新建聊天”操作与新 conversation ID 的精确 action 关联。 | 无推测 pending 收录；取消/其他文档/后续出现 C 均不产生关系；用户明确收录后备已验证。 | 真实新建/取消/第二 tab/旧聊天序列；不能把 first seen 当 created by action。 |
| **EA1 / EXTERNAL_APPROVAL** | 实际模型服务、凭据、数据用途/目的地、保留政策、价格卡、付款配置/额度及真实调用许可。 | provider 关闭/零 transport；本地规则及人工可运行；配置、严格校验、账本、任务/失败/恢复、owner 接口已实现。 | 在明确授权范围内执行真实最小批次、失败/取消/对账；本次不发送个人数据、不收费。 |
| **EA2 / EXTERNAL_APPROVAL** | 获准自然评测数据与实际供应商运行，以及按 profile/lane 的质量报告和自动范围批准。 | 评测/隔离/分母/区间/样本门、人工保护、owner-only 自动准入已实现并用合成反例验证；没有报告不开自动。 | 冻结 profile 的独立自然中文保留集结果、双标、覆盖与稳定性；不是本地规则成绩。 |
| **EA3 / EXTERNAL_APPROVAL** | 真实参与者与真实工作任务的研究/数据用途许可。 | 效用研究统计接口、任务量与错误率门已实现。 | 至少 12 人/60 任务的平衡对照，报告中位找回时间和维护成本；本次未招募或研究用户。 |
| **RD1 / REAL_DEVICE_VALIDATION** | 本人实际 OS IME、触控/辅助技术、真实屏幕和已安装扩展与真实 ChatGPT 同时使用。 | 独立浏览器的窄/短视口、真实 100/125/200% tab zoom、键盘/合成 composition、native textarea/dialog 共存已完成；CI 中文截图独立完成后另绑定。 | 实际设备输入法候选、焦点、缩放与辅助技术体验。 |
| **RD2 / REAL_DEVICE_VALIDATION** | 本人配置的安装/停用/卸载、系统休眠/崩溃/磁盘故障、本人备份与长期宿主恢复。 | 隔离真实 Chromium IDB、整进程重开、事务 abort、历史归档与恢复、统一包 disable/uninstall 已有独立测试。 | 真实设备/账户配置的发布前验收；不能把独立已完成部分再次当作外部阻塞。 |

## 最终交付的工程回执核对规则

1. 以同提交 CI 报告的 `sourceSHA`、干净源码与 `sourceMatchesCommit` 自动绑定候选；Draft PR 记录精确 SHA、实际 GitHub CI URL 和结果。只在实际最终报告与可运行包核对通过后判定 `PRO_CODE_READY`，不将本文件内局部 PASS 当作最终结果。
2. 自动 owner、单聊天复核、三额度、原生后台偏好和一次性披露围栏的合成正/反例随最终代码运行；真实 profile/报告/凭据仍无默认值。
3. 统一 MV3 包验证包含原 Free 回归、真实 worker 生命周期、实际停用/卸载、同库备份/迁移/恢复；注明强制终止和自然 idle 的区别。
4. 固定源码后重测 1,000 引用/100 主题的冷/热开发性能，保留全部样本及 source digest。旧 performance 数字不借用；目标为本地反馈 p95≤100 ms、缓存切换≤150 ms、完整 IDB 链≤500 ms。MockIDB 与真实浏览器指标分别说明。
5. 在有合法 CJK 字体的独立 CI 浏览器中检查中文截图、正常/窄/短/200% 布局；不得将缺字体造成的未验收转列本人设备依赖。
6. 产物 SHA、manifest、可运行统一包和测试源摘要一致；无用户/供应商真实调用、无 merge/release。任何剩余本轮工程失败直接修复，不能转记 FD/EA/RD。
