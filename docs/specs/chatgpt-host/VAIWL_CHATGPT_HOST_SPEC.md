# VAIWL：ChatGPT 生产宿主适配工程规格

**规格：VA-HOST/1 · 修订 1.1 FINAL · 2026-10-13。**
本文件直接修订原 VA-HOST/1；与同目录验收规格、类型合同、Codex 交接构成唯一现行设计包。原 A–G 仍为唯一开发路线。本包不是产品代码、GitHub 提交、真实 ChatGPT 验收或发布许可。

## 2026-10-19 用户批准的临时只读导航例外

用户明确批准在真实 session 接口挑战403期间提供 `temporaryReadOnly:true` 显式构建；默认/正常包仍严格执行以下完整合同。本例外仅用于受限本人试用，不是新计划、账户scope、LIVE_VERIFIED或完整Free替代。

- 私有工具栏popup只向当前topframe请求一次当前文档原生导航；生产仅接受唯一已观察侧栏结构，排除阅读区、composer、dialog和隐藏文字。只取可见原生标题与同源合法Project/Conversation链接，未知结构不可读；不访问session/accounts、页面认证、原数据库或人工资产。
- 数据仅本次popup RAM，最多256条/49152字节行数据；DOM/route/document变化清除，关闭丢弃。列表搜索仅过滤本次条目，不能宣称完整历史。聊天所属Project未核验，UNKNOWN不升级NONE。
- 链接以`_blank`和`noopener noreferrer`交浏览器打开，保留原页与草稿；返回原页并再次点击扩展图标重新读列表。没有原生链接的按钮、未加载历史不能凭空造ID或推断成员。
- 正常bootstrap/context observer/worker runtime不启动，不建立grant/receipt，不打开持久历史、活动校准、跨标签恢复或人工资产入口。保留旧包与旧数据库，退出此显式构建才能恢复正常合同；不得把临时通过记入原81项正常宿主分母。
- 与正常包保持既有权限，不新增权限。对应DTO独立定义在类型合同中，不能传入Host授权或持久化接口。安装/真实读取仍需既有专用Profile许可。

## 0. 裁决、基线和本轮证据

**CONDITIONAL GO：按本修订立即进入现有 Free 分支的离线工程实施；不再重复全面研究。未经必要 S/G/U 关口，真实宿主启用和发布仍不放行。** 原版中“身份通路泛化”“所有元数据读取可选”“自动 Popover + 完全不影响背景交互”的组合不能作为可直接照抄的完整实现，本次已经替换。

最终审查基线为 GitHub PR #16 的 `8a35843431d5d85ee3092612bf88af6129de482d`（Round60）；本轮先读Round58，再读取其后2个提交的差异与相关实际代码，分支 `codex/vaiwl-free-first-20261013`，base 为 PR #15 的 `docs/vaiwl-v28-core-mechanisms-20261012` / `176ebc9a3620f6e174e542e3320ff7008cd6ebe8`。与上一版 `0600133fb88ae1e133062173a1b31d02a4f05ebd` 相比正常 ahead 5，不要求回退；实施前仅核对新提交差异与当前未提交成果。

### 0.1 必须纠正的当前实现描述

共享目录的 reader、writer、迁移、恢复、retention 和 owner 接线已经存在。`simulator/service.mjs` 的 `workspaceContext` 已使用 `boundedDirectory:true`，并在旧格式上调用共享目录迁移；`FreeRuntimeService` 已有 `sourceFor`、授权包装、`publication:'invalidation'` 和 `readCached:false` 路径。不得再次实现一套共享目录、调度器或全量副本。

最新Round60源码回执记录 **1125项完整Node、实际MV3 9项**，均为已读取的仓库原执行记录，非本次运行。Round59已经实现 `loadFreeHeader` 与 `staged:true`：每次最多一个既有原子迁移、严格stage进度、同scope和最终完整HEADER/PAGE/CHECK。Round60又加入256项有界纯instant解析缓存，不缓存授权或ActivityDecision。**不得再把分阶段准备写成尚待从零实现。**

Round58的1092、独立8项crypto和IDB7/4/10；Round59的1118和另报staged合同；原Round47 mixed发送FAIL，均保留为各自源码的历史证据，不累加、不覆盖原件。近期100k发送样本低于1秒不代表所有F1分布/p95通过，完整冷加载仍是剩余性能问题；PR正文仍主要描述Round59，不能据正文忽略Round60源码。源码回执也明确不宣称总体cold-load提速。本包将已有目录、staged loader与instant缓存作为复用基线，不重复开发、不要求回滚。

### 0.2 本轮实际进行的设计反证，不混入产品通过数

在隔离 Chromium 144.0.7559.96 的自建页面上：

- `popover=auto` 打开后，点击侧栏控件使其关闭；普通不透明覆盖层并不阻止 Tab 落入背后的原生链接。
- `popover=manual` 在侧栏操作后保持打开；由 `:popover-open` 驱动的限定 CSS 隐藏/惰性规则生效；点击 frame 外声明式关闭按钮后恢复为 visible/auto，原 textarea 草稿保持，未写 HTML `inert` 属性。
- 双surface补充probe确认：侧栏操作不关闭工作区、背景focus被阻止、native popup出现时两自有surface让位并释放mask、单独关闭sidebar不关闭workspace、关闭后两mask解除且合成草稿保持。它仍只是Web机制probe，不含扩展iframe授权/卸载。
- 尝试在独立空 Profile 装载一次性 MV3 探针时，浏览器管理策略拒绝 unpacked extension。未绕过该限制。**本轮未证明 iframe 在真实 disable/uninstall 时的销毁行为，也未运行产品 MV3 验收。**

这些仅为 WEB_MECHANISM_ONLY，不是 S-MV3，更不是 G。完整原始结果、环境和哈希见 §12；类型核验也不替代运行时授权与浏览器行为测试。

## 1. 反证问题登记与修正

P0：核心闭环或安全前提缺失，必须在首个纵向实现中处理。P1：高返工/错误数据/主要交互风险，不能带入完整离线候选。P2：明确的效率/规格质量缺陷。以下严重程度针对**设计缺陷**，不是宣称已经在真实产品中复现。

| 编号 | 级别 | 原方案问题及可证反例 | 本次原位修正 | 验收归属 |
|---|---|---|---|---|
| A01 | P0 | principal 与 active workspace 分开说对了，但“取得权威 context witness”没有实际握手；用 accounts 第一项或 cookie 会误绑 | 固定认证 provider + 三种明确 ContextProof；浏览器请求关联不是账户认证；无 active 字段不假设它存在 | SEC-01–07 |
| A02 | P0 | 无 ID/href 的项目按钮没有可表示的 NativeTarget；“保留候选”实际上无法点击或永远不升级 | 文档内 LiveNativeHandle、候选视图、一次原生激活、后置 exact-ID 提升；持久主键与临时 renderKey 分离 | MAP-02/06/08、UI-05 |
| A03 | P0 | ID、NONE、时间的读取全部可选，可能实现出安全但绝大多数 UNKNOWN/undated 的产品 | 为每个支持 profile 建立必需能力闭包；具体主通道/备选与正向分母，缺能力不能宣称完整 Free | MAP-04/06、ACT-09/18/19、SYS-08 |
| A04 | P0 | auto Popover 与持续工作区冲突；仅视觉覆盖且禁止任何背景交互抑制，会产生焦点/辅助技术穿透 | manual Popover + 浏览器开闭状态约束的最小 CSS view mask；原生输入/工具不入 mask；真实退出前置 | UI-06–14 |
| A05 | P1 | 原类型虽可编译，inspect 字段、MouseEvent、snippet 形状不兼容现有调用；start 还存在身份初始化环 | 保留 legacy shim 和旧片段格式；DOM 与 RPC 分层；DocumentBinding 与 ScopeGrant 分开握手 | SYS-06、UI-01/17 |
| A06 | P1 | 每次 broker/仓库前后检查都执行 session 网络请求，会随分页/多 tab 倍增 | `peek` 纯本地栅栏 + 单飞有限 `refresh`；同 scope/source 预算跨 lease 保留 | SEC-05/12、ACT-18、SYS-04 |
| A07 | P1 | iframe 异步导航与默认 href 可双执行；随机 gesture handle 不会转移浏览器 user activation | 预计算 NavigationPlan，同步决定默认动作；原生委托恰好一次；修饰键真链接，失败不自动补跳 | UI-01–05/15 |
| A08 | P1 | header 不足时回退侧栏/rail 的工作区返回违反 v2.7 单一阅读返回；未验 iframe 字体/侧栏连续行为 | 删除重复返回兜底；geometry slot 和完整视觉基准纳入支持条件；共享 renderer/session | UI-08–10/16 |
| A09 | P1 | EvidenceLocator/profile/nonce 可能被误当来源证明；canonical source 又可能掩盖 producer 冲突与撤权 | worker receipt 注册表、分字段 witness、受限 ingress；receipt 按 scope/doc/profile 校验，精准失效 | SEC-02/08–12、SYS-08 |
| A10 | P1 | 重开消息的 observedAt 不同会撞不可变事件；从 current leaf 派生 branch 会随发送变化 | semantic event key 独立于观察时刻/当前 branch；原 immutable event 复用，lineage 固定到该消息 | ACT-06/11/12/16 |
| A11 | P1 | 本地已确认发送只有短 TTL hint，无原始时间时十分钟后可能退回数月前 | 同证据分片中的 durable observed-self-send anchor；观察时间永不冒充 sentAt，校准期限不删除已确认活动 | ACT-07–09/13/16 |
| A12 | P1 | 两仓库之间退出后“凭 receipt 补写”未规定原子存储位置，可能丢失活动或重放授权 | native_operations 中同 native CAS 保存有界 observation continuation；独立 evidence 幂等提交与新 grant 复验 | SYS-01–03 |
| A13 | P1 | 全局 source revision、TTL 和有效授权混在一起；无关扫描可能撤掉成员或历史事件 | 对象字段/成员集合局部版本；grant/freshness/revocation 分离；冲突有新鲜核验 epoch 收敛 | MAP-14/15、INV-07/08 |
| A14 | P1 | 原交接仍把共享目录写成未接入，把旧 mixed FAIL 当当前；可能重复工作并忽略首次加载 | 基于 Round60 接已有 owner/目录/staged loader；不追加第二份100k副本；不重新实现已完成preparing | SYS-02–06 |
| A15 | P2 | 标题截断与“显示原名”混淆；保留期限/消息大小/批次边界不够明确 | 存储原名与显示省略分离；超限不谎称完整名称；字节/数量双预算，溢出留 gap | MAP-12、INV-04、SYS-05/08 |
| A16 | P2 | 81 项未全部落实优先级/正向分母/完整视觉，仍可用理想元数据或大量退让蒙混 | 保留 81 个 ID，改写场景和期望；独立 oracle、必要变异测试、完整旅程、真实 S/G/U 分账 | 全部81项 |

