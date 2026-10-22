# VAIWL：生产 HostAdapter 离线验收规格

2026-10-22用户正式采纳[PR16体验裁决](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6335005042)：本人Mac Chrome主用Workspace的近期真实P/C、正确归属、自然新聊天更新、可信最近活动、原生搜索/输入/返回、普通刷新休眠恢复、隔离和成熟v2.7均为个人交付必需。全账户严格历史完整性、逐消息本人作者/ACK/原始时间完整审计取消为默认产品前提，不转为发布欠账。81个ID、子场景和历史结果保留；①个人必需、②发布前完善、③后续优化、④取消/简化的逐ID适用范围见原离线验收§4，延期不改PASS。10k/100k及全库密度自动H为③/DEFERRED，原阈值不变；保留默认30天和已有手动切换。个人切片不冒领旧完整旅程、FREE-ACCEPTED或RELEASE-READY。

**VA-HOST/1 · 修订 1.1 FINAL · 2026-10-13。** 配套同目录工程规格与类型合同。本文件直接修订原81项：ID不变，替换不足的输入/期望并补同ID子场景，不通过增加数量掩盖遗漏。它不是另一条开发计划，也不是已通过报告。

2026-10-19用户批准的临时只读导航例外见同目录Host规格新增节：单独记录私有popup、可见导航读取、搜索、新标签打开/返回、失效与隐私边界证据；不替代本文件正常完整Host要求，原81项/J1–J4/真实账户及人工验收不因此改判。默认包、403安全拒绝和完整Free目标保持。

## 1. 证据与真正的退出条件

L=逻辑/严格合同；D=真实IndexedDB事务；S=真实Chrome MV3+本地native-shaped宿主；G=获准真实ChatGPT；U=真人/物理IME/PAIA/日常旅程。普通Chromium set_content的机制probe单列WEB_MECHANISM_ONLY，不能充S。

P0/P1/P2保留原技术严重度。本人日用按§4的①适用子行为及下列个人J1–J4判定；公开发布补②，③后置，④取消的产品前提不再成为发布欠账。所有要求的case/subcase必须有PASS/FAIL/NOT_RUN，不允许用一个通过子场景覆盖同ID其他失败。P0/P1无skip；环境阻塞记NOT_RUN并继续独立工程，不能伪绿。

**正向分母**：独立oracle中，该profile在该旅程已经实际暴露且有充分可取得证据的P/C/成员/动作集合。正确映射、可达、目标一致性应为100%；目标外未加载历史不进入“已发现”分母，但原生入口必须保留。idless初态允许候选，正常原生打开并取得exactID后的终态必须canonical。原始time确实没有的样本应provisional/undated；带合格元数据的样本一律undated则失败。

**当前能力闭包**：本人主用profile必须覆盖principal/context、近期Project/Conversation、普通NONE、可信最近活动、原生创建/导航/搜索、完整v2.7与退出。PARTIAL或NATIVE_ONLY只允许出现在预先指定的故障case，不能在实现后把所有正向profile改成unsupported。主用正常对象持续错归或无可靠活动不能交付；可信相对顺序允许无日期，不因缺逐消息原始时间封锁日用。

本轮仅执行了说明auto-popover/焦点穿透及manual+CSS关闭的局部机制probe。实际MV3装载被环境管理策略拒绝；本81项和产品回归未在本轮执行。最新Round60的1125项Node与9项MV3为仓库原记录；Round58/59另保留其原运行，不与此次设计probe合计。最终基线8a35843431d5d85ee3092612bf88af6129de482d。

## 2. 夹具来源与反自证

保留四族：R0已观察schema/结构重建；公开实现的legacy与modern sidebar/rail/多ID消息结构；对抗生成；原SyntheticHostAdapter回归。每份manifest固定fixtureId、来源commit/blob、是否reconstruction、实际暴露字段、supportedCapabilities、expectedWorldFile及hash。只有aggregate证据的页面不得标真实DOM快照。

独立expected world仅存在测试进程/服务器，不能通过hf属性、隐藏JSON、window.__expected或TestScopeProvider一口返回全部verified给adapter。身份正向必须调用**实际生产认证parser与固定请求逻辑**，只将origin/fixture server替换为本地；认证服务的cookie/主体/roster由测试端持有，页面只获得正常数据。

至少固定四个可执行旅程profile：

- LEGACY：当前P清单有href与无ID的button，普通C、同名P；自然打开后有真实协议形状metadata，但不把所有初始ID预埋在DOM。
- MODERN：sidebar/rail同时挂载、隐藏旧body、虚拟列表、多message ID块；既有原始时间和缺作者/缺时间两种消息；当前context由正常请求关联，不从DOM verified取得。
- PARTIAL：独立world1000条、页面只25条，后续正常滚动才暴露更多；native metadata会遗漏字段、分页会变化，UI仍可操作。
- FAULT：无安全阅读区、认证失败、任意scope伪造、CSP、iframe销毁、旧响应、429/配额/损坏及不认识的新协议。预期能力受限事先固定，不能临时改oracle迎合实现。

