# 数据模型：共享原生事实、Free投影、Pro资产

2026-10-22用户采纳[PR16体验裁决](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6335005042)：本人Mac Chrome主用连续体验为个人交付标准。原计划及81项原表按①个人必需/②发布完善/③后续优化/④取消简化分层；历史结果不改PASS，取消的全历史与逐消息完整审计不转为发布欠账。安全、权限、正确归属、资产、完整v2.7不削弱。

本Canonical正式采用[VA-HOST/1.1 FINAL工程规格](specs/chatgpt-host/VAIWL_CHATGPT_HOST_SPEC.md)与[完整类型合同](specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts)。任务仅归[唯一DEVELOPMENT_PLAN](DEVELOPMENT_PLAN.md)的B1–B5/C/F；全部验收见[FREE_PRO_ACCEPTANCE](research/FREE_PRO_ACCEPTANCE.md)及其81项附件。本文是应实施的数据合同，不是已执行迁移、当前STATUS或测试结果。

四份设计原件保留Round60形成时的历史基线；实施使用最新PR #16及原工作区，不按旧文档重新创建已完成的数据系统。

## 1. 当前存储基础与必须补齐的边界

本次实际代码核对`src/data/schema.mjs`的DATABASE_VERSION=3：B1的refs/operations、B23的b23_states/b23_operations/b23_checkpoints/b23_views与native_states/native_operations在同库。NativeRepository、FreeEvidenceRepository、FreeProjector、原生/活动分片和共享目录已经实现，不再把“新增原生项目/成员/Free投影”当从零任务。具体evidence分片/键命名空间沿用其现有owner，不创建第二个完整账号数据库。

旧`state.mjs`的none/synthetic来源、旧INGEST内容冲突和Pro workspaces/placements/identities继续保留原语义；它们不能代替生产观察更新。新增生产source只能由owner注册并按已批准profile接纳，不能让页面提交`verified/channel/scopeKey`，也不能批量把synthetic事实、测试null或备份改标签提升。

现有shared-directory读写/迁移/恢复/retention、`free-header-loader.mjs`、staged HEADER、`request-deadline.mjs`、同scope跨tab foreground优先、纯instant缓存与fresh-byte校验均直接复用。下一IDB/codec版本按实施时真实源码分配；不预占v4，不修改hash算法，不放宽旧容量与6秒RPC边界来规避兼容问题。

## 2. 身份、文档、控件和原生对象

### 2.1 身份与传输不是同一授权

| 对象 | 关键字段/身份 | 约束 |
|---|---|---|
| DocumentBinding | documentToken、producerToken、browserDocumentId、routeEpoch、origin、expiresAt | HOST_HELLO只证明浏览器文档和传输资格，不开放任何账户缓存；不可从URL/DOM自行签发 |
| PrincipalProof | principalKey、sessionGeneration、固定providerProfile、transport、verifiedAt、expiresAt、owner receipt | 主worker-fixed-fetch；备isolated-fixed-fetch按挑战/当前document独立验证；认证主体不是头像/姓名/email |
| ContextProof | server-active-context，或认证roster+browser-request+page-association，或已证single-personal-context；documentId/selectionEpoch | roster只证访问权，request receipt只证请求关联，页面字段不单独证明当前workspace；没有字段不猜default |
| ScopeGrant | scopeKey、PrincipalProof、ContextProof、scopeEpoch、issuedAt/expiresAt | 仅owner产生；正常/隐身分区隔离；过期/切换阻止读取和写入；不备份为可执行授权 |
| UiDocumentGrant | mountId、parentDocumentId、uiDocumentId、scopeGrantId、workspace/sidebar角色、expiresAt | 静态UI双通道配对加浏览器parent/frame核验；WAR URL/join key不能单独读库；不放宽B1 topframe观察入口 |