完成本文件修订仅表示为这些问题指定了可编码处理，不表示相应实现已经 PASS。

## 2. 固定架构与支持能力闭包

继续采用同一条链：

```text
ChatGPTHostAdapter（原生表面、已加载元数据、真实控件）
 → DocumentBinding / ScopeAuthority / owner receipts
 → 单一 HostObservationReducer
 → 既有 NativeRepository + FreeEvidenceRepository
 → FreeRuntimeService / FreeProjector / ActivityDecision
 → 复用的 Free 工作区、侧栏、搜索、工作集、片段
```

消息、输入、模型、工具、附件、Canvas、权限弹层、原生运行状态仍属于 ChatGPT。完整历史抓取、后台隐藏页面、全正文镜像、导出 ZIP 及周期人工维护均不是前置或备用流程。

### 2.1 完整 Free 支持 profile 必须有实际来源，不只是一组 selector

一个 profile 的必要闭包为：主体 + 当前 context + P/C 身份或可收敛控件 + PROJECT/NONE 语义 + 本人活动可用来源 + 原生导航/新建/搜索 + v2.7 工作区/连续侧栏 + 可退出生命周期。每项记载主通道、备选、实际支持样本、反例、E/L/S/G 证据。

全部 UNKNOWN、仅入口或原生-only 是故障保护，不是正常成功。离线支持样本中所有**当前实际暴露且在该 profile 范围内**的对象必须可达；有确定身份/归属事实的样本必须正确映射。测试中只暴露25/1000条，分母是25，不假装1000已发现。没有日期字段的夹具必须诚实 undated，但不能拿它替代有可用元数据的常见正向旅程。

G 中若主要已见项目无法成为稳定卡、普通聊天大面积不能确认 NONE、近期/旧项长期 undated，整个 profile 不能被标完整 Free 支持。不得把这些核心能力改“不适用”来发布。具体 G 固定样本闭包见 §11。

### 2.2 来源决策表

| 用途 | 主通道 | 明确备选 | 不成立时 |
|---|---|---|---|
| principal | worker 固定第一方 session 读取 | 受 worker challenge 的隔离世界固定同源读取，仅最小认证结果 | 冷启动不读旧缓存；不猜账户 |
| active context | 与当前文档有关的认证 active-context 响应（仅实际 profile 有此字段时） | 认证 roster + 浏览器见证的正常 native request context + 当前表面关联；个人唯一 context 的已验证语义 | 明确 ambiguous；不是自动采用第一个账户 |
| P/C exact ID | 原生 href 的已验证 grammar、已加载明确 metadata | 原生控制句柄激活后的路由/数据；获准的当前可见目录窄读取 | 临时可达候选；核心旅程不收敛则 profile 不通过 |
| PROJECT/NONE | 当前成员区域/元字段的已验证语义 | 当前聊天窄 metadata；用户自然打开的原生移动菜单中的明确当前状态 | UNKNOWN，保留入口；缺徽章/普通URL不推NONE |
| 原始发送时间 | 当前已加载消息 metadata，作者/时间/状态均核验 | 获准的当前 C 只读详情按元字段归约；本地确证发送用观察锚 | 无日期/暂定；不使用updated_at伪造 |
| 跨端变化 | native recent/当前数据后续正常更新 | foreground 对当前已见域有界校准，渠道许可相同 | 分开上游尚未可见和本地处理迟缓 |
| 原生导航 | 当前真实 anchor/button | 已确认 native URL 的用户 href；有未保存风险明确新标签 | 不复制聊天，不自动重发点击 |

“窄读取”是主链的一种可插拔 source，不是新产品模式。可以现在实现/离线测试已知 endpoint profile，但**本轮不请求真实地址**。最终启用前必须明确具体读取范围/权限及实际协议可用性；不能因为只落盘元数据就隐瞒实际返回可能含正文。

### 2.3 固定的外部实现依据

已对照 imran `src/core.js/content.js` 的 Project 路由/标签学习，XReyRobert `content.js/background.js` 的 session/list/mapping/current_node/time 路径，及 exporter `48a32f9dbe409a415f8de633954c18284019509f` 的 `api.ts/main.tsx/page.ts`。这证明具体工程路径存在，不证明 VAIWL 当前登录态可用或平台承诺稳定。

从这些实现可注册的**待实机确证模板**包括 `/api/auth/session`、`/backend-api/accounts/check/v4-2023-04-27`、当前 conversation detail、已加载 project sidebar/member 域；模板只在固定 host、明确方法、字段及预算内使用。具体 example 路径来自原实现，不从标题或用户文本拼任意 URL。所有 source parser 应把“没有字段”与“显式 null”区分，并拒绝把未解释的 gizmo 字段等同 Project 归属。

## 3. 模块、协议和实际代码兼容

保留原文件组织；以下新模块可以按职责合并小文件，不要求机械创建二十个类或引入框架：

```text
src/host/       contract、url-policy、profiles、chatgpt-adapter
               surface-discovery / loaded-metadata / send-correlator
               native-actions / mount-controller
src/runtime/   scope-authority / host-observation-gateway / reducer
               client-session / service-factory
src/navigation/mount-surface.mjs（从现有navigation抽宿主策略）
extension/     content-entry、worker、静态UI shell和同一renderer入口
```

HostSourceInbox 是 reducer 的小型有界队列，不另建同步引擎。权限、事务、分区和校准分别继续由现有 B1/B4、Repository、目录、FreeRuntimeService/FreeCalibration 拥有。

### 3.1 初始化无环

1. 顶层隔离脚本通过严格 `HOST_HELLO` 完成 browser sender/document/origin 验证，得到 DocumentBinding 与 producerToken。它不是原 `BIND` 的放宽版本，不可读取账户库存。
2. `adapter.start({binding, emit})` 注册列表/路由/元字段 observer，可产生当前文档提案；授权前仅有界 RAM 缓冲，不持久化任何账户数据。
3. ScopeAuthority 独立建立 principal/context；成功后使用现有 scope BIND/lease 才开放该 scope 的仓库和 UI。获取 context 所需的有限控制元信息走 HELLO 允许的白名单，不要求先有账户缓存。
4. 新 grant 不能接纳旧 document/producer/selection epoch 的缓存提案。重扫当前表面比把旧数据贴到新账户更优先。

### 3.2 类型合同和 legacy shim