新增profile至少有positive/missing/conflict/neighbor四种输入；日期/作者/ID不能全部补成理想字段。同名/改名和同值字段交换必须用ID独立oracle。Expected不可调用生产parser/reducer；针对关键guard的mutation test见§5。

## 3. 本地真实Chrome运行

新增tests/host作为原测试的适配补充，可按contracts/parsers/fixtures/expected/browser/property/reports分组。使用新隔离Profile和loopback或预先配置的测试origin；不进入真实chatgpt.com，不改日常Mac代理/DNS/根证书，不读真实账号。生产/fixture编译的parser、reducer、renderer字节相同，composition注入origin/clock/固定认证本地服务，release依赖检查排除测试身份和种子。

外网阻断须覆盖extension worker，不只拦Playwright页面route。完全离线运行所需依赖先在已批准环境准备；不在test case里隐式下载或调用云模型。S的跨origin iframe、cookies、实际webNavigation/webRequest/runtime必须使用真实浏览器通路，不以page JS假事件替代。

真实disable/uninstall用隔离Profile的扩展管理功能或测试专用控制扩展，只控制目标测试扩展；管理权限不能进产品包。管理员禁用unpacked时报告具体阻塞，不绕过、不把adapter.stop算disable。至少区分自然worker休眠和人工terminate；长期DevTools附着导致保活时不能叫自然休眠。

## 4. 保留的81项，修订后的场景与失败条件

每行“必须结果”是确定条件；多种结果仅在该行明确分支输入下分别使用。标S的case只有在真实MV3执行才计S。真实语义G保留为附加门槛，不在离线表假填PASS。

### 4.1 URL、对象和成员（B1.F/B2.F1/R0-03）

| ID | 优先级 | 场景/动作 | 必须结果 | 任一即失败 | 实现/证据 | 当前适用层（覆盖冲突的旧产品前提；非结果） |
|---|---|---|---|---|---|---|
| MAP-01 | P0 | 同一P改原名/slug，两个URL alias先后可见 | 按exactID一张卡，原名按witness更新，老alias不是新P | 以URL全文/name作主键；产生重复P | L/S | ①：稳定ID、原名更新、不重复卡。 |
| MAP-02 | P0 | 同名P各含同名C；其中一个P初始只有button | 两个独立目标；所点button自然打开后提升对应P；不按名称/行号匹配 | 串组、误点或两个button被合并 | L/S | ①/②：同名不串/目标正确①；真实人为制造所有idless同名组合不前置。 |
| MAP-03 | P0 | 普通/c/C但无归属字段，与已有P缓存并存 | 只识别C，UNKNOWN可达；不继承猜测P或NONE | URL决定NONE或默认为当前P | L/S | ①：UNKNOWN不猜P/NONE且可达。 |
| MAP-04 | P0 | 已证语义的NONE、字段missing、未解释null、P内customGPT四子例 | 只有明确NONE进无项目；其他按真实证据P/UNKNOWN；完整profile存在可用NONE通路 | 缺字段一律null；所有普通C永远UNKNOWN仍通过 | L/S+G语义 | ①/④：确证NONE与未知分开；不逐个审计全部旧聊天才允许访问。 |
| MAP-05 | P0 | customGPT路由与Project路由均/g/.../c/C | 按profile区分容器与Project，不仅靠/g/ | 生成假Project或错成员 | L/S | ①：当前路由不混淆customGPT与Project，未知变体退原生。 |
| MAP-06 | P0 | 无ID/href的P控件→点击→原生路由/metadata，空缓存启动 | 有可点击LiveHandle；同节点只激活一次；获得exactID后移为正式卡并保留视图位置 | 候选不可点击/永不升级/用假ID持久化 | S | ①：实际无ID控件可用且自然升级，不造假ID。 |
| MAP-07 | P0 | 外站/userinfo/端口/编码斜杠/反斜杠/javascript/data/非法尾段/query语义 | 先origin/path验证再ID；temporary等语义query不被统一删除 | 先去origin匹配；危险URL进入导航或nativeHref返回null后又回退raw href | URL属性测试L/S | ①：origin/path/危险协议检查不削减。 |
| MAP-08 | P1 | 未来ID grammar不识别；原控件重建后同名新控件 | 保留原生导航候选；旧handle拒绝；新控件需新观察，不猜slug | 重用失效handle；按同名定位另一P | L/S | ①/③：旧handle拒绝及原生退路①；未来grammar主动兼容③。 |
| MAP-09 | P0 | assistant正文/代码/第三方UI含P/C示例链接 | 不进入native库存；只读已证明native区域 | document全扫把示例变真对象 | S | ①：正文/第三方链接不冒充目录。 |
| MAP-10 | P0 | share/temporary/未持久新C与近期第一条同时存在 | 不回退近期首条，不把非本scope内容持久化；原生仍可用 | 静默关联错误C或临时正文落盘 | L/S | ①：临时/share不串对象、不落不该持久的数据。 |
| MAP-11 | P0 | P成员区域旁native recent含Q聊天 | 仅P区域或明确membership的C进入P | 整页C全挂P | S | ①：只按可信成员关系挂P。 |
| MAP-12 | P1 | 有效ID但200字符以上/空名/恶意label/中日韩多字节 | 保留ID/URL；显示省略与存储超限分开；不把截断称完整原名 | 丢对象、HTML注入、字节上限失守或悄悄扩库 | L/D/S | ①/②：中文正常、无注入、ID可达①；极端长名存储矩阵②。 |
| MAP-13 | P1 | 同C在sidebar/搜索/成员页和多个虚拟块重复出现 | 一条canonical C，多witness；重复输入不无意义增revision | 重复行/计数/活动；全库重复写 | L/S | ①/②：常见重复去重①；全部虚拟块/revision优化②。 |
| MAP-14 | P0 | C由P→Q，旧tab迟到P；不可比较冲突后当前metadata证实Q | 同C原子归属或先UNKNOWN，再新核验epoch收敛Q；旧epoch不再回滚它 | last-arrival-wins；永久冲突无核验路径；复制C | L/D/S | ①：移动后不持续错属，允许暂UNKNOWN后自动纠正，晚包不回滚。 |
| MAP-15 | P1 | Q改名、recent翻页；P成员集合未变化 | P局部成员witness/set版本不变；不冒增全覆盖 | sourceRev等号使全部P成员过期 | L/D | ②：局部witness/version全部组合完善，不新做底座。 |

