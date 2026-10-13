# 隐私、安全与恢复：Free/Pro共享合同

本文件按用户正式采用的[VA-HOST/1.1 FINAL](specs/chatgpt-host/VAIWL_CHATGPT_HOST_SPEC.md)统一生产宿主边界；[类型合同](specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts)和[81项验收](specs/chatgpt-host/VAIWL_OFFLINE_ACCEPTANCE.md)为完整附件，任务只在[唯一DEVELOPMENT_PLAN](DEVELOPMENT_PLAN.md)。本次文档固化不改变任何实际状态、测试成绩或产品代码，不自动授权真实账号/费用/原生writer/发布。

## 1. 账户、workspace、文档与UI隔离

主体principal、当前context/workspace、browser document/route/body、producer与UI frame分别核验。HOST_HELLO仅给当前topframe文档的传输资格，不能读取账户缓存；ScopeAuthority独立认证后才走原严格BIND/20秒lease。未确认scope不展示上个账户缓存，任意页面accountId/verified/nonce/名称/头像/URL/roster第一项不提供授权。当前route正确不等于旧DOM属于当前聊天。

主认证是worker固定第一方session请求；备选是worker challenge下包内隔离世界固定同源读取，不是MAIN bridge。固定origin/endpoint/method、schema/MIME/redirect/字节和6秒期限，不接受网页任意URL/header/JSON/token。主token仅worker RAM；备通道确需固定accounts核验时可在隔离闭包短期使用并如实披露，不能传MAIN/UI/日志/DB，不要求用户复制cookie/token。

当前context依真实存在的认证active字段，或认证roster+Chrome正常native request context+页面关联，或经验证唯一个人默认语义。webRequest只提供浏览器请求关联，不单独证明账户/作者/持久发送；若启用只读所需权限，不读requestBody、不blocking/extraHeaders，立即丢弃其他header，排除prefetch/扩展核验/旧epoch。无缓存请求事件、字段缺失和冲突不得用DOM候选补权威。

peek纯本地、refresh单飞有限，保留Repository前后scope栅栏但不每次guard联网、不在IDB事务await网络。检测到切换/撤权先废弃旧grant、producer/selection epoch和迟到响应；信号只能收紧权限不能授权另一账户。正常/隐身分区不共用未验证缓存。20秒lease不是连续实时认证，不承诺检测无任何信号的瞬间上游变化。

扩展origin UI通过实际parent/ui document/frame、owner持有的iframe.contentWindow/mount和scope/lease双通道一次配对获取UiDocumentGrant；join key不写URL、不当账户认证。WAR仅必需静态壳/assets，不含数据/备份/session。私人投影走授权runtime有界通道，page postMessage无标题/原生ID/token；网页自己嵌入同名frame不能读库。

## 2. 数据最小化与来源接纳

Free自动观察仅需要原生对象ID/原名/原生URL、成员三态、必要消息/作者/时间候选、版本、覆盖和受限证明。只读活动native区域，排除assistant正文示例链接、隐藏旧body和第三方扩展UI；metadata只读固定profile白名单字段，不eval/getter/React fiber/全bootstrap，opaque状态不解码。

正常已加载信息优先；获准的当前对象窄读取若返回正文必须准确披露实际范围，不宣称存在已证明的metadata-only接口。只持久元字段不等于未接触过响应正文；不得因此扩大到全历史/隐藏聊天或后台批量开页。官方导出、ZIP导入、周期手工补文件/维护日期不作为Free日常主备流程；人工资产备份是不同功能。

response tap仅旁路宿主自然已有且获准的请求，保留原fetch receiver/参数/原Promise/错误，clone分支限字节/时间/深度/并发，异常不能阻塞原流，不抓全部XHR/WebSocket。JSON/SSE/NDJSON独立解析，HTTP Date/revision/status/updated_at不当原始发送时间。私有原文、完整request/response、HAR、附件/AI正文、凭证不写报告/DB/WAR。

用户主动选择的片段走原独立人工路径，保留2000字符上限和`{refId,messageId,branchId,text,bodyHash}`；选区歧义不伪精确锚，不能借此自动采集所有正文。草稿、Range、DOM/Event与模型/工具/上传/Agent运行态仅归宿主，扩展不持久复制或在节点重建后回写旧草稿。

ObservationProposal不带scope/verified/actorVerified/channel/canonical revision；owner凭真实注册receipt/profile/目标与当前授权接纳。locator、profile名、nonce不是来源证明。统一canonical source保留字段级witness，不洗白所有producer。包内profile代码随扩展发布，不执行远程JS/任意选择器配置。第三方开源实现仅证工程机制，不能替代平台许可或长期稳定性承诺。

