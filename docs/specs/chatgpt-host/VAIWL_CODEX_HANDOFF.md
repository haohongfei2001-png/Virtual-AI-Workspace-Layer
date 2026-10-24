# Codex 最终实施交接：VAIWL ChatGPT HostAdapter

2026-10-22用户正式采纳[PR16体验裁决](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6335005042)：本人Mac Chrome主用Workspace的近期真实P/C、正确归属、自然新聊天更新、可信最近活动、原生搜索/输入/返回、普通刷新休眠恢复、隔离和成熟v2.7均为个人交付必需。全账户严格历史完整性、逐消息本人作者/ACK/原始时间完整审计取消为默认产品前提，不转为发布欠账。81个ID、子场景和历史结果保留；①个人必需、②发布前完善、③后续优化、④取消/简化的逐ID适用范围见原离线验收§4，延期不改PASS。10k/100k及全库密度自动H为③/DEFERRED，原阈值不变；保留默认30天和已有手动切换。个人切片不冒领旧完整旅程、FREE-ACCEPTED或RELEASE-READY。

**VA-HOST/1 · 修订 1.1 FINAL · 2026-10-13。** 本文替换原交接，配套同目录 `VAIWL_CHATGPT_HOST_SPEC.md`、`VAIWL_OFFLINE_ACCEPTANCE.md`、`VAIWL_HOST_CONTRACTS.d.ts`。这是原A–G任务的实施细化，不是新计划或另一个产品。

2026-10-19用户批准的临时只读导航例外见同目录Host规格新增节：单独记录私有popup、可见导航读取、搜索、新标签打开/返回、失效与隐私边界证据；不替代本文件正常完整Host要求，原81项/J1–J4/真实账户及人工验收不因此改判。默认包、403安全拒绝和完整Free目标保持。

## 1. 立即继续原工程，保存正在进行的成果

仓库 `haohongfei2001-png/Virtual-AI-Workspace-Layer`；原目录 `/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer`；原工作树/分支 `codex/vaiwl-free-first-20261013`；继续现有Draft PR #16，base仍为计划PR #15。

最终设计核对head为 **`8a35843431d5d85ee3092612bf88af6129de482d`（Round60）**。这不是要求回退的提交。开始时读取最新实际工作区、未提交变更、AGENTS、现行Canonical/DEVELOPMENT_PLAN、FREE_PRO_ACCEPTANCE、owner/checkpoint和PR差异；只做差额确认，不再全面研究。

shared-directory的reader/writer/迁移/恢复/retention已经接线。`free-header-loader.mjs`、`B23_FREE_HEADER staged:true`、service分阶段准备以及256项instant解析缓存也已存在。**不得再次创建共享目录、staged loader或第二套恢复引擎，不再按旧Round48/58交接从零做这些事。** 最新原源码回执为1125项Node及9项MV3；历史1118、1092/独立8、旧mixed FAIL各保留原证据，不累加。本轮适配的新测试须自己实际运行。

不创建额外仓库、worktree、分支或新PR；不reset/clean/force-push，不无条件stash或覆盖未提交成果，不改PR15/base/main，不merge/deploy。保全当前owner写入，在自然checkpoint整合；一个Git/集成writer，文件不重叠才并行。通过普通提交和正常推送同步原PR16，保持Draft。

## 2. 工作边界与完整目标

浏览器研发和主要验收完全离线：只用新隔离Profile、本地native-shaped页面/认证fixture、外网阻断的测试环境。不进真实ChatGPT/日常网页，不登录、不发送真实消息、不抓包、不读真实cookie/token，不后台打开隐藏聊天，不改日常系统代理/DNS/根证书。正常读取代码/文档与同步GitHub可以进行。

Free完整目标不缩减：真实P/C映射、普通NONE/UNKNOWN、活动与历史、完整H策略/固定、搜索/工作集/片段、原生新建/导航/返回、持久恢复和批准v2.7。ChatGPT保留transcript/composer/model/tools/files/menus/运行状态。全历史数据库、正文镜像、导出ZIP、周期人工补资料均不作为前置或备用。Pro AI、虚拟归组/改名、会员计费、可选E后台原生writer不开发；旧Pro人工作品保持。