### 4.2 分页、覆盖和持久发现（B2.F1/B5.F）

| ID | 优先级 | 场景/动作 | 必须结果 | 任一即失败 | 实现/证据 | 当前适用层（覆盖冲突的旧产品前提；非结果） |
|---|---|---|---|---|---|---|
| INV-01 | P0 | world1000项，native只25，初始DB为空 | 只发现25且partial；25全可达；余项native入口保留 | 读seed凑1000/隐藏余项入口/只显示部分25 | S | ①：已知集合可达，partial诚实，原生旧历史可达。 |
| INV-02 | P1 | 自然滚动第二页，重复ID和旧页卸载 | 增量union；旧已知不丢；当前窗口变化不伪recent变化 | 覆盖库存/重复计数/每页整库写 | L/D/S | ①/②：增量union、去重、不丢已知①；写放大优化②。 |
| INV-03 | P1 | P及C虚拟卸载，刷新后当前scope相同 | last-known按授权可达，不删除；重新出现可核验 | unmount=deleted；需手工补回 | D/S | ①：虚拟卸载/普通刷新不删除，授权后恢复。 |
| INV-04 | P0 | cursor循环、重复页、异常大页、429/500/断网 | 有限结束，留gap/partial；遵守预算；429不立即无限重试 | 死循环、截断=complete、清空已知 | L/S | ①/②：有界失败/预算/不清库①；长循环全组合②。 |
| INV-05 | P1 | 筛选/排序/置顶区及虚拟窗口改变 | 分域baseline；排序改变不生成本人时间 | 筛选终点当全库存/置顶变化续活动 | L/S | ①/④：域/置顶分离；允许可信原生近期顺序用于排序，不伪造日期。 |
| INV-06 | P1 | terminal但扫描中列表变化，无snapshot版本 | exhausted-observed-scan/non-atomic；不能严格complete | 把终点当全账户或allbranch完整 | L/D | ④：采用partial/non-atomic；取消严格全库证明前置，仍不假complete。 |
| INV-07 | P0 | 同scope重开、worker冷启动、lease续期，主体验证尚pending | 新grant前无旧cache曝光；后恢复已知；不重建全部目录或重播网络预算 | 按旧grant显示/全量重新发现才可用 | D/S | ①：新授权前不曝光、后自动复用cache，不全量重扫。 |
| INV-08 | P0 | freshness过期、临时404、网络500、明确对象撤权分别发生 | 前者last-known非当前确认；临时失败不删；明确撤权隐藏相关敏感数据 | TTL当授权或删除；撤权后仍显示缓存 | L/D/S | ①：TTL/临时故障不删，明确撤权不曝光。 |
| INV-09 | P1 | 删除按钮打开→取消；另一次真正删除结果确认 | 取消不删；确证后按恢复合同标记失效；不发后台删除请求 | 仅click即删/误回填旧结果 | L/S | ①/②：取消不删、可靠确认后失效①；全restore/旧writer交错②，继承已有防回填。 |

### 4.3 主体、workspace、文档和权限（R0-01/B1.F/B4.F）