## 3. 原生权限、Free与Pro边界

| 操作域 | 允许边界 | 不得推导的权限 |
|---|---|---|
| Free原生观察 | 已授权scope内正常显示/加载及明确获准当前域窄读取；scope/来源/预算验证 | 全账户正文镜像、隐藏页面扫描、任意fetch代理、认证材料抓取 |
| 用户原生入口 | 明确已识别P/C/new/search控件或安全href，预计划、一次派发，后验观察 | 后台自动创建/移动/改名/删除、未知结果自动重试、按钮点击即假成功 |
| Free人工偏好/工作集/片段 | 现有CAS/inverse、人工审阅和有界备份；不改变原生成员 | 对真实Project/Conversation写回或自动发消息 |
| Pro语义层 | Free完成后按原授权/质量/预算启用；旧人工资产完整保存 | 用Pro会员/建议actor=human越过锁、获得原生写权或让Free依赖计费 |
| E原生代理 | 未来独立Intent/planHash/范围/次数/时限/任务级预算及真实回执 | 从读取许可、会员、模型建议或观察continuation自动取得writer权 |
| F2/G高级同步/PAIA协议 | 独立双方范围/服务/密钥和数据许可 | 读取PAIA私有DB、共用可写owner/凭证、把ChatGPT自然跨端变化称VAIWL同步 |

失效/拒绝的真实权限不通过换Profile/目录/身份重试绕过。默认不加cookies/debugger/all_urls/测试管理权限，不绕源站挑战、账户/管理员/浏览器限制；所需host/webNavigation、storage/scripting、可选只读webRequest按具体capability最小化并准确列明。

## 4. 本人活动与原生动作不可混同

strict UserSendEvent只有本人、持久消息身份、确证new-send/ACK、原始时间语义/精度和body/scope关联成立才入库；role=user、会话归我、共享项目创作者、气泡新增、HTTP200或整个流complete不充分。编辑/复制/分支/重生成、访问、改名、文件/AI回复不能冒充本人新发送。

原始时间未证实但本地本人ACK确证时使用durable observed-self-send观察锚，只支持provisional、本机有界区间，无sentAt/serverTime。校准due不删除已ACK活动，重复轮询/重开不续起点；错误关联、实际失败或撤销可撤锚；旧短TTL hint不批量升级。事件语义键独立于本次observedAt/current leaf，避免重复入账和不可变冲突。RecencyObservation仅dirty无日期。

NativeAction的新Project、全站新聊和P内新聊目的地明确。NavigationPlan在点击前生成，委托同步preventDefault、actionId至多派发一次；异步RPC不转移浏览器user activation。未知ACK不自动补href/再click，取消不建假卡。无native anchor且有或无法排除未保存草稿/附件/上传/运行状态时，只提供明确新标签安全链接，不整页卸载、不复制草稿。原生Back/Forward/history.state不改义。

将来E代理若派发后结果UNKNOWN，应先只读核对，不能盲重试创建；取消不自动删已建P，撤销本地Placement不执行原生删除/移动。各安装/设备无共享账本不承诺全局exactly-once，恢复不重置任务级原生动作预算。

## 5. 持久存储、并发、迁移与恢复

同库已有B1/B23/native/evidence/shared目录、CAS/operationId/inverse、人工patch/checkpoint/备份、retention、新读字节验证和旧容量限制全部保持。普通freshness到期不是grant撤销或删除，已授权scope内last-known可达但不冒充当前已核验；明确撤权隐藏相关敏感投影，不能因原生源失效删除Pro人工作品。

native与evidence仍独立提交。native delta与有界pending-evidence continuation/最小admission在同一次native_states/native_operations CAS事务中提交，不能native先commit再另写receipt。evidence稳定operationId幂等完成后标complete；pure-evidence输入复用现有receipt，不空写native。pending受retention保护且有字节/条数上限，超限背压不丢已ACK活动。

正常worker重启新grant加原子admission/payload digest/未撤source复验可补观察，不必再找丢失RAM receipt；备份恢复/source变更/admission不全则needs-revalidation。观察continuation不包含凭证或可重放原生动作，不能复活send/create、旧授权或模型任务。UI分别表示native新/activity pending，最终HEADER/PAGE/CHECK不伪跨库原子。