## 3. 固定实现链与第一纵向切片

继续同一架构：

`ChatGPTHostAdapter → document/scope/receipt gate → 单一HostObservationReducer → 现有Native/Evidence仓库 → FreeRuntimeService/FreeProjector/ActivityDecision → 现有Free renderer`。

先完成B1.F+B2.F1+C2：空缓存→实际本地认证provider→当前workspace绑定→原生已见P和普通C→完整已有Free界面→准确native P/C/创建入口→唯一四格返回。不要再把100k微优化作为开始adapter的前置。既有F1阈值、最新冷加载问题保留，按自然owner分工继续。

实现开始即先在允许装扩展的离线Chrome验证iframe/manual Popover/声明式关闭/实际disable与uninstall，不留到全部UI写完才测。浏览器管理策略阻断时明确S条件，继续无依赖代码；不得绕过管理策略或用adapter.stop冒充disable。

## 4. 公共合同与兼容抽取

沿用.mjs/JSDoc，不引入新框架。新增必要的src/host contract/url-policy/profiles/chatgpt-adapter、发现/元字段/发送关联/native-actions/mount-controller，以及小型runtime scope-authority/gateway/reducer。模块可以合并，不机械引入很多service。

保留legacy `inspect().history/header/reading/navigationSlot`；旧`openNative(url,MouseEvent)`在shim中同步preventDefault。新iframe路径用预计算NavigationPlan和dispatchNative，不能序列化Event/Element。片段保持旧`{refId,messageId,branchId,text,bodyHash}`及`{ok,reason}`返回。生产不能沿用`nativeHref(...) ?? rawUrl`回退，校验失败不再渲染裸href；legacy status接受旧形状后去掉scope，仅发布非私人诊断。不存在的projectCreateHref返回null，不拼假project query。

`HOST_HELLO`先只验证浏览器document，发DocumentBinding/producerToken；它不能读账户数据。`adapter.start({binding,emit})`随后工作；ScopeAuthority独立核验，再走严格BIND/lease开放库。不要为初始化环放宽旧BIND。

从simulator/client抽公共协调器，注入adapter/clock/context/transport，保留当前replica、分页、staged header、重连。service抽公共组装，生产zero-seed。继续已有sourceFor、publication:invalidation、readCached:false，不额外全量read，不让两个frame各自复制100k索引。生产依赖闭包禁止synthetic resolver/seed/FIXTURE_NOW/hf身份开关/测试管理权限。

## 5. B1.F/B4.F：可执行身份通路，不做空provider

主provider是worker固定第一方session只读profile：6秒、正常凭证策略、no-store、redirect/MIME/schema/大小检查，提取principal/expiry。备选为worker challenge的包内隔离世界固定同源fetch，通过自身runtime返回最小结果；不是MAIN auth bridge，不接页面URL/JSON/token。

主通道token只在worker RAM；备选若必须完成固定accounts读取，可在隔离闭包短时使用，不传MAIN/UI/日志/DB。必须准确披露这一区别，不能同时说所有token永远只在worker。不加cookies/debugger，不要求用户复制凭证。

principal与当前context分开：

- 实际存在且语义确证的认证active-context字段可用；不要假定服务器必有“当前tab workspace API”。
- 多workspace具体备选为认证roster + 只读Chrome webRequest正常native request context + 当前页面关联。保留必要document/frame/requestId/initiator和Chatgpt-Account-Id，过滤扩展自己请求/prefetch/旧epoch/错误响应；缺字段和内存缓存无request事件必须覆盖。roster只证明权限，header receipt只证明关联，两者都不是独立当前账户认证。
- 仅个人唯一context还需profile证实默认绑定语义；不取accounts第一项、不用nickname/DOM/cookie/nonce补权威。

有切换线索先撤旧grant，新current证据一致再授权。不能抵抗完全被控制的第一方源站/浏览器，此威胁边界明确；任意page伪造字段/receipt不能授权。