| ID | 优先级 | 场景/动作 | 必须结果 | 任一即失败 | 实现/证据 | 当前适用层（覆盖冲突的旧产品前提；非结果） |
|---|---|---|---|---|---|---|
| SEC-01 | P0 | 真实本地认证服务A→B，同origin同URL；含隐身/普通分区负例 | 旧grant先撤；B绝不读A缓存；账户资产分别保持 | 跨scope闪现/同名认证/跨分区共用cache | D/S | ①/②：主用账户/空间切换隔离①；隐身正向矩阵②，未支持隐身禁用。 |
| SEC-02 | P0 | DOM/MAIN伪造verified、scope、receiptId、profile、account header消息 | 不生成认证proof；未经owner登记的receipt无效；正常合法输入仍能成功 | 只是有known profile/nonce就提权 | L/S | ①：伪造字段/receipt不可授信。 |
| SEC-03 | P0 | 单/多context：认证roster有两个；另有正常native请求与页面关联 | 缺active见证时ambiguous；C2正向完整关联时授权正确context；不只测试全拒绝 | 取第一账户/cookie即授权；有效C2仍一直拒绝 | L/S | ①/④：一条可信当前空间正向路径；不要求所有域完整认证，不能凭空放宽C2。 |
| SEC-04 | P0 | 成功native请求context与DOM选中/当前body冲突，含prefetch和扩展自己核验请求 | 旧selection epoch失效；不把prefetch/worker读当当前选择；新current证据一致后恢复 | 错误请求选择scope/旧tab覆盖新选择 | L/S | ①：prefetch/旧请求不选空间，切换撤旧。 |
| SEC-05 | P0 | 固定session主/备provider：expiry/401/403/redirect/HTML/超大/timeout/50并发PAGE | 实际parser检查；单飞refresh，peek不联网；不续旧grant；备选只允许固定源最小结果 | 每次guard发请求/MAIN响应认证/token外泄 | providerL/S | ①/②：可用主路径、拒绝/到期/单飞①；所有备通道/高并发矩阵②。 |
| SEC-06 | P0 | A认证/数据异步回包在B新grant后到达 | 按doc/session/selection epoch拒绝；不补授权贴B | 复活旧data/grant/源generation混淆 | L/D/S | ①：A的迟到结果不能贴B。 |
| SEC-07 | P0 | SPA后senderURL旧但Chromeframe新，body尚旧；HOST_HELLO先于BIND | 文档握手不读库；实际route正确；body单独绑定 | 为无scope改宽BIND/只有route即采消息 | L/S | ①：握手不等授权，旧body不归新route。 |
| SEC-08 | P0 | page/UI要求任意fetch/header/selector/JS/raw repo batch | 固定provider/已注册计划外全拒绝 | 成为通用代理或原生writer | L/S | ①：不接受任意fetch/JS/原生writer指令。 |
| SEC-09 | P0 | 网页另嵌同名WAR frame、旧frame、错parent、join重放 | 只有实际owner mount配对获UiGrant；parent postMessage不含私人数据 | 扩展URL或join key即可读缓存 | D/S | ①：只有所属UI frame可读私有投影。 |
| SEC-10 | P0 | synthetic来源、restore bundle、旧profile source试图变生产 | owner注册与新授权验证；恢复不复活source/continuation授权 | 换channel字符串即可trusted | L/D | ①：synthetic/恢复不复活生产权限。 |
| SEC-11 | P0 | source撤权/账户失效，同时库有Pro identities/workingSets | 暂停错误曝光，资产hash保持；只相关来源失效 | 清库或错scope展示人工资产 | D/S | ①：撤权遮蔽但保留人工资产。 |
| SEC-12 | P0 | 同scope多tab并发，重复seq同/异payload，CAS重算和lease频繁更新 | 同payload幂等、异payload拒绝；共享有限网络预算；竞争后重新裁决 | 重复提交/多tab倍增无限重试/旧结果直接覆盖 | D/S | ①/③：日常双tab幂等/预算/不串①；极端多tab交错③。 |

### 4.4 路由、消息和活动（B2.F2/F3/C3）

