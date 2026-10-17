# 技术架构：Free原生事实投影与生产HostAdapter

本Canonical已正式采用[VA-HOST/1.1 FINAL完整工程规格](specs/chatgpt-host/VAIWL_CHATGPT_HOST_SPEC.md)、[类型合同](specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts)、[81项验收附件](specs/chatgpt-host/VAIWL_OFFLINE_ACCEPTANCE.md)和[Codex交接](specs/chatgpt-host/VAIWL_CODEX_HANDOFF.md)。唯一执行路线是[DEVELOPMENT_PLAN](DEVELOPMENT_PLAN.md)原A–G；本文件与附件不是另一份开发计划。四份原件保留其历史审查日期/基线/证据说明，当前实施必须继承最新Free分支代码，不回退到附件基线。

本次文档整合不修改运行时、STATUS或工程证据，不把设计采用、原合成成绩或Web机制probe当作生产接入完成。Free/Pro范围、批准v2.7和安全权限继续按现行Canonical执行。

## 1. 同一扩展、同一数据库、两个展示出口

```text
ChatGPT原生页面 / 正常加载元数据 / 真实原生控件
  → ChatGPTHostAdapter
  → DocumentBinding + ScopeAuthority + owner receipt gate
  → 单一HostObservationReducer
  → 既有NativeRepository / FreeEvidenceRepository
  → FreeRuntimeService / FreeProjector / ActivityDecision
  → 既有Free renderer、搜索、工作集、片段
```

Pro在共享事实之后另接EvidencePack→Candidate/Model→ConstraintReducer→VirtualTopic/DerivedTitle→ProOverlay。Free不能调用模型、读取Pro派生标题/虚拟成员、依赖会员请求才能显示；降级只停止Pro出口，不删除共享事实或Pro人工作品。

VAIWL是原生页面映射层，不是重建ChatGPT账户历史的独立聊天系统。Project卡=(scope,nativeProjectId)，Conversation行对应真实C，原生消息/composer/model/tools/files/menus/运行状态归ChatGPT。渐进发现、增量补充和有界校准成立，不以首次安装得到全历史或下载所有正文作为前置；原生未被发现的历史访问通路必须保留。

## 2. 实际已有模块与生产组装差额

现有Free原生项目/成员、Free投影/活动/时间策略、Native/Evidence/Shared目录、CAS/恢复与UI已经存在。`state.mjs`的旧INGEST和Pro Workspace路径不是生产观察的替代入口；不能据旧文档重新开发整套Free，也不能把synthetic字符串替换成trusted就认定接入。

`simulator/adapter.mjs`/host/service仍是合成组装：syntheticURL、scopeOf、nativeSeed、persistentSeed、FIXTURE_NOW及hf控制只能留测试目标。公共client/service从现有文件抽取并保留旧export wrapper；生产注入ChatGPTHostAdapter、真实时钟、固定provider、transport和zero-seed仓库组装。

继续复用当前`FreeRuntimeService.sourceFor`、`publication:'invalidation'`、`readCached:false`、replica/有界页和一个owner索引。workspace/sidebar不得各自创建100k全量副本。共享目录reader/writer/迁移/恢复/retention、`free-header-loader.mjs`的staged HEADER、`request-deadline.mjs`实耗时检查、同scope跨tab foreground优先及guard-loss释放、纯instant缓存和fresh-byte校验均已存在，不另建loader、调度器、事务引擎或hash算法。

## 3. 公共接口、初始化和传输边界

包内新增职责集中于`src/host/`的contract/url-policy/profiles/chatgpt-adapter/发现/元数据/发送关联/native-actions/mount-controller，以及`src/runtime/`的scope-authority/gateway/reducer/client-session/service-factory；小职责可合并，不引入新框架。实际逐文件集成与依赖见唯一计划§3.1和主规格§9。

初始化固定为：HOST_HELLO仅验证Chrome sender、topframe、documentId、实际origin/route→发DocumentBinding/producerToken→adapter.start({binding,emit})→独立认证principal/context→原严格BIND/20秒lease开放相应scope库及UI。HELLO不能读取私人缓存；授权前仅有限RAM提案，切换后重扫，不把旧提案贴到新账户。body proof与路由单独建立。

保留旧`inspect().history/header/reading/navigationSlot`、`projectCreateHref`及同步`openNative(url,MouseEvent)`shim；新UI跨realm使用预计算NavigationPlan/dispatchNative，不能序列化Event/Element。旧片段`{refId,messageId,branchId,text,bodyHash}`及`{ok,reason}`保持。nativeHref校验失败不得回退rawURL。静态类型通过还须真实调用/严格schema回归。