与现有normalizedScope接口适配时，provider/accountId/organizationId使用已认证principal/context的确定性domain-separated编码，保留原key形式；不使用Project ID、昵称或Profile目录名替代身份。确证个人context使用明确个人namespace，不以字符串default掩盖未知组织。`peek`纯本地、`refresh`单飞，数据库事务不等待网络。

### 2.2 原生ID与临时可操作目标

| 对象 | 持久键/内容 | 权威与生命周期 |
|---|---|---|
| NativeProjectRef | `(scope,nativeProjectId)`；nativeName/nativeUrl、availability、字段witness、局部revision、有界alias | exact原生ID是主键，slug/name/位置不是；改名更新同P；不混同API平台Project或Pro虚拟主题 |
| ConversationRef | `(scope,nativeConversationId)`；nativeTitle/nativeUrl、availability、字段witness/native revision、有界alias | `/c/`只给身份不给NONE；当前body独立绑定；同C移动不复制 |
| LiveNativeHandle | documentToken、route/region epoch、controlKind、opaque handle；原node/fingerprint保存在WeakMap | 仅RAM中的真实原生按钮/控件引用，不是nativeID；节点重建失效，不按同名/序号重找 |
| SurfaceCandidate | ephemeral renderKey、原生title/titleState、resolved target或LiveNativeHandle | 无ID/href仍可原生激活；正常route/metadata取得exactID后提升，迁移临时视图状态；不得持久化假canonical ID |
| NativeRoute/URL alias | 经exact HTTPS origin/path/编码/query验证的目标URL、已证身份或候选容器 | mutableURL不是稳定ID；不能清掉temporary等语义query；raw URL校验失败不能退回使用 |
| BodyProof | 当前document/route/body epoch、conversationId、明确容器ID或current-response/message关联 | route变了不等于旧DOM变了；不能用标题/侧栏选中/两帧稳定证明body |

同名P/C不得合并。分享、temporary、新空聊和customGPT容器按profile分别处理，不回退近期第一条。原名显示省略与存储原名不同：CSS ellipsis不改原文；超现有字段上限保持ID/URL及明确titleState，不能把截断写成完整原名或默默扩库。

## 3. 观察、归属、局部版本与库存

### 3.1 提案不等于已经授权的事实

ObservationProposal包含protocol、document/producer token、localSeq、routeEpoch、profile/version、bodyProofId、kind及严格payload。禁止页面自带scopeKey、verified、actorVerified、source channel或canonical revision。owner验证当前文档/scope、字段白名单、UTF-8字节与实体数量、来源receipt及跨字段一致性后生成事实批次。

建议单包64KiB/256实体、文档在途256KiB/scope1MiB；相同seq+相同digest幂等返回，异payload拒绝。确证ACK/身份撤销优先，重复标题/列表按对象/域合并；溢出背压并留gap，不能静默丢发送或把截断说成complete。

| 对象 | 主要字段 | 不能混同的语义 |
|---|---|---|
| EvidenceLocator | profile/version、sourceKind、regionEpoch、fieldPaths、可选receiptId | 只是定位，不证明网络/原生动作发生；未知receipt不能自证 |
| OwnerReceipt | documentToken/routeEpoch/scopeGrantId、kind、profileId、semanticFingerprint、observedAt、evidenceClass | dom-observed不等于authenticated；receipt须owner实际登记并匹配目标和语义 |
| FieldWitness | receipt、fieldRevision、producerGeneration、upstreamRevision、verificationEpoch、observedAt、freshnessUntil、revoked | freshness不是访问授权，receipt在RAM中的ID不是可恢复接纳证明 |
| canonical source | scope内统一NativeRepository来源、持久generation、注册profile与撤销状态 | 各producer先归约，不直接互相native-source-conflict；统一source不洗白低信任输入 |

每字段只保存当前和有限冲突候选、必要来源摘要；不保存无限DOM、完整网络响应或第二份全量refs。producer重启失效其待处理提案，不使持久source generation每次变化、清空已知历史。