| ID | 优先级 | 场景/动作 | 必须结果 | 任一即失败 | 实现/证据 | 当前适用层（覆盖冲突的旧产品前提；非结果） |
|---|---|---|---|---|---|---|
| ACT-01 | P0 | route=C2但旧C1 body仍可见，包括Back恢复 | C1不写成C2；body proof未成不采消息，native加载仍可用 | 可见marker等同正确正文 | S | ①：旧body/活动不串新目标。 |
| ACT-02 | P0 | 两种role标记；一个块合并user/assistant多个ID | 每条ID分别关联；不把块最后时间赋user | assistant时间当本人/块当唯一消息 | L/S | ④：全混合消息作者解析不作近期排序前置；strict parser原义保留。 |
| ACT-03 | P0 | native user+ID无时间；第三方time标签与MAIN伪metadata | 无exact event；不把第三方节点作为native时间认证 | 任意time或profile label可提升 | L/S | ④：缺原始time可用可信近期信号，不把第三方时间当发送时间。 |
| ACT-04 | P0 | 共享另一作者、复制他人分支、本人本地新发三子例 | 前两者不能算本人新发；后者合格ACK能关联本人 | role=user/owner=作者；有效本人路径也拒绝 | L/S+G语义 | ①/④：最近更新不必宣称本人新发；任何本人强语义仍要真实证据。 |
| ACT-05 | P0 | 秒/毫秒/未知单位、future、day区间、DST与本机时钟跳变 | 精度显式；异常不造日期；local观察不是服务器时间 | 按数值猜单位/假毫秒/错误本机钟写strict | 属性L | ①/②/④：时间单位/未知不造假①；完整精度/DST/时钟矩阵②，不前置全部。 |
| ACT-06 | P1 | mapping parent缺失/循环/多branch，后续追加assistant改变current_node | 有界partial；lineage固定到消息；旧event key不变 | 循环/allbranch假complete/current leaf改事件ID | L/S | ③：全branch/lineage严格证明后置；有界解析仍保留。 |
| ACT-07 | P0 | 发送intent→optimistic气泡→失败/取消/断开 | 不产生ACK锚或strict；既有旧活动保留 | 气泡/HTTP200/流complete即成功 | L/S | ①/④：失败不称成功；当前可达无需先获最高精度ACK。 |
| ACT-08 | P0 | 确证本地ACK无原始time，过去旧锚60天；校准期限后重启 | durable观察锚仍provisional且原起点不变；自然随H变老 | 十分钟后无故掉回旧锚/Date.now写sentAt | L/D/S | ①/④：已确认近期重启/due后不突退；不要求先升级原始time。 |
| ACT-09 | P0 | 合格作者、持久消息ID、原始time；重复正常打开 | 一次strict event；重开复用immutable语义，lastSeen分离 | changed observedAt导致冲突或重复；全部unknown过测 | L/D/S | ④：strict event为增强路径，不独占默认活动排序。 |
| ACT-10 | P0 | IME组成/Enter换行/停止/上传/取消/真正发送 | 只有真正发送路径进入correlator，native事件不被吞 | 误发/误记/阻断输入 | S；物理U | ①：物理中文IME、换行/停止/上传不误发、不吞输入。 |
| ACT-11 | P0 | 重生成、旧消息编辑、切branch、复制C、多块重挂 | 新发送与编辑/复制语义区分；key不随当前leaf变 | 每次重挂/branch更新近期时间 | L/S | ④：原生真实更新可影响最近活动，但编辑/重生成不冒充本人新发送。 |
| ACT-12 | P0 | 同C/message两种原始时间；另有独立有效新消息 | 冲突消息隔离；其余证据继续；不max掩冲突 | 静默挑较晚或全部清空有效证据 | L/D | ③：原始消息时间冲突全证明后置；不得用max伪造事实。 |
| ACT-13 | P1 | 60天旧锚、成员partial；有/无新本地观察锚 | 只有旧锚时可逆下沉；新ACK时近期provisional；无时间不猜old | 一直活跃/假exact inactivity/误过期回退 | L/S | ①/④：旧项自然下沉且可找回；近似分类无需全成员历史否定证明。 |
| ACT-14 | P0 | 新C消息先到而membership未知，随后确认P | 确认前不聚合任意P；确认后更新P，C始终可达 | 暂时随便挂P或消息永不进入P | L/D/S | ①：新聊天先可达、未知不乱归、确认后自动聚合。 |
| ACT-15 | P1 | recent顺序/改名/置顶/窗口滚动变化 | 核验后同域顺序/原生时间可直接排序/provisional，未核验只dirty；本机收到时间不当活动 | updated_at/order=本人sentAt | L/S | ④：经核验updated_at/order可用于最近活动；不写sentAt，不由置顶/扫描造now。 |
| ACT-16 | P0 | 重复digest/hint/ACK重读、source刷新、新lease | 旧hint及durable锚均不续事件起点；来源复验与事件分离 | 每次poll重置recent/重复入账 | L/D/S | ①：重复观察不续活动起点。 |
| ACT-17 | P1 | 首次安装recent25条，旧缓存无对应事件 | 建立baseline与已见索引，不造25次新发送 | 首次发现即近期强事件 | S | ④：首次按真实时间/顺序展示；不造N次新发送或安装时间。 |
| ACT-18 | P0 | 无source/超时/429/30秒用尽/lease20秒续期/多tab | 6秒单次30秒轮次12请求最多2重试；跨lease域预算不重置；稳定fallback | 永久spinner/后台开页/无限budget复位 | 假钟L+真实S | ①/④：有界/退路/无永久spinner；继承预算，不扩大每种lease证明。 |
| ACT-19 | P0 | 远端合成发送仅在native后续数据出现，初次只updated_at后有ACK/time元字段 | 前阶段若语义已核验可provisional/同域排序，否则只dirty；有可用证据自动正确投影；上游/本地延迟分报 | 偷读oracle/仅updated_at当本人/收到证据不更新 | S；实际跨端G/U | ①/②/④：桌面得到新数据后自然消费①；完整实际跨端组合②；取消严格ACK才更新。 |
| ACT-20 | P0 | JSON/SSE/NDJSON异常、超深/超大、slow clone、宿主cancel | 原fetch Promise/响应/错误流不受旁路错误改变；预算/取消局部有效 | 吞原流/无限buffer/解opaque/原请求因tap失败 | L/S | ①：旁路不破坏原生流/取消且资源有界；非必要旁路可不开启。 |

### 4.5 v2.7界面、原生导航和生命周期（C2–C6/F3）