ObservationProposal只携带文档/producer/seq/epoch/profile/kind和白名单数据，禁止客户端scopeKey/verified/actorVerified/channel/canonicalRevision。owner分配并验证receipt；locator、profile名、nonce和随机handle均不是认证凭据。建议入口同时限制64KiB UTF-8和256实体，在途队列文档256KiB/scope1MiB；身份撤销和确证ACK优先，重复标题/列表合并，溢出背压并留gap，不能丢确认发送或宣称完整。

## 4. 主体、workspace和来源权限

`ScopeAuthority.peek(frame)`是纯本地热路径栅栏；`refresh`只在bind/focus/expiry/auth-change有限触发、单飞去重。保留broker/Repository前后scope校验，不每次PAGE/guard联网、不在IDB事务await网络。20秒lease不是实时账户认证保证，续lease不自动刷新活动时间或重置来源预算。

主认证provider在worker执行包内固定第一方session读取，限制origin/endpoint/method、正常凭证策略、no-store、6秒、redirect/MIME/schema/字节。备选是worker challenge的包内隔离世界固定同源读取器，通过自身runtime回最小结果，不是MAIN auth bridge，不接受网页指定URL/JSON/token。主通道token仅worker RAM；备通道确需固定accounts查询时，可在隔离闭包短期使用并准确披露，不能传MAIN/UI/日志/DB。不得要求用户复制cookie/token。

principal与当前context分别证明，采用主规格的三种ContextProof：实际存在且语义确证的认证active-context；认证roster+Chrome正常native request context+当前页面关联；唯一个人context加已验证默认绑定语义。不能假设有服务器签名的当前tab API，不选roster第一项，不用昵称/头像/DOM字段/选择cookie补权威。

多context的只读webRequest路径仅在所需权限获准时启用：精确native域/path、浏览器document/frame/requestId/initiator和一个context header，关联正常响应及当前对象，排除prefetch、扩展自己核验请求、旧epoch和冲突；丢弃其他headers，不读取requestBody，不使用blocking/extraHeaders。它证明请求关联，不单独证明账户或本人发送；内存缓存无事件的情况必须覆盖。实际当前字段/凭证/关联可用性由固定G验证，未建立时ambiguous，不显示错误缓存，也不能把全部拒绝当完整Free成功。

信任浏览器、本扩展包和明确的第一方认证边界，不承诺抵抗被完全控制的源站/浏览器/扩展。任意页面字段不可提权；任何切换线索可收紧/撤销权限，不能直接授权另一账户。正常/隐身分区、principal、context、document/selection epoch独立，不跨分区读取缓存。provider/profile权限、live grant、持久source generation、事实freshness、revocation分离。

## 5. 渐进发现、统一事实归约和版本

URL先验证HTTPS、exact origin、端口、userinfo、编码、长度和语义query，再提取ID。`/c/`不给NONE，`/g/`可能是customGPT；exact Project ID从已证grammar或加载元数据取得，不假设固定32hex、不同名合并或以slug作主键。分享/temporary/新空聊不回退近期第一条。

无ID/href的实际原生按钮用WeakMap中的LiveNativeHandle表示，绑定原节点/fingerprint/document/route/region epoch；renderKey是临时显示键，不持久化假nativeID。用户激活一次后，从正常路由/metadata关联exactID并提升为正式对象；原节点重建旧handle拒绝，不按名字或行号重找。正常支持样本须最终收敛，不能永久候选充数。

只读已识别的活动原生列表、当前Project成员区和当前body；排除消息正文示例链接、隐藏旧DOM和第三方UI。NONE要求明确无项目语义，missing/未解释null/无badge不推NONE；UNKNOWN保留原名与原生可达路径。成员移动更新同一C，不复制，不使用Pro虚拟MOVE更新原生事实。

各DOM/metadata producer先经一个HostObservationReducer，再写现有scope的canonical source。每字段仍保留owner receipt/profile/producer/verification epoch，不因统一source抹平来源信任。sourceRevision只表示本地提交次序，fieldRevision和memberSetRevision是局部版本；无关Q改名不影响P成员见证。上游revision仅在同域且语义已证时比较；不可比较冲突先UNKNOWN，再由当前对象新核验epoch收敛，旧epoch不得推翻新确认，不last-arrival-wins。

