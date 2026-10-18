# VAIWL 唯一开发计划：Free 完整交付 → Pro 智能增强

## 0. 正式采用与唯一执行入口

用户已正式批准将 **VA-HOST/1.1 FINAL** 完整纳入本计划。原 A–G、原任务 ID、Free/Pro 范围和批准 v2.7 产品目标全部保留；`.F`、`.P`仍只是原任务内的切片，不另建 Host、Free、Pro 三套计划。

正式开发位置仍为原目录 `/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer`、分支 `codex/vaiwl-free-first-20261013`、现有 Draft PR #16；base 保持计划 PR #15 的 `docs/vaiwl-v28-core-mechanisms-20261012`。本次整合核对代码至 `570a90638e5e7c73fb97a63626d7fd79c4deb8d5`；实施时使用当时最新 HEAD 和已有工作区成果，不回退至此提交或附件的历史审查基线。

四份完整正式附件存放于 `docs/specs/chatgpt-host/`：

| 附件 | 正式职责 | 原件 Git blob SHA |
|---|---|---|
| [VAIWL_CHATGPT_HOST_SPEC.md](specs/chatgpt-host/VAIWL_CHATGPT_HOST_SPEC.md) | 完整架构、16项问题修订、状态机、机制、逐文件集成与最终实测边界 | `16bbf7c09c3df8ae03c052b73878e1caee1c2a27` |
| [VAIWL_HOST_CONTRACTS.d.ts](specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts) | 完整类型合同、legacy shim、观察提案、权限和导航 DTO | `ec7259ac79f6f604358464b7bf8766fcf3f65096` |
| [VAIWL_OFFLINE_ACCEPTANCE.md](specs/chatgpt-host/VAIWL_OFFLINE_ACCEPTANCE.md) | 原81项及其子场景、独立oracle、变异检查和J1–J4完整旅程 | `59278cebac6b483f8a21ae9357561c793b692d3f` |
| [VAIWL_CODEX_HANDOFF.md](specs/chatgpt-host/VAIWL_CODEX_HANDOFF.md) | 原分支内的完整实施交接与边界 | `d2a2bcf0aa70e6cc8c45fb52d42830c4dcd6dfd9` |

附件按已批准原件完整保存。其中 Round60、2026-10-13、“本轮研究/未提交”等说明属于原设计形成时的历史语境，不是当前开发状态或撤销本次正式采纳；不得据此回退后续代码、重做已完成模块或要求用户再次上传文件。附件内的实施顺序是本计划原任务的细化，不具有独立路线地位。当前任务、依赖和优先级以本文件为唯一入口；生产 HostAdapter 的具体机制采用 1.1 FINAL，不再实施被其撤回的 VA-HOST/1 初版选择。

[AUTHORITY](AUTHORITY.md)区分本次文档写入与正在持续的 Codex 工程权限。此提交不修改产品代码、STATUS或工程证据，不认证任何新增运行时能力，不自动授权真实账户、原生写入、费用、merge或发布。

## 当前执行优先级调整（用户决定，2026-10-18）

当前同目标阅读/唯一返回/已知搜索已通过隔离完整MV3候选闭环；真实专用Profile已首装候选；原生query窄适配完成，滚动阅读返回空位与真实双frame挂载已取得窄证据；经现有返回入口后聊天投影可见；遮罩后滚动viewport命中缺陷已离线修复；最新真实账户接口403导致可信context阻塞。下一关口为合法账户接口恢复后的当前聊天阅读/返回/搜索，以及Project成员证据；继续不依赖真实context的工程。 已关闭离线C2冷启动及休眠返回HELLO/REFRESH传输失败后忽略新READY的死路，仍须新上下文和新握手；无新context的J4仍不成立，历史J2原失败继续独立定位。 partial busy-close已增加原子释放后一次新握手候选，联合L已验证；专用MV3尚阻于前置preflight，不能关闭其浏览器关口。隔离结果不升级LIVE_VERIFIED，原J2/J4及规模失败保留，10k/100k继续DEFERRED。

原A–G目标和退出条件不变。优先B1.F/C2/C3/C4/B4真实本人闭环：排除已授权专用Profile页面连接超时→合法账户/当前空间证据→一个真实Project/聊天映射→打开/唯一返回/搜索→安全恢复。沿用已授权只读范围；原生写入、凭据与私人正文不扩权。C2-only缺新可信context时安全等待，不恢复旧receipt、不伪造scope或无限重试。

当前布局实施顺序：先将独立reading遮罩与滚动viewport几何分离，随后验证阅读左上唯一返回槽和纯history列表边界，再组装真实profile闭环。任何一项未证实不打开生产scope；离线机制通过不代替真实MV3验收。实际结果只记STATUS及原证据入口。

10k/100k规模门禁及优化暂记 **DEFERRED**，不阻塞独立功能和受限本人试用准备；暂停CI自动10k与其失败诊断，测试源码、single-project的`memberReturnDeadline=performance.now()+30000`及历史FAIL原样保留。DEFERRED不是PASS、FREE-ACCEPTED或RELEASE-READY。改动相关小回归、构建、权限/撤权、数据完整性、草稿保护、基本导航继续；生产6秒请求与30秒/12请求/2重试等预算不变。