2026-10-22目录消费窄接线：worker私有`directoryProvider`以同一context对象绑定固定首屏请求、主体来源、grant/epoch、文档及目标；页面无目录RPC。owner复用原canonical sourceId/generation和同库CAS，以`host-metadata / directory-candidates`持久接纳正向ID/原名，不能伪装`host-dom / surface`。admission.coverage仅记录**最新批次**的过滤域、缺口和本页终止；不重证旧行或聚合成完整库存。membership为空、inventory始终partial、无活动/ACK/缺席删除。缺名不覆盖或续证已知原名，明确首屏参数冲突拒绝；缺完整库存声明仍可保留合法条目。待恢复pending-evidence优先，目录暂缓或输掉原revision CAS；原ACK续接谓词不放宽。

此消费入口默认没有生产provider，不能由脱敏报告复活scope或打开数据库。`host-metadata`是持久来源枚举扩展，既有原格式/键/hash不改，但旧包不能读取该新枚举；因此旧F3回退结论不覆盖未来写入这类数据后的降版。生产启用前必须指定支持新枚举的最低读取/回退包并完成对应恢复验证，不清库或把渠道改写成DOM来降版。当前未在真实库写入，无需用户迁移或重载。

### 3.2 Membership三态

PROJECT包含同scope projectId及有效正向成员witness；NONE有明确无Project语义证明；UNKNOWN包含原因、局部fieldRevision和可选lastConfirmed记录，但不能把lastConfirmed展示为最新确认。UNKNOWN的projectId为空不等于NONE。

PROJECT只由正确P成员区域或经核验metadata确定；P页旁近期列表的Q聊天不能归P。NONE只能来自当前对象明确字段或用户自然打开的原生菜单状态的已证语义；missing、未解释null、无badge、普通/c/都不充分。完整支持profile必须确实有普通聊天正向NONE通路，不能所有普通C永久UNKNOWN仍算完成。

成员更新只修改同一C及P/Q局部集合；Free不发Pro虚拟MOVE/SET_TITLE，更不移动原生聊天。不可比较P/Q观察先UNKNOWN并保留可达引用，再去重的当前对象核验epoch收敛；旧epoch/旧tab不得推翻新确认，不按最后到包时间选胜者。

### 3.3 版本与覆盖

sourceRevision仅本地接纳/提交次序；fieldRevision是某组字段有效版本；memberSetRevision/setRevision是某P或过滤域的集合版本；upstreamRevision仅在同域且含义已证时用于因果比较。标题更新不能导致全部项目成员witness失效，lease续期不能续活动日期。

InventoryCoverage以CoverageDomain区分projects-index/recent-list/project-members/conversation-messages及filter/sort/branchScope，包含scanId、extent、consistency、setRevision、observedAt、completeThrough或null、cursorDigest、terminalWitness与gaps。extent为unknown/partial/exhausted-observed-scan/complete-snapshot；无一致snapshot即使看见终点也不能声称全账户完整。游标记录有界，分域去重；置顶/筛选/虚拟滚动窗口不伪造近期变化。

库存覆盖、成员完整性、消息/分支TimeCoverage分别保存。一条近期正向发送可证明当前活跃，不证明历史无更晚输入；成员partial不阻止P卡存在，只限制严格历史否定结论。

### 3.4 可用性、授权和新鲜度

逻辑状态至少区分available、last-known/stale、temporarily-unavailable、明确deletion-confirmed和permission-revoked；通过现有codec的兼容演进实现，不把数据库恢复当删除权限。未见、virtualization unmount、分页缺失、TTL或单次404都不是删除。

当前ScopeGrant无效时隐藏该scope缓存；仍授权scope内普通row freshness到期可保留上次确认的原名/URL但不标当前已核验。明确对象撤权/删除按对应证据停止相关敏感展示，保留必要引用与恢复合同，不清Pro人工资产。旧格式按旧规则解码，不静默提高来源信任。