| ID | 优先级 | 场景/动作 | 必须结果 | 任一即失败 | 实现/证据 | 当前适用层（覆盖冲突的旧产品前提；非结果） |
|---|---|---|---|---|---|---|
| UI-01 | P0 | P卡/子C/更多控件；从UI frame通过worker委托native控件 | 同步决定default，一次native handler，目标route/body正确；子操作不冒泡开P | 双导航/复制聊天/异步默认href先跑 | S | ①：点击正确且只派发一次，子操作不误开。 |
| UI-02 | P0 | 缓存C无native anchor；风险clear/unsaved/unknown；点击前风险变化 | 按计划真href或明确新标签；计划过期不自动改派；草稿保留 | 有风险整页卸载/超时补跳/无限假SPA | S | ①：草稿保护，不粗暴卸载、不超时补跳。 |
| UI-03 | P0 | Ctrl/Cmd/Shift/中键/同route旧body；无href button | 有href保留浏览器默认；同目标还需body一致；button不假装可新标签 | 吞modifier/把gesture handle当userActivation/重复打开 | S | ①：Mac修饰键/中键原生行为，button不伪链接。 |
| UI-04 | P0 | Back/Forward/bfcache/replaceState，双surface状态及root重建 | native history不改；H/T/Z/scroll恢复；先grant/body再发布 | 增加假history/旧epoch覆盖/重复surface | S | ①/②：常用Back/Forward/位置恢复①；全BFCache/root组合②。 |
| UI-05 | P0 | 空缓存newProject取消/成功；外部页面点P内newchat；全站newchat | 正确原生入口及目的地；只确认结果建卡；不自动跑后台多步 | 按click建假P/创建错scope/取消后残留对象 | S | ①：原生新建目的地正确，取消不造卡。 |
| UI-06 | P0 | 工作区开关及Tab/AX检查，原input/textarea/contenteditable有草稿；自有mask触发observer | manual+限定CSS：仅背景reading惰性，composer/handlers保持；自有mask不诱发拆挂循环；关闭完全恢复 | 焦点/AX穿透、HTML inert残留或草稿入库 | S | ①：原输入/草稿/焦点保持，mask可恢复。 |
| UI-07 | P0 | native model/tool/file/menu/dialog/权限，含programmatic与reading内portal | mask和surface一起让位；不拦native动作；关闭后不抢焦点 | top layer压住native/隐藏menu仍误判open/只解除视觉不解除inert | S+G | ①：模型/工具/附件/权限弹层正常。 |
| UI-08 | P0 | 双sidebar/rail、native重建、VAIWL侧栏展开/滚动/切历史 | 操作侧栏不关闭workspace；连续列表可用；唯一阅读四格返回不搬到侧栏 | auto dismiss、重复返回、巨大列表附在底部冒充完整侧栏 | S | ①：主题卡/连续侧栏/展开/唯一返回完整。 |
| UI-09 | P0 | reading含composer/无批准return slot；另有安全几何正常例 | 故障profile退让；正常例完整显示；protectedRegions不被mask | main整体inert/挤压native；正常例也退让算成功 | S | ①：不遮composer；异常可退，正常主环境可用。 |
| UI-10 | P1 | 1440桌面/窄屏/200%/浅深色/长中文/键盘高度变化，v2.7同尺寸对照 | 3列响应、5/+12、左旧箭头、无主页折叠/当前向上、全H/工作集等完整；字体tokens有效 | 仅小弹板/iframe默认字体失真/安全但残缺UI | S；物理U | ①/②/③：本人窗口成熟视觉①；宣称支持环境②；罕见尺寸③。 |
| UI-11 | P0 | 真实worker自然休眠与强制退出，frame仍活跃；慢恢复 | lease/expiry正确；无第二全量副本；新grant后恢复；native始终可用 | 靠永久worker保活/旧grant复活/混淆自然休眠 | S | ①：普通自然休眠/重开自动恢复，不能长期WAITING_NATIVE。 |
| UI-12 | P0 | 实际disable：workspace/sidebar各开关组合，native输入/生成时 | nativeOperable=true，privateProjectionAbsent=true；余壳可声明式关闭；分报cleanLayout | 只stop代disable/敏感残留即使可关也算通过 | 真实Chrome管理S | ①：停用原生可用、敏感投影消失。 |
| UI-13 | P0 | 实际uninstall/re-enable/更新；原生页面不刷新和随后导航分别看 | 不损ChatGPT；再授权才显示；不承诺uninstall保留扩展DB；升级旧reader保护资产 | 旧私有frame长期残留/更新破坏库/拿卸载当数据备份 | S | ①/②：重启用新授权、实际版本安装升级安全①；全版本卸载/回退矩阵②。 |
| UI-14 | P0 | 杀content/UI脚本、frame断连、样式变体、CSS能力不足；键盘到frame外close | 无JS按钮实际释放CSS mask；不写HTML inert；正常ESC与故障声明式退出分开 | 只能手删DOM；manual无JS仍声称ESC；背景永久屏蔽 | S | ①/③：常见断连不永久挡原生①；罕见CSS/崩溃排列③。 |
| UI-15 | P0 | pointerdown→click/composition/drag期间收到事实或计划更新、RPC ACK丢失 | 原目标不替换；同actionId最多派发一次；未知结果不重试native | 错点/自动补href/重复native动作 | S | ①：点击期间目标稳定，未知ACK不重发原生操作。 |
| UI-16 | P1 | 其他扩展浮板/捷径与native top layers；原生全历史入口使用 | 自身受限，不读第三方数据；不重复返回，原生历史正常进入 | 私有整库放page DOM兜底/挡PAIA/只剩本地索引 | 合成S；PAIA G/U | ①/②/③：原生全历史搜索、本人已启用PAIA基本共存①；扩展矩阵②/③。 |
| UI-17 | P0 | 旧snippet格式、单/多ID选区、内容hash变化、contenteditable重建 | 旧人工资产保持；唯一锚定位，歧义退原生；不回写旧草稿 | 类型换格式丢片段/锚错C/自动收集整段历史 | L/D/S | ①/②：人工资产不丢/不串①；高级片段与重建组合②。 |