后续规模证据按以下边界分别记录，不替代或追溯改判原F1/SYS-04联合门禁：

| 记录 | 计时起止与前置条件 | 对应原指标及限制 |
|---|---|---|
| 首次渐进摄取 | 空缓存开始原生发现→首个可用映射；另记每次有界提交及已观察尾项 | 原首次启动/渐进可用；尾项不是完整索引证明，不以库存快照替代成员审计 |
| 独立完整性审计 | 完成摄取后、已记录revision上开始逐页读取→全部ID/成员/重复/缺失检查结束 | 原完整索引与成员正确性；原双审计及measurement前后同revision要求保留，独立计时不覆盖原30秒失败 |
| 已有索引交互延迟 | 经审计且revision稳定的索引上，用户导航/搜索动作→目标呈现/首屏可用 | 原F1导航p95<150ms、搜索首屏<300ms；冷摄取不混入已有索引样本，仍需足量样本及原环境记录 |
| 100k压力 | 单独记录冷摄取、完整审计、稳定索引交互与资源/异常恢复阶段 | 原100k容量/可靠性/性能目标全保留；未执行记DEFERRED，不用10k或合成单模块代替 |

以上是计时口径与现有要求对应，尚未实施或取得分段认证，不是新增计划或放宽超时。

## 1. 唯一产品目标与任务归属

- **Free**：不重设计现有界面；项目卡严格对应真实 ChatGPT Project，键为 `(scope, nativeProjectId)`，项目名和聊天行显示原生名称；确认无 Project 的聊天是同等重要的独立紧凑列表。范围/成员正确、活跃准确且可用、自动进入较早区间、已知历史不失联、原生功能完整、持久恢复共同构成完整产品。UNKNOWN 不等于 NONE；未加载历史保留原生访问通路。
- **共享底座**：账户/原生事实、证据、IDB、CAS、分片、恢复、搜索、工作集、用户手选片段、时间策略、性能和原生适配。已有非 AI 功能继续复用，不因分级删除或强制付费。优先正确映射，不要求首次安装已取得完整账户历史。
- **Pro**：在完整 Free 上优先为确认 NONE 的聊天提供 AI 虚拟收录、虚拟主题和派生标题；保留系列、智能拆合、人工纠错/锁/排除、显式跨 Project 语义投影、端/云模型和原高阶目标。未归类余项仍可见，原生名称/成员不改，旧 Pro 人工作品不丢。
- **独立可选能力**：代理原生改名/自动创建、VAIWL跨设备同步、PAIA数据协议、收费服务各有独立许可。它们不成为 Free 正常原生新建、搜索或宿主自然跨端更新的前置条件。用户点击原生创建入口不等于授权扩展后台写入。

[CORE_MECHANISMS_V2_8](CORE_MECHANISMS_V2_8.md)定义产品机制，[FREE_PRO_PRODUCT_SCOPE](FREE_PRO_PRODUCT_SCOPE.md)定义分级，[TECHNICAL_ARCHITECTURE](TECHNICAL_ARCHITECTURE.md)与[DATA_MODEL](DATA_MODEL.md)定义共享架构与数据合同，[FREE_PRO_ACCEPTANCE](research/FREE_PRO_ACCEPTANCE.md)定义FR/PR退出条件及81项映射。Host具体合同由上述完整附件细化；引用不建立第二计划。

## 2. 复用已有工程，只实现生产差额

B1–B5、C1–C5可独立部分及F1已有代码与原范围的合成Chrome/IDB/MV3证据，全部保留。`NativeRepository`、原生项目/成员三态、`FreeEvidenceRepository`、`freeProjection`、活动/跨度策略、共享目录和恢复已经存在；不再按PR #15形成时的旧描述重新新增整套Free模型和投影。旧Pro的Workspace/Placement/DisplayIdentity与Series仍保留，不能用它们伪造Free原生成员或原名。

生产差额在于：`simulator/adapter.mjs`、fixture service、identity/source gate仍是合成组装；真实入口、账户/context认证、元数据归约和生产挂载需要按VA-HOST/1.1接入。不能只换域名、把synthetic标签改为trusted，或把关闭AI视为完成Free。

必须直接复用：