## 4. 原始发送、持久观察锚和活动决策

| 对象 | 核心字段/键 | 正式语义 |
|---|---|---|
| UserSendEvent | scope/C/message语义键；message/真实branch或固定到消息的lineage、actor/role、new-send、committed/ACK、原始sentAt或sentInterval/precision、来源与撤销 | 只有本人、身份、确认状态、原始时间语义/精度/body关联充分才成立；角色user或拥有会话不证明全部分支作者 |
| TimeCoverage | C、from/through、completeness、observed/all branches、gaps、来源和版本 | current_node只指当前可见分支；parent缺失/循环不标all完整；打开时间不是completeThrough |
| ObservationHint | 原有eventKey/hintType/observedAt/validUntil/candidateInterval及witness | 保留短期提示语义，重复不续TTL；不能批量转换为持久发送证据 |
| LocalSendAnchor | `kind=observed-self-send`；scope/C/message eventKey、ackReceipt、firstObservedAt、本机有界interval、clockBasis/quality、calibrationDueAt、revoked | 新codec的持久本地确证ACK观察，永远provisional，没有sentAt/serverTime；校准due不删除已确认活动，原起点不随重开/轮询变 |
| RecencyObservation | 同domain nativeOrder、baseline/newID/order/title change、前后digest、observedAt、carriesSendTime=false | 可直接支持同域无日期稳定排序及发现/校准；首次25条、置顶、改名不制造发送或日期 |
| NativeActivityObservation | 私有provider proof下的scope/profile、原生C ID及可选updateTime；单位和排序域由包内profile明确 | codec3同库CAS：每来源/C/种类一个最新快照；更新时间provisional，同域同批rank无日期；新grant/准入前不可读，撤权不复活；无新生产profile默认关闭 |
| ActivityDecision | objectKey、evidenceRevision、exact/interval/provisional/undated、candidateTime/day/segment、reason、nextCheck | 纯可重算投影，不写回sentAt/membership；依据缺失不制造确定旧日期 |
| FreeViewPreferences/ViewSession | H∈7/14/30/60/90、T/Z/policyRevision、人工锁/auto、旧项/容量/侧栏、anchor/scroll | 同一偏好owner；历史会话固定H/T/Z，其他tab更新不误解释原k |

UserSendEvent的语义fingerprint不包含本次observedAt、source读取时间或current branch leaf。首次event不可变；重开相同语义复用原event，lastSeen/witness独立更新，不制造immutable conflict或重复事件。branch/lineage用于定位/覆盖，派生谱系固定为根至该消息，追加回复不能改变旧event键。同message两种原始时间隔离冲突，不取max掩盖。

LocalSendAnchor只在本人原生intent与message/operation、独立确证ACK关联成功后建立；optimistic气泡、HTTP200、整个流complete、失败/停止/IME/上传均不足。没有原始时间可用本机观察区间支持暂定recent，但不得伪原始sentAt；时钟无法约束则无日期/当前可达并校准。due到期只请求复核，原锚自然随H老化；误配/失败/撤权可撤销。旧短TTL hint不能因迁移被升级成持久锚。

Free聚合已确证P成员中最近有效可信活动，保留严格或provisional依据；普通NONE按自身分段，UNKNOWN不随意贡献给P。一条可靠近期发送无需全历史扫描；60天旧锚在覆盖partial时可逆暂定下沉，不永远置顶。完全无时间有限校准后稳定可达，不无限spinner或伪月份。6秒请求/30秒轮次/12请求/2重试预算按scope/source跨lease/重启/多tab保持；手机变化上游可见延迟与本地投影延迟分别报告。

## 5. Free投影、原生导航与Pro资产