`ScopeAuthority.peek`纯本地栅栏；`refresh`单飞有限，由bind/focus/expiry/auth-change触发。现有broker/repository前后权限检查保留，不每次guard/每页网络认证，不在IDB事务await网络。20秒lease、document/actual-frame/seq/epoch/cancel都保留；账户与隐身分区不混用。

若C2确需webRequest权限，明确最小用途，非blocking、无requestBody/extraHeaders，丢弃其他header，不写到报告。未获权限该provider不可用，但不能把完整profile所有身份通路都删掉只返回unverified。

## 6. B2.F1：IDless、归属和覆盖闭环

URL先验证HTTPS/exact origin/端口/编码/长度再解析；普通/c/不证明NONE；/g/可能customGPT。exact nativeID、mutable slug、renderKey和workspace ID分开，不按名字或宽松regex合并Project。分享/temporary/新空聊不回退近期首条。

无ID/href的真实Project按钮必须有LiveNativeHandle：WeakMap原节点、document/route/region epoch、fingerprint。临时候选可点击但不成为假canonical ID；同名各自独立。用户点原控件一次，正常route/metadata取得exactID后提升同一目标，迁移临时展开/焦点。节点重建旧handle拒绝，不按标题/序号重找；超时不自动再点。必要时用获准的当前可见目录窄读，不抓全历史。

PROJECT只能来自明确P成员域/metadata；NONE只能来自已证语义的当前对象字段或用户自然打开的原生菜单状态。missing、未解释null、无badge、普通URL不构成NONE。ordinary/customGPT/P内customGPT/共享/移出移入正反样本不可少。UNKNOWN正常可达，原生搜索/目录/历史通路保留。

source归约统一写现有NativeRepository，保留producer/receipt的字段witness；sourceRevision不是服务器因果时间。fieldRevision/memberSetRevision/coverage分域，不让Q改名使P所有成员失效。跨tab不可比较冲突先UNKNOWN，再当前C核验epoch收敛；旧epoch不再推翻新确认。P改名不改ID，C移动不复制C。

分页partial、terminal observed、complete snapshot分开。未见/虚拟卸载/TTL/404不等于删除。名字存储与CSS省略分开；超限保留ID和明确名称状态，不谎称截断为完整原名，不随意扩大总库限制。

## 7. B2.F2/F3：时间、发送、自然更新

主路径读已加载元字段/白名单JSON/own data loader；不eval/getter/React fiber/全bootstrap。JSON/SSE/NDJSON独立decoder，opaque状态不解码，revision/status/HTTP Date/updated_at都不是本人原始sentAt。当前C窄读取可实现，但返回可能含正文，必须如实声明读取范围，profile/许可未成立不启用；不扩展到全历史。

response tap只旁路宿主已有请求，保留原fetch receiver/参数/原Promise和失败语义，clone分支受预算，异常不能影响原流；达不到性能要求关tap，走已有metadata/获准窄读。

strict UserSendEvent要求本人、持久message身份、branch/固定到该消息的lineage、new-send/ACK、原始时间语义和精度。role=user不等于本人，拥有会话不证明所有分支历史由本人写。若只有可伪造MAIN字段不能提升；优先固定当前对象读回确认。

本地intent→消息/operation关联→确证ACK，失败/optimistic/IME/停止/上传不记成功。ACK成立但无原始time时，用同evidence分片新codec的durable observed-self-send锚：原本机观察区间、clockBasis、ACK witness和calibrationDueAt，永远provisional、无sentAt/serverTime。校准期限到不删除已ACK活动，重复观察不续时间；发现误配/失败可撤销。旧短TTL hint不批量升级。本机时钟异常无可信区间时不造日期。

eventKey基于scope/C/message，不含本次observedAt或current branch leaf。重开同消息复用immutable event，lastSeen/receipt独立。相同message时间冲突隔离，不max掩盖；多ID块不把assistant时间赋user，parent缺失/循环不标allbranch complete。