| 已有工程 | 本轮接入方式 | 禁止重复或退回 |
|---|---|---|
| B1 broker、同库scope、CAS、operationId、guard/epoch | 新增文档握手/生产scope provider/typed ingress，保持原BIND检查 | 放宽topframe/账户门槛、用页面verified授权 |
| Native/Evidence目录、shared-directory reader/writer/迁移/恢复/retention | 在现有owner/codec上增加受限witness、观察锚和continuation | 第二数据库、第二refs全集、第二WAL/恢复引擎 |
| `free-header-loader.mjs`及`B23_FREE_HEADER staged:true` | 继续既有有序preparing、最终HEADER/PAGE/CHECK；生产zero-seed | 巨型单次迁移、preparing当空库、重做另一loader |
| `request-deadline.mjs` | 保留实耗时复核和6秒边界，生产transport复用 | 仅凭延迟timer放行超时回包、延长RPC换通过 |
| `FreeRuntimeService`的sourceFor/invalidation/readCached:false | 接生产reducer/inbox；保持同scope跨tab foreground优先与guard-loss释放 | 每frame全量读取、每次权限栅栏联网、第二全局调度器 |
| current-index、replica、有界页、纯instant缓存与校验缓存 | 消费现有接口，保持新读字节验证；一个owner索引供两个UI切片 | 用缓存替授权、两frame各复制100k、回退已完成优化 |
| 现有navigation/styles/icons、工作集、片段、人工偏好 | 抽宿主策略与renderer边界，保留legacy调用和旧人工格式 | 重画聊天、误迁移片段、删除Pro人工资产 |

以上是代码复用说明，不是第二份STATUS或新测试成绩。后续结果由实施者在既有状态/证据位置记录，本次不改写。D1/D2的1200模板影子预览保留原证据，不提升为通用自动分类；PR #14访客时间及覆盖UNKNOWN不外推为所有渠道不可行。旧65项v2.8验收和历史E1–E10/T1–T8映射继续保留，不强迫Free先完成Pro。

## 当前实施优先级校正（2026-10-17）

延续下述同一A–G/Free关口，当前集中关闭完整索引/成员审计与worker/peer scope恢复，按启动→工作空间识别→导航→活动→休眠恢复→返回组织候选。10k须完整ID与成员审计，priority tail仅为进度，不可替代完成；worker恢复须stop后新授权及实际VIEW，不接受frame旧缓存。定向回归稳定后一次冻结矩阵；J4在独立runner/profile/output中保持内部顺序，与其他CI任务并行，不启用缓存/产物上传。真实宿主只在用户指定的只读范围内核验，不打开未经验证的scope开关。实际已关/未关、同源码证据与耗时仅见STATUS，历史失败保留；这些是既有任务的执行校正，不改变验收标准或新建路线。

J4定位必须区分主tab与失败peer的证据归属；独立GET200/旧reason/其他tab ready不能代替该peer新receipt、新grant与VIEW。现有失败后检查选择实际失败目标，保持原旅程和认证边界；当前实测与未闭合窗口见STATUS。 已确证的旧HTTP尾事件只关闭对应receipt竞态，不等同peer自动恢复。完整审计的scope键扫描可在同事务分批，但不得提前选scope或减少全成员/双revision检查；小幅观察器节省不作为跨环境10k关口完成依据。

B1/F1 offset分页优化必须逐页保留全目录bucket和跨bucket ordinal校验、完整尺寸上限与原顺序，不能用只在首次HEADER验证替代后续完整性。仅减少重复目录构造，原完整成员审计及30秒总窗口不变；真实IDB局部改善不外推Host/p95，数值ID保持legacy Object.keys兼容。

B4.F/UI-11自动关闭继续复用现有prepare→worker检查→双frame清空ACK→release→新授权wake链。只在已有C3能力配置且非C2-only、已确认open→closed、明确clear输入风险与队列排空时提供一次机会；busy/失败消耗机会，不新增周期重试或scope开关。真实未知风险保持拒绝，离线销毁/唤醒观察不等于自然休眠原因、真实Profile或完整UI-11认证。

B2.F2取消重发按“浏览器未确认终态→有界认证operation读回→仅已确认failed/cancelled解除旧intent”继续验证；网络ERR_FAILED自身不证明取消，不授权重发或ACK。此loopback重建机制不自动开放生产profile。

当前恢复子关口已加入同一C2 runner的待命拒绝→新原生GET/READY→阅读返回正例及旧stop变异反例；只认证明确故障链，不扩大为自动scope恢复/完整J4。 初次mount注册等待期间的合法owned-frame终止属于同一一次新授权恢复窗口，必须保持旧start晚返回隔离及EXIT/权限拒绝/第二次中断不循环；实际J2结果不扩充为MODERN或全Free验收。10k跨环境完整旅程仍是未关闭关口：历史交接CI39078898821已完成双全量审计，但返回后成员展开耗尽原总预算；CI39083660931则收齐10000会话、首轮全审计通过、第二轮审计仍在执行时耗尽原预算。两次阶段不得混写，也不得沿用“会话未摄取完整”解释这些失败。 本批聚合隐藏目录让行及mount/wake就绪后消费已到达foreground；原游标、30秒/6秒和FOCUS授权检查不变。局部RED成立不等于Linux吞吐或真实peer恢复已关闭，仍须同源码完整旅程。 后续f29443a/CI39086077996正式样本截止仍PENDING_MEMBER、audit0，10000库存是失败后快照；该次不得写为预算内已完整摄取。48dd920/CI39087927722正式双审计rev206完整10000正确成员，但仅余819ms后项目卡渲染超时，整个原窗口旅程仍FAIL；不得将阶段改善写完整验收。本地接手实测及独立成员展开竞态修复继续记录于STATUS与原交接记录，不改变门槛。