FreeProjectCard仅由NativeProjectRef和当前可用Membership形成，name取nativeName，聊天displayTitle取nativeTitle。Pro workspaces/placements/identities不能补Free标题或成员；未知名称只用合法上次原名或明确名称状态。IDless候选在临时显示层可操作但不占正式Project计数，正常原生打开后提升exactID；不能以候选大面积不收敛冒充完整Free。

投影缓存必须包含scope/grant或visibility epoch、native/局部membership/evidence revision、profile、viewMode及H/T/Z/policyRevision；纯解析缓存不能缓存授权或ActivityDecision。无关更新只重算受影响节点，保留当前interaction guard/焦点/scroll。workspace/sidebar两个frame由同owner供有界切片，不持有两份全量索引。

NavigationPlan绑定当前target/control、document/region/grant、planRevision和风险方式；NativeTarget为resolved或live-control。计划准备在手势前，实际dispatch前复核。NavigationCommandDTO只引用owner计划和actionId/UiGrant/mount，不接受任意URL/selector/JS；动作ACK丢失不自动再click或补href。真正原生href保留浏览器修饰键语义，风险存在/未知不整页卸载未发内容。原生全站新聊和P内新聊是显式不同context，不用null缺省猜目的地。

片段仍使用既有`{refId,messageId,branchId,text,bodyHash}`，仅明确选择的有限正文可持久化；自动观察不能借片段路径收全部正文。原生草稿、Selection/Range、DOM/Event、模型/工具/上传/Agent运行态不进入持久库或跨realm DTO。

Pro资产完整保留：VirtualTopic承接Workspace，VirtualPlacement承接Placement，DerivedTitle承接DisplayIdentity；命名空间不得原样冒充nativeProjectId。人工name/aliases/icon/order/owner/lock、include/exclude、Series、redirect和可撤销重组全部保留。Pro默认只为确认NONE提供虚拟归组；跨Project聚合为显式后续能力。多归属使用明确LaunchContext，不用current-index first-match伪唯一来路。

C移入真实Project时，Pro中失去NONE资格的默认虚拟显示停止，但旧人工Placement/标题仍存，不逆向移动原生。Free↔Pro只切出口，降级不删除资产、不复活授权，不需会员才能基本查找/恢复/备份。

## 6. 同库事务、continuation、迁移与恢复

### 6.1 已有事务复用

继续existing B1/B23/native/evidence/shared owner的IDB、CAS、operationId、inverse、人工patch、checkpoint和不可变目录。原20k旧表/16Mi单记录/128Mi聚合/100k及有界PAGE限制保持；具体下一codec/schema必须核对最新实现。新增witness/coverage/anchor字段必须进入strict schema、hash、大小、读写、迁移、恢复和GC校验，不只改.d.ts。

### 6.2 两仓库观察提交的最小补全

native与evidence并非跨仓库原子事务，保留native先可达、activity尚pending的语义。ObservationContinuation放现有native_operations命名空间，并与native delta在同一次native_states/native_operations CAS事务内提交；不是新WAL，也不是原生动作账本。

continuation包括稳定operationId、scopeKey、nativeRevision、semanticFingerprint、evidencePayloadDigest、有界且owner验证过的evidencePayload、pending-evidence/complete/needs-revalidation/cancelled、必要receipt引用和持久admission。admission至少含scope、profile/version、sourceGeneration、semanticFingerprint、evidenceClass、acceptedAt。只有RAM receiptId不足以恢复，禁止native已提交后再另事务写收据。

EvidenceRepository用稳定operationId幂等提交，再将continuation标complete；pure-evidence输入复用现有evidence receipt，不为此空写native。UI使用native/evidence组合revision/pending及现有最终CHECK，不报告“活动完整刷新”直到对应提交可确认。

正常worker重启必须获得新scope grant，并校验原子admission/payload digest及未撤销source/profile后才能补观察记录；不为找RAM receipt再抓正文。来源撤销/变更、admission缺失或备份恢复为needs-revalidation，在获准自然当前对象核验后重建；不重放原生send/create或旧授权。