`VAIWL_HOST_CONTRACTS.d.ts` 为规范接口；保留当前 `inspect().history/header/reading/navigationSlot` 字段和 `{ok,reason}` 失败形状。新增 rect/protectedRegions/regionEpoch 不取代旧字段。现有 navigation 尚用 MouseEvent.preventDefault；legacy shim 必须**同步**决定阻止默认动作，不能把 MouseEvent 序列化进 iframe RPC。

新路径使用 `planNavigation` + `dispatchNative`，旧 `openNative(url,event)` 只在过渡 shim 存在。不要让两条路径同时发送点击。`projectCreateHref` 保留兼容；无原生 href 则 null，交 `activateNative`，不拼假 query URL。

片段保持现有 `{refId,messageId,branchId,text,bodyHash}`，返回 `{ok:true}` 或 `{ok:false,reason}`。不把旧片段静默迁成只含 selectedTextDigest 的新格式。若将来扩充定位信息，应有独立版本与旧reader回归。

DOM Element、Selection/Range、MouseEvent 均留原 realm。向 iframe 发送 SurfaceLayoutDTO/NavigationPlan 的纯数据，不传 native DOM 对象。类型编译通过只证明静态引用一致；运行时必须拒绝额外字段、原型污染、跨字段矛盾和过大数据。

### 3.3 观察 ingress 和背压

Envelope 固定 `protocol/documentToken/producerToken/localSeq/routeEpoch/profileId/profileVersion/bodyProofId/kind/payload`。不接 `scopeKey/verified/actorVerified/channel/canonicalRevision`。producerToken 由 owner 分配，重启不复用旧序列空间；token 是关联工具，不是来源认证。

单消息同时限制 UTF-8 64KiB、最多256实体；某个大值须独立拒绝/分片，不靠JS字符数替代字节数。同 producer 的相同 seq+相同 digest 返回原 ack；同 seq 不同内容拒绝。先前已确认 ack 丢失可重送同提案，不生成新事件。

队列按身份撤销 > 确认发送/失败更正 > 当前对象 > 已见目录排序。标题/重复列表按对象/域合并；不能把一次确认发送挤掉。建议每文档256KiB、每scope 1MiB在途上限；溢出先背压、保留gap和重新扫描标记，不假装完整。无限滚动扫描分片约8ms/200候选，最迟250ms刷新一批，assistant token更新不驱动全库遍历。

## 4. 原生对象、按钮和成员闭环

### 4.1 URL身份规则

先验证 HTTPS、精确目标origin、无userinfo/异常端口、长度及编码歧义，再解析路径。拒绝 javascript/data、外站伪 `/c/`、编码斜杠/反斜杠、非法尾随段。身份比较忽略已确认仅展示用slug，但导航使用完整原生URL；未知query保留或拒绝由profile逐项规定，不能为方便统一清空所有query（temporary等改变语义）。

`/c/<uuid>` 给C身份，不给NONE；`/g/<container>/c/<uuid>` 给C身份/容器线索，不把custom GPT等同Project；`/g/<container>/project` 需 exact metadata或明确ID grammar。`g-p-...`不等于已证明固定32hex长度。分享页与临时对话不回退“近期第一条”。新增ID格式只改profile，不全库换ID。

同名不合并。原生Project ID与本地 renderKey、路由alias、organization/context ID严格不同。P改名不改P ID；C移组不改C ID；slug变化不生第二张卡。

### 4.2 没有ID/href的按钮不是死胡同

SurfaceDiscovery为**实际识别的原生控件**在WeakMap中分配 LiveNativeHandle，包含 documentToken/routeEpoch/regionEpoch/controlKind；节点、属性fingerprint和父区域留本地RAM。它只代表“这个当前按钮”，绝不是nativeProjectId。

临时项目条目使用独立renderKey，展示原生标题和可操作状态，放在未完成身份识别的项目候选区域；不占 canonical Project 计数，不借名字合并同名按钮。点击流程：

```text
候选控件仍是原节点 + 指纹/区域/epoch一致
 → 记录单次actionId和待关联原生动作
 → 仅激活该真实控件一次
 → 等待正常路由/Project标题区域/已加载metadata
 → exact P ID 与该激活结果关联
 → 同scope提升为canonical P，迁移临时展开/焦点，不产生重复卡
```

按钮重建/消失时旧handle立刻失效，新观察产生新handle。不得按标题、行号或“第一个匹配按钮”重找。若有同名双按钮，选择只与用户实际激活的对象关联。超时保留原生页面/候选；不得自动再点一次。用户自然打开后仍无法解析ID且有获准当前目录metadata通道时，执行一轮该域窄读；未获准/仍无证据则能力缺口明确，不用候选长期冒充完整映射。

冷启动空库存可以先展示当前原生控件，不能等待已有Project seed。已知href但未获稳定ID的路由候选可以保留导航alias，不伪装持久Project。已验证profile的正常“按钮→P页→C”旅程必须成功；只有故障族可以保持候选。

### 4.3 PROJECT/NONE/UNKNOWN

PROJECT由与P身份对齐的**原生成员区域**或明确成员元字段证明；侧边recent中Q的聊天不因在P页出现就归P。NONE要求经过正反样本证实的native无Project语义：当前对象metadata的membership字段，或用户自然打开的移动菜单中明确的当前无项目状态。一个未解释的 `gizmo_id:null`、无badge、无Project breadcrumb或普通`/c/`都只支持UNKNOWN。

所需正反样本包括：普通聊天、Project聊天、custom GPT聊天、Project内custom GPT聊天、共享/分支聊天、missing与null、移入/移出。一个profile没有取得NONE语义来源就不能把普通聊天功能标完成。当前公开来源存在custom GPT/共享项目等组合，不能将“不是自定义GPT”当作“无Project”。

UNKNOWN是一条正常可达原始引用，显示原名、原生链接和待核对状态，不随意挂任意P，也不放入声称确定NONE的清单。所有尚未发现的历史仍通过保留的原生侧栏/搜索/目录进入，VAIWL本地搜索不冒充全历史搜索。

### 4.4 分页与覆盖

观察只合并已见；unmount、分页未见、筛选、空页、网络故障不是删除。CoverageDomain按projects-index/recent-list/project-members/messages分开并携带filter/sort/branchScope。置顶区与近期区分开；滚动虚拟窗口换页不当一次新的近期排序。

记录有界cursor链摘要/最后cursor与gap，不无限保存token列表。terminal仅证明该次扫描到终点；无一致快照版本时为 exhausted-observed-scan/non-atomic，不是账户complete。部分成员不阻止P卡存在；memberSet完整性只控制严格库存/历史否定结论。

title上限继续沿当前codec。显示省略使用CSS ellipsis，不能把截断后的字符串宣称为完整原名或写入alias。真实原名超200时保留有效ID/URL和明确名称不可用/超限状态；只有真实样本证明需要时，在原B2/B5做窄字段长度升级及容量回归，不放宽总库护栏。

## 5. 生产身份、上下文和来源凭据

### 5.1 信任模型必须可实施且诚实

信任Chrome提供的sender/document/frame关系、本扩展包内固定代码和第一方认证来源；不信任任意DOM/MAIN字段、帖子链接、model输出、page nonce或自报verified。来自正常第一方应用的数据也不是浏览器签名的事实；源码/字段存在不自动证明本人、持久发送或时间语义。

威胁边界包括同页伪造字段/bridge消息、旧tab/响应、非授权iframe；**不承诺抵抗已完全控制第一方源站、浏览器或本扩展的攻击者**。正常宿主自己管理的service worker属于需要说明的第一方运行边界。不能为了宣称无限强身份保证，要求一个宿主实际不存在的“服务器签名当前tab工作空间API”。

### 5.2 SessionIdentityProvider：主通道与可执行备选

主通道是worker对固定session地址的只读请求：credentials使用浏览器正常策略，cache:no-store，6秒总期限，拒绝意外redirect/HTML/未知MIME/过大响应，严格提取user.id/expiry等。仅固定profile可发请求，不接页面给出的URL、header、token或返回JSON。认证principal以独立namespace编码适配现有token字段，不能使用email/name作为ID。

备选是**包内隔离世界的固定同源读取器**，不是MAIN auth bridge：worker给已验证topframe发送一次challenge与允许的provider ID；隔离代码自行调用固定same-origin fetch，最小化响应，经自身runtime通道回应。worker复核challenge、sender/document、前后epoch、schema和expiry。网页不能调用该读取器指定目标、提交JSON或获得认证响应。此通道需注明第一方service-worker信任边界，最终单独G验证。

凭证原则：主通道token只在worker私有RAM。若备选provider需要在隔离代码内部继续完成固定accounts查询，可在该隔离闭包短期使用它，只返回最小principal/roster，不将token传给MAIN、UI、日志或持久存储。这是明确的备用凭证边界，不能同时声称“token从未离开worker”。不请求cookies/debugger权限，不要求用户复制凭证。