## 3. Free执行顺序与原关口

**现在的第一优先级是 B1.F + B2.F1 + C2 的生产映射纵向闭环。** 先在自然checkpoint保全当前owner工作，完成公共合同/legacy shim及独立fixture，同时尽早执行C2/C5/F3的实际Chrome离线frame生命周期与声明式退出试验。随后完成空缓存→主体/context→真实形状的P/C与NONE/UNKNOWN→现有FreeUI→原生P/C/创建入口→唯一四格返回。不能再以追加十万级合成微优化作为开始适配的前置。

关键S测试受环境限制只阻塞相应能力验收，继续所有无依赖的离线编码；不得用全部NATIVE_ONLY/UNKNOWN宣称纵向闭环通过，也不得等全部UI完成才检查frame退出。

| 原关口 | 原任务集合 | 本次新增执行内容 | 退出条件与下一步 |
|---|---|---|---|
| FREE-CONTRACT | B1.F、B2.F1、B3.F、B5.F、C1.F1、C2 | 公共合同、无环握手、生产zero-seed组装、IDless可操作句柄；复用已有模型与UI；C2早期S退出反例 | 旧调用/资产兼容，正常IDless可收敛；不把仅类型检查当运行完成 |
| FREE-DATA | R0-00/01/02/03、B1.F、B2.F1、C2 | 先离线写完固定主体/context/目录/成员provider和正反闭环，再按独立许可执行固定G核验 | 有可持续、可复验且不需手工补文件的来源；G未运行不能标此真实关口完成 |
| FREE-ACTIVITY | B2.F2/F3、B4.F、C1.F2、C3 | 本人ACK关联、strict event、durable观察锚、近期dirty、自然跨端再发现与有界校准 | 新活动及时；60天旧项可逆下沉；校准期限不抹已ACK活动；无伪时间/无限等待 |
| FREE-EXPERIENCE | C1.F3、C2、C3、C4、C5 | 完整v2.7双surface、原生导航/搜索/新建/输入、原工作集/片段/跨度和来路 | J1–J3完整离线旅程；不是安全但残缺小弹板；不复制原生聊天 |
| FREE-ACCEPTED | C6、B4/B5回归、F1.F、R0-04/05/06、G1兼容 | 完成81项适用子场景/J1–J4，再完成指定G/U来源、跨端、原生全链、PAIA与恢复 | FR-01–15对应证据通过；严重漏列/误属/原生丢失/跨scope曝光为失败；核心能力不得“不适用” |
| RELEASE-READY | F3.F、F4.F | 最小权限、同源码可复现包、升级回退说明、实际日常/跨日记录 | 源码与全部证据对应；merge/商店提交/发布仍需独立授权 |
| PRO-ENABLED | B3.P/B4.P/B5.P、D1–D5、C.P、F.P及可选E/G | 完整Free后按后续授权推进原Pro目标 | 不为开发Pro忽略Free；不因商店等待重做Free；不擅自启用费用/模型 |

这些仍是原任务的验收集合，不新增H阶段。完整离线验收不是FREE-ACCEPTED；正式采纳设计也不是生产实现完成。

### 3.1 代码位置、依赖、owner与完成标准

下表是原任务的必要实施条目，不是额外任务编号。主规格§3–9给出全部机制与具体合同；模块名是责任边界，可按现有风格合并小文件，不引入新框架。