初值单条≤64KiB、每scope≤256条且≤1MiB，pending受retention保护。超预算背压/合并无因果冲突观察，不丢确认ACK；单个C移组不能拆成半归属。年龄到期不可静默删除未完成活动，转needs-revalidation保留必要目标/witness摘要。新增数据不能绕旧容量/损坏保护。

### 6.3 准备、迁移与恢复

直接复用`free-header-loader.mjs`、`B23_FREE_HEADER staged:true`：有限有序stage、同scope、重复/回退/未知stage拒绝、最终完整HEADER/PAGE/CHECK；preparing不是空库/READY。生产zero-seed跳过合成native-bootstrap，不借阶段名称取得种子许可；新增迁移阶段由同owner同步修改协议/loader/测试，不能再建平行loader。保留无staged旧调用兼容、6秒elapsed deadline和当前foreground调度。

结构升级采取验证旧根→短事务准备新结构/codec→有界转换→CAS根切换→新reader验证；失败保留旧有效根，不清库。旧reader看到不支持格式应拒写/安全只读，versionchange关闭旧连接；两个版本/多tab、quota、put前中后撤权、root/日志损坏均需反例。

B5备份仍是有界人工资产与必要引用，不是无限全聊天镜像。Free偏好/工作集/原始引用和Pro人工作品可恢复；最新人工修改优先，安全inverse与冲突审阅保留。备份不恢复grant、pending执行、模型调用许可、native writer授权或source信任；观察锚不升级strict事件，项目/成员/密度重验。卸载扩展是否删除本地库按浏览器实际行为，不将卸载当备份承诺；原生ChatGPT数据/功能不能受损。

## 7. 原生UI视图状态与退出约束

approved v2.7保持：三列适配、5/+12、主页不折叠、连续侧栏可折叠、左侧旧项、当前无向上、完整H/工作集/片段/搜索、阅读区唯一四格返回。原生DOM、composer、handler和草稿不是VAIWL数据模型；不得为统一界面持久复制它们。

按VA-HOST/1.1，只有独立reading和纯native history列表区域可用opaque marker及`:popover-open`驱动的限定CSS visibility/interactivity视图mask；不写原生HTML inert/hidden/aria-hidden/display，不覆盖protectedRegions。manual双surface分别开闭，原生弹层优先，退出selector失效即释放mask。frame字体/主题为白名单DTO，私人投影只走授权runtime，WAR无私人数据。

disable/uninstall时nativeOperable、privateProjectionAbsent、cleanLayout分开记录；可关闭外壳不允许掩盖敏感画面残留。正常JS grant到期清屏不等于hard-kill保证；真实S必须先验证，G再确认宿主CSP和原生功能。区域不兼容退让是故障保护，不是允许削减完整Free。

## 8. 可选E原生动作账本与验收边界

E若以后获准，ExecutionIntent、审阅planHash、scope/准确原生目标、动作类型/次数/时限/预算、派发/回执/FAILED/UNKNOWN保存在独立逻辑域；不能把ObservationContinuation当可重放原生动作。用户原生创建入口点击不自动产生扩展后台许可。

已派发但结果未知先只读核对，不自动重试；取消不删除已建Project，本地Placement撤销不执行原生删除/移动。不同安装/设备无共享账本时不承诺全局exactly-once；恢复不能通过换目录/Profile重置已派发总预算。模型建议不得声明actor=human越过人工锁。

本模型的生产新字段依B1/B2/B4/B5实施，并经81项对应任务/FR及J1–J4验证。主体/context、NONE、本人/原始时间/ACK、旧历史/跨端、实际CSP/原生功能/PAIA/IME由实际G/U分账确认，按81适用层①/②/③执行；本人以主用个人J1–J4为出口，不要求逐消息审计或特定旧样本才可使用。原模型/合成测试不自动继承新生产能力结论；不因来源暂缺而重建数据库或发明全历史前置。
