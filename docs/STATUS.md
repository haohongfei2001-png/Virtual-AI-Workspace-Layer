# VAIWL实际状态：Free持续实施，真实验收未完成

## 当前持续实施（2026-10-13，正式桌面目录）

第三轮本地实现为 `7ac2e28`，第四轮在 `25e2ab2` 上继续，结果见末节；远端PR #16仍为已推送的 `b2a262b`。正常Git传输分别出现HTTP/2错误和443连接超时，第三轮实现及最终检查点尚未推送；见恢复检查点的“最后同步检查点”。未修改远端设置。

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