当前数据库版本及下一codec按实际代码核对，保留已完成shared目录和staged HEADER、elapsed deadline、scope-wide foreground及纯解析缓存；不新增第二数据库/事务/调度/loader，不以改hash算法或扩容量换过测。preparing不是空库/READY，生产zero-seed不使用合成bootstrap，6秒实耗时护栏不延长。

坏根/日志/桶、quota、撤权在put前中后、多tab/旧新reader、两仓库间退出均需实际D/S反例。旧reader不支持新schema则拒写，迁移失败保留旧有效根，不清库重建。Free↔Pro及恢复保持identities/placements/aliases/locks/workingSets/snippets/humanRefs/preferences和最新人工优先。B5文件备份是有界人工资产/必要引用，不是无限全部聊天镜像，不携带grant/source授权/pending执行。卸载不能被描述为自动备份，原生ChatGPT数据/功能始终不被修改。

## 6. 原生UI、声明式退出与失败处理

完整v2.7要求不改变：三列适配、5/+12、主页不折叠、连续侧栏/左旧项、上下段/完整H、工作集/片段/搜索、阅读区左上唯一四格返回。header不足不搬到侧栏/rail新增返回，不用小弹板或页面外侧面板残缺版充完整Free。

生产采用扩展origin私有UI frame和同一MountSurface的两个manual surface，共享session/index，不各复制100k。只对唯一已证明reading和纯history列表根添加非私人marker，以浏览器真实popover-open与准确native-open排除条件控制最小CSS visibility/interactivity；禁止HTML inert/hidden/aria-hidden/display、native DOM/handler重写，composer/model/tools/files/account/protectedRegions不入mask。

frame外同树声明式关闭button能在UI/内容脚本失效时释放对应CSS mask。manual不自动ESC/轻点外部，正常running时只处理owned层级ESC，不吞native/IME；无JS不能谎称ESC仍保证可用。原生dialog/menu/权限/Canvas优先，mask和surface同时suspend；隐藏role节点存在不等于打开，两个自有surface不能互判native层。自有mask不使observer自证body消失/反复拆挂；native真实变动先解除mask再复核。

侧栏仅覆盖纯history区域，原生新建/搜索/项目目录/其他入口/footer保留；frame外“显示原生列表”关闭增强恢复尚未发现历史。它不构成第二个工作区返回。未知混合root不能整块mask，但也不能把附在底部的大列表当连续侧栏完成。CSP失败不改宿主策略、不降为page DOM泄露私有cache。

实际stop、worker自然休眠/terminate、刷新/重载、disable、uninstall、re-enable、freeze/bfcache分别测试。退出结果分nativeOperable、privateProjectionAbsent、cleanLayout；仍可手关不使旧私人画面残留通过。正常JS到期清屏不能代替hard-kill行为，frame并不被假定必销毁，管理员禁用unpacked时记NOT_RUN而非绕过。冻结旧像素不承诺瞬时擦除，恢复后先重验grant才发布数据。

无法满足私有退出/原生完整性的profile不发布；保留原生和人工资产，定向修同一mount/provider，不无限增加降级路线或大面积NATIVE_ONLY充成功。完整S生命周期尽早在C2/C5/F3运行，G再确认实际ChatGPT的CSP/原生流程与PAIA/物理IME。

## 7. 工程权限、质量和发布条件

本次GitHub文档整合者不改代码/STATUS/结果、不操作Mac或真实ChatGPT、不干扰Codex。原工程在同目录/同Free分支/PR #16继续，非强制提交，遇并发只整合自己的差异；不创建额外repo/worktree/PR、不要求暂停或reset。最新共享owner成果继承，优先B1.F+B2.F1+C2生产映射闭环，原F1失败与阈值不删除但不无限前置。

离线研发只用独立本地native-shaped/认证fixture与阻断外网的新Profile，不读日常账号/凭证。固定G/U清单和任何真实创建/发送/移动、实际PAIA、费用、merge/发布均按AUTHORITY另行许可，使用任务级预算。法律/平台分发资格和技术可用性分开，不由第三方扩展存在或只读措辞推定允许。

原81项/全部子场景、J1–J4、独立oracle、关键变异与既有回归必须按L/D/S/G/U分账；Web机制probe、类型编译和旧synthetic成绩不代替生产验证。正常支持族须完整P/C/NONE/本人活动/原生目标/v2.7成功，FAULT族才可按预定结果降级。核心数据大面积长期unknown、实际跨端无源、原生损坏或敏感残留不得标FREE-ACCEPTED。发布还需F3/F4的源码对应包、权限/隐私/回退和实际日常质量；本次采纳不是发布许可或新通过结果。