| 原任务 | 必须实施的代码面 | 依赖和可并行范围 | 完成标准 |
|---|---|---|---|
| B1.F、C2、F3 | `src/host/contract.mjs`、`chatgpt-adapter.mjs`及legacy shim；从`simulator/client.mjs`/`service.mjs`抽公共client-session/service-factory；新增production入口/静态UI资源 | 先稳定合同；公共client/service/build由唯一集成owner修改；纯类型/fixture可并行 | HOST_HELLO先于scope BIND；同一业务同时跑Synthetic/ChatGPT adapter；生产依赖闭包无seed/固定时钟/测试身份 |
| B1.F、R0-01 | `src/runtime/scope-authority.mjs`、固定session/roster/context provider；`src/b1/document-binding-broker.mjs` typed握手/UiGrant | 依赖文档合同；固定请求parser可并行；真实G独立许可 | peek不联网、refresh单飞；主worker/备隔离读取准确披露；正常多context能成功绑定，伪字段不能授权 |
| B2.F1、R0-03、C2 | `src/host/url-policy.mjs`、profiles、surface-discovery、native-actions；必要route/body关联 | 依赖B1文档合同；parser/DOM分文件并行，归属写入依赖scope | exactID与slug/renderKey分离；LiveNativeHandle→原生激活→exactID；PROJECT/NONE/UNKNOWN、同名/移动/分页正确且可达 |
| B2.F1、B4.F、B5.F | `src/runtime/host-observation-gateway.mjs`/reducer；既有native-facts/repository/目录codec | 依赖身份/观察合同；native codec和CAS由同一owner集成 | 所有producer进入一个canonical source但逐字段保留witness；局部版本/核验epoch收敛；不last-arrival-wins、不凭未见删除 |
| C2、C3、C5、F3 | `src/navigation/mount-surface.mjs`、现有navigation renderer分离；extension-origin workspace/sidebar frame、UiDocumentGrant | 公共surface合同后与parser并行；UI不重复持有全量索引；实际disable/uninstall尽早做 | manual双surface+限定声明式CSS mask；禁止HTML inert；原生弹层优先、无JS可关、私有残留不通过、唯一阅读四格返回 |
| C2、C3、C4 | 预计算NavigationPlan/dispatchNative、原create/search入口；现有focus/片段与来路调用 | 依赖真实目标handle、mount与scope；现有UI共享文件唯一owner | 同步决定default，actionId一次派发；无ACK不自动补跳；修饰键/Back/Forward及未发草稿保护；旧snippet格式不改 |
| B2.F2、C1.F2 | loaded-metadata/send-correlator；free-evidence及其codec、free-activity | 依赖身份/消息/body/ACK合同，纯parser可提前；evidence codec唯一owner | strict事件语义去重；observed-self-send无sentAt且始终provisional；due只校准、重开不重复；他人/失败发送不记本人 |
| B2.F3、B4.F、C3 | sourceFor/reducer inbox接既有FreeRuntimeService/FreeCalibration；SPA/列表dirty与跨端自然数据触发 | 依赖B2.F1/F2；复用同scope foreground、elapsed deadline和invalidation | 6秒/30秒/12次/2重试保持；预算跨lease/重启/多tab；上游变化与本地投影延迟分报，无隐藏聊天扫描 |
| B4.F、B5.F | NativeRepository同CAS写continuation/admission到native_operations；EvidenceRepository幂等完成；现有迁移/恢复/retention和staged loader | 依赖观察与evidence codec；共享仓库/迁移文件串行集成；不新建WAL或loader | 各中断点可恢复；不丢已ACK活动、不重放原生send/create/旧授权；Pro/humanRefs/工作集/片段保持 |
| C6、R0-04/06、F1/F3/F4 | `tests/host/`独立oracle/profile/正反/变异/真实MV3旅程；现有测试与构建入口 | fixture可与实现并行；先固定预期，后执行；G/U有许可后定向验证 | 81项及子场景逐项分账，J1–J4完整；正常profile不能全降级；实际源码/包/hash与证据绑定 |

### 3.2 并行、最小同步与优先级

合同稳定后可并行纯URL/元数据parser与send模型、DOM/actions/mount、独立fixture/oracle。共享broker/service/client/navigation、source与schema/Repository由唯一集成owner串行接线；发生文件交叉就收回该文件归属，不创建新worktree规避冲突。整个工作树只有一个Git writer。

Codex在原工作区正常fetch并吸收本次文档提交；如其本地尚有未推送或未提交成果，先按现有owner流程安全保全再整合，只解决自己的冲突，不reset/clean/force-push、不停其他开发者。不要将文档同步假称本地已自动加载或实现已开始。

新主优先级：公共合同与最早S退出门槛 → B1.F+B2.F1+C2闭环 → B2.F2/F3+C3/C4 → B4/B5+C5 → C6/F1/F3离线退出与固定G/U。F1的100k、4x、多tab、冷加载问题继续保留在原任务，不降低阈值；不再无限排在生产适配之前，也不要求已在写入的owner回滚。

## 4. A / R0：固定来源与最终实测，不重新研究产品

| 原ID | 归属/依赖 | 正式任务与完成条件 |
|---|---|---|
| R0-00 | 共享/Free；当前源码和许可 | 使用已批准1.1来源/接口profile，记录权限、未公开渠道和分发边界；不把第三方代码当官方稳定承诺，不再做第三轮全网/竞品研究 |
| R0-01 | 共享/Free；文档与身份合同；G独立许可 | 固定principal/context主备通道，A/B/unknown、多workspace、同URL切换、隐身分区及迟到响应；先完成真实本地认证fixture正反，最终G证明当前字段与关联 |
| R0-02 | 共享/Free；R0-01及活动source | 已加载消息/ACK/时间语义、旧样本与另一原生客户端活动自然再发现；不要求全正文/全历史，也不以访问或updated_at伪时间；G不足如实NOT_RUN |
| R0-03 | Free映射；B1.F/B2.F1 | 同名P、IDless→exact、成员/NONE/UNKNOWN、原生改名/移动/删除/分页和用户新建后置结果；与C2共用一次闭环，不把Pro跨项目虚拟聚合当Free依赖 |
| R0-04 | 共享；C2/C3/C5/F3 | 最早在隔离真实Chrome执行manual surface/iframe/声明式退出/disable/uninstall；随后SPA、原生五格、重启/重载/freeze分别验证；已有合成证据保留，G仍需实际宿主 |
| R0-05 | 共享兼容；R0-04及获准真实PAIA构建 | 无扩展/各自/共存/反向加载，输入与浮板/捷径不争抢；不是数据协议，不修改PAIA或读其库，缺条件只阻塞该验收 |
| R0-06 | 共享；R0-01–05逐项结果 | 汇总支持profile完整能力、81项和固定G/U结果；不用笼统R0通过替代来源、时间或退出证据；严重核心缺口不能改不适用 |

