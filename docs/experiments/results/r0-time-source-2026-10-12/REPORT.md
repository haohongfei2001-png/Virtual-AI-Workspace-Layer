# PR #14 匿名原始消息时间专项：UNKNOWN，匿名来源未被否定

2026-10-12，Mac本地，基线PR #14 `a68fd07aeec5ba2cc9ff4e9754c5aa294b7e287e`，原分支 `codex/vaiwl-r0-live-readonly-20261012`，base仍为PR #13。任务只补充原始用户发送时间来源；不进入登录态、不重跑R0整体或B1–F1合成验收、不修改正式src/simulator/design。

**明确裁决：本轮仍未建立可靠消息级原始用户发送时间，originalUserSentAt=UNKNOWN，TimeCoverage=UNKNOWN。** 已增加真实可见初始化数据、正常交互自然第一方NDJSON响应及三个扩展条件的独立恢复调查。这个结论不等于“ChatGPT没有时间”或“所有匿名途径不可行”。未取到的字段、未获证实的语义和没有检查的渠道分别保留。

## 五个最终问题

| 问题 | 本轮回答 |
|---|---|
| 一、匿名网页能否获得可靠消息级原始用户发送时间？ | **UNKNOWN / 本次未证实。** 自己合成消息的DOM、已查初始化结构与三个实际NDJSON流没有提取到能关联user及原始发送语义的时间字段。不能据此否定其他匿名变体/渠道。 |
| 二、哪些不能充当原始发送时间？ | **HTTP Date**是响应来源/中间层时间，不能证明某条用户消息何时发送；浏览器点击/接收/观察时刻是本机观察。`revision`、`baseRevision`是版本类整数；`status`/`dil.status`是协议/渲染状态，均不是原始send-time。即使未来响应出现create_time，也还需证明它是该user消息的创建时间、精度/时区及是否服务器生成或回显；不能只靠字段名/时间邻近性。 |
| 三、已发现的时间能否刷新/重新打开复验？ | **消息级时间未发现，无法比较其值或稳定性。** 三种条件各一个独立刷新样本均丢失消息，六次原地址新tab打开均没有自己的原消息；HTTP Date可再次出现，但不是同一消息时间复验。Back旧DOM可见时路由不一致，不能称完整会话恢复。 |
| 四、单条消息时间足够证明历史覆盖吗？ | **不够。** 没有历史发现范围、completeThrough、消息/分支去重、缺口或账户scope证明。没有扫描全账户；即使单条时间成功也不能给30日活动分段或“无更晚发送”认证。 |
| 五、哪些渠道已查、哪些需登录/官方导出？ | 已查自己访客消息DOM、6个页面application/json初始化script、指定公开初始化global描述符、8个相关inline初始化script的时间key形状、自然第一方响应类型/HTTP Date、3个实际NDJSON流及嵌入HTML字段结构。账户持久历史/Project/原始导出语义需要未来清洁登录范围或获准官方clean导出做正向验证。其他匿名JSON正文、未识别初始化状态与opaque conversationState仍未完整验证，**不能声称这些必须登录或不可行**。 |

## 上一轮边界与本轮来源

详细原始复核见 `SOURCE_AUDIT.md`。上一轮structure.js只是可见role-root/有限属性计数，旅程时间函数检查根及后代的time[datetime]、timestamp/created-at/sent-at/datetime属性名；未查看初始化或自然网络消息元数据。原报告本身限定了DOM范围，本轮不把它扩大为全渠道否定。

