# VAIWL实际状态：Free持续实施，真实验收未完成

## 当前持续实施（2026-10-13，正式桌面目录）

当前已推进至第十九轮（接本地 `ee7bc03`，远端最后确认 `dab61e7`）。Free界面统一末次发布校验；继续原正式目录、分支和PR，不改发布状态。

用户明确恢复并授权完整Free本地并行开发，沿用 `/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer`、`codex/vaiwl-free-first-20261013` 和现有 Draft [PR #16](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16)。本轮起点及远端核对为 `81ff0ec37021eaabc5f7a8aecf61e9076619bf44`；PR #16 仍基于计划PR #15，不修改父PR/main，不部署。

B1/B4/B5/F1原生存储新增：同库不可变Project/Conversation分片、源版本CAS、受影响记录增量读写、版本绑定分页、保留当前与上一检查点所需分片、原子恢复影子。损坏root恢复先验证全部piece并撤销全部来源；旧source不能借恢复重放，单独门控的新source可重新核验。旧v1仍20k行/16Mi；v2仅为分片聚合，100k/128Mi边界，各落盘记录仍16Mi。Pro根/日志未改。

新证据独立记录：

- Node分片/恢复针对性回归通过；完整集成组合回归222通过/0失败（命令见检查点；后续变更另测，不与旧180相加）。
- 真实Headless Chrome / IndexedDB，1k/10k/100k × mixed/single-project六组通过，见 `engineering/free-partition-scale-2026-10-13.json`。这是持久化/尾部可达/CAS测试，不是导航p95认证。100k全量投影约550–715ms，尾页约131–171ms，双连接增量约626–942ms；大规模根校验仍O(N)，须继续优化读取/缓存路径。
- 真IDB损坏恢复单独通过，见 `engineering/free-partition-recovery-2026-10-13.json`。报告保留各自运行前源码哈希，不冒称后续源码已验证。

C1/C2/C3/C4/C5新增合成路径：Free默认导航只用原生Project/原名；NONE与UNKNOWN独立紧凑列表、原名查找、原生项目空composer（发送前不保存）、用户合成发送后1秒内新增引用、手工7/14/30/60/90、scope会话H/T/Z冻结、共享工作集/片段/备份设置；旧Pro路径保留在显式 `?view=pro`。

B2.F2/F3新增严格本人发送与ObservationHint分层、旧锚点暂定下沉、来源撤权/过期回退、H自适应纯算法、预算/去重/取消/最多两次重试校准器。活动持久仓库已独立实现并验证；服务接线、真实源及持续校准仍需继续，不能把模块测试算端到端完成。

- 真MV3合成旅程7/7通过，`engineering/free-mv3-2026-10-13.json`：双tab、原生工具/搜索/草稿、唯一返回、历史Project、worker终止再恢复、UNKNOWN scope。
- 独立活动仓库真IDB5/5和根损坏恢复1条通过，`engineering/free-evidence-idb-2026-10-13.json`，同库Pro资产、CAS、撤权、scope与缺根反例。
- Headless UI合成旅程通过：原名/NONE/查找、H、真实合成用户发送后可达、重连保留、键盘入口、390px/深色/CSS200%、跨21秒lease草稿。物理IME、实际Chrome缩放与真人可用性NOT_RUN。

UI、活动/时间策略与测试由互不冲突的writer并行推进，最终集成仍由主代理执行。真实ChatGPT来源/授权账户、跨端真值、实际PAIA共存、物理IME/真人日常验证仍NOT_RUN / BLOCKED_LIVE，未访问私人账户或PAIA。**FREE_ACCEPTED、RELEASE_READY、PUBLISHED均未达到；持续执行剩余可行任务。**

## 第二轮持续集成（接627696e）

`627696e` 已正常快进推送到现有Draft PR #16。继续完成：

- Free HEADER/PAGE有界RPC、scope/native/workspace/evidence末次版本校验、不可用对象显式tombstone；客户端按native/活动引用版本增量拉取，单条活动仅重取1ref。来源撤权/generation/TTL变化、会话和评估时刻改变均使相关缓存重验。
- 原生新增ref与B1/B23共享工作集/片段引用在同一个IDB事务登记，支持旧root和F1分片；发布故障注入证明两边均回滚，不覆盖Pro identity/placement等人工资产。
- 持久独立活动提示接入模拟发送，原始event与hint不混写；同message重观察不续TTL、不新增发送。新增FreeRuntime控制器的缓存优先/无来源unsupported/预算/CAS/撤权/前台重查模块测试；**worker持续上游校准接线仍未完成**。
- 历史ViewSession在重载及跨午夜保持H/T/Z，安全回当前段才采纳新日期/策略；证据足够时auto安全进入评估，短暂撤销恢复fixed旧H及冷却。无Project占主体/证据不足不自适应。
- 100k客户端纯计算排序优化：NONE-heavy聚合约485→108ms、活动增量聚合462→103ms；单活动网络计划1ref/1page。仅LOGIC_ONLY_SYNTHETIC，不代替IDB写入、浏览器端到端或弱设备指标。

实际验证：一次完整Node组合253通过/0失败；随后排序局部回归25通过/0失败（不相加）。真实MV3分页版本9/9，历史session4项，auto变化/撤销旅程分别通过，新增JSON报告保留各自源码/构建来源。最终代码比先前报告变化时，只声明对应已执行局部验证。

仍可本地继续：独立活动证据从20k/16Mi单根迁至分片；native/evidence损坏交互恢复；worker/service持续校准接线；可信原生旧名称aliases与Project成员完整性证明合同。以上不是外部权限阻塞，继续实施。真实ChatGPT/跨端/PAIA/物理IME/完整F1与发布关口仍未通过。

## 第三轮持续集成（接b2a262b）

`b2a262b` 已正常推送原Draft PR #16。继续按同一计划完成以下本地路径：

- B2/B5/F1活动证据迁入同库不可变per-ref片段及全局ID分桶索引；单片16Mi、聚合100k/128Mi、source/marker/CAS/幂等/撤权保持。跨ref事件ID及hint eventKey冲突、缺索引片、超容量和部分写入失败均拒绝且整体回滚。旧v1首次写入原子迁移。损坏root只从当前原子影子恢复，先检查所有数据/索引片，全部来源撤销；不恢复发送许可。
- HEADER以活动ref版本生成增量计划，PAGE只读取需要的证据；源/成员证明的版本改变分别使相关缓存重验。原生可信改名自动保留最多20个旧原名；不接收页面或Pro别名作为原生事实。成员完整性需明确当前source的count及成员见证；全库存不擅自提升未知成员证据。
- C5手动native/evidence修复入口接入设置及故障提示；用户点击才修复，原生草稿保留、不重放发送。独立headless别名4项、手动恢复4项、严格count自动范围4项通过。
- B2.F3/B4校准registry实际接broker/service：owner才可提供source，绑定guard/signal/current-document/current-account见证；未配置来源明确unsupported且不读取大快照或轮询。发现并修复后台迟到结果在unknown或账户变化后仍落库的问题，补写前异步权威重核验。当前worker没有生产source，不构成真实ChatGPT数据渠道。

验证来源分别保留：完整Node组合278通过/0失败；后续背景权威修复及索引/容量反例使用对应针对性回归，不能与旧总数相加。真MV3更新包9/9通过（实际worker依赖/重启/NONE新发送/双tab/草稿/UNKNOWN scope）；后续broker写前权威增强另有服务级反例，不冒称先前浏览器report对应后来每字节。

真IDB最初1k/10k/100k+迁移恢复4/4；分桶优化后只重跑受影响100k+迁移恢复2/2：100k首灌15.56s、header219ms、50ref尾页196.5ms、全读2705ms、双连接增量814ms（前版1229ms）。首灌变慢且全量manifest仍O(N)，没有把这些数字当作真实发送1秒、导航p95或物理弱设备认证。详见独立 `free-evidence-scale-*-2026-10-13.json`，执行源码哈希保留原样。

最终集成Node组合 **297/297通过、0失败/跳过**，随后恢复错误分类2项和同context三轮手动恢复5项针对性通过（不相加）；最终MV3包9/9独立报告为 `free-mv3-integrated-2026-10-13.json`。组合回归涵盖后台静默账户切换、header不等待source、不重复全快照、source时间倒退拒绝及正确重试、可信新来源在撤销旧source后重新建立库存证明。独立审查没有把拒绝后旧来源恢复成有效来源。侧栏缓存8条headless、正常UI14条、auto4条分别通过。

F1新增6组真实UI/4x CPU（1k/10k/100k × Project混合/NONE密集）。10k历史导航p95约34–46ms、搜索约34ms；100k首屏/longtask成本保留，侧栏缓存后只复测100k两组：历史p95 244.3/242.1ms，搜索150.4/179.2ms，仍有longtasks。此为真实组件UI合成环境，不含IDB/上游端到端，也不代替物理弱设备；100k不是擅自新增150ms门槛。完整F1仍需真实来源/目标设备证据。

F3已新增固定ZIP元数据的纯Node离线打包、source/build SHA-256清单、静态worker依赖闭合与verify，3项包测试通过；使用与回退说明见 `engineering/FREE_PACKAGE_SUPPORT.md`。最终ZIP SHA-256为 `2592ead6ebb3e8eee576e8752062ea462b0f16e9c6230dc5a9fed8e3d3d33728`，见 `engineering/free-package-2026-10-13.json`。测试包明确 **SYNTHETIC_ONLY / NOT_RELEASE_READY**，仅loopback；未加入ChatGPT权限或部署。生产渠道、获准真实账户、跨端真值、PAIA干净构建/共存、物理IME和真人F4仍BLOCKED_LIVE或NOT_RUN，FREE_ACCEPTED/RELEASE_READY/PUBLISHED未达到。

本轮恢复UI测试修复：等待异步IDB谓词曾提前结束，导致测试在活动根提交前注损坏；改为显式await root与marker事务完成的有界等待。同context原生→活动→合法checksum但非法manifest恢复仍逐轮验证，不用延时或拆分上下文掩盖数据删除。

## 以下为恢复前81ff0ec检查点历史，不代表当前暂停

## 当前实施检查点（2026-10-13）

用户在本线程明确授权从`176ebc9a3620f6e174e542e3320ff7008cd6ebe8`实施Free，随后要求完成当前测试、提交已有代码、保存恢复检查点并暂停Goal。工作分支为`codex/vaiwl-free-first-20261013`。本地实现提交以包含本节的Git提交为准；未创建本实现的Draft PR，未推送、合并或部署。远端只读核对PR #15仍Draft，head为上述基线。

| 切片 | 当前证据与状态 |
|---|---|
| B1.F / B2.F1原生事实基础 | 原生Project/Conversation/Membership三态合同、来源版本/期限/撤权、原生改名和移动的原子观察更新、scope隔离、CAS与幂等已实现；仅synthetic来源。完整任务仍IN_PROGRESS |
| B3.F / C1.F1投影基础 | native-only纯投影、同名Project独立、NONE/UNKNOWN分流、旧引用UNKNOWN可达、Pro标题隔离；模拟器通过受保护的`B23_FREE_SNAPSHOT`读取。UI仍使用原有投影，尚未切换，IN_PROGRESS |
| B5.F初步同库结构 | IDB版本3新增`native_states/native_operations`；旧B1/B23根、分片和Pro资产保留；v2升级及旧reader拒绝已有测试。新原生事实仍是20k行/16Mi有界根，尚未接入F1原生事实分片/检查点恢复，IN_PROGRESS |
| B2.F2/F3、C1.F2/F3及后续 | 此检查点未开始新增活动决策、校准、H策略或后续UI任务；依同一DEVELOPMENT_PLAN恢复，不另立计划 |
| R0 / C6真实条件 | 私人ChatGPT、真实原生写入、PAIA、跨设备真值均未获本轮授权且NOT_RUN；对应真实验收BLOCKED_LIVE，不影响之后继续获准本地工程 |

本次实际测试（不与旧结果或中间重复运行相加）：

- Node逻辑/Mock IDB/构建/B1/B23/B4/F1/HF及Free回归：**180通过，0失败，0跳过**。命令和恢复入口见[恢复检查点](engineering/FREE_RESUME_CHECKPOINT_2026_10_13.md)。
- Chrome Headless Shell `156.0.8078.4`、隔离合成页面、真实IndexedDB：**7通过，0失败**。包括v2升级、三态持久化、双连接CAS、改名移动、写中撤权、scope隔离、模拟器broker原名投影；[原始报告及源码SHA-256](engineering/free-contract-native-idb-2026-10-13.json)。证据为REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY，原生UI与真实账户NOT_RUN。
- npm缓存及headless进程首次受沙箱权限限制，工具升级权限后执行成功；没有启动可见浏览器、读取私人数据或调用收费服务。

**完整B2.F1+B3.F+C1.F1尚未完成，FREE-ACCEPTED/RELEASE-READY/PUBLISHED均未达到。** 用户要求本检查点后停止领取新任务，待桌面应用显式恢复。

## 以下为176ebc9a文档轮历史记录，不代表当前实施状态

核对日期：2026-10-13。远端PR #15读取到的head为`fd5df2be787f8eef053de65965395d7eeea1a80d`；父#14为`0b07455a09b4f2ae2d756ffca5a868305815e424`；main为初始化`76e3dbdb283769e5c94fcef2de35f6b21cf7e49c`。本轮读取到的最新PR仍为#15、Draft/未合并。

本版是对上述文档的最终正文替换。产品方向已确定，计划文本就绪；代码仍未实现新Free原生Project投影。**本轮没有产品测试结果，是否已提交须核对实际PR head；离线文件包不能算GitHub交付。** 本轮GitHub可用操作为读取，写入受阻；没有使用Mac或其他通道绕过。

## 1. 已有工程与Free差额

| 阶段 | 已有证据/实现 | 当前Free剩余状态 |
|---|---|---|
| A/R0 | 合成与Chrome合成多轮；#14真实访客部分调查 | 真实账户/原生Project库存/成员/持续活动渠道未认证，BLOCKED_LIVE |
| B1 | scope/document broker、同库IDB和旧回包拒绝 | 原生Project/native membership三态与生产来源合同待实现/核验 |
| B2 | 严格事件/覆盖/撤权、合成channel | 原生标题/成员更新接口、观察型提示、活动可逆决定和有界校准待实现 |
| B3 | 人工Workspace/Placement/Identity与偏好 | Free必须改用原生事实；旧虚拟资产保留Pro，不代表Free已支持真实项目 |
| B4 | CAS/幂等/重连/多tab/合成生命周期 | Free原生源变化/活动/策略更新和真实宿主生命周期仍需增量回归 |
| B5 | 人工日志/恢复/备份/损坏和配额反例 | 新事实/三态/格式迁移、Free/Pro资产兼容待做，不重建旧库 |
| C1–C5 | v2.7合成界面、工作集/片段/键盘200%等可独立部分 | 原生项目卡+无项目列表+native-only名称+活动及真实适配尚未完成 |
| C6 | 合成闭环有记录 | 完整Free真实日常、跨设备、PAIA/物理IME仍未通过 |
| D1/D2 | 1200模板，16.67%覆盖，影子预览 | DEFERRED_PRO；不是通用自动虚拟收录/智能命名 |
| D3–D5 | 原计划保留 | DEFERRED_PRO；无供应商/模型/费用自动许可 |
| E1–E3 | 原生写入设计/有限授权原则 | OPTIONAL_LOCKED；不是Free用户使用原生入口的前置 |
| F1 | #13完整100k合成MV3、分区/增量性能记录 | 复用但要对Free真实分布/源更新/5H再验，不能原数认证新投影 |
| F2/F3/F4 | 同步/打包/发布/长期目标保留 | F2可选后置；F3/F4 Free路径待C6/F1，不依赖D/E |
| G1/G2 | 共存与可选协议边界保留 | 运行共存须Free验收，数据协议/官方高级生态后置 |

旧结果详细证据入口见[基线表](research/V28_BASELINE_AND_ACCEPTANCE.md)，本表不累加各组数字或把旧阶段重置为未开发。PR依赖链#1→#5→#6→#7→#8→#9→#10→#11→#12→#13→#14→#15；#2–#4为独立实验支线。

## 2. 立即可执行与真实阻塞

取得后续Free实施授权后，最早可执行切片为B2.F1/B3.F/C1.F1：原生Project事实/成员三态/native-only投影/无项目清单及同库兼容，复用现有模拟器和回归。同步准备R0-01/02/03.F的最小真实条件；没有条件不启动私人数据读取，继续本地活动决策/迁移/生命周期工程。

真实卡住的不是AI：是scope/原生库存和可持续活动来源、原生组件适配的证据。UNKNOWN的可达回退必须实现，但不能把回退算成真实准确性通过。完整Free未达到FREE-ACCEPTED，不能开始抢跑Pro功能或宣称可正式发布。

## 3. 本次文档交接状态

PLAN_TEXT_READY；REMOTE_WRITE_BLOCKED（当前工具未提供写入动作，也无已配置提交凭证）；RUNTIME_UNCHANGED；NEW_PRODUCT_TESTS_NOT_RUN。可提交文件包以固定head与逐文件旧blob作为保护条件，写回前必须重新读PR #15，不覆盖别人的新提交。提交成功后记录真实新head再更新本状态，禁止预造SHA。

## 第四轮：后台通知与生命周期（接25e2ab2）

补齐校准提交到真实客户端的通知：service owner发布仅lease标识的更新，MV3 broker重新验证当前scope/document/lease后定向发送；客户端只重读受版本保护的页面，保留阅读态和原生草稿。每binding前台校准只启动一次，避免“通知→HEADER→再次校准”循环；显式send/source/expiry/history仍可触发。独立审查已复现循环并用延迟投递回归关闭。

本次实际结果独立记录，不和历史次数相加：
- 完整Node组合301通过/0失败/0跳过；命令同第三轮，源码与日志尾见 `engineering/free-notification-source-receipt-2026-10-13.json`。
- 实际headless Chrome MV3回归9/9；`free-notification-mv3-2026-10-13.json`。
- 实际Chrome禁用/启用、可信freeze/resume、Back/Forward与同IDB恢复5/5，旧草稿页不刷新；`free-lifecycle-mv3-2026-10-13.json`保留通知改动前各自构建哈希。
- Free共享工作集/片段/失效回退/Free↔Pro人工资产保留、后台通知保持阅读及草稿、旧lease拒绝8/8；`free-shared-assets-notification-ui-2026-10-13.json`。
- 真实IDB+page transport校准可见性：旧轮询2199.7ms，新通知200.1ms，阈值1000ms，来源调用严格1次；before/after报告独立保留。此项不是MV3上游source或真实ChatGPT认证。

新可复现合成包：`/private/tmp/vaiwl-free-delivery-round4-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `a63b1aa6928dc6d047a7450ca18adf2483839ae47360e3c1b6176e75ae605fb3`。旧包与证据不覆盖。实际ChatGPT/跨端/PAIA/物理IME和弱设备、真人F4仍未验收；完整Free未交付。配置source后runtime提交仍做全量活动投影，100k端到端持续更新优化未完成，不能当外部阻塞忽略。

本轮Git端点5秒连通性检查仍超时，API核对Draft PR #16仍b2a262b；没有循环重试，没有更换remote或部署。本轮提交继续仅本地检查点。

## 第五轮：提交后增量失效与期限调度（接1210407）

`1210407`已保存第四轮本地检查点，未推送。第五轮针对已记录的runtime全量投影缺口：独立FreeRuntime默认snapshot合同保持；服务owner明确选择invalidation，成功批次提交后仅发布lease/scope绑定的更新。部分native已提交而evidence失败时仍通知，取消/旧scope不发布。HEADER/PAGE仍承担已有增量读取；不会因为通知再次启动上游校准。

多期限调度保留成功批次中的所有有效期；冷启动复用原生/证据实际分页及source header的期限，经broker最终authority核验后传给registry并剥离内部元数据，页面不能伪造。无source也可只让缓存显示过期，不新增来源请求/事实。先安排下一个期限再触发校准，unsupported不丢后续期限。独立审查关闭了CHECK误插入和无source期限遗漏；真实浏览器关闭默认timer接收者Illegal invocation问题。

新证据：
- 完整Node315通过/0失败；随后timer绑定最后修复有23条针对性通过，次数不相加。`free-invalidation-source-receipt-2026-10-13.json`保留说明与最终源hash。
- 真实headless MV3 9/9；`free-invalidation-mv3-2026-10-13.json`。
- 实际页面+真实IDB可见167.1ms，source只调用1次；`free-invalidation-visibility-2026-10-13.json`，不代替真实源MV3验收。
- 真实IDB registry校准10k/100k两组通过；native/evidence均各header1/apply1，full read/snapshot为0。10k双提交121.9ms；100k双提交1340.2ms，末次提交到通知0.2ms。事后各page只验证1ref。`free-invalidation-scale-2026-10-13.json`明确不含完整UI/broker/真实源，这不是100k端到端性能认证，仍有根manifest O(N)成本。

新合成安装包 `/private/tmp/vaiwl-free-delivery-invalidation-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `9fc158e8cba4ada662ec825cb671347d5e8b9fa045769c848f78d82fa77e0a65`。真实账户/R0/C6、跨端、PAIA、物理IME/弱设备及真人F4未通过；FREE_ACCEPTED/RELEASE_READY/PUBLISHED仍否。没有访问私人账户或PAIA、付费调用、部署、merge、force push。Git端点阻塞本轮未循环重试，现有Draft PR #16远端仍b2a262b。

## 第六轮：交互安全、入口校准与大页续租（接03ef76a）

本轮正常Git快进同步已恢复，原先积压提交已推送至原PR #16分支03ef76a；未改remote/强推/merge/部署。继续补已复现的真实合成路径缺陷：
- 按住导航项时后台更新曾替换原节点，mouseup点击丢失。现在按压/键盘激活/组合输入/拖动期间合并同scope最新snapshot，结束后的下一task应用；失效/换scope立即丢弃。持续真实交互属于安全更新点例外，不用硬超时破坏原点击；物理IME未验证。
- 同binding重新打开工作区/切历史之前未发校准。新增仅用户导航入口触发的B23_FREE_CALIBRATE，严格kind/64个ID上限、scope/lease核验与同类重复目标短时合并；快速切不同历史目标不丢新增ID，render/update不触发循环。
- Free首次分页从1000提升至合同允许5000，在每页及最终核验前重新BIND续租。保留6秒请求/20秒lease，不延长授权；每页及最终CHECK验证scope，版本栅栏保持。无增量页时同版本跨账户也拒绝，避免旧scope缓存重新显示。
- 相同不可变root/recovery在同事务只计算一次checksum，native大小检查复用规范化序列，evidence仅复制修改maps；格式、完整性校验、恢复根与CAS不弱化。

实际新证据：完整Node321/0（日志及源码hash见free-round6-source-receipt）；实际Chrome MV3 9/9；安全交互6项、无页续租scope/version反例2项；入口合同6项属于Node组合，不另相加。10k完整合成页面真实IDB+broker+DOM更新327.1ms，初始1210.9ms，1ref分页、无fullread、原生草稿节点保留，运行前后源码hash一致。100k存储registry双提交1177.5ms、末次提交到通知4ms，仍不满足1秒总更新目标，且不包含UI。

100k完整UI尝试保留失败诊断：初始1000页规格在15秒只读约24k；改5000和续租后初始约21.3秒完成，但增量测量的测试source提前超过6秒并取消，不是成功的更新验收。期间源变更已标记，不能当固定源码认证。修正测试源生命周期后只复验10k，100k真实增量DOM仍NOT_RUN；不隐去失败、不把registry数据替代UI。

新合成包 `/private/tmp/vaiwl-free-delivery-round6-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `d5f2a3d3c01ac2d43fcee1c9d0ed3e22d7aacea9b4cd126e0894f5be5863fbe4`。当前仍SYNTHETIC_ONLY；真实ChatGPT/R0/C6、跨设备、PAIA、物理IME/弱设备/真人F4及100k端到端尚未通过，完整Free未交付。

第六轮最终同步结果：本地实现bf9bcd4。GitHub API确认PR #16仍Draft、远端03ef76a；默认HTTPS推送报HTTP/2 framing error，一次命令级HTTP/1.1补救20秒超时后停止重试。没有改remote/config；bf9bcd4及本同步记录仅在本地，不能把PR远端描述成已含第六轮代码。

## 第七轮：超大页与完整字节验证缓存（接fe046ab）

首次固定源码100k完整source→IDB→broker→DOM已执行：初始22188.5ms、更新3513.7ms，功能通过但1秒性能目标FAIL。此前诊断不再被误当完整增量证据。

继续实现：
- Free读取仅遇native/evidence page-too-large才二分当前页，不丢Project/ref顺序；最多64次额外拆分/深度13，单项仍超限明确失败，其他错误不重试。scope、revision和最终版本栅栏原样保留，6秒/20秒授权边界不变。
- Native旧checkpoint envelope从已验证的同RW事务闭包复用，不额外对100k旧root重hash；不接收外部trusted参数。GC先读旧checkpoint再覆盖，root/recovery/receipt/shared ref仍原子回滚。
- native/evidence根校验缓存每次仍比较严格JSON全内容、checksum与scope/key。仅完全相等才复用schema/hash验证；不只信checksum/revision、不缓存mutable事实对象。每repo最多2项/8Mi字符，不超预算；marker、pieces、index、恢复和GC仍独立验证。独立合同修复toJSON及自定义iterator碰撞，不调用这类hook。

优化后固定源码100k完整UI：初始17525.8ms、更新2149.9ms（下降约38.8%），1ref分页、全量read/snapshot0、原生阅读/输入/消息节点及草稿保留。功能PASS，1秒性能目标仍FAIL；头读取约477ms、单页323ms、两次CHECK约193/180ms及并行view保存仍有成本，不通过省略安全栅栏来达标。before/after报告保留各自source hashes。

验证：最终完整Node360/0/0skip；真实Chrome MV39/9报告为数组遍历最后小修之前的独立哈希；最终严格缓存16合同、完整Node及拆页浏览器3项覆盖最后修复。浏览器拆页采用模拟30KB返回预算+真实IDB/DOM，两类size error均604refs/2projects、63calls/32成功页，603有效聊天与原有T401 tombstone全部可达，单项error10calls后停止；这是错误路径测试，不能冒称真实16Mi边界认证。各次数不相加。

合成包 `/private/tmp/vaiwl-free-delivery-round7-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `f84712d88cfdc9a2c2817370f0eb43f6632c650aff941bd68a725d58e4d0ce9c`。本轮一次20秒HTTP/1.1正常推送仍超时，未循环重试、改配置或remote。上一确认远端03ef76a；本轮代码仍本地待同步。完整Free/真实ChatGPT/PAIA/物理与日常验收未通过；不标FREE_ACCEPTED或RELEASE_READY。

## 第八轮：共享根验证与一致的读取上下文（接98d6e17）

共享分片manifest复用严格全字节/checksum/scope/key缓存，普通人工事务和原生引用注册仍逐次核验新读记录；损坏或跨scope不命中。HEADER直接使用已验manifest元数据，不再为偏好引用加载pieces；PAGE在单个只读事务内取得state及manifest，保留旧格式回退、Pro人工资产及最终版本检查。活动/引用版本表减少临时数组，不改语义。

完整Node366/0/0skip；其后新增共享上下文4/4针对性通过，不能与旧轮结果累加。固定源码真实Chrome MV3 9/9；100k source→IDB→broker→DOM功能PASS，首屏12913.5ms，更新1625.2ms（上轮2149.9ms）。1ref分页、零全量snapshot/read、原生阅读/输入/消息节点和草稿保留。1秒更新性能仍FAIL，未以减弱权限或完整性检查换性能。各源hash、日志摘要及独立报告为free-round8-*。

新合成包 `/private/tmp/vaiwl-free-delivery-round8-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `7893cbf04248f0db55ccff9e215b19a7c0ae0ea6fc8fb02051ad606704c8c21c`。仍仅loopback SYNTHETIC_ONLY，真实ChatGPT/跨端/PAIA/物理设备和真人日常条件不变；完整Free、RELEASE_READY和PUBLISHED均未达到。下一本地工作为客户端重复全量导航转换/索引成本，保留末次CHECK。

## 第九轮：导航单次转换与受证据约束的路由复用（接1a0dcaf）

client已转换的Free快照通过内部WeakMap来源登记的prepared入口发布，浅拷贝/改scope不能冒充；普通raw入口继续适配。按压/输入安全门控保存prepared标记，释放后只应用最新快照，失效丢弃。路由索引复用先协作式逐项比较scope、引用ID/URL/顺序和group成员/各行顺序；任何不符完整重建，首匹配与新对象绑定保持，末次CHECK不变。

完整Node387/0/0skip（最终延迟标记小修前）；最终prepared浏览器9项覆盖等价DOM、无二次clone、按压/失效、原生阅读焦点草稿，真实MV3 9/9。路由17项合同已包含在Node组合中，不重复累加。固定源码100k功能PASS，首屏14240.5ms、源响应→DOM1790.6ms；比上轮1625.2ms慢，**本轮未证明端到端提速，1秒目标仍FAIL**。新增仓库耗时显示native.apply526.3ms、evidence.apply178.6ms；仍单引用分页、无fullread，原生草稿节点保留。

最新合成包 `/private/tmp/vaiwl-free-delivery-round9-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `cc15f0ae0743646171d1c9dddaf2d929fb2751a5c5987fcfe2397f10daf534ff`。第八轮正常快进推送20秒超时，未重试；本次GitHub API再确认PR #16 Draft、头03ef76aba14cd4d734ba15940c4f206dbe3c5cf5，本地后续代码未声称已同步。

下一可执行位置：原生/活动manifest结构校验后的JSON.stringify大小检测与随后的stable/hash重复编码；需只在内部写路径合并编码、保留结构/CAS/限额与公开读取校验。真实账户/跨端/PAIA/物理和日常验收条件不变，完整Free仍未交付。

## 第十轮：内部manifest单次编码（接838fb6d）

原生/活动分片内部写入先做完整结构、scope、版本及128Mi聚合检查，再用同一stable字符串执行16Mi限额和SHA256；不暴露跳过校验或调用方传入可信长度的参数。公开读validator、GC、checkpoint与事务回滚边界保留。

最终完整Node394/0/0skip；新7项编码合同包括合法Unicode/转义/插入顺序等长、root-shadow校验和一致、scope/schema及16Mi/128Mi拒绝。10k真实IDB校准功能PASS，fullread0；实际Chrome MV3 9/9。10k记录63.7ms/末提交到通知1ms，但与Node回归并行，仅为诊断，不声明提速或性能认证。本次没有普通100kUI复测，上一轮1790.6ms与1秒FAIL结论保留。

包 `/private/tmp/vaiwl-free-delivery-round10-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `aeb751673711d26245a3d4c1a5b2c4b277969a6efd6396cc25d20e94ccf7767b`。仍SYNTHETIC_ONLY；当前正常推送网络阻塞及真实账户/PAIA/物理设备/真人日常验收条件不变，完整Free未完成。

100k仅做一次CPU诊断：55个运行时源hash稳定、功能PASS；1590ms含profile收尾开销，明确不是时延认证。采样self CPU：严格JSON遍历375.8ms（22.5%），活动根处理156.8ms（9.4%），SHA256100.7ms（6.0%），GC62.4ms，Free导航适配12.3ms。下一优化应针对完整字节序列化/根遍历，不能继续把主要瓶颈归因于DOM。可选profile脚本已修正先捕获DOM完成时间再保存profile，不为计时小修重跑。

## 第十一轮：减少严格JSON编码的中间分配（接224724e）

缓存仍逐次编码完整payload并对比checksum/context/key及所有内容；只将逐字段map/join中间数组改为字符串构造，有限number使用与JSON同义的NumberToString（含-0）。toJSON/iterator仍不调用，非JSON值仍拒绝，budget按原编码长度计算。更慢的复制对象方案只做本地微测后放弃，未进入源码。

完整Node419/0；其后补精确maxChars边界，新编码合同44项与旧cache16项合跑60/60，独立记录不相加。实际MV3 9/9。固定55运行时source hashes普通100k测试功能PASS，首屏15762.7ms，源响应→DOM1635.9ms；相对此前普通1790.6ms低约8.6%，只是单次观察，1秒性能目标仍FAIL。native.apply462.4ms、evidence.apply157.7ms，1ref分页、无全量read，原生阅读节点/草稿保留。

最新包 `/private/tmp/vaiwl-free-delivery-round11-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `0d6e917f361301398cc13186695f4714e8eb2734d7619a993b0d92370461b195`，仍SYNTHETIC_ONLY。共享/原生/活动根读取与版本表仍有O(N)成本；活动header还遍历refVersions生成调用者不使用的total，可继续消除重复工作，不能省略marker/checksum/scope或最终CHECK。正常推送待网络恢复，远端上一确认03ef76a Draft；真实账户/跨端/PAIA/物理与真人日常验收仍缺条件，完整Free未交付。

## 第十二轮：活动头专用元数据读取（接10aa13f）

FreeEvidenceRepository.header在完整root校验后只读取revision/manifest/sources，避免枚举全量引用及构造调用者丢弃的分页统计。marker请求先排入同一只读事务，仍在事务成功和末次guard之后返回；原query({header:true})/page/read合同不变。

新10项覆盖空库/v1/v2精确返回、验证后无ref枚举、scope/root/marker损坏、缺根、取消和guard。相关evidence/runtime/shared/broker组合93/0；实际headless MV3 9/9及10k IDB校准功能通过，零fullread；57.6ms仅诊断。没有重复完整Node或100k测试；上一普通100k1635.9ms/1秒FAIL保留。

已验证包 `/private/tmp/vaiwl-free-delivery-round12-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `d8ecda06be6e1fa038a96a0b104dc7ff4d1cea25bec90a11c8a6c378a4c1dda8`。GitHub网络重新连通后一次正常HTTP/1.1推送成功，未改remote/config/分支方式、未强推；PR16已确认Draft、远端10aa13f，本节提交之后继续普通同步。真实Free尚未验收，外部数据/账户/PAIA/物理/真人条件保持不变。

## 第十三轮：显式分页计数复用完整内容遍历（接182e96b）

原生及分片活动显式IDs分页在严格JSON完整字节遍历时取得顶层map数量，不额外分配全量键数组，不缓存facts或派生计数。scope/checksum/schema、marker、最终版本与guard不变。修复开发时误改mutate变量及独立审查发现的错误优先级问题；无效计数不能遮蔽原有损坏恢复错误。

最终完整Node462/0/0skip（含14项新计数合同），headless MV3 9/9、10k真IDB校准PASS。固定55源hash普通100k完整更新1377.8ms，功能PASS/1秒性能FAIL；首屏20577.5ms，比上一15762.7ms更慢，不能宣称整体达标。无fullread、单ref分页、原生节点/草稿/阅读保留。各自报告见free-round13-*，不合并旧结果。

合成包 `/private/tmp/vaiwl-free-delivery-round13-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `14fb2eab262a8804eebe48787e96f2cb6e982ca44111df5e8e8e99f405652f16`。下一实际位置：活动manifest的refVersions/sizes重复keys/entries/values遍历可合并，保持原字段/容量/错误顺序；不是外部权限阻塞。真实账户/来源/跨端/PAIA/物理与真人验收条件不变，Free尚未交付。

## 第十四轮：活动manifest结构校验减少重复枚举（接5f18bc1）

refVersions/sizes各自只生成一份keys并复用，字段校验过程中累计容量；去掉Object.entries二元数组及后续重复keys/values。原100k/128Mi、同键集合、版本、scope和错误优先级保留，16Mi公开校验及内部规范编码不改。独立审查通过。

新增59项在修改前基线通过；修改后evidence/manifest/counts组合110/0/0skip，10k真实IDB校准PASS。没有重复全套Node/MV3或100k；上一100k1377.8ms/1秒FAIL不可替换为本轮结果。包仍SYNTHETIC_ONLY，archive SHA256 `9c331c4e41361ed9990600000f2e85f21f249dc75bb4821b6263baf95f9c8061`，本轮报告free-round14-*。

下一局部位置为共享partitioned.saveMutation：新manifest先完整size编码再stable/hash，旧检查点再次编码已验证根；内部合并必须保留恢复回退、共享人工资产、同事务和故障回滚。真实账户/来源/PAIA/物理/日常验收条件未解除，完整Free未交付。

## 第十五轮：共享分片写入单次有界规范编码（接38726aa）

saveMutation内部新根将同一次规范编码用于16Mi限额和SHA256；公共同步/异步校验、512步yield、cycle/非JSON拒绝、128Mi聚合及事务回滚均保留。旧checkpoint完整哈希不改：当前接口缺同事务不可变envelope保证，未为性能引入可信hash旁路。

F1/shared组合57/0，随后补精确16Mi/+1和共享合法数组，新编码合同19/19单独通过（不相加）。真实隔离Chrome IndexedDB原20项分片合同20/20，记录的3源hash稳定；新增可复用tests/f1/partition-browser.mjs。没有重跑完整Node/MV3/100kUI。Node100k saveMutation交替6次采样的中位数83.9→72.2ms，仅诊断，不代表端到端；此前100k1377.8ms及1秒FAIL仍保留。

包SHA256 `c2015af073e55c099531c1ac8ab43fd37f6bf74bc8d1e93f0490d99366f0084c`，报告free-round15-*；仍SYNTHETIC_ONLY。下一本地位置回到100k原生活动更新关键路径：native manifest结构重复枚举/验证成本；不要继续把主要延迟归因于DOM或弱化最终CHECK。真实来源/获准账户/跨端/PAIA/物理与真人验收条件未解除，完整Free未交付。

## 第十六轮：原生manifest严格map类型及手动恢复（接4822a0f）

修复projects/refs真值primitive被当作空map接受的问题；校验keys只枚举一次，容量/版本顺序保持。native-partition-capacity补入持久损坏恢复分类，合法checksum但非法map的根不会退化为通用连接失败。用户必须点击修复，来源撤销/草稿保留/不重放发送。

最终native/encoding/counts/recovery组合92/0，含38项新合同；真实headless恢复旅程7/7，新增refs=true重签根反例并保留先前原生/活动损坏流程。未重跑完整Node/MV3或100k，不替换此前性能未达标记录。包仍SYNTHETIC_ONLY，SHA256 `15313c923ebd178a91dec1ac008b997794d6650fb03340b77c54d45d5725fbb9`，报告free-round16-*。

上一4822a0f推送连接75秒失败后停止，短只读检查恢复200，本轮完成后合并普通推送两项提交；实际同步以最终输出为准。不改remote或部署。真实来源/账户/跨端/PAIA/物理与真人验收仍缺条件，Free未完成。

## 第十七轮：Project增量依赖与最终IPC页大小（接87fa2ff）

Project版本变化会重新投影其已知成员及失去父项目身份的UNKNOWN聊天；项目不可用/恢复时聊天正确PROJECT→UNKNOWN→PROJECT，不丢可达性，不重拉无关NONE/其他项目成员。修复原先仅移除卡片却保留旧PROJECT引用导致missing-free-project-dependency的实际问题。

Free PAGE在broker末次权威校验/owner deadline处理后按完整响应UTF-8大小执行保留F1的16Mi IPC页限制；超限typed free-page-too-large进入既有有界二分，不放宽容量/预算。ASCII/UTF8反例证明输入页均合规但投影可超限；5000→2500+2500后全部引用原序完整。不是声称Chrome通道自身只有16Mi限制。

最终完整Node582/0/0skip，实际MV3 9/9，真实页面Chrome/IDB双向Project恢复与草稿/阅读保留通过。新逻辑2项、wire边界2项均包含Node总数。最大长ID HEADER另做真实MV3：100k共享refs+100k原生Projects、128字符ID，40,400,691bytes/941ms通过；小对照54,073bytes/116.5ms；未复现传输失败，不据此新增HEADER限额。该构建hash及限定覆盖见独立报告。

本轮修改前87fa2ff固定55源hash100k完整更新1178.1ms/首屏12189.7ms，功能PASS/1秒性能仍FAIL；此结果不冒称覆盖后来的依赖/IPC修复。新包SHA256 `568b281f26967ac2a10f1e532d0b5b23fe50ec3d75a1bbc98af664f1ef9b8d75`，仍SYNTHETIC_ONLY。下一具体位置：fixtureObserve的本地确认发送仍先workspaces.read/native.read全量，需复用单ref读取保留严格重复事件/路由/CAS门控；不把该本地缺口记成权限阻塞。真实来源/账户/跨端/PAIA/物理/真人验收仍缺原条件，完整Free未完成。

## 第十八轮：确认发送改用目标引用读取（接dab61e7）

fixtureObserve复用workspaceContext单ref和native.page目标引用，不再在分片模式先读全库。保留项目依赖、来源、全局版本/CAS/operationId与路由/账号guard。发现并修复旧truthy事件跳过漏洞：工作集预加载的另一ref冲突事件不再被当作幂等成功；只有与预期完全相同且未撤销的事件才能跳过，hint和native后续写入不会在冲突后发生。

最终发送/服务/运行时组合30/0；包含6项分片/项目移动/账号失效与9项冲突/分阶段CAS重试反例。实际MV3 9/9。10k真实页面Chrome/IDB三发送旅程通过，约216/215/214ms；100k测试预留2新增位置，99,998→100,000三旅程功能通过，但既有/新NONE/新Project分别1847.8/2280.1/2212.9ms，均1秒性能FAIL。55运行时hash稳定、全量read/snapshot均0、每旅程1次native发送/1事件/1hint、阅读和未发草稿保持。不是生产账户或物理弱设备认证。

测试修正如实保留：初次10k夹具漏fixture_v1导致orphan-event，补齐正常来源后通过；首次100k已满容量时新增被partition-capacity正确拒绝，随后只调整初始数量预留2位置，未放宽限额/断言。原始失败与debug在/private/tmp/free-round18-send-scale.json及free-round18-send100k.json，最终报告free-round18-*分别保存。包SHA256 `75f394fa0286c9ea81a32a042de5752ab41d1b78f996402b44f37bce12d4f1e1`，仍SYNTHETIC_ONLY。

下一已审查位置：Free readSnapshot早期CHECK只提前终止过时计算，可保留构建前续租、将唯一末次CHECK统一放在复用/重建分支之后且所有发布赋值之前；需要构建期间切账户/版本变化及零页回归，不能直接删最终检查。真实来源/账户/跨端/PAIA/物理与日常验收条件仍缺失，Free未完成。

## 第十九轮：Free界面统一末次发布校验（接ee7bc03）

移除构建前重复CHECK，保留构建前续租；复用及重建都在唯一末次scope/native/workspace/evidence校验通过后才发布，候选replica/index不提前赋值。Pro读取路径不变。

真实headless发布屏障7/7：构建期间scope/版本变化、隐藏/取消均不发布，首次空库存、零页复用和构建前续租通过。scope/空库存是transport注入，版本变化用真实native.apply；不是生产账户证明。实际MV3 9/9。100k发送3/3功能通过，既有/新NONE/新Project分别1824.9/2083.0/2046.8ms，均1秒性能FAIL；每次投影仅1个末次CHECK，全量读取0、各1发送/event/hint、草稿保持。单次诊断不声称统计提速；报告分别保留来源，不相加。

新包SHA256 `21827dbaf9a0d8ea35ae8fac232aa207c378b9e0e611681ef64fe2fdffbd37ec`，仍SYNTHETIC_ONLY。ee7bc03正常推送因GitHub 443连接失败未完成，最后确认远端仍dab61e7，不更换remote或循环重试。下一本地位置：共享分片旧checkpoint重复哈希，可在同一事务验证后立即put原envelope，依靠IDB同步克隆与事务回滚保留准确旧记录；不得接受外部可信hash。真实来源/账户/跨端/PAIA/物理与日常验收仍缺条件，Free未完成。