CoverageDomain按项目目录、近期列表、某P成员、某C消息及筛选/排序/分支分别记录。partial、扫描到终点、完整一致快照不混同；虚拟卸载、未见、TTL、一次404不等于删除或撤权。同scope仍获准的last-known对象可达但不得冒充当前已核验；明确撤权隐藏相关敏感数据，资产本身不因源失效而清库。

## 6. 活动来源、自然更新与校准

消息元数据优先来自正常已加载的明确DOM/JSON/loader字段；只读白名单own data，不eval/getter/React fiber/全bootstrap。获准当前C窄读取可能返回正文，必须说明实际读取范围，不能宣称已有metadata-only API；不扩展成全历史遍历。JSON/SSE/NDJSON分别解析，opaque状态不解码，revision/status/HTTP Date/updated_at均非本人原始发送时间。

可选response tap只旁路宿主已经发出的获准请求，保持原fetch receiver/参数/原Promise/错误语义；clone分支有预算和取消边界，异常不影响原流。不满足性能则关该tap能力、使用已加载或获准窄来源，不加另一套后台抓取器。

route只证明导航请求，当前消息需要body proof；多ID块分别关联。role=user/会话owner/MAIN自报作者均不自动证明本人。strict UserSendEvent需要本人、持久消息身份、new-send/确证ACK、原始时间语义/精度及scope/body关联；气泡/HTTP200/整个流complete/点击按钮不足。

本地确证ACK但没有原始时间时，使用新版本evidence codec中的durable `observed-self-send` LocalSendAnchor：firstObservedAt、本机有界区间、ACK witness、clockBasis和calibrationDueAt。始终provisional，禁止sentAt/serverTime；校准期限不删除已ACK活动，重开不续起点，随H自然变老，误配/失败/撤权可撤销。旧短TTL hint保留原语义，不批量升级。本机时钟异常不能伪造日期。

事件语义键基于scope/C/message，不含这次observedAt或current branch leaf。重复打开复用原immutable event，lastSeen/witness另存；谱系固定到该消息，parent缺失/循环为partial，同消息时间冲突隔离，不挑最大值。RecencyObservation只有baseline/order/newID dirty，无日期，不把首次发现或改名/置顶当新发送。

复用FreeRuntimeService/FreeCalibration：6秒请求、30秒轮次、12请求、最多2重试，同scope/source预算跨lease/重启/多tab不归零。真实发送和当前项优先，源不支持即有限结束；已知旧锚可逆下沉，无日期仍可达，不无限spinner。原生SPA/列表/当前对象/前台变化触发校准；其他设备活动只有桌面native自然可见后才吸收，上游延迟和本地1秒投影目标分别记录，不伪装VAIWL同步。

H∈{7,14,30,60,90}、T/Z/ViewSession、自动密度选择/驻留/冷却/撤销与人工锁按核心规范完整保留，Free无AI依赖；不回投今天lastSend伪造历史密度，不复制五份100k集合。

## 7. 完整v2.7挂载、原生导航和退出

采用扩展origin静态UI frame承载缓存工作区与连续侧栏，同一MountSurface管理两个manual Popover，共享owner session/index和有界DTO。frame字体/主题从白名单token提供，不假设继承宿主，不读取私有字体资源。原render/styles/icons/5行+12/三列/历史/H/工作集/片段全部复用，不缩为安全但残缺弹板。

**1.1 FINAL允许的唯一原生视图遮罩**：对经过证明的独立reading根和纯history列表根加非私人opaque marker，以浏览器真实`:popover-open`和准确native-open排除条件驱动最小CSS visibility/interactivity。不得写原生HTML inert/hidden/aria-hidden/display，不移动/克隆原生DOM或覆盖handler；composer、模型/工具header、文件/权限/账户/其他入口不得被mask。关闭或移除自有surface后selector自动失效。原版auto Popover和“完全禁止一切限定背景CSS”的冲突方案不再执行。

frame外、同popover树内保留声明式关闭button；manual本身不自动ESC/轻点外部，正常运行只处理owned UI层级ESC，不吞native/IME事件，无JS退路为可聚焦原生关闭控件。native dialog/menu/权限/Canvas优先，自有surface与mask一同suspend；不得只见隐藏role=menu就判打开，不把自己的第二surface当native层。自有mask/marker不触发body失效拆挂循环；派发被自己mask的native anchor前先解除mask再复核。

侧栏覆盖安全纯history区域，native顶部新建/搜索/项目目录/其他入口与账户footer保持；frame外“显示原生列表”声明式关闭恢复未发现历史通路。它不是第二个工作区返回。阅读区左上唯一四格返回按v2.7保持，不因header不足搬到侧栏/rail或增加重复按钮；正常profile必须完整成功，无安全位的故障profile才能退让。