| 来源 | 实际执行 / 范围 | 发现 / 限制 |
|---|---|---|
| 自己可见user/assistant DOM | 九条简短数学合成消息；宽化时间key检测，检查time元素和属性名 | 最新样本1user/1assistant，0time元素、0时间属性；role可见，但不是可信账户或服务器user-send witness |
| 页面JSON初始化script | 每次在浏览器内解析，只输出字段名/类型/是否匹配自己的marker；不复制script正文 | 最新样本6个JSONscript、0解析错误、0预算溢出，0可靠时间字段/匹配的消息元数据；早期presentation/hasStartedPresentation为正则误命中，已修复且原件保留 |
| 指定公开初始化global | 只查__NEXT_DATA__/__NUXT__/__INITIAL_STATE__/__next_f的own-property描述符，不调用getter、不枚举隐藏React或闭包状态 | 当前变体这些描述符均未见；不等于宿主没有任何初始化数据 |
| inline初始化script | 8个相关script只在浏览器内筛时间key形状，不fetch代码资产、不eval、不输出正文 | 没有候选time-key形状；代码字符串的key本身也不构成已填充消息字段 |
| 正常第一方响应metadata | 自己正常发送/返回/刷新自然产生的响应；只记录type/status/阶段，HTTP Date只读这一个header | 实际媒体类型包含application/vnd.openai.conversation-source+ndjson；没有读request headers/payload、Cookie、Token或全部response headers |
| 自然原生NDJSON | run-2两条、run-4一条；逐帧归约，三个流各14帧、无弃帧；不构造完整HTTP body/HAR副本 | 字段schema见下表，未提取原始user时间；实际消息ID/会话ID值未公开 |
| NDJSON嵌入HTML | run-4只抽字段名/类型，增量HTML parser检查22个tag | 无时间属性、无role marker组；不输出HTML、markdown或渲染代码，不执行回复中的代码 |
| 自然普通JSON响应 | 本轮查看metadata；后续驱动准备对非认证conversation/message/init类路径做部分标量提取，已缓冲完整JSON不读 | run-4没有捕获到可安全归约的对应JSON流。不能说所有JSON正文没有时间；认证/session/sentinel等来源不进入正文分析 |
| opaque conversationState | 只记schema：str | 未取值/解码，不把它当时间或可信历史快照。若可能为能力/签名/认证材料，不能为找时间而解码；它的语义目前UNKNOWN |
| 官方账户历史/Project/导出、未打开聊天 | NOT_RUN | 本轮不登录、不主动请求隐藏API、不扫描账户。不用网络监视授权推导主动历史读取授权 |

观察器仅输出必要元字段。HTTP协议响应浏览器自身会正常读取；本实验不导出完整请求响应，流帧局部解析后丢弃，认证/账户键树跳过。代码/数据预算与漏查项如实列出，不以“被动”扩大范围。没有新付费服务、系统代理/证书设置变更或其他Profile访问。

## 实际协议字段与语义

run-4自然response MIME为 `application/vnd.openai.conversation-source+ndjson`，14帧，共9973字节经逐帧归约，43个去重schema path。run-2相同类型分别14帧/9976与9968字节。没有持久保存原始NDJSON、HTML或markdown。

| 字段 | 类型 | 当前能够判断的语义 / 不能推出什么 |
|---|---|---|
| detail.operationId | str | 操作标识字段；未作原始时间/账户 witness |
| detail.conversationId | str | 会话标识字段存在；与真实网页scope/路由的精确值关联未实测 |
| messageId、detail.messageId | str | 消息标识字段存在；不能仅凭来源就假定为user而非assistant，DOM ID精确关联提案未获追加发送许可 |
| detail.canonicalPath | str | 正规路径字段的schema；值未公开，未用作身份授权 |
| revision、baseRevision | int | 修订/版本形状，非时间；未假设单调性或单位 |
| dil.status | str | 实际出现pending；属于渲染/交互层状态，非user创建时间 |
| status | str | 实际出现complete；不能把整个流完成当作某用户消息持久化或发送时刻 |
| conversationState | str | 不透明状态，未读值或解码；时间/历史语义未建立 |
| html、markdown、dil.* | str / dict | 只抽必要schema与HTML元结构，不保存内容或执行代码；不能由未知常量/渲染状态推断无时间来源 |
| create_time / createdAt / sentAt / server_time等 | 未提取 | 当前归约结果未得到；不假造字段，不推断全部匿名或登录态均不存在 |

没有可用原始时间，因此消息级精度、timezone offset、服务器生成 vs客户端回显、分支/编辑后的稳定性都 **NOT_ESTABLISHED**。HTTP Date本轮只记header存在/类型，没有保留值进行精度或漂移测量；浏览器观察浮点时刻只用于局部识别，未被写入产品UserSendEvent。前后接收时间与回复耗时也不能替代send-time。

## 三种扩展条件：刷新、重新打开、Back分开判断

每个条件在run-1用两个独立消息分别验证返回和刷新；先返回样本失败不会污染刷新样本。新tab只打开自己刚产生的原生地址，不主动请求内部接口，地址仅留RAM。只读probe与PR14原构建hash一致，始终unverified-scope、无数据库/敏感投影/native writer。

| 条件 | 独立刷新 | 新tab重开自己原地址 | 新聊天→Back |
|---|---|---|---|
| 无扩展 | FAIL：0user/0assistant，原消息不可见，路由改变 | run-1/run-2/run-4均未恢复自己的消息 | 多次1user/1assistant旧DOM可见，但sameRoute=false；严格会话恢复NOT_VERIFIED |
| 已加载只读probe | FAIL：0user/0assistant；刷新后因无auto content script另手动重注入，scope仍未知 | run-1未恢复 | 旧DOM可见但路由不一致，NOT_VERIFIED；不称探针修复了导航 |
| probe实际stop/uninstall后 | FAIL：0user/0assistant；卸载发生在发送前 | run-1/run-2均未恢复 | run-1工具驱动TimeoutError，不能归因host；run-2旧DOM可见但路由不一致，NOT_VERIFIED |