既有[R0任务书](experiments/R0_CAPABILITY_SPIKE.md)保留历史范围与动作预算；本次生产具体路径采用1.1主规格§11的固定实测清单。真实账号/发送/移动/创建必须有对应许可与任务级总预算，不能跨目录/Profile重置。历史R0拒绝不绕过，G缺失不妨碍全部无依赖离线工程。

## 5. B：共享事实与Free先行，Pro资产不丢

| 原ID/切片 | 依赖 | 必须交付及复用 | 退出证据 |
|---|---|---|---|
| B1.F Scope/引用 | 原B1；VA-HOST文档/身份合同 | 按§3.1实现HOST_HELLO、principal/context、peek/refresh、receipt gate与独立UiGrant；保留现有scope/CAS/lease/epoch，生产授权不由页面提供 | SEC-01–12、相关MAP/SYS、原B1回归；G由R0-01证明 |
| B2.F1 获取/原生更新 | B1.F合同；R0-03 profile | 复用NativeRepository/FreeProjector，追加生产P/C渐进发现、可操作无ID句柄、成员三态、统一reducer、局部witness/coverage和撤销/可达状态；不是重做Free模型 | MAP-01–15、INV-01–09；FR-01–04与对应G |
| B2.F2 时间与决策 | B2.F1、B1.F、R0-02合同；不是性能F1 | strict事件原始语义、本人ACK、semantic去重、durable LocalSendAnchor、无日期RecencyObservation；复用ActivityDecision、项目max本人、NONE自身分段和完整H | ACT-01–17/19/20及SYS-01/03，FR-05–10；真实语义G独立 |
| B2.F3 有界校准 | B2.F2及受支持source；不是同步F2 | 复用sourceFor/FreeRuntimeService/FreeCalibration、跨scope边界/同scope跨tab优先；自然SPA/列表/前台/跨端dirty触发，预算跨lease保持，不要求用户文件维护 | ACT-15–20、INV/SEC相关反例，FR-07/08；无源不伪updated |
| B3.F 用户显示偏好 | B1/B2及现有偏好/renderer | 固定/开合/范围、工作集/片段及旧格式保持；Free只用原名，不从Pro identities/placements推成员，拖动不虚拟改原生 | FR-04/10/13/15、UI-17、SYS-03及原人工资产回归 |
| B3.P 虚拟组织/命名 | FREE-ACCEPTED、D1/D2、后续许可 | 保留Workspace/Placement/DisplayIdentity/Series、人工include/exclude/lock、单窗口/空虚拟主题/拆合/redirect；不得向原生写回 | PR-01–07及旧N28/T28相应目标 |
| B4.F 并发/生命周期 | B1/B2/B3.F合同；随纵向接线开展 | 保留20秒lease、6秒elapsed deadline、CAS/幂等/inverse及同scope foreground释放；增加跨producer核验epoch、一次导航派发和两仓库publication/continuation | SEC-06/12、UI-11–15、SYS-01/02及原B4/B5回归 |
| B4.P 语义计划事务 | B3.P、FREE-ACCEPTED、后续许可 | 候选接纳、拆合/命名CAS与人工冲突；不是原生移动 | PR-03/04/06 |
| B5.F 迁移与恢复 | 原同库owner；B1/B2/B4新codec | 保留已接线shared/native/evidence目录、staged header、hash/旧reader、人工备份；新增witness/observed-self-send/同CAS admission-continuation，恢复不复活授权 | SYS-01–04、INV-07/08、SEC-10/11；FR-12及全部旧损坏/撤权/配额反例 |
| B5.P Pro恢复 | B3.P/B4.P及后续许可 | 拆合/别名/负约束恢复，降级不删除、回Pro重核验 | PR-03/07 |

现有数据库版本在本次源码核对为3；下一版本按实施时真实代码分配，不在文档抢占号码。新增字段必须进入真实codec/hash/预算/事务/迁移/GC验证；不能只改类型声明。合成事实不批量升级生产来源，旧人工作品不可丢失。详细字段与提交机制见DATA_MODEL及主规格§8。

## 6. C：完整Free产品体验，不以降级替代目标