合格的同域原生近期顺序可供无日期排序；经核验语义/单位的对象更新时间可供provisional最近活动。二者不写本人sentAt、actorVerified或成功ACK；首次观察只建baseline，重复打开/轮询/置顶/筛选/虚拟滚动不续活动起点。严格UserSendEvent与ACK锚原义保留，UNKNOWN不作NONE，未见不删除，原生搜索始终可达。保持旧锚可逆下沉、默认30日/手动H（自动密度③）/固定/NONE独立活动/UNKNOWN可达。跨端证据在桌面native自然到达后自动吸收，分别计上游延迟与本地投影延迟。

沿用6秒request/30秒cycle/12请求/最多2重试，同scope/source预算和去重跨lease/worker重连/多tab保留。没有来源有限终止，不无限spinner，不每次renew重新抓12次，不隐藏开页。

## 8. B4/B5与最新存储：小幅接口补全

复用同DB、当前native/evidence/shared目录、hash、CAS/inverse、备份/恢复/retention。生产source权限从owner注册，页面不得填写scope/verified/channel/actorVerified/canonicalRevision。观察单包建议64KiB UTF-8/256实体，背压优先保ACK，溢出留gap不伪complete。

Source revocation、live grant、freshness分开：scope撤权立即停显；普通新鲜度过期last-known可达但不标当前确认。worker重启不换持久source generation，不全局撤销历史；精准source/profile失效不抹其他正常来源。

Native/Evidence仍独立提交，不伪称跨库原子。将有界pending-evidence observation continuation及最小admission witness（scope/profile/version/source generation/语义指纹/acceptedAt）与native delta在同一次native_states/native_operations CAS事务中提交，不能只存重启后丢失的RAM receiptId；evidence稳定operationId幂等落库后complete。不得native提交后才另写receipt。纯evidence输入复用既有evidence operation，没必要空写native。

正常worker重启后新grant、原子admission/payload digest与未撤销source复验可补观察；不为找RAM receipt再次抓正文。备份恢复/admission不全/source失效必须重核验。不能重放native send/create或旧授权。payload/receipt有严格codec/字节/条数上限，pending受retention保护；超预算背压，不丢确认发送。UI区分native已新/activity仍pending，继续现有HEADER/PAGE/final CHECK。

直接使用free-header-loader和staged:true，不重做preparing。其有序stage/不同stage/同scope/最终header保护保留；生产不使用synthetic native-bootstrap seed，必要新迁移阶段由同owner同步修改协议/loader/测试。保留无staged旧调用兼容，不把preparing当空库，不延长6秒，不回退纯instant缓存和既有目录成果。

## 9. C2–C5：完整界面与可关闭挂载

保留扩展origin静态UI frame承载cache，现有renderer/styles/icons/视图状态复用。workspace用manual Popover，**不使用auto作为主工作区**。批准reading区外的composer/header/tools/files不被覆盖；在唯一明确reading root上以opaque marker和浏览器:popover-open驱动最小CSS visibility/interactivity mask，不写native HTML inert/hidden/display，不搬DOM。

连续sidebar使用相同MountSurface第二manual surface覆盖安全纯history区域，原native顶部功能/目录/搜索/账户保持；必要history mask同样只绑定自身popover-open。frame外“显示原生列表”声明式关闭后还原native history；不能永久移除原列表，也不能仅把巨大列表附到底部充完整侧栏。两个surface共享session/索引，非两套全量replica。

frame外始终保留同树声明式关闭button；它在content/UI JS失效时仍解除相应CSS mask。manual本身不自动ESC/轻点外部；正常运行只处理自有UI的ESC层级，不吞native ESC/IME。实际disable/uninstall必须分nativeOperable、privateProjectionAbsent、cleanLayout；私有内容残留即使可手关也不合格。本轮设计probe不是这项S证据。

native model/menu/dialog/权限/Canvas优先：自己的surface/mask一起suspend，不阻止原生事件；CSS判断只用已证open predicate，不把所有role=menu存在当open。自身sidebar/workspace不被当native层；侧栏操作不关闭workspace。

忽略自己marker/style引发的observer变化；自身mask不能让adapter判body失效形成重挂循环。native区域/属性真正改变时先suspend解除mask再重验；派发被自己mask的native anchor前先解除相关mask，复核后只click一次。