### 5.3 ContextBinding：实际选中与账户权限分开

可接受的三种ContextProof，按profile支持情况选择，不假设全部同时存在：

**C1：认证响应明确给出与当前document/选择epoch相关的active context。** 只有真实字段/语义已经证实才使用；本轮没有证明所有ChatGPT变体具备此接口。

**C2：认证roster + 浏览器正常请求上下文 + 当前页面关联。** 这是多workspace的具体候选实施路径：

1. 由session/固定accounts读取取得principal有权访问的context集合。roster本身不是当前选中证明。
2. 使用只读`webRequest.onSendHeaders`记录精确白名单native数据路径上浏览器给出的tab/frame/document/requestId/initiator和`Chatgpt-Account-Id`候选；不监听requestBody、不使用blocking或extraHeaders、不记录Authorization/Cookie或其他header。API回调可能提供其他字段，代码必须立即丢弃，不能谎称接口只暴露这一个字段。
3. 与相同requestId的成功响应元信息/无错误结束关联；只接受当前document、当前selection epoch、非扩展自己发出的核验请求。requestId不是时间或身份凭据。
4. 该context必须属于认证roster，并与当前native加载域/当前对象ID关联。必要时以固定、窄范围认证对象读取确认该context下的对象事实；“同一对象两处都可访问”不能单独确定选中状态。
5. 有切换信号时旧grant先失效；不同context请求并行、旧完成包、prefetch或背景域不能选择新context。新一轮当前页面数据明确一致后才发grant，保留reason与关联收据。

C2证明的是**当前第一方应用请求与已授权context的一致关联**，不是服务器对当前tab的加密签名。仅向页面post同名header不能生成Chrome receipt；但webRequest也不能鉴别完全恶意第一方JS意图，不夸大其威胁覆盖。

**C3：仅一个有效个人context，且当前profile已证明该变体的默认个人绑定语义。** 只有roster数量为1仍不够，不盲填default。个人/组织/Project三套ID不混用。

网络内存缓存、首次加载早于扩展、无header、切换不发请求时，C2可能没有receipt。不得用缓存URL/名字/用户选择cookie补权威；保留原document已确认且尚有效的context或触发一轮固定认证重核验。冷启动仍缺证明则ambiguous，原生继续；此变体的全Free支持待相应C1/C3或真实可用C2建立，不把不支持泛化为技术不可能。

### 5.4 性能、时限与隔离

`resolveScope`在热路径只使用`ScopeAuthority.peek(frame)`的内存授权快照；`refresh`在bind/focus/expiry/auth-change触发且单飞去重。现有broker/FreeRuntimeService前后栅栏保留，但不每次栅栏都fetch session。任何IDB事务内部不await网络。

20秒lease继续约束document/client权限；session proof取session有效期与本地短期复核策略的较小值，不因反复CHECK延长。失效信号立刻撤grant；有效刷新可续认证证明但不能续活动事件时间。认证等待不占住一次仓库RPC，明确PENDING并保持原生可用。每个浏览器隔离分区和incognito上下文分别绑定，生产默认不支持未验证的隐身混合存储；不得跨正常/隐身或账户共享cache。

浏览器事件只证明文档/路由；账户切换未产生任何可观察信号的瞬间不可能被宣称已检测。记录“收到失效信号→撤下派生UI”的延迟，并在可检测切换中不得出现旧cache发布到新grant。定时续lease不能当实时账户认证或强制保活worker。

### 5.5 来源注册与权限

worker注册source profile，规定可读域/字段、信任等级、是否允许生产启用、许可和capabilities。低信任提案可以创建`dom-observed`收据，不因此获得`authenticated`或actorVerified。EvidenceLocator仅定位证据；receiptId必须在owner表中真实存在、匹配scope/document/profile/目标和语义fingerprint。

主要权限仍为目标HTTPS host、webNavigation，以及确需的storage/scripting等公开扩展API。C2需要webRequest时按能力明确申请/启用，只读无blocking；无权限时C1/C3可以继续，不能静默越权。source权限与UI grant、事实freshness、持久source generation分开。生产依赖闭包不含synthetic grant/种子/固定时钟；同库保留旧Pro资产而不提升其source trust。

## 6. 消息时间、本人发送和自然更新

### 6.1 元数据读取必须具体，但不越界

按固定profile依次读取：native元属性 → 正常加载JSON的白名单字段 → 有已知结构的loader own data properties → 获准的当前C固定读取。禁止全局递归搜时间、eval、调用getter、枚举React fiber、clone包含session的bootstrap。正文/附件在parser中跳过，不为活动索引落盘。

现有公开实现的conversation detail通常包含`mapping/current_node/message.author/message.id/create_time`，但不保证当前每种宿主协议都有这些字段。若读取detail，必须明确可能接收到当前C正文，限该对象与预算，不声称存在已证实的metadata-only API。默认自动读取仅针对当前或在正常活动域中需要核验的对象；不得启动全历史循环。最大解析预算在profile固定，例如总响应8MiB、深度32、单批消息256、总节点10000；超限partial并说明未覆盖，不能把budget当完整性。上限是实现初值，真实长聊超限应改为流式元字段归约，不无限扩大正文缓存。

如需response tap，仅对允许且**已经由宿主发出的**请求旁路归约。原fetch必须以原receiver/参数调用并直接返回同一个原Promise；另挂catch处理的旁路，异常不反向reject宿主。使用clone/tee前检查bodyUsed/MIME，读分支受字节/时间/并发预算约束，cancel该分支而不cancel原请求。不能保证任意stream clone零开销，压力验证不达标则关闭tap、走已有元数据或获准当前C读取。XHR/WebSocket不是默认扩围。

JSON、SSE、`application/vnd.openai.conversation-source+ndjson`分别解析。R0里revision/baseRevision/status/HTTP Date不是消息发送时间；opaque conversationState不解码、不当认证材料。HTTP Date最多用于本机时钟异常诊断，不能写sentAt。

### 6.2 body proof与作者证据

route=C只表示浏览器请求打开C。当前body需独立容器ID或同一current response中的C及message IDs与活动消息区域对应；来源必须受当前document/route/body epoch约束。旧隐藏body、虚拟重挂、多message ID块都不可直接产生新发送。若body一时未就绪，导航可以保持原生加载，暂停消息绑定，不阻断其他已见对象。

角色user不是本人。强本人来源为认证作者与principal一致，或经过真实语义验证、明确排除共享/导入/复制他人分支的单作者协议。即使当前用户拥有会话，也不能推断全部历史user消息由本人发送；共享Project的可见创作者图标不充分。

本地发送可用“真实原生发送意图 + 独立确认的message/operation ID + 接受/持久化状态”关联本人。仅气泡出现、HTTP200、整个流complete、点击Send均不足。Intent识别不复制草稿，忽略IME组成、换行、停止、上传和重新生成。若确证ACK只能来自可随意伪造的MAIN字段，则保持候选，不能提升；优先当前对象认证读回对应message进行确认。平台/user手势因果语义属于profile的G门槛。

### 6.3 原始事件、观察锚、近期顺序是三种不同对象

**UserSendEvent**：本人/message/真实或可核验lineage/committed/new-send/原始时间语义完整才建立。精度显式，秒不装毫秒，区间不伪instant。create_time须测试编辑、分支、重开后的意义，不单靠字段名提升。

**LocalSendAnchor**：已经确证本地发送成功、但无可靠原始服务器时间时，在现有evidence分片中新增版本化的`observed-self-send`逻辑记录，不另建数据库。保存首次确认的本机观察区间、message ID、ACK witness、clockBasis与校准期限；它始终只支持provisional ActivityDecision，**没有sentAt/serverTime字段**。

`calibrationDueAt`到期只代表需要重核验，不删除一次已ACK的活动；重复poll/重开不会把firstObservedAt或区间向后移动。该锚自然随H/T/Z变老。如果之后发现ACK误配、实际失败/撤权，则撤销该锚；没有新证据不得十分钟后自动回到数月前。现有短期`local-confirmed-send` hint保留原语义，不批量当永久锚；只有新的确证ACK可建立新记录。

本机时钟跳变或不能合理约束区间时不持久编造日期，保留当前发送导航例外/无日期状态并校准；测量原生ACK延迟与本地投影延迟分开。原1秒指标从合格证据到达开始，同时报告“用户发送→合格证据”的耗时，不能把昂贵校验藏起来。

**RecencyObservation**：当前已加载同域列表的baseline/order/new ID变化只触发发现、排序候选或校准，不形成日期或本人事件。首次安装不把25条全记“新发送”；pinned、筛选与虚拟窗口变化要建立不同baseline；相同digest不续锚、不重做全库。