### 4.6 事务、集成、构建与性能（B4/B5/F1/F3）

| ID | 优先级 | 场景/动作 | 必须结果 | 任一即失败 | 实现/证据 | 当前适用层（覆盖冲突的旧产品前提；非结果） |
|---|---|---|---|---|---|---|
| SYS-01 | P0 | native CAS提交前/后、evidence前/后、complete标记前逐点退出 | continuation/admission与native同事务；RAM receipt丢失仍按持久admission验证；新grant后幂等补 | native已commit却无receipt/payload；重复发原生send/create | D/S | ①/②：普通中断不丢/不重发，继承同事务①；逐内部点全矩阵②。 |
| SYS-02 | P0 | quota/CAS/损坏root桶/checkpoint/retention，pending达到预算 | 旧root安全；pending不被GC误删；背压不丢已确认活动；复用当前已接线目录/staged loader | 另建WAL/静默丢Pro/放宽容量/无上限pending | D/S | ①/②/③：资源有界、不静默坏库①；广泛损坏矩阵②；极端风暴③。 |
| SYS-03 | P0 | 同库新codec升级、备份恢复、旧版拒写、再升级 | Pro identities/workingSets/snippets/humanRefs hash保持；source/grant/pending不自动复活 | synthetic提权/旧reader写坏/人工资产损失 | D/S | ①/②：当前升级/资产保护①；全部历史codec排列②。 |
| SYS-04 | P1 | 1k/10k/100k mixed/none-heavy/单大P，双surface，多tab；首次schema preparing | 按原F1报告；只一套索引/共享预算；preparing不当空库，6秒RPC不变 | 引用旧快数字/双100k副本/延长RPC掩startup | S/F1 | ①/③：本人实际量流畅①；10k/100k/4x/弱设备③。 |
| SYS-05 | P1 | assistant token流+DOM风暴，ack与标题变更同队列 | 局部dirty合并、ACK不丢、backpressure/gap；只影响相关页 | token×全库存扫描/确认消息被挤掉 | S计数与性能 | ①/③：普通生成不卡输入/更新不丢①；极限DOM/token风暴③。 |
| SYS-06 | P0 | 生产依赖闭包、.d.ts与实际legacy调用形状、frame资源/CSP | 无seed/测试auth/固定clock/remoteJS/管理权限；保留inspect/MouseEvent/snippet shim | 只声明文件编译却断callsite；测试特权打入release | 静态L+S装包 | ①：正常可安装包不含seed/测试授权/远程JS/管理权限。 |
| SYS-07 | P0 | 主/备认证、metadata失败后扫DB/日志/WAR/UI messages | 无token/cookie/全body/草稿；备选token短期闭包使用准确披露 | 把全session/body写盘或误称metadata-only | L/D/S | ①：凭据/整正文/草稿不落盘，不向网页泄露私有数据。 |
| SYS-08 | P0 | 支持profile缺ID/NONE/time关键通道，过大/伪造提案，故意去掉关键guards | 合法闭包正向必须成功；故障明确降级；变异测试可靠杀死 | 以全UNKNOWN全NATIVE_ONLY通过；虚构receipt授信 | L/S | ①/④：主用正向真实成功、故障安全退让；严格time缺失不再整体封锁。 |

## 5. 自动化实现与反例强度

### 5.1 双adapter合同不等于双答案通道

同一HostAdapter行为合同参数化Synthetic和ChatGPT native-shaped；schema/identity/metadata的adapter结果必须从页面/固定本地服务实际取得。不能把ChatGPT adapter的方法换成dataset返回，再宣称业务双运行。legacy shim测试读取当前navigation的真实使用形状：inspect字段、openNative同步preventDefault、projectCreateHref和原snippet。不同realm不能传Element/Event，DTO应结构化序列化可过。

### 5.2 必须能杀死的设计变异（仍归原ID）

在专用测试变异构建中分别去掉origin检验（MAP-07）、把missing改null（MAP-04）、按name合并（MAP-02）、允许旧epoch（SEC-06）、任意receipt自证（SEC-02）、ACK前记send（ACT-07）、从current leaf算eventKey（ACT-06/11）、重复poll续锚（ACT-16）、改回auto Popover（UI-08）、移除背景惰性（UI-06）、异步不preventDefault（UI-01）、把continuation改到native提交之后（SYS-01）。每个变异至少使相应预定case失败；若检测不到，先修test/oracle，不说原实现正确。

变异只用于测试构建，不修改原生产分支结果来凑绿。随机时序必须保存seed和最小反例；CAS/property模型oracle独立于生产归约算法。

### 5.3 原生所有权与完整视觉