UiGrant采用一次性双通道配对：worker实际parent/ui document/frame + content保存的iframe.contentWindow/mount + scope grant；key不是认证。WAR只有静态资源、parent postMessage不含私人数据，UI不能发任意URL/JS/raw写入。CSP失败不可改宿主CSP或用page ShadowDOM泄露cache兜底。

v2.7必须完整：三列适配、5/+12、主页不折叠、连续侧栏可折叠、左侧旧项箭头、当前无向上、默认30日/手动H（自动密度③）/固定/工作集/片段/搜索，以及**阅读区左上唯一四格返回**。删除“header不足改sidebar/rail返回”备选。位置不足应定向修profile几何，不挤native或加重复入口。字体/主题token传入frame，不能假设iframe继承宿主字体。以批准截图/交互为基准，不用新实现自造golden。

输入焦点支持input/textarea/contenteditable；仅RAM保存原节点/Range，原节点失效不回写旧草稿；不持久化草稿。片段格式和旧Pro人工作品不破坏。

## 10. 原生导航、测试和最终交付

可见目标先准备NavigationPlan再收点击。iframe内普通native委托同步preventDefault，发送一个actionId，controller复核并激活原控件一次；RPC没有user activation传递保证。真href计划保留浏览器默认和修饰键，中键不同时发RPC。ACK丢失仅unconfirmed，不自动补href/再点。

无native anchor且未发草稿/上传/生成/Canvas风险存在或未知时，提供明确新标签真链接保留当前内容，不整页卸载。计划之后风险改变就撤销旧计划，不能当前点击时偷偷改派。route相同body未确认不作same-target成功；不pushState伪SPA、不调React私有router、不改native Back/Forward。

新Project/新聊天只打开真实原生入口，确认结果才建对象；Project内与全站目的地区分。无当前P内newchat入口先普通P导航，由用户原生完成后续，不后台多步创建，取消不生成假P。

落实原81个ID的修订矩阵，不增加数量代替质量。LEGACY/MODERN/PARTIAL正向完整闭包，FAULT故障族安全退让；独立oracle，不读hf seed、不让认证fixture直接给verified答案。参数化两个adapter，测试真实S/IDB/iframe/原生事件，v2.7截图+节点/焦点/状态断言。关键guards变异必须使预定case失败。全部UNKNOWN/NATIVE_ONLY不能过测。

原完整旅程及历史结果保留；本人交付先完成OFFLINE_ACCEPTANCE §6同编号个人连续切片，不要求全部下列扩展：空缓存映射；旧C发送/ACK/重启/校准；完整v2.7与native工具/草稿/返回；多tab/scope/两库退出/迁移/禁用。物理IME/实际PAIA/跨端/真实ChatGPT缺条件标G/U NOT_RUN，不把合成改label。

测试记录specRevision/sourceCommit/dirty hash/build/fixture/oracle hash、环境、正向分母、PASS/FAIL/NOT_RUN、证据等级和失败原件；不写真实ID/token/正文。编译类型合同还必须检验实际legacy调用形状，不是只跑d.ts自身。

合同稳定后可并行纯parser/send/模型测试、DOM/actions/mount和独立fixture/oracle；共享broker/service/client/navigation/schema由唯一owner整合。每项完成继续下一个原任务；遇到具体S/G/U阻塞保留准确条件，继续所有无依赖工程，不重新研究产品、不重跑全R0、不提前转Pro。

本人日用条件：真实主用adapter接线，①安全/归属/近期活动/普通恢复/v2.7与原J1–J4个人连续路径成立，同源码构建可重跑、资产保全。81全矩阵和后续②/③独立分账，④取消不成为发布欠账；未运行实际来源不能由离线通过替代。

本修订结论为CONDITIONAL GO进入工程，不等于允许真实账户测试或发布。最终正常提交同步原PR16，交付实际变更、当前source/包hash、已跑结果、具体未通过事项和下一原任务编号。不宣称LIVE_VERIFIED/FREE-ACCEPTED/RELEASE-READY，不merge/deploy，不另交一套方案。