| 原ID | Free交付内容、依赖和代码面 | Pro后续保留 | 退出条件 |
|---|---|---|---|
| C1 | 复用现有Free卡片/原名/NONE/UNKNOWN；B2.F1接真实来源，B2.F2接活动与旧窗口，B3.F接固定和H7/14/30/60/90自动/手动；不重建UI | 虚拟主题/派生名/拆合交互后置 | FR-01–10/14、UI-08/10；三列/5行+12/主页不折叠/左侧旧项/当前无向上全部保留 |
| C2 | 优先与B1.F/B2.F1做纵向切片；manual双surface/UiGrant/声明式view mask、真实P/C导航与原生新建/搜索；提前实际S退出 | 明确虚拟主题启动与独立E授权动作后置 | UI-01–16、MAP-06、SEC-09；唯一阅读四格返回，原生消息/composer/tool/menu不复制、不受损 |
| C3 | 现有工作集/现场/H/T/Z和来路；原生Back/Forward、同目标body proof、输入焦点；不保存宿主草稿/运行态 | 多虚拟Placement来路、Series工作集 | FR-10/11/15、UI-02/04/06/15/17；历史视图不被新策略重解释 |
| C4 | 已知原始名称/别名、工作集/片段/未知库存搜索；保留原生完整搜索/目录和末尾可达；沿用旧snippet格式 | 虚拟名/语义/跨主题查找与redirect | FR-03/04/07/14/15、MAP/INV可达、UI-16/17；本地索引不冒充全历史 |
| C5 | 深浅/窄屏/200%/keyboard/物理IME、iframe字体token、双sidebar/rail/虚拟列表/原生portal及生命周期故障 | AI/会员额外交互后置 | UI-06–17、原生五格、S/G/U分开；安全但残缺不算v2.7完成 |
| C6 | 81适用子场景与J1–J4离线完整旅程，继而固定G主体/context/ID/NONE/本人时间/旧样本/跨端/真实全链/PAIA/日常 | Pro质量和语义闭环叠加 | FR-01–15和FREE-ACCEPTED；正常profile不可全UNKNOWN/NATIVE_ONLY，缺G不得宣称完整Free |

H自动选择是原Free非AI共享功能，完整保留核心§4的统计、手工锁/冷却/驻留/撤销等规则，不移Pro、不等待全账户精确时间才允许手选与导航。原生输入、模型、工具、文件、弹层、快捷键、运行状态和未知新入口继续由ChatGPT持有。限定CSS mask的允许范围见TECHNICAL_ARCHITECTURE及主规格§7，不等于重新绘制聊天或永久禁用原生。

## 7. D / E：AI后置与独立原生操作

| 原ID | 归属/依赖 | 保留的完整目标与完成条件 |
|---|---|---|
| D1 | Pro；FREE-ACCEPTED后实施 | 中文独立自然语料、主题/任务/系列/标题，按用户/事项/时间隔离；原1200模板保留为结构反例，不是自然gold |
| D2 | Pro；D1/B3.P/B4.P | 无项目聊天自动虚拟收录/命名，稀疏召回、解释/UNKNOWN、人工纠错/lock/排除；shadow→建议→经质量门槛允许自动应用；保留拆合及显式跨Project高阶投影 |
| D3 | Pro可选；D1/D2、设备条件 | 端侧模型中文质量、下载/内存/耗电/失败回退；不得要求Free加载模型 |
| D4 | Pro可选；D1/D2、独立云/费用授权 | 最小证据、预算/缓存/撤权、账单和质量分开验；无凭证不得假调用 |
| D5 | Pro；D2/实际启用模式 | 原生/规则/模型同任务比较，precision/coverage/命名接受/纠错与稳定性；Free自己的日常收益由C6/F4测试，不依赖D5 |
| E1 | 独立可选原生写入；B4/R0身份目标/额外许可 | 原改名旧名→新名、计划/次数/时限/可信审阅保留；创建Project授权独立，无派生权限自动升级 |
| E2 | 同上；E1/已验证通道 | 确定性唯一目标、串行、真实post-read、FAILED/UNKNOWN，未知不盲试；不调用未证实内部API |
| E3 | 同上；E2 | 有限批次、部分成功、暂停/撤权/冲突撤销；跨run预算、已建不自动删；不是Free原生按钮可用的前置 |

本次Host文档采纳不开放Pro AI、收费、自动原生writer或上述新模型调用。

## 8. F / G：保留全部目标，消除误依赖

| 原ID | Free/共享路径 | Pro/可选路径与许可 |
|---|---|---|
| F1 | 保留1k/10k/100k、长中文、none-heavy/mixed/单大Project、原名/成员/活动增量、多tab/4x及实际弱设备；复用最新目录/foreground/elapsed deadline。既有失败保留，优先级在生产首个闭环之后，不无限前置 | Pro启用后测模型/虚拟图/5H/拆合；不得使Free依赖D |
| F2 | 非Free发布必要条件；本地备份/跨标签一致仍属B；ChatGPT另一客户端活动再发现属B2.F3/R0-02，不是VAIWL同步 | 同步服务/加密/密钥/tombstone/设备撤权/离线冲突按独立授权保留 |
| F3 | 构建/最小权限/静态依赖闭包/真实MV3生命周期前置准备；最终退出依赖C6.F+F1.F+来源/权限确认，交付可安装包、隐私/升级/回退/商店材料 | Pro会员/价格/结算/供应商后续批准；不以ChatGPT订阅决定VAIWL权益；发布仍另批 |
| F4 | C6/F3候选后的真实日常、低维护、误放/误藏/纠正延迟、跨日/设备；保留找回改善与纠错成本目标 | Pro额外收益/模型漂移再按D5测 |
| G1 | 实际PAIA共存仍为R0-05/C6兼容门槛；不实施数据接口也需验证 | 最小数据协议/双方许可/版本白名单后续可选，不共享私有DB、可写owner或品牌视觉 |
| G2 | 已用宿主/分发资格在R0-00/F3定向核对，不重开全面研究 | 官方身份/用量/商业能力研究保留；缺高级集成不挡Free独立工程 |