### 6.4 幂等、不可变事件和branch

事件语义键采用 `(scope, conversationId, messageId)`；message ID在scope内的唯一性不足时以profile定义的服务器节点身份补充，不能拿当前branch leaf补漏洞。规范内容fingerprint仅覆盖消息身份、作者、原始时间/精度/事件种类，不包含本次observedAt、source读取时间或当前视图branch。

首次入库保存原不可变event；重开相同语义event复用它，新增/刷新的是独立witness/lastSeen，而不是改event.observedAt去触发immutable conflict。相同message的两个不同原始时间保留冲突，不取较晚值。

branch/lineage用于定位和coverage。只有真实branch ID才叫原生branch；派生谱系固定为“根至该消息”的节点链身份，不能取“根至当前末尾”的hash。新增回复、切换可见branch、同消息显示于多个块都不得重复入账。parent缺失/循环时partial；无全branch证据不标all完整覆盖。复制到另一conversation不得自动继承“本人刚发送”。

### 6.5 活动质量与校准

沿用现有max本人活动、60天旧锚provisional下沉、NONE自身分段、未知可达、完整自动H选择。已确认近期正证据不需全历史；完全无时间不能硬放上月，也不能无限“正在加载”。Project成员partial不阻止展示，只限制严格历史否定结论。

校准复用现有6秒/30秒/12次/最多2次重试预算；**同scope同source域跨lease、worker重连和多tab去重**，不能每次renew都重新启动12次网络读取。可持久保存不敏感的预算高水位/continuation，不持久授权。可见当前/本人发送优先；认定无支持source须立即unsupported，重试无字段没有意义。前台自然更新重新触发，不后台打开隐藏聊天。

跨端只在桌面native数据中实际出现新信息后自动更新。若变化只给updated_at/顺序，先置dirty并做该受支持域校准；没有消息/作者来源就不能标“本人刚发送”。“收到上游证据后1秒投影”与“远端发送到桌面可见”分别报告。未建立这条闭环时FR-08不通过，不能拿可搜索代替默认活动正确。

## 7. v2.7完整挂载、导航与退出

### 7.1 一次必要替换：manual Popover + 声明式限定view mask

保留扩展origin UI iframe以隔离缓存私人标题；复用现有Free renderer，不重画ChatGPT。**撤回原版auto Popover以及“生产绝不影响任何native显示/交互CSS”的绝对禁令。** 只允许下面有证明边界的reading及§7.3纯history最小view mask，不允许回到可遗留的HTML inert/永久style。

普通不透明overlay不能排除背后transcript焦点与AX内容；auto Popover会因操作旁边侧栏而关闭。这不是可以靠额外z-index或禁用Tab解决的小问题。

工作区用`popover="manual"`；其rect只覆盖独立reading区域，不包含composer、模型/工具header、侧栏或native门户层。对唯一确认的reading节点加不含私人内容的opaque marker。自有stylesheet将view mask绑定**浏览器真实`:popover-open`状态**，而不是只绑定JS变量：

```css
/* 示例中IDs/marker由包内代码生成并正确转义；不得从页面文本构造selector。 */
body:has(#va-workspace-N:popover-open):not(:has(dialog[open]))
  [data-va-reading="N"] {
  visibility: hidden;
  interactivity: inert;
}
```

完整实现还应在同一个predicate中排除当前profile可证明的native popover/开放portal，确保“原生层优先”时mask与workspace同时挂起。不要用所有`[role=menu]`的存在作为CSS open判断，很多宿主长期挂着隐藏menu。具体开放状态由profile定义；DOM-only可见层由早期交互观察/局部observer触发suspend。只有独立reading且protectedRegions不在其后代时允许mask。

`visibility`保留原布局；CSS interactivity使背景不可焦点/编辑/选择/AX访问。**不写原生HTML inert/hidden/aria-hidden，不更改native display、节点父子关系、composer内容或handler。** 关闭popover或移除自有容器后，mask selector自动失效；marker遗留也不应有副作用。原生原有inert/visibility必须尊重，不主动强改为auto/visible。

**自观察反馈防护：** 自己的marker/style/布局消息不触发native证据更新；已经确认的reading/history被自有mask隐藏时，不以此判断native body消失，避免“隐藏→失效→拆挂→重挂”循环。保留原node/region epoch，native路由、class/开放状态或节点真正变动时，先suspend解除自有mask再重新inspect。派发一个当前被自有sidebar mask覆盖的native anchor之前，先解除对应mask、复核真实节点可用，再click一次；不能借自己制造的hidden把所有native入口判不可用。不得依赖window[id]隐式全局取DOM节点，使用明确节点引用/查询。

CSS interactivity在Chrome135引入；生产完整挂载profile以公开能力为候选底线并做feature-detect/实际行为测试，不能把旧simulator的minimum120视作新能力已支持。版本或能力不足可退原生，但不得计为完整UI支持；最终最低支持版本由实际离线矩阵确定。此机制的局部反例/修正已验证，**完整MV3生命周期仍待执行**。

### 7.2 关闭、原生弹层和浏览器故障

iframe外、同一popover树内始终保留可聚焦的声明式`button[type=button][popovertarget][popovertargetaction=hide]`。关闭控件负责退出增强/返回原生阅读，不是第二个工作区返回。即使UI frame无响应或content JS停止，浏览器原生按钮仍可关闭表面并解除CSS mask。

manual Popover**不自动响应ESC/轻点外部**。正常运行时仅在焦点位于自有UI且无内部menu/IME时处理ESC关闭当前自有层；不在宿主全局吞ESC。frame内若先有menu，第一次ESC只关menu。JS已失效时不宣称ESC仍一定可用，声明式关闭按钮是无JS退路；键盘必须能到达它。

原生model/tools/search/账户/文件/权限控件被激活前，controller只执行自己的suspend，不preventDefault/stopPropagation原生事件。原生程序化dialog/popover/Canvas出现时同样让位；DOM变体未经识别不能靠最高层级压过去。VAIWL侧栏展开/滚动/筛选不是native弹层，不应关闭工作区。恢复条件是同scope/route/region仍有效、原生层已关闭且未转入native输入/导航流程；不抢回native焦点，不自动打开被用户明确关闭的workspace。

普通失焦不销毁工作区的H/T/Z/展开/scroll；进入native composer或执行原生导航时可进入reading模式，四格返回恢复来路。挂载必须检测workspace区域、frame和reading marker同时存在且区域不相交；重建时先隐藏自有surface，再重新授予新frame绑定。

**disable/uninstall的三个指标分开：** nativeOperable、privateProjectionAbsent、cleanLayout。清理代码不执行也不能遗留原生不可操作状态；私有frame在被浏览器撤销后仍展示旧cache为失败。frame原生生命周期的这项行为本轮没有实测，列为最早S关口，不留到完整UI开发末尾。正常JS下另加grant-expiry清屏；它不能代替浏览器hard-kill保证。

若S证明已禁用的frame仍残留敏感画面，不允许“还有关闭按钮所以安全”作为通过。先在同一MountSurface中修复资源/iframe生命周期；若浏览器机制无法满足，关闭该挂载capability，原生与人工资产保持，**该浏览器/profile不满足完整Free，不发布**。不偷偷改用宿主ShadowDOM承载全部缓存、不用侧面板残缺版冒充v2.7。冻结进程的旧像素不承诺瞬时擦除，恢复后必须先重验grant再发布任何私人数据。

### 7.3 连续侧栏和视觉一致性

自有sidebar frame是现有导航的渲染出口，不另建独立状态系统。**正常展开侧栏采用同一个MountSurface管理的第二个manual surface**，固定在经过确认的纯history列表区域；保留native顶部新建/搜索/项目目录、其他功能入口与账户footer。workspace和sidebar分别开闭，共享同一ViewSession，侧栏操作不触发workspace的light-dismiss。

已有原生history节点不移走。只有profile证明它们构成不含native功能入口的list root（或有限个独立安全root）时，才允许使用与reading相同的声明式CSS视图mask，predicate绑定该sidebar surface的`:popover-open`，不写HTML inert。CSS排除其他native层时必须排除两个自有surface ID，不能将自己另一个面板误识别为native modal。原生全历史/项目目录和搜索入口始终可达，sidebar frame外另有“显示原生列表”声明式关闭控件；这是原生列表切换，不是第二个工作区返回。关闭/撤下该surface后原native列表立即恢复，未发现历史不会从原生通路消失。