run-1/run-2原Back标签PASS只检查marker可见，是弱断言。原文件不重写；`SUMMARY.json`提供派生严格裁决。run-4改为必须marker及原route同时匹配，实际FAIL。**旧DOM存在与正确消息/会话归属是不同问题**，未来真实适配必须证明归属后才能投影；没有擅自修改产品架构。

因此：刷新丢失在三个条件稳定复现；原来的Back失败不是单一稳定的“消息一律消失”行为。现在发现的是DOM/路由错位，不能将它简化为Back完全正常或完全不可用。仍只针对这些样本与该访客变体，不外推全部匿名环境。

## 失败、最小修复与真实未执行项

1. 初版仅识别text/event-stream，实际NDJSON未读正文。run-1保留原件；最小增加精确实际MIME，run-2成功归约14帧，拒绝把原初版空结果当网络字段不存在。
2. 宽匹配sent-at误匹配presentation类key。原object/bool记录保留，改时间词边界后初始化检查0候选；这些不是时间反例。
3. Back只看marker，缺route一致断言。原件保留，严格断言run-4FAIL；上轮“返回完全丢失”不能延伸为所有独立Back均无旧消息。
4. run-3新Profile首次官方导航ERR_CONNECTION_CLOSED，0条消息，浏览器关闭。保留精确失败源码与hash；一次有限重试run-4成功，未循环网络重试。
5. **发送上限控制缺陷**：我最初声明最多6条，却按每次invocation计数；修驱动时累计9条（6+2+0+1），均为简短合成数学问题。已停止全部新增浏览器操作并改专项跨run累计护栏，检查发生在Profile创建之前；不能换目录/Profile重置。默认总预算6，当前9已超出，离线证明确实会拒绝而不启动浏览器。
6. 追加第10条、验证camelCase网络ID与DOM ID精确关联，被自动审批拒绝。拒绝理由把六条边界视作本专项授权上限；六这个数字来自我的最初执行声明，用户原文仅为“少量”。没有绕过拒绝或发送第10条。只完成字段与RAM比较提案/离线合成验证，**LIVE NOT_RUN / WAITING_EXPLICIT_ONE_MESSAGE_AUTHORIZATION**。详情见APPROVAL_BOUNDARY.json。

现有元字段与恢复证据足以给本次时间UNKNOWN裁决；不为了求全绿再发消息。待批准的ID关联补测也不会自动赋予原始时间语义或历史覆盖。

## 登录与官方导出的准确需求

本轮不要求登录。只有要证明 **账户scope、已保存会话刷新后同一消息复验、持久历史覆盖、Project/分支/编辑归属**，才需要用户亲自登录并确认范围的清洁测试账户；若官方clean导出提供消息级create字段/映射，也要独立批准文件范围并证明字段语义、快照范围/截至时刻。不能假定登录必然解决时间问题，不能假定官方导出必然完整或新鲜。

其他未解析匿名初始化格式、普通JSON或不透明状态，不因为本轮UNKNOWN就被转成“必须登录”。仍可能有研究价值，须先建立合法来源、只取必要字段的安全方法及必要授权；禁止主动探查隐藏历史、读Token、解码可能的认证材料或取全量正文。第三方/PAIA未运行；不使用模型API重建ChatGPT历史。

## 交付与恢复

- PR #14保持Draft、base #13；正常非强制HTTPS同步。原runtime src/simulator/design与f151fb4逐路径一致，未重复合成工程验收。
- `SOURCE_AUDIT.md`：上一轮真实来源边界。
- `run-1..4/results.json`：原始脱敏字段/metadata观察，包括旧弱PASS和真实FAIL；每批`executed/`精确执行源码SHA验证通过。
- `SUMMARY.json`：所有原始标签与严格恢复裁决并列、来源与环境。
- `OFFLINE_CHECKS.json`：8个字段归约测试PASS；RAM ID比较OFFLINE PASS，非LIVE；任务累计护栏PASS，0额外发送。
- `APPROVAL_BOUNDARY.json`：上限失误/自动审批拒绝/待批准项。
- `COMMANDS.json`、`SHA256SUMS.json`、`VERIFICATION.json`：真实命令、当前源码与执行归档哈希/完整性；不发布Profile或Chrome私有日志。

四个Chrome均已关闭，无后台测试或自动追加行为。下一恢复点是本专项分支PR14最新head，保留UNKNOWN和具体未验证项；不重复旧R0、不修改正式运行时代码、不自动进入登录态。