## 9. 执行、验收对应与安全提交

### 9.1 81项和16项修订的正式归属

81项完整正文仅在正式验收附件维护；[FREE_PRO_ACCEPTANCE](research/FREE_PRO_ACCEPTANCE.md)提供每项ID到原任务/FR的逐项对应，不复制第二套相互漂移的预期结果。分组为MAP-01–15、INV-01–09、SEC-01–12、ACT-01–20、UI-01–17、SYS-01–08，总数81；J1–J4是这些ID组成的完整旅程，不计为新增四项。所有子场景均需结果，不能拿一项PASS覆盖同ID另一个FAIL。

主规格A01–A16是设计问题登记，不是新增工程A阶段任务：A01/A06归B1.F；A02/A03归B2.F1+C2+C6；A04/A07/A08归C2/C3/C5；A05归B1.F/C2/C4/F3；A09/A13归B2.F1/B4/B5；A10/A11归B2.F2；A12归B4/B5；A14归B5/F1；A15归B2.F1/F1；A16归C6/R0-06/F3。其原严重程度、修订结论和全部机制完整采用，不重启设计反证审查。

### 9.2 完成表达与持续执行

继续使用READY、IN_PROGRESS、IMPLEMENTED_SYNTHETIC、LIVE_VERIFIED、BLOCKED、DEFERRED_PRO。旧证据只认证原源码/环境/能力范围，新增Host不得借其直接DONE。L/D/S/G/U与WEB_MECHANISM_ONLY分开；没有实际运行的标NOT_RUN。类型声明编译、文档写完、原100k通过不等于Host完成。

每项完成即由实施者记录自己的源码/测试/失败/下一原任务并继续。缺具体S/G/U条件只拦相关验收；继续全部无依赖Free工程，不反复重建模拟器、重跑全R0、请求用户周期性补文件或提前转Pro。正常支持样本必须完整成功；严重身份、NONE、本人活动或安全v2.7缺口不得以大面积降级掩盖。

本次文档固化不改STATUS/测试结果/产品源码/既有工程证据，不声称Codex本地已自动同步。实施者继续维护原状态与证据入口。本计划与附件的采用不意味着允许真实账户测试或发布；固定G/U动作仍按AUTHORITY单独许可。

### 9.3 Git与并发边界

直接在现有Free分支/PR #16继续，不另建仓库、工作树、模块分支或额外PR；原堆叠#1→#5→#6→…→#15→#16和实验#2–#4历史保留。不得要求其他执行者停工、回退或重新建立环境。

文档写入以写入前实际HEAD为父提交，核对所改路径当前blob；只修改自己获准的文档，非强制快进并使用expected-head。若并发有新提交，吸收最新tree、核对文档变化后重建自己的文档提交；不覆盖代码、STATUS或证据，不强推。将来纳入main仍需独立批准，按依赖回归/合并/重定向，不以强推跳过父层。

FREE-ACCEPTED要求FR真实证据完整、数据能力范围明确、无未处理严重错误、完整Free不依赖AI/费用/手工文件维护；RELEASE-READY另加F3/F4，PUBLISHED仅由批准的实际发布记录证明。保留Pro不表示本轮开发Pro。

## 10. 原目标编号和数值保留

历史评估E1–E10与工程E阶段同名但不是同一对象：E1数据渠道、E2范围、E3原生、E4兼容、E7稳定、E9性能、E10恢复属于Free/共享；E5命名98%精确/90%接受和至少1k合格语料归Pro；E8安全原生改名归可选E；E6找回改善30%、周纠错≤2分钟由Free C6/F4先测，Pro D5另测。10k导航p95<150ms、搜索首屏<300ms及100k压力目标保留，报告环境和首次/增量/最坏值，不用旧快照或单次快样本代表新版全部达标。

T1日历窗口扩展5H；T2时区/DST/会话；T3可信原始证据与显示估计分层；T4原生Project唯一段/无项目按自身分段；T5卡片/父子/原生成员；T6未知/旧/固定/current不失联；T7跨度/返回不改原生history；T8原生五格/PAIA继续。旧自由主题的T4/T5作为Pro附加测试保留。所有数值仍为相应阶段待验证目标，不因本次正式文档采纳变成已测成绩。