若当前结构把history、工具、账户混成无法安全分割的root，不整块mask。该变体可以保留附加可达能力，但不能宣称完整连续侧栏已验收；需在profile中解析真实边界，而不是把巨大列表附在最底部充数。两surface沿用相同几何/失效/关闭实现，不新造第二套窗口或状态引擎。

workspace/sidebar共用同一owner ViewSession和同一事实索引；向两frame发送有界显示DTO/增量，不各复制整个100k集合。样式、icons、卡片布局从现有代码抽出复用，字体/主题只传白名单token，不能假设iframe继承宿主字体。不得自动抓取宿主私有字体资源。原样卡片三列适配、5行预览/+12、主页不折叠、侧栏可折叠、左侧旧项箭头、无项不留把手、上下段/当前无向上、完整H选择/固定/搜索/工作集/片段均要截图与交互对照。

**单一四格返回**仍在阅读区域左上已验证空位；workspace主页不显示。删除原版“header不足就改为sidebar/rail返回”的兜底，它违反v2.7。可以根据真实header/reading几何在同一批准区域选择一个有空间的slot，不挤模型/分享按钮；没有slot是受限变体，不能靠多个入口蒙混验收。原生搜索、新建及应急关闭不是额外工作区返回，不混淆语义。

Project卡标题保持h2层级、不变整卡折叠按钮；可用h2内真实链接/独立原生打开控件完成P导航，子聊天/更多/旧项不冒泡触发P。返回时恢复原H/T/Z、scroll、展开和调用来路；后台策略改变不重解释正在浏览的历史段。

### 7.4 UI frame绑定：只增加一次受限握手

保留两通道join关联但简化为一次性配对：静态UI脚本生成随机key，通过runtime与parent分别发送；顶层content仅对自己保留的iframe.contentWindow、connected节点、mount/region有效时响应。worker核对两方Chrome sender、实际parent document/frame、scope grant与mount；同key冲突/重复/过期拒绝。key不写URL，不当账户凭据。

UiDocumentGrant记录workspace/sidebar角色，不放宽原B1 topframe观察入口。WAR仅暴露必需静态壳/资源，对目标origin限制；data/backup/session不是WAR。页面自己嵌入同名WAR frame拿不到grant。私人projection只走runtime有界消息；parent postMessage只有关联/几何非私人控制，不传标题或token。

UI可执行既有人工显示命令和owner-issued目标计划，不能发任意URL/JS/CSS/selector、通用fetch或raw Repository batch。若宿主CSP阻止frame，则该profile需具体兼容修正；不修改宿主CSP、不绕政策、不改为在page DOM泄露缓存。独立离线CSP正反测试先完成，实际宿主CSP最终G验证。

### 7.5 导航先计划、点击只派发一次

在渲染时为可见目标准备NavigationPlan：同目标/body已确认、可委托的native control、无风险same-tab href、有风险new-tab-preserve-current、暂不可用。计划绑定目标、document/region/grant、revision；实际派发前复核节点与版本。不要把“有一个字符串href”当所有情况下都能安全卸载。

- 普通左键走native委托时，**iframe事件内同步preventDefault**，发送一个actionId；controller校验并click原真实anchor/button一次。异步rpc没有浏览器user activation传递保证，不能声称随机gestureId解决了受保护API限制。native控件若要求真正原地用户激活，保留原入口让用户完成；把这条限制按具体action记录。
- 纯href计划不异步拦截，设置正确`target=_top`或`_blank`和rel策略，交浏览器原生导航。正常native href是最佳备选，不直接pushState伪造SPA，不调用React私有router。
- Cmd/Ctrl/Shift/中键在有有效href时保留浏览器行为；modifier click不同时派发native click。无href的真实button本来就没有“新标签打开”语义，明确作为button而非失效超链接。
- 同一actionId重复rpc只返回已派发状态，不再click；ACK丢失/超时返回unconfirmed，不自动href补跳。观察route/body确认实际结果，用户可以随后显式重试。
- 没有native anchor且存在或无法排除未发草稿、待提交附件、上传/语音/生成、Canvas未保存时，只显示明确的“保留当前内容，在新标签打开”真链接。风险在计划后变化时撤销旧same-tab计划，当前次激活不自动换新页，需要用户看到新方式后明确点击。

route相同不必然body相同；只在两者匹配时直接恢复原生阅读。已缓存URL失效返回404/加载错不会触发删除或重新创建。native Back/Forward不被VAIWL添加历史entry或改history.state；这里只保存自己的视图状态。

### 7.6 原生新建、焦点与片段

新Project/新聊天只进入真实native入口。Project内新聊天若当前页无控件，先按普通P导航进入该Project，由用户在原生页完成后续；不静默执行多步后台创建。全站新聊天与Project新聊天为不同action类型，不用null缺省猜目的地。取消不建假卡；发送前新空聊可作为临时当前上下文，不制造sentAt。

原输入DOM和handler保持。input/textarea记录selectionStart/end；contenteditable仅RAM保存原节点与Range，restore前检查同document/body/composer和connected。原节点替换时不复制旧草稿/HTML回写，交宿主；任何选区/草稿不进DB/报告。

片段读取仅用户明确选中的原范围，继续2000字符上限及bodyHash定位；多ID块无法绑定单一message/lineage时不建立虚假精确锚，提示原生搜索；原先已保存的人工片段资产原样保留，不另造无版本的新片段格式。不会因自动活动采集而读取所有正文。

## 8. reducer、局部版本、事务和恢复

### 8.1 一个normalized source，不是抹平所有证据

使用现有NativeRepository一个scope的canonical source以免多个producer互相触发native-source-conflict；每个字段保留具体receipt/profile/producer generation/verification epoch。source本身不是“所有输入可信”的标签，生产gate由owner安装。持久generation不随worker重启变；文档producer重启只失效其未处理提案。

尽量把小型field witness、局部setRevision和coverage摘要存进同native piece/元记录，以同CAS提交。不要添加第二份完整refs表或无限observation log；每字段最多保留当前和有限冲突候选，旧审计按既有retention整理。source协议撤销时精准失效相关profile/witness；整个源授权被撤销才禁用全部对应数据。

### 8.2 版本和冲突收敛

sourceRevision仅表示本地提交次序；fieldRevision表示字段裁决版本；setRevision是P成员集合版本；upstreamRevision只有语义确证且同域时可比较。无关Q改名不改变P的成员证明。scan完整性和用户活动覆盖不是一个版本。

同producer/epoch的seq拒旧；跨tab不可比较的P/Q成员冲突先UNKNOWN，保留C原始引用。然后为C启动**去重的当前事实核验epoch**：有认证当前C元数据或确定post-move见证时，在该epoch下裁决；旧verification epoch的提案不再推翻结果。没有更强来源则维持UNKNOWN而不是随机取最后包。域完整扫描可作为覆盖见证，但无因果snapshot不能当“无更晚变化”证明。

本机接收时间晚不代表上游新。刷新source.revision不能续原活动锚。临时候选、source/body/visibility变化不应导致整库fullread；只失效关联project/ref/evidence索引页。注册表最大容量、处理预算用原F1/Repository上限，不因引入证明字段失控增长。

### 8.3 freshness不是授权，也不是删除

ScopeGrant过期/切换即停止该scope显示和写入；对象事实的新鲜度过期仍可作为**同已授权scope的last-known**，但不能继续标当前已核验或完整覆盖。明确权限撤销/删除证据与普通TTL分开。

新codec把live grant、source revocation、row freshness及历史事件有效性分离；旧codec按原语义读取，不通过改一个synthetic字符串来提升。last-known标题可显示“上次确认”，可靠原链接可达；过期成员关系不得被当最新确认、不能用它作严格历史否定。出现真实冲突才切UNKNOWN；不会每20秒lease到期就删除Project、失去全部姓名或清空历史。

### 8.4 两仓库提交：复用事务和最小continuation

Native和Evidence是独立提交，保留“native成功先可达、activity仍pending”的语义。新增加的只是**观察提交continuation**，不是第二个事务引擎或原生动作账本：

1. owner校验提案，产生确定性的operationId/semanticFingerprint、native delta和有界evidence payload。
2. 在现有NativeRepository.apply的同一`native_states/native_operations`事务与expectedRevision CAS中提交native delta及`pending-evidence` continuation，同时存最小admission witness（scope、profile/version、source generation、已核验语义指纹/类别、acceptedAt）。只有RAM receiptId不够，worker重启后它已不存在。必须实际修改该owner接口以容纳严格codec；不得native提交后才另开事务写receipt，留下丢窗口。
3. EvidenceRepository.apply使用稳定operationId与immutable语义去重提交；成功后标continuation complete。重复同输入复用原event/ACK。没有native delta的纯evidence读取使用既有evidence operation receipt，不强制空写native。
4. 中途退出：正常worker重启取得新scope grant后，校验本地owner已原子接纳的admission、payload digest与未撤销的同profile/source，可以补**观察记录**，不必为了找已丢失的RAM receipt再次抓正文；source变化/撤销、admission不完整或备份恢复来源则needs-revalidation，在允许的当前对象自然核验时重建见证。绝不重发原生send/create或恢复旧授权。
5. UI publication使用nativeRevision/evidenceRevision/pending标识，不因一个仓库已新就称“活动全部刷新完成”。现有HEADER/PAGE/CHECK组合栅栏继续使用。