UiDocumentGrant通过静态UI runtime与owner iframe.contentWindow的双通道一次配对，加Chrome parent/ui document/frame、mount、scope/lease检查；key只是关联。WAR仅静态壳和必需assets，无数据/备份/token；私人投影不进page postMessage。CSP失败不改宿主CSP、不用page ShadowDOM泄露缓存兜底。

导航在点击前生成NavigationPlan，普通委托同步preventDefault并按actionId派发真实native控件一次；异步RPC不转移user activation，未知ACK不自动补href/再点。纯href保留浏览器默认、修饰键与中键；同路由还需body一致。没有native anchor且有未发/上传/生成/Canvas风险或风险未知时，明确新标签真链接保留当前内容；不整页卸载、不复制草稿、不pushState假SPA、不调React私有router、不改native Back/Forward。

新Project/全站新聊/P内新聊走真实原生入口，只有后置结果才入库，取消不建假对象；无当前P内入口先P导航，用户继续原生流程，不后台多步创建。焦点支持input/textarea/contenteditable，节点/Range仅RAM；原节点失效不回写旧草稿。片段只收明确选区，保持旧格式和2000字符边界，多ID歧义退原生搜索。

disable/uninstall、受控退出、worker stop/restart、freeze、重载各自验证，分报nativeOperable、privateProjectionAbsent、cleanLayout。可手动关闭不能使私有画面残留通过；不得假定cleanup必运行或frame必消失。实际S生命周期测试最早安排，机制probe/adapter.stop不代替真实禁用。无法满足的完整profile不得发布，大面积NATIVE_ONLY不算产品完成。

## 8. 同库提交、迁移与恢复

当前DATABASE_VERSION=3；具体新schema/codec版本由实施时owner按最新源码选择，不预占或另建库。继承B1/B23/native/evidence/shared已有store/目录、20k旧表/16Mi单记录/128Mi聚合/100k边界及既有有界页，新增字段进入hash/容量/GC/迁移/旧reader验证，不改变旧hash算法或checksum。

native和evidence保持独立提交，但观察continuation及最小admission必须与native delta在同一次`native_states/native_operations` CAS事务内写入；不能native先commit再另写收据。使用稳定evidence operationId幂等提交后标complete。pure-evidence输入复用evidence receipt，不额外空写native。

正常worker重启取得新scope grant后，凭原子接纳的admission/profile/version/sourceGeneration/语义指纹和payload digest、未撤销source补观察，不必重新寻找丢失RAM receipt；备份恢复、source失效或admission缺失进入needs-revalidation。绝不重放原生send/create或旧授权。continuation按单条64KiB/scope256条且1MiB初值有界，pending受retention保护，溢出背压不静默丢确认活动。

UI保留native已更新/activity仍pending的语义，用组合revision和最终CHECK确认，不声称跨库原子。沿用现有staged HEADER仅完成所需阶段、同scope/进度约束、最终完整页，preparing不是空库存或READY；生产不能借native-bootstrap执行seed。新codec超过预算只在现有owner内有界改造，不重做loader、不延长6秒。

Free↔Pro、升级/降级、备份/恢复保持人工title/aliases/placement/locks/workingSets/snippets/humanRefs/preferences及CAS/inverse。恢复不是授权，源/模型/原生动作不复活；旧reader拒写而非忽略新字段覆盖。source/row失效不清空人工资产。

## 9. 验收、发布边界和既有目标

原81项、16项修订和J1–J4均已纳入唯一计划原任务；逐项FR/任务映射见FREE_PRO_ACCEPTANCE。正常支持族必须满足主体/context、P/C/NONE、本人活动、原生导航/新建/搜索、完整v2.7及退出；故障族预先规定降级，不得实现后改oracle迎合全部拒绝。

L/D/S/G/U严格分账；独立oracle、关键变异、真实Chrome MV3/IDB/父子frame/网络计数与旧回归共同验收。真实current-context、时间/作者/ACK、IDless→exact、NONE、旧样本/跨端、CSP/原生功能、PAIA/物理IME仍按主规格§11最小G/U清单定向确认，不再全面研究或重构产品。

F1性能目标和历史失败保留，但不能继续无限前置于B1.F+B2.F1+C2。F3/F4包、隐私、长期漂移和用户收益不因文档通过自动达标；来源权限/平台资格独立核对，不以第三方扩展或用户同意替代。D/Pro、E代理原生动作、F2同步及G高级集成按原目标后置，不成为完整Free工程的误依赖。