用宿主自己的事件计数与原节点引用验证native send/new/menu handler只运行一次、composer未替换、附件/交互答复状态保持。截图不能代替节点/状态断言。

view mask允许范围已经修订：只在浏览器popover-open的限定reading与profile确认的纯native history列表视图上出现可逆visibility/interactivity差异；其他属性/style/handler不变。关闭后比较完整computed state及可访问/焦点顺序，不能放宽为“看起来能点”。不改HTML inert，不用给每个背景后代设置tabindex的繁重补丁。

v2.7截图至少覆盖主页、阅读唯一返回、侧栏开合、旧项展开、历史空段、长列表末尾、工作集/片段/搜索、设置H策略、浅深色和窄屏。指定截图基线由批准v2.7+当前Free目标取得，不由新实现截图自动生成；合理host差异逐项标注，不将残缺界面作为新golden。

### 5.4 有界网络与生命周期

网络计数按scope/source/触发轮次统计，续lease/新tab不得偷偷归零。受限只读webRequest只保留一个context字段和必要浏览器元信息；内部缓存未触发webRequest的case必须存在，不能假设每次数据加载都有网络receipt。

实际禁用/卸载分别检查敏感frame、native操作及残留壳，不能将“关闭按钮仍能点”代替privateProjectionAbsent。用户卸载扩展本身的数据生命周期另有说明，不承诺保留扩展IndexedDB；原生ChatGPT数据/功能必须不被影响。

## 6. 固定完整旅程（引用已有ID，不增加计数）

J1：空缓存身份/当前context→两个同名P（一个button）→普通NONE/UNKNOWN→P页和C→唯一四格返回，来路保持。映射分母、目标与普通聊天正向全部通过。

J2：旧C→本地发送失败→成功ACK无原始时间→跨校准期限/worker重启→仍provisional近期→后来原始time复验→不重复event；另含共享他人消息/旧branch。

J3：工作区/连续侧栏同时运行→原生model/files/权限→input/contenteditable草稿→Back/Forward→200%→旧窗口→片段→native搜索；v2.7外观/行为完整。

J4：多tab A/B/context切换→native/evidence之间退出→schema准备/恢复→实际disable/uninstall→原生继续。所有privateProjection、nativeOperable与Pro资产断言按实际阶段成立。

个人适用连续切片（同一J1–J4编号，实际结果与上面原完整旅程分别记录）：

| 原旅程 | 本人日用必须连续成立 |
|---|---|
| J1 | 正常启用/空缓存→近期P卡和聊天自动出现→正确成员及自然无Project入口→原生聊天→唯一返回；未入本地索引的旧聊可经原生搜索找到；已知不因展开/分页消失。无需制造同名项目或先扫描全库。 |
| J2 | 全站/Project内正常新聊天和实际新增活动及时可见，归属/近期顺序合理；失败取消不称成功；重复读取不续新，普通重启不退回数月前。无需等strict原始time升级和全branch审计。 |
| J3 | 卡片/侧栏/展开→本地/原生搜索→打开/返回/Back/Forward→中文IME及草稿→原生模型/附件/工具正常；本人窗口视觉成熟；当前若开PAIA则做窄共存。 |
| J4 | 刷新、Chrome重开、worker自然休眠后自动继续；常用双tab不串；账户/Workspace变化撤旧数据；来源故障原生可用；停用/重新启用正确且人工资产保全。逐内部故障点/全旧版本排列后置。 |

J1–J4按当前①②③④适用层在对应宣称支持profile完成；④取消项不恢复为发布前置。个人连续旅程仍须实际完成，不用分别无关的单元PASS拼成一个没跑过的端到端成功。

## 7. 报告、构建和退出

每个case及子场景报告：specRevision、sourceCommit、dirtyPatchHash、build/fixture/oracle hash、browser/OS、networkPolicy、身份实际provider、profile、关键receipt类型、正向分母/正确数、操作重复数、异常原因、P0/P1/P2、PASS/FAIL/NOT_RUN、L/D/S/G/U与limitations。认证实际标识/token/正文不写报告；以合成数据或不泄露内容的计数/摘要取代。

提供可重跑的host:contracts / host:idb / host:browser / host:failures / host:release-check等价命令，沿用仓库实际runner，不要求引入package manager或框架。完整执行和定向补测分别报告，不把1092+8说成一次1100全套。

离线完整矩阵作为既有工程证据保留；本人可安装日用候选以①适用子行为、真实主用J1–J4个人连续路径及安全构建为出口，不等81全部子场景或全环境矩阵。公开发布补②；③含10k/100k保持DEFERRED和原目标；④不复活。L/D/S不能替代G/U，任何未运行/失败不改PASS。类型/机制probe通过只作相应证据，不升级状态。

G/U保留主规格§11清单并按§4适用层区分本人日用与后续发布；下列全量场景不全作为本人前置：principal/context、真实idless→exact、NONE、本人time/ACK、真实旧样本和另一原生客户端更新、实际CSP/原生功能、PAIA/IME。缺条件NOT_RUN，不用fixture换label。G失败只定向修对应provider/parser/mount，不重开全面产品研究；核心能力不成立不能发布部分版充完整Free。