continuation放现有native_operations命名空间，建议单条≤64KiB、每scope≤256条且≤1MiB；达到上限先背压/合并不影响因果的观察。超大batch必须拆为各自合法一致native变化，不能把单个C移组拆成半关系。pending记录在GC/retention下受保护；年龄到期不能静默丢未提交活动，转needs-revalidation后保留最小目标/witness摘要。恢复备份不恢复pending授权或自动发包。

### 8.5 与Round60启动路径的整合

现有`FreeRuntimeService.sourceFor`接reducer/inbox，不新增全局scheduler。使用`publication:'invalidation'`和`readCached:false`避免HEADER/PAGE之外又全量read。workspace/sidebar frame只得到可见切片，不复制两份100k index。

直接复用已实现的 `src/data/free-header-loader.mjs`：通过 `B23_FREE_HEADER` 的 `staged:true` 接收 `{preparing:{scope,stage}}`，stage按已注册顺序前进，重复/回退/未知stage或scope改变拒绝，最终只发布无preparing的完整header。当前列表包含native-bootstrap/native-index/shared-directory/evidence-directory；生产zero-seed不会因此获得合成native-bootstrap许可。使用既有约定跳过不需要的阶段；确需新schema准备阶段时同owner同时扩展协议/loader/测试，而不是另建并行loader。

现有service已将native/shared/evidence迁移分阶段；保留legacy无staged请求兼容、6秒单RPC和最终CHECK。真实新字段迁移若单阶段超过预算，需要在既有owner内有界改造；已完成的staged不能被回退为单个巨型HEADER，也不能用preparing当空库存/READY。原instant缓存只缓存输入解析，不缓存作用域授权/活动裁决；继续复用。

同DB schema、旧reader拒写、CAS/inverse、人工patch、备份和已验证fresh-byte checks保留。Free↔Pro保持旧人工资产字节和ID；native观察不执行虚拟MOVE/SET_TITLE，也不改原生Project/聊天标题。

## 9. 逐文件最低集成面

| 现有位置 | 必要集成 | 不得重复/破坏 |
|---|---|---|
| simulator/adapter.mjs | 包装SyntheticHostAdapter/legacy shim，共用观察与导航合同 | 旧合成fixture仍可独立跑，不给真实域测试权 |
| simulator/host.mjs | 保留；新的native-shaped夹具另由独立expected world驱动 | 不通过hf属性暴露全部答案 |
| simulator/client.mjs | 抽client-session，注入adapter/clock/transport；已有replica/分页/重连复用 | 不回退当前shared-directory相关改进 |
| simulator/service.mjs | 抽service-factory，生产zero-seed；scope peek/refresh独立；接已有sourceFor | 不为每个frame新建库/复制全快照；复用当前staged loader/owner |
| simulator/build.mjs / package | synthetic目标不动其权限边界；新增production/local-fixture composition | 自动检查依赖闭包；frame assets/WAR只按需 |
| b1/identity.mjs | 保留scope/token形式；边界domain-separated ID编码 | 不按displayName、Project.organization猜账户 |
| b1/document-binding-broker.mjs | 单独HOST_HELLO、typed ingress、缓存scope resolver；UI独立grant | 原BIND/seq/topframe/actual document/20秒lease继续严格 |
| native-facts、native-repository、native分片/目录codec | owner生产channel、字段witness/成员set/coverage、同事务continuation | 新字段不能未进入hash/容量/迁移/GC验证；不重建目录 |
| free-evidence及其repository/codec | semantic事件去重、observed-self-send版本化记录 | 不改变旧strict event语义、原raw事件不篡改 |
| free-projection / free-activity | 新鲜度与授权分离，局部见证；观察锚始终provisional | UNKNOWN≠NONE；Free不读Pro改名/虚拟成员 |
| free-runtime / free-runtime-service | 接受owner注册source；共享预算/去重；继续invalidation出口 | 不再在热路径全量snapshot或每次网络认证 |
| free-calibration | 原算法/预算优先保留，生产source表达unsupported/dirty/continuation | 不并列第二个轮询器；不靠lease循环重置预算 |
| navigation/navigation.mjs | 分离native DOM controller与renderer；legacy字段兼容；导航预计划；声明式mask | 卡片/历史/工作集/片段/风格不重做；原HTML inert不留生产 |
| navigation/current-index / styles / icons / free-view | 保留Round60实际实现，必要原生URL alias判等；保留instant纯解析缓存 | 缓存上下文含scope/profile/route，不退回旧快版本 |
| shared-directory-* / partitioned / repository / hash | 消费现有API，metadata加字段由唯一owner处理 | 禁止第二套shared目录、hash算法/落盘checksum变更和重复性能工程 |
| experiments/r0、旧报告与design/approved/v2.7 | 只读作证据/视觉参照 | 不改旧失败成PASS，不把合成聊天HTML搬到生产 |

接口抽取先保留旧export wrapper，正反合同通过后再删重复实现。无需把每个小函数变一个service；本包的模块名是责任边界，不是必须引入的框架/依赖列表。

## 10. 原A–G内的执行顺序，不建平行计划

A/R0现有任务负责profile来源、身份/成员/时间语义和最终G确认；此轮不重跑整个R0。B1.F处理身份/文档/观察/UiGrant；B2.F1负责IDless→exact、成员/覆盖；B2.F2/F3负责消息/观察锚/自然更新；B3.F保留用户工作集和偏好；B4/B5按既有owner处理source/CAS/continuation/升级恢复；C1保持视觉，C2优先生产挂载/导航，C3–C5补完整交互，C6保留真实旅程；F1按最新基线回归，F3负责构建/权限/退出，F4真人低维护和误判验证。D/Pro新AI、可选E代理原生写、F2同步、PAIA数据协议继续后置。

实施顺序只调整依赖优先级：

1. 在自然checkpoint保存当前owner成果；公共类型/legacy shim与独立fixture oracle；**最早执行frame生命周期/声明式mask的实际S试验**，不先做全部UI。
2. B1.F + B2.F1 + C2 一个完整纵向切片：空缓存→认证/当前context→原生已见P与普通C→既有FreeUI→原生P/C/创建入口→阅读四格返回。
3. B2.F2/F3 + C3/C4：有/无原始时间的本人发送、旧项/跨端dirty、工作集/片段、原生搜索、待核验对象可达。
4. B4/B5 + C5：多tab、同URL换账户、scope失效、schema/continuation/恢复、实际disable/uninstall、200%/键盘/主题/全部批准视觉。
5. C6/F1/F3离线退出；原81项支持族正向成功，故障族安全退让；输出固定G/U验收包，不再交研究提案。

可以并行纯parser/send/reducer模型测试、DOM/actions/mount、独立fixture/oracle。broker/service/client/navigation/schema由唯一集成owner串行接线，Git只有一个writer；不增加worktree、仓库或PR。当前shared目录/staged loader工作不被外来代码覆盖。

## 11. 剩余关键假设、最小实测与失败退路

E=已读源码/标准/原记录；L/S=本轮设计待实现验证；G=实际ChatGPT字段/行为；U=真人/物理环境。不能将E“有一种实现”升级为G“当前全部可用”。

| 条件 | 已有证据与待证明部分 | 最小最终检查 | 不通过的工程退路 |
|---|---|---|---|
| session与principal | 固定session实现E；worker cookie/隔离固定读取的当前实际行为G | 同一受控用户重开/刷新、退出→另一用户、失效响应；两provider分别记结果 | 改固定transport/schema，保留cache锁；不把DOM身份替代，受限profile不启用 |
| 多workspace context | roster和header工程路径E；当前选择关联完整性G | 同一用户个人→workspace→个人，至少一次同URL切换、缓存恢复、两个tab不同context | 在C1/C2/C3中选择实际成立的profile；缺证据不guess，其他scope资产不丢 |
| Project稳定身份 | 原生链接/按钮学习E；当前实际ID字段G | 两个同名P，其中一个首次只有button；打开后唯一ID→卡→成员→返回，改名后ID不变 | 更新route/loaded目录parser或当前域窄读；不按名字合并，不持久候选假ID |
| 普通聊天NONE | 当前合同E；具体当前字段/null含义G | 普通C、P内C、customGPT与P内customGPT（宿主支持时）、移入/移出 | 增加当前对象/原生菜单证明profile；未证明不算FR-02完成 |
| 本人/时间/ACK | mapping与时间字段路径E；原始意义/作者/新协议G | 本人正常发送、失败/停止、重开相同message、编辑/分支；共享来源反例 | 原始time不成立时用已ACK观察锚且provisional；本人ACK也不成立则发送能力未通过，不伪造 |
| 旧历史与跨端 | 算法L/S可做；上游旧时间与其他设备更新G/U | 一个真实60天以上旧C和P；另一原生客户端向旧C发一次合成消息，桌面自然重见 | 定向修当前source/foreground刷新；记录上游延迟；长期undated或需人工补数据不放行 |
| v2.7与native全链 | 原型/当前rendererE；局部manual/CSS机制本轮Web证明；完整S/G/U未证 | 当前支持壳的主页/阅读/侧栏/历史、model/tool/file/权限/草稿/Back，与批准同尺寸对照 | 修改具体boundary/geometry/字体token；不是无限增加NATIVE_ONLY，也不改产品视觉 |
| 生命周期与CSP | Chrome公开机制E；本轮S装载受策略阻塞 | 干净本地Chrome装真实MV3，workspace开关两态disable/uninstall/restore、frame断连；G再测实际CSP | 修同一MountSurface；敏感残留不能接受，无法满足则该浏览器完整profile NO-GO |
| PAIA与物理IME | 原兼容目标保留；本轮未验证 | 真实PAIA各自/共存/反向加载，物理中文输入/菜单/缩放 | 定位具体事件/布局冲突，修适配边界，不读PAIA库/不去掉其功能 |

最终真实测试只用明确获准的干净账户/样本和**任务级总动作预算**。先只读P/C/context/已存在旧样本；需要新建/发送/移动时分别记录授权和计数，不换Profile/目录重置预算。无法取得60天真实旧样本时诚实NOT_RUN，离线调时钟不是G旧历史证据。只读失败不自动扩大到隐藏endpoint/认证材料抓取。

**分级结论：** 本修订的离线实施为CONDITIONAL GO；条件是沿上述既有任务完成关键S工程门槛，不是先再写研究。离线完成后仍需固定G/U清单；无法满足principal/context、确定普通聊天、可用活动或安全v2.7挂载任一核心能力时，相应完整Free支持/profile NO-GO。部分映射可以作为开发过程，但不能偷换为产品交付。

## 12. 证据索引与本包验证

### 12.1 固定工作源

```text
repository: haohongfei2001-png/Virtual-AI-Workspace-Layer
PR: 16, Draft, branch codex/vaiwl-free-first-20261013
reviewed head: 8a35843431d5d85ee3092612bf88af6129de482d
prior package head: 0600133fb88ae1e133062173a1b31d02a4f05ebd
source receipt: docs/engineering/free-round60-source-receipt.json
current continuation: docs/engineering/FREE_RESUME_CHECKPOINT_2026_10_13.md
```

本轮重读四份原设计全文，GitHub PR/commit/compare、实际navigation、service、NativeRepository、B1 broker、FreeRuntimeService以及CORE_FLOW_V2_7。compare确认原未变模块保留，新增shared目录、staged service/broker/loader和instant缓存按源码处理。原设计所研究的native-facts/free-evidence/free-projection/activity/R0/Canonical证据继续保留；不能从旧STATUS推断新的实现。

外部固定代码参照：imran `src/core.js`、`content.js` blob `ab5358d4c027fcde2b0f4e0f8f1ebf1d593cd6f2`；XReyRobert `content.js` blob `6feeac095bc8546f77c01b231bf005b8dd1bf74d`；pionxzh/exporter commit `48a32f9dbe409a415f8de633954c18284019509f`，api/main/page。仅借机制；复制任何代码先核对许可证和固定版本署名。

### 12.2 官方平台机制（核对日期2026-10-13）

```text
https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
https://developer.chrome.com/docs/extensions/reference/api/webRequest
https://developer.chrome.com/docs/extensions/reference/api/webNavigation
https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
https://developer.chrome.com/release-notes/135
https://html.spec.whatwg.org/multipage/popover.html
https://www.w3.org/TR/css-ui-4/
https://help.openai.com/en/articles/10169521-projects-in-chatgpt
```

这些资料支持browser/Popover/CSS/共享项目机制，不是ChatGPT未公开API的稳定性或分发许可。原R0-00/F3的来源范围、隐私和平台资格检查保留；第三方扩展存在不自动赋予授权。全部profile code随扩展打包，不执行远程下发JS或任意选择器配置。

### 12.3 本轮局部probe原始结果

```json
{
  "browser": "144.0.7559.96",
  "evidence": "WEB_MECHANISM_ONLY_NOT_MV3_NOT_CHATGPT",
  "original": {
    "auto_before_sidebar": true,
    "auto_after_sidebar": false,
    "opaque_overlay_tab_target": "native"
  },
  "revised": {
    "manual_survives_sidebar": true,
    "mask_open": ["hidden", "inert"],
    "mask_after_declarative_close": ["visible", "auto"],
    "reading_html_inert_attribute": null,
    "synthetic_draft_preserved": true
  },
  "mv3Lifecycle": {
    "status": "BLOCKED_NOT_RUN",
    "reason": "Loading of unpacked extensions is disabled by the administrator."
  }
}
```

### 12.4 双surface补充probe

```json
{
  "browser": "144.0.7559.96",
  "evidence": "WEB_MECHANISM_ONLY_NOT_MV3_NOT_CHATGPT",
  "both_open_after_sidebar_click": true,
  "background_focus_blocked": true,
  "native_layer_visible": true,
  "workspace_hidden_during_native_layer": true,
  "reading_mask_released_during_native_layer": true,
  "sidebar_close_does_not_close_workspace": true,
  "history_mask_released": true,
  "both_masks_released": true,
  "no_html_inert": true,
  "synthetic_draft_preserved": true
}
```

首个补充probe脚本使用`history`命名全局，错误取到window.history而非同ID元素，引发TypeError；修为明确DOM查询后保留原断言复跑。该失败属于probe驱动，不是VAIWL产品失败，也没有删除失败记录换取PASS。工程代码应避免这类隐式全局/DOM clobbering。

### 12.5 文件及静态核验结果

TypeScript 5.8.3下`--strict --noEmit --target ES2022 --lib ES2022,DOM`通过；另有基于实际旧navigation调用形状的独立消费者检查，含inspect DOM字段、MouseEvent、旧status、snippet、初始化和continuation，以及9个预期类型错误反例。这不是把真实产品仓库接线编译/运行一次，也不证明runtime授权。

跨文件检查确认：四份均为同一1.1 FINAL与同一最终审查head；保留81个唯一case ID，分组15/9/12/20/17/8；16项问题为4 P0、10 P1、2 P2；引用case均存在；Markdown围栏平衡。未宣称该81项已执行。

复现时原包与本轮probe的SHA-256：

| 原文件 | SHA-256（修订前原件） |
|---|---|
| VAIWL_CHATGPT_HOST_SPEC.md | `796246a514249e65224860639ab7515ac1e51b727ae95fe42f4bdf82f9bb0e1b` |
| VAIWL_OFFLINE_ACCEPTANCE.md | `47113b6c2a1f906e6d925755fcfbc81d79039db3a4d40b788e06a645a703222b` |
| VAIWL_HOST_CONTRACTS.d.ts | `7ff3035a9112d89746a6e77931062463c1a52e083226633c271c1d52812aa641` |
| VAIWL_CODEX_HANDOFF.md | `fe30dbaca0ada31155d59505f6eba953e9b6118403fc621fc337b34051838d66` |

| 本轮局部probe/驱动记录 | SHA-256 |
|---|---|
| mechanism-counterexamples.json | `610e54db838b17e2e541712ea9cc1e28c33ef83d0955c3fc86765e78f646a25a` |
| revised-mount-mechanism.json | `3afd25310de2329f084c3200b5f0fc269822399bad80a0e9c2e0c8bd7131f8ee` |
| dual-surface-mechanism.json | `aea57ec1c38b78ad6d5f983f11f6a2899a13365352bf87ff9fb217c0bf58c667` |
| lifecycle-probe.json | `346c780be55cb819332b5f1028eb89402eb2229d5154143f8c71af6e34d2c994` |
| dual-surface-initial-driver-error.json | `7f16be478d36aaa8d3cd6442bc3291ab4e288e8f3725ddd0e2ce04e880fcd1b7` |

交付ZIP仅包含本包四个现行文件，不混入原版、临时probe、私人数据、产品实现或另一份计划。

